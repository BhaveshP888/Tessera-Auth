import { createClient as createWebClient, type Client } from '@libsql/client/web';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { SyncDelta } from '@tessera/schemas';

const require = createRequire(import.meta.url);

export interface DbUser {
  id: string;
  email: string;
  auth_key_hash: string;
  auth_key_salt: string;
  wrapped_master_key: string;
  wrapped_master_key_nonce: string;
  totp_secret: string | null;
  totp_enabled: number; // 0 or 1
  backup_codes: string | null; // JSON array of hashed codes
  created_at: string;
  updated_at: string;
}

export interface DbSession {
  id: string;
  user_id: string;
  device_id: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface DbDevice {
  id: string;
  user_id: string;
  name: string;
  public_key_hex: string | null;
  last_seen_at: string;
  created_at: string;
}

export interface StoredUserDeltaEntry {
  cursor: number;
  userId: string;
  delta: SyncDelta;
  receivedAt: string;
}

export interface DbEmailOtp {
  email: string;
  otp_code_hash: string;
  attempts: number;
  expires_at: string;
  last_sent_at: string;
  created_at: string;
}

export class TesseraDatabase {
  private client: Client;
  private initPromise: Promise<void> | null = null;

  constructor(connectionUrlOrPath?: string, authToken?: string) {
    let url = connectionUrlOrPath;
    const token = authToken || process.env['TURSO_AUTH_TOKEN'];

    if (!url) {
      if (process.env['TURSO_DATABASE_URL']) {
        url = process.env['TURSO_DATABASE_URL'];
      } else {
        const dataDir =
          process.env['DATA_DIR'] ||
          (process.env['VERCEL']
            ? path.join(os.tmpdir(), 'tessera-data')
            : path.resolve(process.cwd(), 'data'));
        if (!fs.existsSync(dataDir)) {
          try {
            fs.mkdirSync(dataDir, { recursive: true });
          } catch {}
        }
        url = `file:${path.join(dataDir, 'tessera.sqlite3')}`;
      }
    } else if (url === ':memory:') {
      url = ':memory:';
    } else if (
      !url.startsWith('file:') &&
      !url.startsWith('libsql:') &&
      !url.startsWith('http:') &&
      !url.startsWith('https:')
    ) {
      url = `file:${path.resolve(url)}`;
    }

    if (url.startsWith('libsql:') || url.startsWith('http:') || url.startsWith('https:')) {
      this.client = createWebClient({
        url,
        authToken: token,
      }) as unknown as Client;
    } else {
      try {
        const { createClient } = require('@libsql/client');
        this.client = createClient({
          url,
          authToken: token,
        });
      } catch (err) {
        console.warn('[Tessera DB Warning] Local sqlite initialization failed (expected on Vercel without TURSO_DATABASE_URL):', (err as Error).message);
        this.client = createWebClient({
          url: 'https://placeholder.turso.io',
          authToken: 'placeholder',
        }) as unknown as Client;
      }
    }
  }

  public async initTables(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // Enforce foreign key constraints
        try {
          await this.client.execute('PRAGMA foreign_keys = ON;');
        } catch {}

        await this.client.execute(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            auth_key_hash TEXT NOT NULL,
            auth_key_salt TEXT NOT NULL,
            wrapped_master_key TEXT NOT NULL,
            wrapped_master_key_nonce TEXT NOT NULL,
            totp_secret TEXT,
            totp_enabled INTEGER NOT NULL DEFAULT 0,
            backup_codes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

        await this.client.execute(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL,
            refresh_token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);`);
        await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`);

        await this.client.execute(`
          CREATE TABLE IF NOT EXISTS devices (
            id TEXT NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            public_key_hex TEXT,
            last_seen_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (user_id, id)
          );
        `);

        await this.client.execute(`
          CREATE TABLE IF NOT EXISTS sync_changelog (
            cursor INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            delta TEXT NOT NULL,
            received_at TEXT NOT NULL
          );
        `);

        await this.client.execute(
          `CREATE INDEX IF NOT EXISTS idx_changelog_user_cursor ON sync_changelog(user_id, cursor);`,
        );

        await this.client.execute(`
          CREATE TABLE IF NOT EXISTS email_verifications (
            email TEXT PRIMARY KEY,
            otp_code_hash TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT NOT NULL,
            last_sent_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);

        await this.client.execute(
          `CREATE INDEX IF NOT EXISTS idx_email_verifications_expiry ON email_verifications(expires_at);`,
        );
      })();
    }
    return this.initPromise;
  }

  // --- Users ---

  public async createUser(user: {
    id: string;
    email: string;
    authKeyHash: string;
    authKeySalt: string;
    wrappedMasterKey: string;
    wrappedMasterKeyNonce: string;
  }): Promise<DbUser> {
    await this.initTables();
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        INSERT INTO users (
          id, email, auth_key_hash, auth_key_salt, wrapped_master_key,
          wrapped_master_key_nonce, totp_secret, totp_enabled, backup_codes,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?
        )
      `,
      args: [
        user.id,
        user.email.toLowerCase().trim(),
        user.authKeyHash,
        user.authKeySalt,
        user.wrappedMasterKey,
        user.wrappedMasterKeyNonce,
        now,
        now,
      ],
    });

