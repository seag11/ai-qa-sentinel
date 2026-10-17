import { describe, expect, it } from 'vitest';
import { createUnsafeRouteCheck } from '../../src/checks/unsafe-route.js';
import { FASTIFY_TYPES, messages, runCheck } from '../helpers.js';

const check = createUnsafeRouteCheck();

/** Wraps route code in a module that imports Fastify, as a real routes file would. */
function routes(body: string): Record<string, string> {
  return {
    'fastify.d.ts': FASTIFY_TYPES,
    'routes.ts': [
      `import Fastify from 'fastify';`,
      `declare const db: { query(sql: string, params?: unknown[]): unknown; prepare(sql: string): { get(...a: unknown[]): unknown } };`,
      `declare const reply: { send(body: unknown): void };`,
      `const app = Fastify();`,
      body,
    ].join('\n'),
  };
}

describe('unsafe-route', () => {
  it('flags a POST route with no schema whose input is spliced into SQL', async () => {
    const findings = await runCheck(
      check,
      routes(`app.post('/orders', async (request: any) => {
        const { coupon } = request.body;
        return db.query(\`SELECT * FROM coupons WHERE code = '\${coupon}'\`);
      });`),
    );
    expect(findings).toMatchObject([{ severity: 'error', line: 5 }]);
    expect(messages(findings)).toEqual(['POST /orders: no body schema; input reaches SQL']);
  });

  it('only warns about a missing body schema when input is handled safely', async () => {
    const findings = await runCheck(
      check,
      routes(
        `app.put('/items/:id', async (request: any) => db.query('UPDATE items SET name = ?', [request.body.name]));`,
      ),
    );
    expect(findings).toMatchObject([
      { severity: 'warning', message: 'PUT /items/:id: no body schema' },
    ]);
  });

  it('accepts a route with a body schema and parameterized SQL', async () => {
    const findings = await runCheck(
      check,
      routes(`app.post('/orders', { schema: { body: { type: 'object' } } }, async (request: any) =>
        db.prepare('SELECT * FROM coupons WHERE code = ?').get(request.body.coupon));`),
    );
    expect(findings).toEqual([]);
  });

  it('trusts a schema defined elsewhere, since it cannot be inspected', async () => {
    const findings = await runCheck(
      check,
      routes(
        `const orderSchema = { body: {} };\napp.post('/orders', { schema: orderSchema }, async () => 'ok');`,
      ),
    );
    expect(findings).toEqual([]);
  });

  it('flags input echoed into an HTML reply, via send or return', async () => {
    const findings = await runCheck(
      check,
      routes(`app.get('/hello', async (request: any) => {
        const name = request.query.name.trim();
        reply.send(\`<h1>Hello \${name}</h1>\`);
      });
      app.get('/bye', async ({ query }: any) => {
        const html = '<p>Bye ' + query.name + '</p>';
        return html;
      });`),
    );
    expect(messages(findings)).toEqual([
      'GET /hello: input reaches HTML reply',
      'GET /bye: input reaches HTML reply',
    ]);
  });

  it('flags input interpolated into a log line, but not structured logging', async () => {
    const findings = await runCheck(
      check,
      routes(`app.get('/search', async (request: any) => {
        request.log.info(\`searching for \${request.query.term}\`);
        request.log.info({ term: request.query.term }, 'searching');
        return [];
      });`),
    );
    expect(messages(findings)).toEqual(['GET /search: input reaches log line']);
  });

  it('understands app.route() and handlers declared as named functions', async () => {
    const findings = await runCheck(
      check,
      routes(`async function createUser(request: any) {
        console.log('creating ' + request.body.email);
      }
      app.route({ method: 'POST', url: '/users', handler: createUser });`),
    );
    expect(messages(findings)).toEqual(['POST /users: no body schema; input reaches log line']);
  });

  it('reads handlers placed inside the options object', async () => {
    const findings = await runCheck(
      check,
      routes(
        `app.get('/q', { handler: async (request: any) => db.query('SELECT ' + request.query.col) });`,
      ),
    );
    expect(messages(findings)).toEqual(['GET /q: input reaches SQL']);
  });

  it('does not treat a sanitizer call as tainted', async () => {
    const findings = await runCheck(
      check,
      routes(`declare function escapeHtml(s: string): string;
      app.get('/hello', async (request: any) => \`<h1>\${escapeHtml(request.query.name)}</h1>\`);`),
    );
    expect(findings).toEqual([]);
  });

  it('ignores files that do not use Fastify', async () => {
    const findings = await runCheck(check, {
      'router.ts': `declare const router: { post(p: string, h: () => void): void };\nrouter.post('/x', () => {});`,
    });
    expect(findings).toEqual([]);
  });
});
