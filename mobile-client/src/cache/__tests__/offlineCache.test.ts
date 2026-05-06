// Mocks expo-file-system with an in-memory store so we can exercise
// saveCache / readCache / clearCache / formatLastSynced under Jest (Node).
// The real File and Directory classes are TurboModule-backed and would
// no-op outside the React Native runtime.

interface MemFile {
  uri: string;
  text: string | null;
}

const memory: Record<string, MemFile> = {};

jest.mock(
  'expo-file-system',
  () => {
    class MockFile {
      readonly uri: string;
      get exists(): boolean {
        return memory[this.uri]?.text != null && memory[this.uri]?.text !== '__dir__';
      }
      constructor(...parts: any[]) {
        const segments: string[] = [];
        for (const part of parts) {
          if (typeof part === 'string') segments.push(part);
          else if (part?.uri) segments.push(part.uri);
        }
        this.uri = segments.join('/');
      }
      create() {
        memory[this.uri] = { uri: this.uri, text: '' };
      }
      write(content: string) {
        memory[this.uri] = { uri: this.uri, text: content };
      }
      async text() {
        return memory[this.uri]?.text ?? '';
      }
      delete() {
        delete memory[this.uri];
      }
      get name(): string {
        const segs = this.uri.split('/');
        return segs[segs.length - 1] ?? '';
      }
    }

    class MockDirectory {
      readonly uri: string;
      // Directories track existence separately so create() is idempotent.
      get exists(): boolean {
        return memory[this.uri]?.text === '__dir__';
      }
      constructor(...parts: any[]) {
        const segments: string[] = [];
        for (const part of parts) {
          if (typeof part === 'string') segments.push(part);
          else if (part?.uri) segments.push(part.uri);
        }
        this.uri = segments.join('/');
      }
      create() {
        memory[this.uri] = { uri: this.uri, text: '__dir__' };
      }
      delete() {
        for (const key of Object.keys(memory)) {
          if (key.startsWith(this.uri)) delete memory[key];
        }
      }
      list(): Array<MockFile | MockDirectory> {
        const prefix = this.uri.endsWith('/') ? this.uri : `${this.uri}/`;
        const result: Array<MockFile | MockDirectory> = [];
        for (const key of Object.keys(memory)) {
          if (!key.startsWith(prefix)) continue;
          // Direct children only (no further '/').
          const rest = key.slice(prefix.length);
          if (!rest || rest.includes('/')) continue;
          const entry = memory[key];
          if (entry.text === '__dir__') {
            result.push(new MockDirectory(this.uri, rest));
          } else {
            const file = new MockFile(this.uri, rest);
            result.push(file);
          }
        }
        return result;
      }
      get name(): string {
        const segs = this.uri.split('/');
        return segs[segs.length - 1] ?? '';
      }
    }

    return {
      File: MockFile,
      Directory: MockDirectory,
      Paths: { cache: { uri: 'cache://' } },
    };
  },
  { virtual: true },
);

// Imports must come AFTER jest.mock for the mock to apply.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const offlineCache = require('../offlineCache');
const {
  cacheKeyFor,
  clearCache,
  formatLastSynced,
  readCache,
  saveCache,
  saveCurrentUser,
  readCurrentUser,
  clearCurrentUser,
  clearAllUserCaches,
} = offlineCache as typeof import('../offlineCache');

const stubUser = (id: string) => ({
  id,
  first_name: 'Test',
  last_name: 'User',
});

