import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface StoredDeltaEntry {
  cursor: number;
  delta: any;
  receivedAt: string;
}

// In-memory relay changelog with /tmp persistence across warm serverless invocations
class ServerlessRelayStore {
  private globalCursor = 0;
  private changelog: StoredDeltaEntry[] = [];
  private storageFilePath: string;

  constructor() {
    const dataDir = path.join(os.tmpdir(), 'tessera-data');
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch {}
    this.storageFilePath = path.join(dataDir, 'relay_changelog.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.changelog)) {
          this.changelog = parsed.changelog;
          this.globalCursor = typeof parsed.globalCursor === 'number' ? parsed.globalCursor : this.changelog.length;
        }
      }
    } catch {}
  }

  private saveToDisk(): void {
    try {
      const data = {
        globalCursor: this.globalCursor,
        changelog: this.changelog,
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data), 'utf-8');
    } catch {}
  }

  public appendDeltas(deltas: any[]): { nextCursor: number; count: number } {
    const now = new Date().toISOString();
    for (const delta of deltas) {
      this.globalCursor++;
      this.changelog.push({
        cursor: this.globalCursor,
        delta,
        receivedAt: now,
      });
    }
    this.saveToDisk();
    return {
      nextCursor: this.globalCursor,
      count: deltas.length,
    };
  }

  public getDeltasSince(sinceCursor: number, limit = 100): { deltas: any[]; nextCursor: number; hasMore: boolean } {
    const matching = this.changelog.filter((entry) => entry.cursor > sinceCursor);
    const sliced = matching.slice(0, limit);
    const hasMore = matching.length > limit;
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1]!.cursor : sinceCursor;

    return {
      deltas: sliced.map((entry) => entry.delta),
      nextCursor,
      hasMore,
    };
  }
}

const relay = new ServerlessRelayStore();

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Universal CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, *');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rawUrl = req.url || '';
  const pathname = rawUrl.split('?')[0] || '';

  try {
    // 1. Health check
    if (pathname === '/api/health' || pathname === '/api') {
      return sendJson(res, 200, {
        status: 'ok',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Sync Push
    if (pathname === '/api/sync/push' && req.method === 'POST') {
      const body = await readBody(req);
      const deltas = Array.isArray(body.deltas) ? body.deltas : [];
      const result = relay.appendDeltas(deltas);
      return sendJson(res, 200, result);
    }

    // 3. Sync Pull
    if (pathname === '/api/sync/pull' && req.method === 'POST') {
      const body = await readBody(req);
      const sinceCursor = typeof body.sinceCursor === 'number' ? body.sinceCursor : 0;
      const limit = typeof body.limit === 'number' ? body.limit : 100;
      const result = relay.getDeltasSince(sinceCursor, limit);
      return sendJson(res, 200, result);
    }

    // 4. Device Registration
    if (pathname === '/api/devices/register' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, { success: true, device: body });
    }

    // 5. Proxy Metadata
    if (pathname === '/api/proxy/metadata' && req.method === 'POST') {
      const body = await readBody(req);
      const targetUrl = body.url;
      if (!targetUrl) {
        return sendJson(res, 400, { error: 'URL is required' });
      }

      try {
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tessera-Reader/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1]?.trim() : targetUrl;

        return sendJson(res, 200, {
          title,
          url: targetUrl,
          description: '',
          icon: `https://www.google.com/s2/favicons?domain=${new URL(targetUrl).hostname}&sz=64`,
        });
      } catch {
        return sendJson(res, 200, {
          title: targetUrl,
          url: targetUrl,
          description: '',
          icon: '',
        });
      }
    }

    // Fallback: match any route ending with sync/push or sync/pull
    if (pathname.endsWith('/sync/push') && req.method === 'POST') {
      const body = await readBody(req);
      const deltas = Array.isArray(body.deltas) ? body.deltas : [];
      const result = relay.appendDeltas(deltas);
      return sendJson(res, 200, result);
    }

    if (pathname.endsWith('/sync/pull') && req.method === 'POST') {
      const body = await readBody(req);
      const sinceCursor = typeof body.sinceCursor === 'number' ? body.sinceCursor : 0;
      const limit = typeof body.limit === 'number' ? body.limit : 100;
      const result = relay.getDeltasSince(sinceCursor, limit);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { error: `Endpoint not found: ${pathname}` });
  } catch (err: any) {
    return sendJson(res, 500, { error: err?.message || 'Internal Server Error' });
  }
}
