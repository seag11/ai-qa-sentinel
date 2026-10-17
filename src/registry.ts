import { isRecord } from './guards.js';

/** What the npm registry knows about a package, reduced to the signals phantom-import uses. */
export interface PackageInfo {
  readonly createdAt: Date;
  readonly weeklyDownloads: number;
}

export type LookupResult =
  | { readonly status: 'found'; readonly info: PackageInfo }
  | { readonly status: 'missing' }
  /** The registry could not be reached; the check stays silent rather than guessing. */
  | { readonly status: 'unknown' };

export interface PackageRegistry {
  lookup(name: string): Promise<LookupResult>;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const REGISTRY_URL = 'https://registry.npmjs.org';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week';
const TIMEOUT_MS = 5_000;

export function createNpmRegistry(fetchImpl: Fetch = fetch): PackageRegistry {
  const cache = new Map<string, Promise<LookupResult>>();

  async function fetchJson(url: string): Promise<unknown> {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
  }

  async function lookupUncached(name: string): Promise<LookupResult> {
    const encoded = name.replace('/', '%2F');
    try {
      const metadata = await fetchJson(`${REGISTRY_URL}/${encoded}`);
      if (metadata === undefined) return { status: 'missing' };
      const createdAt = readCreatedAt(metadata);
      if (createdAt === undefined) return { status: 'unknown' };
      const downloads = await fetchJson(`${DOWNLOADS_URL}/${name}`);
      return { status: 'found', info: { createdAt, weeklyDownloads: readDownloads(downloads) } };
    } catch {
      return { status: 'unknown' };
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

function readCreatedAt(metadata: unknown): Date | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.time)) return undefined;
  const created = metadata.time.created;
  return typeof created === 'string' ? new Date(created) : undefined;
}

function readDownloads(body: unknown): number {
  return isRecord(body) && typeof body.downloads === 'number' ? body.downloads : 0;
}