    const created = await this.getUserById(user.id);
    return created!;
  }

  public async getUserByEmail(email: string): Promise<DbUser | null> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `SELECT * FROM users WHERE email = ?`,
      args: [email.toLowerCase().trim()],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0] as unknown as DbUser;
  }

  public async getUserById(id: string): Promise<DbUser | null> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `SELECT * FROM users WHERE id = ?`,
      args: [id],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0] as unknown as DbUser;
  }

  public async updateUser(
    id: string,
    updates: {
      auth_key_hash?: string;
      auth_key_salt?: string;
      wrapped_master_key?: string;
      wrapped_master_key_nonce?: string;
      totp_secret?: string | null;
      totp_enabled?: number;
      backup_codes?: string | null;
    },
  ): Promise<void> {
    await this.initTables();
    const existing = await this.getUserById(id);
    if (!existing) return;

    const merged = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await this.client.execute({
      sql: `
        UPDATE users SET
          auth_key_hash = ?,
          auth_key_salt = ?,
          wrapped_master_key = ?,
          wrapped_master_key_nonce = ?,
          totp_secret = ?,
          totp_enabled = ?,
          backup_codes = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        merged.auth_key_hash,
        merged.auth_key_salt,
        merged.wrapped_master_key,
        merged.wrapped_master_key_nonce,
        merged.totp_secret,
        merged.totp_enabled,
        merged.backup_codes,
        merged.updated_at,
        id,
      ],
    });
  }

  public async deleteUser(id: string): Promise<void> {
    await this.initTables();
    await this.client.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [id],
    });
  }

  // --- Sessions ---

  public async createSession(session: {
    id: string;
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    expiresAt: string;
  }): Promise<DbSession> {
    await this.initTables();
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        INSERT INTO sessions (
          id, user_id, device_id, refresh_token_hash, expires_at, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?
        )
      `,
      args: [
        session.id,
        session.userId,
        session.deviceId,
        session.refreshTokenHash,
        session.expiresAt,
        now,
      ],
    });

    return {
      id: session.id,
      user_id: session.userId,
      device_id: session.deviceId,
      refresh_token_hash: session.refreshTokenHash,
      expires_at: session.expiresAt,
      created_at: now,
    };
  }

  public async getSessionByTokenHash(tokenHash: string): Promise<DbSession | null> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `SELECT * FROM sessions WHERE refresh_token_hash = ?`,
      args: [tokenHash],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0] as unknown as DbSession;
  }

  public async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.initTables();
    await this.client.execute({
      sql: `DELETE FROM sessions WHERE refresh_token_hash = ?`,
      args: [tokenHash],
    });
  }

  public async deleteSessionsForUser(userId: string): Promise<void> {
    await this.initTables();
    await this.client.execute({
      sql: `DELETE FROM sessions WHERE user_id = ?`,
      args: [userId],
    });
  }

  // --- Devices ---

  public async upsertDevice(device: {
    id: string;
    userId: string;
    name: string;
    publicKeyHex?: string | null;
  }): Promise<void> {
    await this.initTables();
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        INSERT INTO devices (id, user_id, name, public_key_hex, last_seen_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
          name = excluded.name,
          last_seen_at = excluded.last_seen_at
      `,
      args: [
        device.id,
        device.userId,
        device.name,
        device.publicKeyHex || null,
        now,
        now,
      ],
    });
  }

  public async listDevicesForUser(userId: string): Promise<DbDevice[]> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC`,
      args: [userId],
    });
    return res.rows as unknown as DbDevice[];
  }

  public async deleteDevice(userId: string, deviceId: string): Promise<void> {
    await this.initTables();
    await this.client.execute({
      sql: `DELETE FROM devices WHERE user_id = ? AND id = ?`,
      args: [userId, deviceId],
    });
  }

  // --- User-Scoped Sync Changelog ---

  public async appendUserDeltas(
    userId: string,
    deltas: SyncDelta[],
  ): Promise<{ nextCursor: number; count: number }> {
    await this.initTables();
    if (deltas.length === 0) {
      return { nextCursor: 0, count: 0 };
    }

    const now = new Date().toISOString();
    const stmts = deltas.map((d) => ({
      sql: `INSERT INTO sync_changelog (user_id, delta, received_at) VALUES (?, ?, ?)`,
      args: [userId, JSON.stringify(d), now],
    }));

    const batchResults = await this.client.batch(stmts, 'write');
    const lastResult = batchResults[batchResults.length - 1];
    const lastInsertedCursor =
      lastResult && lastResult.lastInsertRowid !== undefined
        ? Number(lastResult.lastInsertRowid)
        : 0;

    return {
      nextCursor: lastInsertedCursor,
      count: deltas.length,
    };
  }

  public async getUserDeltasSince(
    userId: string,
    sinceCursor: number,
    limit = 100,
  ): Promise<{ deltas: SyncDelta[]; nextCursor: number; hasMore: boolean }> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `
        SELECT cursor, delta FROM sync_changelog
        WHERE user_id = ? AND cursor > ?
        ORDER BY cursor ASC
        LIMIT ?
      `,
      args: [userId, sinceCursor, limit + 1],
    });

    const rows = res.rows as unknown as Array<{ cursor: number; delta: string }>;
    const hasMore = rows.length > limit;
    const sliced = rows.slice(0, limit);
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1]!.cursor : sinceCursor;

    const parsedDeltas = sliced.map((row) => JSON.parse(row.delta) as SyncDelta);

    return {
      deltas: parsedDeltas,
      nextCursor,
      hasMore,
    };
  }

  // --- Email OTP Verification ---

  public async upsertEmailOtp(email: string, otpCodeHash: string, expiresAt: string): Promise<void> {
    await this.initTables();
    const now = new Date().toISOString();
    const normalized = email.toLowerCase().trim();
    await this.client.execute({
      sql: `
        INSERT INTO email_verifications (email, otp_code_hash, attempts, expires_at, last_sent_at, created_at)
        VALUES (?, ?, 0, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          otp_code_hash = excluded.otp_code_hash,
          attempts = 0,
          expires_at = excluded.expires_at,
          last_sent_at = excluded.last_sent_at
      `,
      args: [normalized, otpCodeHash, expiresAt, now, now],
    });
  }

  public async getEmailOtp(email: string): Promise<DbEmailOtp | null> {
    await this.initTables();
    const res = await this.client.execute({
      sql: `SELECT * FROM email_verifications WHERE email = ?`,
      args: [email.toLowerCase().trim()],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0] as unknown as DbEmailOtp;
  }

  public async incrementOtpAttempts(email: string): Promise<number> {
    await this.initTables();
    const normalized = email.toLowerCase().trim();
    const res = await this.client.execute({
      sql: `UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ? RETURNING attempts`,
      args: [normalized],
    });
    if (res.rows.length === 0) return 0;
    return Number(res.rows[0]!['attempts'] || 0);
  }

  public async deleteEmailOtp(email: string): Promise<void> {
    await this.initTables();
    await this.client.execute({
      sql: `DELETE FROM email_verifications WHERE email = ?`,
      args: [email.toLowerCase().trim()],
    });
  }

  public async wipeAllData(): Promise<void> {
    await this.initTables();
    await this.client.batch(
      [
        'DELETE FROM email_verifications;',
        'DELETE FROM sync_changelog;',
        'DELETE FROM devices;',
        'DELETE FROM sessions;',
        'DELETE FROM users;',
      ],
      'write',
    );
  }

  public close(): void {
    this.client.close();
  }
}
