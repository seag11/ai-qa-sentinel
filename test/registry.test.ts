import { describe, expect, it } from 'vitest';
import { createNpmRegistry } from '../src/registry.js';

function fakeFetch(answer: (url: string) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return answer(url);
  };
  return { fetchImpl, calls };
}

const status = (code: number) => () => Promise.resolve(new Response(null, { status: code }));

describe('npm registry client', () => {
  it('asks for the abbreviated document, encoding scoped names', async () => {
    const { fetchImpl, calls } = fakeFetch(status(200));
    expect(await createNpmRegistry(fetchImpl).lookup('@fastify/cors')).toBe('found');
    expect(calls[0]?.url).toBe('https://registry.npmjs.org/@fastify%2Fcors');
    expect(calls[0]?.init.headers).toEqual({ accept: 'application/vnd.npm.install-v1+json' });
  });

  it('reports a 404 as missing', async () => {
    const { fetchImpl } = fakeFetch(status(404));
    expect(await createNpmRegistry(fetchImpl).lookup('ghost')).toBe('missing');
  });

  it('reports server errors and network failures as unknown', async () => {
    expect(await createNpmRegistry(fakeFetch(status(503)).fetchImpl).lookup('a')).toBe('unknown');
    const offline = fakeFetch(() => Promise.reject(new Error('ENOTFOUND')));
    expect(await createNpmRegistry(offline.fetchImpl).lookup('a')).toBe('unknown');
  });

  it('asks the registry once per package', async () => {
    const { fetchImpl, calls } = fakeFetch(status(404));
    const registry = createNpmRegistry(fetchImpl);
    await Promise.all([registry.lookup('ghost'), registry.lookup('ghost')]);
    expect(calls).toHaveLength(1);
  });
});
