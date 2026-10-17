import {
  Node,
  type ArrowFunction,
  type CallExpression,
  type FunctionDeclaration,
  type FunctionExpression,
  type MethodDeclaration,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import { findingAtNode, unwrapExpression } from '../ast.js';
import type { Check, Finding, TargetProject } from '../types.js';
import { STUDIES } from './evidence.js';

const ID = 'unsafe-route';
const SHORTHAND_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'all',
]);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const REQUEST_INPUTS = new Set(['body', 'query', 'params', 'headers']);
const SQL_CALLS = new Set(['query', 'execute', 'exec', 'prepare', 'raw', 'unsafe']);
const LOG_CALLS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'log']);
const HTML_TAG = /<\/?[a-z][^>]*>/i;

type Handler = ArrowFunction | FunctionExpression | FunctionDeclaration | MethodDeclaration;

interface Route {
  readonly method: string;
  readonly url: string;
  readonly node: CallExpression;
  readonly options: ObjectLiteralExpression | undefined;
  readonly handler: Handler | undefined;
}

export function createUnsafeRouteCheck(): Check {
  return {
    id: ID,
    description: 'Fastify routes without input schemas, or whose input reaches SQL, HTML or logs',
    evidence: [STUDIES.veracode, STUDIES.pearce],
    run(project) {
      return Promise.resolve(
        project.sourceFiles
          .filter(importsFastify)
          .flatMap(findRoutes)
          .map((route) => judgeRoute(project, route))
          .filter((finding) => finding !== undefined),
      );
    },
  };
}

function judgeRoute(project: TargetProject, route: Route): Finding | undefined {
  const reasons: string[] = [];
  if (BODY_METHODS.has(route.method) && !hasBodySchema(route.options)) {
    reasons.push('no body schema');
  }
  const flows = route.handler ? findTaintedSinks(route.handler) : [];
  reasons.push(...flows);
  if (reasons.length === 0) return undefined;

  return findingAtNode(project, route.node, {
    checkId: ID,
    severity: flows.length > 0 ? 'error' : 'warning',
    message: `${route.method} ${route.url}: ${reasons.join('; ')}`,
  });
}

function importsFastify(file: SourceFile): boolean {
  return file
    .getImportDeclarations()
    .some((declaration) => /^(fastify|@fastify\/)/.test(declaration.getModuleSpecifierValue()));
}

/** Both `app.post('/x', opts, handler)` and `app.route({ method, url, handler })`. */
function findRoutes(file: SourceFile): Route[] {
  const routes: Route[] = [];
  file.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return;
    const name = callee.getName();
    const args = node.getArguments();

    if (SHORTHAND_METHODS.has(name)) {
      const [path, ...rest] = args;
      if (!path || !Node.isStringLiteral(path) || !path.getLiteralText().startsWith('/')) return;
      const options = rest.find(Node.isObjectLiteralExpression);
      const handler =
        resolveHandler(rest.at(-1)) ?? resolveHandler(propertyValue(options, 'handler'));
      routes.push({
        method: name.toUpperCase(),
        url: path.getLiteralText(),
        node,
        options,
        handler,
      });
    } else if (name === 'route' && args[0] && Node.isObjectLiteralExpression(args[0])) {
      const options = args[0];
      const method = propertyValue(options, 'method');
      const url = propertyValue(options, 'url');
      if (!Node.isStringLiteral(method) || !Node.isStringLiteral(url)) return;
      routes.push({
        method: method.getLiteralText().toUpperCase(),
        url: url.getLiteralText(),
        node,
        options,
        handler: resolveHandler(propertyValue(options, 'handler')),
      });
    }
  });
  return routes;
}

function hasBodySchema(options: ObjectLiteralExpression | undefined): boolean {
  const schema = propertyValue(options, 'schema');
  if (schema === undefined) return false;
  // A schema built elsewhere cannot be inspected here, so give it the benefit of the doubt.
  if (!Node.isObjectLiteralExpression(schema)) return true;
  return schema.getProperty('body') !== undefined;
}

