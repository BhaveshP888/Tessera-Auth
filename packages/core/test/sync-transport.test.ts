import { describe, expect, it } from 'bun:test';
import type { SyncDelta } from '@tessera/schemas';
import { RelayHttpTransport } from '../src/sync/transport.js';

describe('SyncTransport Seam & RelayHttpTransport Adapter', () => {
  it('returns graceful error when server URL is not configured', async () => {
    const transport = new RelayHttpTransport('');
    const pushRes = await transport.push({
      deviceId: 'dev-1',
      clientCursor: 0,
      deltas: [],
    });
    expect(pushRes.success).toBe(true); // Empty deltas is a no-op success

    const sampleDelta: SyncDelta = {
      id: 'd-1',
      entityType: 'bookmark',
      entityId: 'b-1',
      deviceId: 'dev-1',
      lamportTs: 1,
      vectorClock: { 'dev-1': 1 },
      ciphertext: 'abc',
      nonce: 'def',
      createdAt: new Date().toISOString(),
    };

    const pushNonEmpty = await transport.push({
      deviceId: 'dev-1',
      clientCursor: 0,
      deltas: [sampleDelta],
    });
    expect(pushNonEmpty.success).toBe(false);
    expect(pushNonEmpty.error).toContain('Server URL not configured');

    const pullRes = await transport.pull({
      deviceId: 'dev-1',
      sinceCursor: 0,
      limit: 100,
    });
    expect(pullRes.success).toBe(false);
    expect(pullRes.error).toContain('Server URL not configured');
  });

  it('handles push and pull with mock fetch function', async () => {
    const storedDeltas: SyncDelta[] = [];

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/sync/push')) {
        const body = JSON.parse(init?.body as string);
        storedDeltas.push(...body.deltas);
        return new Response(JSON.stringify({ success: true, count: body.deltas.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/sync/pull')) {
        return new Response(
          JSON.stringify({
            deltas: storedDeltas,
            nextCursor: storedDeltas.length,
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const transport = new RelayHttpTransport('http://localhost:8787', mockFetch);

    const delta: SyncDelta = {
      id: 'delta-101',
      entityType: 'bookmark',
      entityId: 'b-101',
      deviceId: 'mock-device',
      lamportTs: 1,
      vectorClock: { 'mock-device': 1 },
      ciphertext: 'ciphertext-123',
      nonce: 'nonce-123',
      createdAt: new Date().toISOString(),
    };

    // Push
    const pushResult = await transport.push({
      deviceId: 'mock-device',
      clientCursor: 0,
      deltas: [delta],
    });
    expect(pushResult.success).toBe(true);
    expect(pushResult.pushedCount).toBe(1);

    // Pull
    const pullResult = await transport.pull({
      deviceId: 'mock-device',
      sinceCursor: 0,
      limit: 50,
    });
    expect(pullResult.success).toBe(true);
    expect(pullResult.deltas.length).toBe(1);
    expect(pullResult.deltas[0]!.id).toBe('delta-101');
    expect(pullResult.nextCursor).toBe(1);
  });
});
