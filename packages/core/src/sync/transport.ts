import type { SyncDelta } from '@tessera/schemas';

export interface TransportPushPayload {
  deviceId: string;
  clientCursor: number;
  deltas: SyncDelta[];
}

export interface TransportPushResult {
  success: boolean;
  pushedCount: number;
  error?: string;
}

export interface TransportPullPayload {
  deviceId: string;
  sinceCursor: number;
  limit: number;
}

export interface TransportPullResult {
  success: boolean;
  deltas: SyncDelta[];
  nextCursor: number;
  hasMore?: boolean;
  error?: string;
}

/**
 * SyncTransport is a polymorphic adapter seam for synchronizing deltas across
 * diverse storage backends (Relay Server, Cloud Gist, WebDAV, local files).
 */
export interface SyncTransport {
  readonly name: string;
  push(payload: TransportPushPayload): Promise<TransportPushResult>;
  pull(payload: TransportPullPayload): Promise<TransportPullResult>;
}

/**
 * HTTP Relay adapter that communicates with Tessera's Cloud Sync Relay server.
 */
export class RelayHttpTransport implements SyncTransport {
  public readonly name = 'RelayHttp';
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(serverUrl: string, customFetch?: typeof fetch) {
    this.baseUrl = this.normalizeUrl(serverUrl);
    this.fetchFn = customFetch || globalThis.fetch;
  }

  public setServerUrl(url: string): void {
    this.baseUrl = this.normalizeUrl(url);
  }

  public getServerUrl(): string {
    return this.baseUrl;
  }

  public async push(payload: TransportPushPayload): Promise<TransportPushResult> {
    if (payload.deltas.length === 0) {
      return { success: true, pushedCount: 0 };
    }
    if (!this.baseUrl) {
      return { success: false, pushedCount: 0, error: 'Server URL not configured' };
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: payload.deviceId,
          clientCursor: payload.clientCursor,
          deltas: payload.deltas,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          pushedCount: 0,
          error: `Relay returned ${res.status}: ${errorText}`,
        };
      }

      return {
        success: true,
        pushedCount: payload.deltas.length,
      };
    } catch (err) {
      return {
        success: false,
        pushedCount: 0,
        error: (err as Error).message || 'Network error during push',
      };
    }
  }

  public async pull(payload: TransportPullPayload): Promise<TransportPullResult> {
    if (!this.baseUrl) {
      return { success: false, deltas: [], nextCursor: payload.sinceCursor, error: 'Server URL not configured' };
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/sync/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: payload.deviceId,
          sinceCursor: payload.sinceCursor,
          limit: payload.limit,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          success: false,
          deltas: [],
          nextCursor: payload.sinceCursor,
          error: `Relay returned ${res.status}: ${errorText}`,
        };
      }

      const data = (await res.json()) as {
        deltas: SyncDelta[];
        nextCursor: number;
        hasMore: boolean;
      };

      return {
        success: true,
        deltas: data.deltas || [],
        nextCursor: data.nextCursor ?? payload.sinceCursor,
        hasMore: Boolean(data.hasMore),
      };
    } catch (err) {
      return {
        success: false,
        deltas: [],
        nextCursor: payload.sinceCursor,
        error: (err as Error).message || 'Network error during pull',
      };
    }
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
  }
}
