import { describe, expect, it } from 'bun:test';
import { buildServer } from '../../../server/src/app.js';
import { TesseraDatabase } from '../../../server/src/db/sqlite.js';
import { LocalStoreEngine } from '../src/store/engine.js';
import { MemoryStorageAdapter } from '../src/store/engine.js';

describe('End-to-End Zero-Knowledge E2EE Auth & Cross-Device Sync', () => {
  it('registers on Device A, creates bookmarks, logs in on Device B, unwraps master key, and syncs data', async () => {
    // 1. Start Server with test DB
    const db = new TesseraDatabase(':memory:');
    const app = await buildServer({ db });
    await app.ready();

    // Mock fetch pointing to in-memory Fastify inject
    const testFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      const parsedUrl = new URL(urlStr);
      const pathname = parsedUrl.pathname + parsedUrl.search;

      const res = await app.inject({
        method: (init?.method as any) || 'GET',
        url: pathname,
        headers: init?.headers as any,
        payload: init?.body as any,
      });

      return new Response(res.body, {
        status: res.statusCode,
        headers: res.headers as any,
      });
    };

    // 2. Setup Device A (primary device)
    const storageA = new MemoryStorageAdapter();
    const engineA = new LocalStoreEngine({
      storage: storageA,
      deviceId: 'laptop-a',
      syncServerUrl: 'http://localhost:8787',
      fetchFn: testFetch,
    });

    const userEmail = 'alice@privacy.org';
    const userPassword = 'MySecretMasterPassword2026!';

    // Register Device A (use lower rounds for test speed)
    const regRes = await engineA.registerAccount(userEmail, userPassword, 'Alice Laptop', 5_000);
    expect(regRes.success).toBe(true);
    expect(regRes.user?.email).toBe(userEmail);
    expect(engineA.getAuthToken()).toBeDefined();

    // Device A adds bookmarks
    const b1 = engineA.addBookmark({
      url: 'https://signal.org',
      title: 'Signal Messenger',
      notes: 'End-to-end encrypted messaging',
      tags: ['privacy', 'security'],
    });

    const b2 = engineA.addBookmark({
      url: 'https://bitwarden.com',
      title: 'Bitwarden',
      notes: 'Zero knowledge password manager',
      tags: ['security'],
    });

    // Device A syncs to server
    const syncARes = await engineA.sync(true);
    if (!syncARes.success) {
      console.log('SYNC A ERROR:', syncARes.error);
    }
    expect(syncARes.success).toBe(true);
    expect(syncARes.pushedCount).toBeGreaterThanOrEqual(2);

    // 3. Setup Device B (fresh new device, simulating a new phone or second laptop)
    const storageB = new MemoryStorageAdapter();
    const engineB = new LocalStoreEngine({
      storage: storageB,
      deviceId: 'phone-b',
      syncServerUrl: 'http://localhost:8787',
      fetchFn: testFetch,
    });

    // Before login, Device B has no bookmarks
    expect(engineB.getBookmarks()).toHaveLength(0);
    // Device B has a different random master key initially
    expect(engineB.getMasterKeyBase64()).not.toEqual(engineA.getMasterKeyBase64());

    // 4. Device B logs in using email & password
    const loginRes = await engineB.loginAccount(userEmail, userPassword, 'Alice Phone', 5_000);
    expect(loginRes.success).toBe(true);
    expect(loginRes.user?.email).toBe(userEmail);
    expect(engineB.getAuthToken()).toBeDefined();

    // Verify: Device B successfully recovered and unwrapped the exact same Master Key!
    expect(engineB.getMasterKeyBase64()).toEqual(engineA.getMasterKeyBase64());

    // 5. Verify Device B has all bookmarks automatically pulled and decrypted on login!
    const bookmarksB = engineB.getBookmarks();
    expect(bookmarksB).toHaveLength(2);

    const signalBm = bookmarksB.find((b) => b.url === 'https://signal.org');
    expect(signalBm).toBeDefined();
    expect(signalBm?.title).toBe('Signal Messenger');
    expect(signalBm?.notes).toBe('End-to-end encrypted messaging');
    expect(signalBm?.tags).toContain('privacy');

    const bitwardenBm = bookmarksB.find((b) => b.url === 'https://bitwarden.com');
    expect(bitwardenBm).toBeDefined();
    expect(bitwardenBm?.title).toBe('Bitwarden');

    // 6. Test logout on Device B
    await engineB.logoutAccount();
    expect(engineB.getAuthToken()).toBeNull();
    expect(engineB.getAuthUser()).toBeNull();
  });
});
