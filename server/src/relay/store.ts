import fs from 'node:fs';
import path from 'node:path';
import type { RegisteredDevice, SyncDelta } from '@tessera/schemas';

export interface StoredDeltaEntry {
  cursor: number;
  delta: SyncDelta;
  receivedAt: string;
}

export class SyncRelayStore {
  private globalCursor = 0;
  private changelog: StoredDeltaEntry[] = [];
  private devices = new Map<string, RegisteredDevice>();
  private storageFilePath: string;

  constructor() {
    let dataDir = process.env['DATA_DIR'];
    if (!dataDir) {
      if (process.env['VERCEL'] || process.env['AWS_LAMBDA_FUNCTION_NAME']) {
        dataDir = path.join('/tmp', 'tessera-data');
      } else {
        dataDir = path.resolve(process.cwd(), 'data');
      }
    }

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
        if (Array.isArray(parsed.devices)) {
          for (const d of parsed.devices) {
            this.devices.set(d.id, d);
          }
        }
      }
    } catch (err) {
      console.warn('[SyncRelayStore] Could not load changelog from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        globalCursor: this.globalCursor,
        changelog: this.changelog,
        devices: Array.from(this.devices.values()),
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SyncRelayStore] Could not persist changelog to disk (memory relay active):', err);
    }
  }

  /**
   * Registers a client device public key.
   */
  public registerDevice(device: RegisteredDevice): void {
    this.devices.set(device.id, device);
    this.saveToDisk();
  }

  /**
   * Returns registered devices for an account.
   */
  public listDevices(): RegisteredDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Appends opaque encrypted deltas to the relay changelog.
   */
  public appendDeltas(deltas: SyncDelta[]): { nextCursor: number; count: number } {
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

  /**
   * Pulls encrypted deltas since a given cursor position.
   */
  public getDeltasSince(
    sinceCursor: number,
    limit = 100,
  ): { deltas: SyncDelta[]; nextCursor: number; hasMore: boolean } {
    const matching = this.changelog.filter((entry) => entry.cursor > sinceCursor);
    const sliced = matching.slice(0, limit);
    const hasMore = matching.length > limit;

    const nextCursor = sliced.length > 0
      ? sliced[sliced.length - 1]!.cursor
      : sinceCursor;

    return {
      deltas: sliced.map((entry) => entry.delta),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Wipes all relay data (for GDPR / zero-knowledge data destruction).
   */
  public wipeAll(): void {
    this.changelog = [];
    this.devices.clear();
    this.globalCursor = 0;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        fs.unlinkSync(this.storageFilePath);
      }
    } catch {}
  }
}

export const relayStore = new SyncRelayStore();
