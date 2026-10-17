export type LookupResult = 'found' | 'missing' | 'unknown';

export interface PackageRegistry {
  /** `unknown` means the registry could not be reached; callers stay silent rather than guess. */
  lookup(name: string): Promise<LookupResult>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const REGISTRY_URL = 'https://registry.npmjs.org';
const TIMEOUT_MS = 5_000;

export function createNpmRegistry(fetchImpl: Fetch = fetch): PackageRegistry {
  const cache = new Map<string, Promise<LookupResult>>();

  async function lookupUncached(name: string): Promise<LookupResult> {
    try {
      const response = await fetchImpl(`${REGISTRY_URL}/${name.replace('/', '%2F')}`, {
        // The abbreviated document is a fraction of the full one; only the status matters here.
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return 'missing';
      return response.ok ? 'found' : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  return {
    lookup(name) {
      let pending = cache.get(name);
      if (pending === undefined) {
        pending = lookupUncached(name);
        cache.set(name, pending);
      }
      return pending;
    },
  };
}
