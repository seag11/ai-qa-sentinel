import { builtinModules } from 'node:module';
import { Node, ts, type SourceFile } from 'ts-morph';
import { findingAtNode } from '../ast.js';
import type { PackageRegistry } from '../registry.js';
import type { Check, Finding, TargetProject } from '../types.js';
import { STUDIES } from './evidence.js';

const ID = 'phantom-import';
const NEW_PACKAGE_DAYS = 30;
const LOW_WEEKLY_DOWNLOADS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Version specs that point somewhere other than the public registry. */
const LOCAL_SPEC = /^(workspace|file|link|portal|git|github|https?):/;

export interface PhantomImportOptions {
  /** Omit to run offline: only package.json is consulted. */
  readonly registry?: PackageRegistry;
  readonly now?: () => Date;
}

interface ImportSite {
  readonly packageName: string;
  readonly node: Node;
}

export function createPhantomImportCheck(options: PhantomImportOptions = {}): Check {
  const now = options.now ?? (() => new Date());

  return {
    id: ID,
    description: 'Imports of packages that are undeclared, missing from npm, or suspiciously new',
    evidence: [STUDIES.spracklen],
    async run(project) {
      const sites = project.sourceFiles.flatMap((file) => findImportSites(project, file));
      const findings = await Promise.all(
        sites.map((site) => judgeImport(project, site, options.registry, now())),
      );
      return findings.filter((finding) => finding !== undefined);
    },
  };
}

async function judgeImport(
  project: TargetProject,
  site: ImportSite,
  registry: PackageRegistry | undefined,
  now: Date,
): Promise<Finding | undefined> {
  const { packageName, node } = site;
  const spec = project.dependencies.get(packageName);
  const declared = spec !== undefined || project.dependencies.has(typesPackageFor(packageName));
  const report = (severity: Finding['severity'], message: string): Finding =>
    findingAtNode(project, node, { checkId: ID, severity, message });

  if (spec !== undefined && LOCAL_SPEC.test(spec)) return undefined;

  const lookup = registry ? await registry.lookup(packageName) : { status: 'unknown' as const };
  if (lookup.status === 'missing') {
    return report('error', `'${packageName}' is not on npm`);
  }
  if (!declared) {
    return report('error', `'${packageName}' is imported but not declared in package.json`);
  }
  if (lookup.status === 'unknown') return undefined;

  const ageDays = Math.floor((now.getTime() - lookup.info.createdAt.getTime()) / DAY_MS);
  if (ageDays < NEW_PACKAGE_DAYS) {
    return report(
      'warning',
      `'${packageName}' was first published ${ageDays} days ago; confirm it is the package you meant`,
    );
  }
  if (lookup.info.weeklyDownloads < LOW_WEEKLY_DOWNLOADS) {
    return report(
      'warning',
      `'${packageName}' had ${lookup.info.weeklyDownloads} downloads last week; confirm it is the package you meant`,
    );
  }
  return undefined;
}

function findImportSites(project: TargetProject, file: SourceFile): ImportSite[] {
  const aliases = pathAliasMatchers(project);
  const sites: ImportSite[] = [];

  for (const node of moduleSpecifierNodes(file)) {
    const specifier = node.getLiteralText();
    if (!isPackageSpecifier(specifier) || aliases.some((matches) => matches(specifier))) continue;
    const packageName = toPackageName(specifier);
    if (packageName === project.packageName) continue;
    sites.push({ packageName, node });
  }
  return sites;
}

/** String literals naming a module: static and dynamic imports, re-exports, and require(). */
function moduleSpecifierNodes(file: SourceFile): (Node & { getLiteralText(): string })[] {
  const nodes: (Node & { getLiteralText(): string })[] = [];
  for (const declaration of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
    const specifier = declaration.getModuleSpecifier();
    if (specifier) nodes.push(specifier);
  }
  file.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      const isLoader =
        callee.isKind(ts.SyntaxKind.ImportKeyword) ||
        (Node.isIdentifier(callee) && callee.getText() === 'require');
      const [first] = node.getArguments();
      if (isLoader && first && Node.isStringLiteral(first)) nodes.push(first);
    } else if (Node.isExternalModuleReference(node)) {
      const expression = node.getExpression();
      if (expression && Node.isStringLiteral(expression)) nodes.push(expression);
    }
  });
  return nodes;
}

function isPackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) {
    return false;
  }
  if (specifier.startsWith('node:')) return false;
  return !builtinModules.includes(specifier.split('/')[0] ?? specifier);
}

function toPackageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function typesPackageFor(packageName: string): string {
  const bare = packageName.startsWith('@') ? packageName.slice(1).replace('/', '__') : packageName;
  return `@types/${bare}`;
}

function pathAliasMatchers(project: TargetProject): ((specifier: string) => boolean)[] {
  const paths = project.ts.getCompilerOptions().paths ?? {};
  return Object.keys(paths).map((pattern) => {
    const star = pattern.indexOf('*');
    if (star === -1) return (specifier: string) => specifier === pattern;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    return (specifier: string) => specifier.startsWith(prefix) && specifier.endsWith(suffix);
  });
}
