import { describe, expect, it } from 'vitest';
import { createNpmRegistry } from '../src/registry.js';

function fakeFetch(routes: Record<string, { status: number; body?: unknown } | Error>) {
  const calls: string[] = [];
  const fetchImpl = (url: string): Promise<Response> => {
    calls.push(url);
    const route = routes[url];
    if (route instanceof Error) return Promise.reject(route);
    if (!route) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(Response.json(route.body ?? {}, { status: route.status }));
  };
  return { fetchImpl, calls };
}

describe('npm registry client', () => {
  it('reads creation date and weekly downloads, encoding scoped names', async () => {
    const { fetchImpl } = fakeFetch({
      'https://registry.npmjs.org/@fastify%2Fcors': {
        status: 200,
        body: { time: { created: '2020-01-02T00:00:00.000Z' } },
      },
      'https://api.npmjs.org/downloads/point/last-week/@fastify/cors': {
        status: 200,
        body: { downloads: 1234 },
      },
    });
    const result = await createNpmRegistry(fetchImpl).lookup('@fastify/cors');
    expect(result).toEqual({
      status: 'found',
      info: { createdAt: new Date('2020-01-02T00:00:00.000Z'), weeklyDownloads: 1234 },
    });
  });

  it('reports a 404 as missing', async () => {
    const { fetchImpl } = fakeFetch({});
    expect(await createNpmRegistry(fetchImpl).lookup('ghost')).toEqual({ status: 'missing' });
  });

  it('reports network failures, server errors and odd metadata as unknown', async () => {
    const { fetchImpl } = fakeFetch({
      'https://registry.npmjs.org/offline': new Error('ENOTFOUND'),
      'https://registry.npmjs.org/flaky': { status: 503 },
      'https://registry.npmjs.org/odd': { status: 200, body: { time: 'yesterday' } },
    });
    const registry = createNpmRegistry(fetchImpl);
    for (const name of ['offline', 'flaky', 'odd']) {
      expect(await registry.lookup(name)).toEqual({ status: 'unknown' });
    }
  });

  it('asks the registry once per package', async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const registry = createNpmRegistry(fetchImpl);
    await Promise.all([registry.lookup('ghost'), registry.lookup('ghost')]);
    expect(calls).toHaveLength(1);
  });
});