/** Follows request input through local variables to the calls that would make it dangerous. */
function findTaintedSinks(handler: Handler): string[] {
  const requestNames = new Set<string>();
  const tainted = new Set<string>();
  const firstParam = handler.getParameters()[0]?.getNameNode();

  if (Node.isIdentifier(firstParam)) {
    requestNames.add(firstParam.getText());
  } else if (Node.isObjectBindingPattern(firstParam)) {
    for (const element of firstParam.getElements()) {
      const field = element.getPropertyNameNode()?.getText() ?? element.getName();
      if (REQUEST_INPUTS.has(field)) tainted.add(element.getName());
    }
  }

  const isTainted = (expression: Node): boolean => {
    const node = unwrapExpression(expression);
    if (Node.isIdentifier(node)) return tainted.has(node.getText());
    if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
      const base = unwrapExpression(node.getExpression());
      if (Node.isIdentifier(base) && requestNames.has(base.getText())) {
        return Node.isPropertyAccessExpression(node) && REQUEST_INPUTS.has(node.getName());
      }
      return isTainted(base);
    }
    if (Node.isTemplateExpression(node)) {
      return node.getTemplateSpans().some((span) => isTainted(span.getExpression()));
    }
    if (Node.isBinaryExpression(node)) {
      return isTainted(node.getLeft()) || isTainted(node.getRight());
    }
    if (Node.isConditionalExpression(node)) {
      return isTainted(node.getWhenTrue()) || isTainted(node.getWhenFalse());
    }
    if (Node.isAwaitExpression(node)) return isTainted(node.getExpression());
    if (Node.isCallExpression(node)) {
      // `input.trim()` keeps the taint; a call to some other function might be a sanitizer.
      const callee = node.getExpression();
      return Node.isPropertyAccessExpression(callee) && isTainted(callee.getExpression());
    }
    return false;
  };

  for (const declaration of handler.getDescendants().filter(Node.isVariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (!initializer || !isTainted(initializer)) continue;
    const name = declaration.getNameNode();
    if (Node.isIdentifier(name)) tainted.add(name.getText());
    else
      for (const element of name.getElements().filter(Node.isBindingElement))
        tainted.add(element.getName());
  }

  const isTaintedString = (expression: Node | undefined): boolean =>
    expression !== undefined && isTainted(expression) && buildsString(expression);

  const flows = new Set<string>();
  handler.forEachDescendant((node) => {
    if (Node.isReturnStatement(node)) {
      const value = node.getExpression();
      if (isTaintedString(value) && looksLikeHtml(value)) flows.add('input reaches HTML reply');
      return;
    }
    if (!Node.isCallExpression(node)) return;
    const callee = node.getExpression();
    const name = Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText();
    const [first] = node.getArguments();

    if (SQL_CALLS.has(name) && isTaintedString(first)) flows.add('input reaches SQL');
    if (name === 'send' && isTaintedString(first) && looksLikeHtml(first)) {
      flows.add('input reaches HTML reply');
    }
    if (isLoggerCall(callee) && node.getArguments().some(isTaintedString)) {
      flows.add('input reaches log line');
    }
  });
  return [...flows];
}

/** True when the value is assembled from pieces (template or `+`), directly or via a local. */
function buildsString(expression: Node): boolean {
  const node = unwrapExpression(expression);
  if (Node.isTemplateExpression(node)) return true;
  if (Node.isBinaryExpression(node)) return node.getOperatorToken().getText() === '+';
  if (!Node.isIdentifier(node)) return false;
  const declaration = node.getSymbol()?.getValueDeclaration();
  const initializer = Node.isVariableDeclaration(declaration)
    ? declaration.getInitializer()
    : undefined;
  return initializer !== undefined && initializer !== expression && buildsString(initializer);
}

function looksLikeHtml(expression: Node | undefined): boolean {
  if (!expression) return false;
  const node = unwrapExpression(expression);
  if (HTML_TAG.test(node.getText())) return true;
  const declaration = Node.isIdentifier(node) ? node.getSymbol()?.getValueDeclaration() : undefined;
  return (
    Node.isVariableDeclaration(declaration) &&
    HTML_TAG.test(declaration.getInitializer()?.getText() ?? '')
  );
}

function isLoggerCall(callee: Node): boolean {
  if (!Node.isPropertyAccessExpression(callee) || !LOG_CALLS.has(callee.getName())) return false;
  const receiver = callee.getExpression().getText();
  return receiver === 'console' || /(^|\.)(log|logger)$/.test(receiver);
}

function propertyValue(
  objectLiteral: ObjectLiteralExpression | undefined,
  name: string,
): Node | undefined {
  const property = objectLiteral?.getProperty(name);
  if (Node.isPropertyAssignment(property)) return property.getInitializer();
  if (Node.isShorthandPropertyAssignment(property)) return property.getNameNode();
  if (Node.isMethodDeclaration(property)) return property;
  return undefined;
}

function resolveHandler(node: Node | undefined): Handler | undefined {
  if (!node) return undefined;
  if (
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isFunctionDeclaration(node)
  ) {
    return node;
  }
  if (!Node.isIdentifier(node)) return undefined;
  const declaration = node.getSymbol()?.getValueDeclaration();
  if (Node.isFunctionDeclaration(declaration)) return declaration;
  if (Node.isVariableDeclaration(declaration)) return resolveHandler(declaration.getInitializer());
  return undefined;
}
