import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'bun:test';
import type { SyncDelta } from '@tessera/schemas';
import { buildServer } from '../src/app.js';

describe('Server Relay & Proxy', () => {
  it('returns health check status', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('handles encrypted delta push and cursor-based pull', async () => {
    const app = await buildServer();

    const sampleDelta: SyncDelta = {
      id: 'd9b2d63d-a23d-4c3e-9f37-123456789abc',
      entityType: 'bookmark',
      entityId: 'b-9999',
      deviceId: 'laptop-primary',
      lamportTs: 1,
      vectorClock: { 'laptop-primary': 1 },
      ciphertext: 'U29tZUVuY3J5cHRlZEJsb2I=',
      nonce: 'bm9uY2UxMjM0NTY3ODkwMTI=',
      createdAt: new Date().toISOString(),
    };

    // 1. Push delta
    const pushRes = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      payload: {
        deviceId: 'laptop-primary',
        deltas: [sampleDelta],
        clientCursor: 0,
      },
    });

    expect(pushRes.statusCode).toBe(200);
    const pushBody = JSON.parse(pushRes.body);
    expect(pushBody.count).toBe(1);

    // 2. Pull delta
    const pullRes = await app.inject({
      method: 'POST',
      url: '/api/sync/pull',
      payload: {
        deviceId: 'phone-secondary',
        sinceCursor: 0,
        limit: 10,
      },
    });

    expect(pullRes.statusCode).toBe(200);
    const pullBody = JSON.parse(pullRes.body);
    expect(pullBody.deltas.length).toBeGreaterThanOrEqual(1);
    expect(pullBody.deltas[pullBody.deltas.length - 1].entityId).toBe('b-9999');
  });

  it('lists registered extensions in registry', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'GET',
      url: '/api/registry/extensions',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.extensions.length).toBeGreaterThanOrEqual(2);
    expect(body.extensions.map((e: any) => e.id)).toContain('html-import');
  });

  it('extracts metadata and handles tracking params and ssrf blocking', async () => {
    const app = await buildServer();

    // SSRF block tests (standard, decimal IP, hex IP, cloud metadata, IPv6)
    const blockedUrls = [
      'http://127.0.0.1:8080/admin',
      'http://localhost:3000',
      'http://2130706433/secret',
      'http://0x7f000001/status',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:8080/metrics',
      'http://10.0.0.1/router',
      'http://192.168.1.1/config',
    ];

    for (const blockedUrl of blockedUrls) {
      const ssrfRes = await app.inject({
        method: 'POST',
        url: '/api/proxy/metadata',
        payload: { url: blockedUrl },
      });
      expect(ssrfRes.statusCode).toBe(400);
    }

    // Clean tracking & public URL metadata extraction
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/proxy/metadata',
      payload: { url: 'https://github.com/torvalds/linux?utm_source=twitter' },
    });
    expect(validRes.statusCode).toBe(200);
    const body = JSON.parse(validRes.body);
    expect(body.data).toBeDefined();
    expect(body.data.url).toBe('https://github.com/torvalds/linux');
  });

  it('serves static JavaScript assets with application/javascript MIME type and not text/html fallback', async () => {
    const app = await buildServer();
    let sampleJsPath = '/assets/index.js';
    const assetsDir = path.resolve(process.cwd(), 'apps/web/dist/assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      const jsFile = files.find((f) => f.endsWith('.js'));
      if (jsFile) {
        sampleJsPath = `/assets/${jsFile}`;
      }
    }

    const res = await app.inject({
      method: 'GET',
      url: sampleJsPath,
    });

    expect(res.statusCode).toBe(200);
    const contentType = res.headers['content-type'] || '';
    expect(contentType).toContain('javascript');

    // Missing assets must return 404 and NOT fallback to index.html with text/html
    const missingAssetRes = await app.inject({
      method: 'GET',
      url: '/assets/non-existent-bundle.js',
    });
    expect(missingAssetRes.statusCode).toBe(404);
  });
});
