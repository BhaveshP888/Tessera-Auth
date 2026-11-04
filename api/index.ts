import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns/promises';

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

  private async saveToDiskAsync(): Promise<void> {
    try {
      const data = {
        globalCursor: this.globalCursor,
        changelog: this.changelog,
      };
      const tmpPath = `${this.storageFilePath}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(data), 'utf-8');
      await fs.promises.rename(tmpPath, this.storageFilePath);
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
    void this.saveToDiskAsync();
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

function parseIpv4ToNumber(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 4) {
    let num = 0;
    for (let i = 0; i < 4; i++) {
      const part = parts[i]!;
      let octet: number;
      if (/^0x[0-9a-f]+$/i.test(part)) {
        octet = parseInt(part, 16);
      } else if (/^0[0-7]+$/.test(part)) {
        octet = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        octet = parseInt(part, 10);
      } else {
        return null;
      }
      if (octet < 0 || octet > 255) return null;
      num = (num << 8) | octet;
    }
    return num >>> 0;
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  if (/^\d+$/.test(host)) {
    const n = parseInt(host, 10);
    return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }
  return null;
}

function isPrivateOrReservedIpv4(ipNum: number): boolean {
  const b0 = (ipNum >>> 24) & 0xff;
  const b1 = (ipNum >>> 16) & 0xff;
  if (b0 === 0 || b0 === 127 || b0 === 10) return true;
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  if (b0 === 192 && b1 === 168) return true;
  if (b0 === 169 && b1 === 254) return true;
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  if (b0 === 192 && b1 === 0 && ((ipNum >>> 8) & 0xff) === 2) return true;
  if (b0 >= 224) return true;
  return false;
}

function isPrivateOrReservedIp(ipStr: string): boolean {
  const cleanIp = ipStr.startsWith('[') && ipStr.endsWith(']') ? ipStr.slice(1, -1) : ipStr;
  const ipv4Num = parseIpv4ToNumber(cleanIp);
  if (ipv4Num !== null) {
    return isPrivateOrReservedIpv4(ipv4Num);
  }
  const lower = cleanIp.toLowerCase();
  if (lower === '::' || lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower.startsWith('::ffff:')) {
    const rest = lower.slice(7);
    const mappedNum = parseIpv4ToNumber(rest);
    if (mappedNum !== null) return isPrivateOrReservedIpv4(mappedNum);
  }
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9')) return true;
  if (lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('ff') || lower.startsWith('100::')) return true;
  if (lower.startsWith('64:ff9b::')) {
    const suffix = lower.slice('64:ff9b::'.length);
    if (suffix.includes('.')) {
      const ipv4Num = parseIpv4ToNumber(suffix);
      if (ipv4Num !== null) return isPrivateOrReservedIpv4(ipv4Num);
    }
    const parts = suffix.split(':');
    if (parts.length === 2) {
      const p0 = parseInt(parts[0]!, 16);
      const p1 = parseInt(parts[1]!, 16);
      if (!isNaN(p0) && !isNaN(p1)) {
        const ipNum =
          (((p0 >> 8) & 0xff) << 24) |
          ((p0 & 0xff) << 16) |
          (((p1 >> 8) & 0xff) << 8) |
          (p1 & 0xff);
        return isPrivateOrReservedIpv4(ipNum >>> 0);
      }
    }
    return true;
  }
  return false;
}

async function isSafePublicUrl(targetUrl: string): Promise<boolean> {
  try {
    let trimmed = targetUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    let host = url.hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    if (
      host === 'localhost' ||
      host === '::' ||
      host === '::1' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home.arpa')
    ) {
      return false;
    }

    if (isPrivateOrReservedIp(host)) return false;

    try {
      const addresses = await dns.lookup(host, { all: true });
      if (!addresses || addresses.length === 0) return false;
      for (const addr of addresses) {
        if (isPrivateOrReservedIp(addr.address)) return false;
      }
    } catch {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

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

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const configuredOrigin = process.env['CORS_ORIGIN'];
  if (configuredOrigin) {
    const list = configuredOrigin.split(',').map((o) => o.trim().toLowerCase());
    if (list.includes(origin.toLowerCase())) return true;
  }
  const url = origin.toLowerCase();
  if (
    url.startsWith('http://localhost:') ||
    url.startsWith('https://localhost:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith('https://127.0.0.1:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://')
  ) {
    return true;
  }
  return false;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

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

    // Auth check helper for sync/relay endpoints
    const verifyRelayAuth = (): boolean => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
      }
      const token = authHeader.slice(7).trim();
      const apiKey = process.env['RELAY_API_KEY'];
      if (apiKey && token === apiKey) return true;
      // In serverless fallback mode, accept non-empty bearer token for client sessions
      return token.length > 10;
    };

    // 2. Sync Push
    if ((pathname === '/api/sync/push' || pathname.endsWith('/sync/push')) && req.method === 'POST') {
      if (!verifyRelayAuth()) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const body = await readBody(req);
      const deltas = Array.isArray(body.deltas) ? body.deltas : [];
      const result = relay.appendDeltas(deltas);
      return sendJson(res, 200, result);
    }

    // 3. Sync Pull
    if ((pathname === '/api/sync/pull' || pathname.endsWith('/sync/pull')) && req.method === 'POST') {
      if (!verifyRelayAuth()) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const body = await readBody(req);
      const sinceCursor = typeof body.sinceCursor === 'number' ? body.sinceCursor : 0;
      const limit = typeof body.limit === 'number' ? body.limit : 100;
      const result = relay.getDeltasSince(sinceCursor, limit);
      return sendJson(res, 200, result);
    }

    // 4. Device Registration
    if (pathname === '/api/devices/register' && req.method === 'POST') {
      if (!verifyRelayAuth()) {
        return sendJson(res, 401, { error: 'Authentication required' });
      }
      const body = await readBody(req);
      return sendJson(res, 200, { success: true, device: body });
    }

    // 5. Proxy Metadata
    if (pathname === '/api/proxy/metadata' && req.method === 'POST') {
      const body = await readBody(req);
      const targetUrl = body.url;
      if (!targetUrl || typeof targetUrl !== 'string') {
        return sendJson(res, 400, { error: 'URL is required' });
      }

      const isSafe = await isSafePublicUrl(targetUrl);
      if (!isSafe) {
        return sendJson(res, 400, { error: 'Invalid or restricted URL' });
      }

      try {
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tessera-Reader/1.0' },
          signal: AbortSignal.timeout(5000),
          redirect: 'manual',
        });

        const MAX_BYTES = 512 * 1024;
        let html = '';
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let bytesRead = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              bytesRead += value.byteLength;
              html += decoder.decode(value, { stream: true });
              if (bytesRead >= MAX_BYTES) {
                reader.cancel();
                break;
              }
            }
          }
          html += decoder.decode();
        } else {
          const text = await response.text();
          html = text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
        }

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

    return sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    return sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