describe('offlineCache', () => {
  beforeEach(() => {
    for (const key of Object.keys(memory)) delete memory[key];
  });

  describe('cacheKeyFor', () => {
    it('namespaces by user id and slug', () => {
      expect(cacheKeyFor('alice', 'commitments')).toBe('u_alice__commitments');
    });
  });

  describe('saveCache + readCache', () => {
    it('round-trips JSON-serialisable payloads', async () => {
      const key = cacheKeyFor('u1', 'demo');
      saveCache(key, { hello: 'world', count: 3 });
      const got = await readCache<{ hello: string; count: number }>(key);
      expect(got).not.toBeNull();
      expect(got!.data).toEqual({ hello: 'world', count: 3 });
      expect(typeof got!.cachedAt).toBe('number');
      expect(got!.fresh).toBe(true);
    });

    it('marks entries older than the TTL as stale', async () => {
      const key = cacheKeyFor('u1', 'stale');
      saveCache(key, { x: 1 });
      // Force the stored timestamp into the past.
      const file = memory[Object.keys(memory).find((k) => k.endsWith('stale.json'))!];
      const parsed = JSON.parse(file.text!) as { data: unknown; cachedAt: number };
      parsed.cachedAt = Date.now() - 60_000;
      file.text = JSON.stringify(parsed);

      const got = await readCache(key, /* ttlMs */ 30_000);
      expect(got).not.toBeNull();
      expect(got!.fresh).toBe(false);
    });

    it('returns null for missing keys', async () => {
      expect(await readCache('nope')).toBeNull();
    });

    it('treats corrupt entries as missing', async () => {
      const key = cacheKeyFor('u1', 'corrupt');
      saveCache(key, { ok: true });
      const fileKey = Object.keys(memory).find((k) => k.endsWith('corrupt.json'))!;
      memory[fileKey].text = 'not-valid-json{';
      expect(await readCache(key)).toBeNull();
    });

    it('overwrites existing entries on save', async () => {
      const key = cacheKeyFor('u1', 'overwrite');
      saveCache(key, { v: 1 });
      saveCache(key, { v: 2 });
      const got = await readCache<{ v: number }>(key);
      expect(got!.data.v).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('removes a single key when given one', async () => {
      saveCache('a', { x: 1 });
      saveCache('b', { x: 2 });
      clearCache('a');
      expect(await readCache('a')).toBeNull();
      expect(await readCache('b')).not.toBeNull();
    });

    it('wipes every entry when called with no key', async () => {
      saveCache('a', { x: 1 });
      saveCache('b', { x: 2 });
      clearCache();
      expect(await readCache('a')).toBeNull();
      expect(await readCache('b')).toBeNull();
    });
  });

  describe('formatLastSynced', () => {
    const now = 1_700_000_000_000;

    it('reports "just now" for the current minute', () => {
      expect(formatLastSynced(now - 5_000, now)).toBe('just now');
    });

    it('reports minutes when under an hour', () => {
      expect(formatLastSynced(now - 90_000, now)).toBe('1 min ago');
      expect(formatLastSynced(now - 5 * 60_000, now)).toBe('5 mins ago');
    });

    it('reports hours when under a day', () => {
      expect(formatLastSynced(now - 2 * 3600_000, now)).toBe('2 hours ago');
    });

    it('reports days at the high end', () => {
      expect(formatLastSynced(now - 3 * 86400_000, now)).toBe('3 days ago');
    });
  });

  describe('current-user snapshot', () => {
    it('round-trips the signed-in user via the dedicated slot', async () => {
      saveCurrentUser(stubUser('alice') as any);
      const got = await readCurrentUser();
      expect(got).not.toBeNull();
      expect(got!.data.id).toBe('alice');
    });

    it('clears the current-user slot on logout', async () => {
      saveCurrentUser(stubUser('alice') as any);
      clearCurrentUser();
      expect(await readCurrentUser()).toBeNull();
    });

    it('does not expire the current-user snapshot — it lives until logout', async () => {
      saveCurrentUser(stubUser('alice') as any);
      // Force the timestamp far into the past.
      const fileKey = Object.keys(memory).find((k) => k.endsWith('current-user-snapshot.json'))!;
      const parsed = JSON.parse(memory[fileKey].text!) as { cachedAt: number };
      parsed.cachedAt = Date.now() - 30 * 86400_000;
      memory[fileKey].text = JSON.stringify(parsed);

      const got = await readCurrentUser();
      expect(got).not.toBeNull();
      expect(got!.fresh).toBe(true);
    });
  });

  describe('clearAllUserCaches', () => {
    it('removes only the target user\'s per-user files', async () => {
      saveCache(cacheKeyFor('alice', 'home-feed-default'), [{ id: 'a1' }]);
      saveCache(cacheKeyFor('alice', 'messages-chats'), [{ id: 'c1' }]);
      saveCache(cacheKeyFor('bob', 'home-feed-default'), [{ id: 'b1' }]);
      saveCurrentUser(stubUser('alice') as any);

      clearAllUserCaches('alice');

      expect(await readCache(cacheKeyFor('alice', 'home-feed-default'))).toBeNull();
      expect(await readCache(cacheKeyFor('alice', 'messages-chats'))).toBeNull();
      // Bob's cache survives.
      expect(await readCache(cacheKeyFor('bob', 'home-feed-default'))).not.toBeNull();
      // The current-user slot is in a separate namespace and is untouched.
      expect(await readCurrentUser()).not.toBeNull();
    });

    it('is a no-op when the user has nothing cached', () => {
      expect(() => clearAllUserCaches('nobody')).not.toThrow();
    });
  });
});
