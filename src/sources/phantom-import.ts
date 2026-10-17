import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import type { PackageRegistry } from '../registry.js';
import type { Finding, FindingSource, TargetProject } from '../types.js';

const RULE = 'phantom-import';
/** Version specs that point somewhere other than the public registry. */
const LOCAL_SPEC = /^(workspace|file|link|portal|git|github|https?):/;

interface ImportSite {
  readonly packageName: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Imports of packages that don't exist, the "package hallucination" failure (Spracklen et al.,
 * USENIX Security 2025). Without a registry it runs offline and checks package.json only.
 */
export function createPhantomImportSource(registry?: PackageRegistry): FindingSource {
  return {
    id: RULE,
    async find(project) {
      const perFile = await Promise.all(
        project.files.map(async (file) =>
          findImportSites(project, file, await readFile(file, 'utf8')),
        ),
      );
      const findings = await Promise.all(
        perFile.flat().map((site) => judge(project, site, registry)),
      );
      return findings.filter((finding) => finding !== undefined);
    },
  };
}

async function judge(
  project: TargetProject,
  site: ImportSite,
  registry: PackageRegistry | undefined,
): Promise<Finding | undefined> {
  const { packageName } = site;
  const spec = project.dependencies.get(packageName);
  if (spec !== undefined && LOCAL_SPEC.test(spec)) return undefined;

  const report = (message: string): Finding => ({
    rule: RULE,
    file: site.file,
    line: site.line,
    column: site.column,
    severity: 'error',
    message,
  });

  if (registry && (await registry.lookup(packageName)) === 'missing') {
    return report(`'${packageName}' is not on npm`);
  }
  const declared = spec !== undefined || project.dependencies.has(typesPackageFor(packageName));
  return declared
    ? undefined
    : report(`'${packageName}' is imported but not declared in package.json`);
}

/** Every package named by a static or dynamic import, a re-export, or a require() call. */
export function findImportSites(project: TargetProject, file: string, text: string): ImportSite[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const relativeFile = path.relative(project.root, file).split(path.sep).join('/');
  const sites: ImportSite[] = [];

  const visit = (node: ts.Node): void => {
    const specifier = moduleSpecifierOf(node);
    if (specifier && isPackageSpecifier(project, specifier.text)) {
      const packageName = toPackageName(specifier.text);
      if (packageName !== project.packageName) {
        const { line, character } = source.getLineAndCharacterOfPosition(
          specifier.getStart(source),
        );
        sites.push({ packageName, file: relativeFile, line: line + 1, column: character + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function moduleSpecifierOf(node: ts.Node): ts.StringLiteral | undefined {
  let candidate: ts.Node | undefined;
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    candidate = node.moduleSpecifier;
  } else if (ts.isExternalModuleReference(node)) {
    candidate = node.expression;
  } else if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const isLoader =
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && callee.text === 'require');
    if (isLoader) candidate = node.arguments[0];
  }
  return candidate && ts.isStringLiteral(candidate) ? candidate : undefined;
}

function isPackageSpecifier(project: TargetProject, specifier: string): boolean {
  if (/^[./#]/.test(specifier) || specifier.startsWith('node:')) return false;
  if (builtinModules.includes(specifier.split('/')[0] ?? specifier)) return false;
  return !project.pathAliases.some((pattern) => matchesAlias(pattern, specifier));
}

function matchesAlias(pattern: string, specifier: string): boolean {
  const star = pattern.indexOf('*');
  if (star === -1) return specifier === pattern;
  return (
    specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
  );
}

function toPackageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function typesPackageFor(packageName: string): string {
  const bare = packageName.startsWith('@') ? packageName.slice(1).replace('/', '__') : packageName;
  return `@types/${bare}`;
}
