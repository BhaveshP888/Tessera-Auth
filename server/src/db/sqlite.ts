import { Database } from 'bun:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import type { SyncDelta } from '@tessera/schemas';

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
  private db: Database;

  constructor(dbPath?: string) {
    let resolvedPath = dbPath;
    if (!resolvedPath) {
      const dataDir = process.env['DATA_DIR'] || path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      resolvedPath = path.join(dataDir, 'tessera.sqlite3');
    }

    this.db = new Database(resolvedPath);

    // Enforce WAL mode and foreign key constraints
    this.db.run('PRAGMA journal_mode = WAL;');
    this.db.run('PRAGMA foreign_keys = ON;');

    this.initTables();
  }

  private initTables(): void {
    this.db.run(`
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

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`);

    this.db.run(`
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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_changelog (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delta TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
    `);

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_changelog_user_cursor ON sync_changelog(user_id, cursor);`,
    );

    this.db.run(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        email TEXT PRIMARY KEY,
        otp_code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        last_sent_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_email_verifications_expiry ON email_verifications(expires_at);`,
    );
  }

  // --- Users ---

  public createUser(user: {
    id: string;
    email: string;
    authKeyHash: string;
    authKeySalt: string;
    wrappedMasterKey: string;
    wrappedMasterKeyNonce: string;
  }): DbUser {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, email, auth_key_hash, auth_key_salt, wrapped_master_key,
        wrapped_master_key_nonce, totp_secret, totp_enabled, backup_codes,
        created_at, updated_at
      ) VALUES (
        $id, $email, $auth_key_hash, $auth_key_salt, $wrapped_master_key,
        $wrapped_master_key_nonce, NULL, 0, NULL, $now, $now
      )
    `);

    stmt.run({
      $id: user.id,
      $email: user.email.toLowerCase().trim(),
      $auth_key_hash: user.authKeyHash,
      $auth_key_salt: user.authKeySalt,
      $wrapped_master_key: user.wrappedMasterKey,
      $wrapped_master_key_nonce: user.wrappedMasterKeyNonce,
      $now: now,
    });

    return this.getUserById(user.id)!;
  }

  public getUserByEmail(email: string): DbUser | null {
    const stmt = this.db.prepare<DbUser, { $email: string }>(
      `SELECT * FROM users WHERE email = $email`,
    );
    return stmt.get({ $email: email.toLowerCase().trim() }) || null;
  }

  public getUserById(id: string): DbUser | null {
    const stmt = this.db.prepare<DbUser, { $id: string }>(
      `SELECT * FROM users WHERE id = $id`,
    );
    return stmt.get({ $id: id }) || null;
  }

  public updateUser(
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
  ): void {
    const existing = this.getUserById(id);
    if (!existing) return;

    const merged = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      UPDATE users SET
        auth_key_hash = $auth_key_hash,
        auth_key_salt = $auth_key_salt,
        wrapped_master_key = $wrapped_master_key,
        wrapped_master_key_nonce = $wrapped_master_key_nonce,
        totp_secret = $totp_secret,
        totp_enabled = $totp_enabled,
        backup_codes = $backup_codes,
        updated_at = $updated_at
      WHERE id = $id
    `);

    stmt.run({
      $id: id,
      $auth_key_hash: merged.auth_key_hash,
      $auth_key_salt: merged.auth_key_salt,
      $wrapped_master_key: merged.wrapped_master_key,
      $wrapped_master_key_nonce: merged.wrapped_master_key_nonce,
      $totp_secret: merged.totp_secret,
      $totp_enabled: merged.totp_enabled,
      $backup_codes: merged.backup_codes,
      $updated_at: merged.updated_at,
    });
  }

  public deleteUser(id: string): void {
    const stmt = this.db.prepare(`DELETE FROM users WHERE id = $id`);
    stmt.run({ $id: id });
  }

  // --- Sessions ---

  public createSession(session: {
    id: string;
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    expiresAt: string;
  }): DbSession {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, user_id, device_id, refresh_token_hash, expires_at, created_at
      ) VALUES (
        $id, $user_id, $device_id, $refresh_token_hash, $expires_at, $created_at
      )
    `);

    stmt.run({
      $id: session.id,
      $user_id: session.userId,
      $device_id: session.deviceId,
      $refresh_token_hash: session.refreshTokenHash,
      $expires_at: session.expiresAt,
      $created_at: now,
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

  public getSessionByTokenHash(tokenHash: string): DbSession | null {
    const stmt = this.db.prepare<DbSession, { $tokenHash: string }>(
      `SELECT * FROM sessions WHERE refresh_token_hash = $tokenHash`,
    );
    return stmt.get({ $tokenHash: tokenHash }) || null;
  }

  public deleteSessionByTokenHash(tokenHash: string): void {
    const stmt = this.db.prepare(
      `DELETE FROM sessions WHERE refresh_token_hash = $tokenHash`,
    );
    stmt.run({ $tokenHash: tokenHash });
  }

  public deleteSessionsForUser(userId: string): void {
    const stmt = this.db.prepare(`DELETE FROM sessions WHERE user_id = $userId`);
    stmt.run({ $userId: userId });
  }

  // --- Devices ---

  public upsertDevice(device: {
    id: string;
    userId: string;
    name: string;
    publicKeyHex?: string | null;
  }): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO devices (id, user_id, name, public_key_hex, last_seen_at, created_at)
      VALUES ($id, $user_id, $name, $public_key_hex, $now, $now)
      ON CONFLICT(user_id, id) DO UPDATE SET
        name = $name,
        last_seen_at = $now
    `);

    stmt.run({
      $id: device.id,
      $user_id: device.userId,
      $name: device.name,
      $public_key_hex: device.publicKeyHex || null,
      $now: now,
    });
  }

  public listDevicesForUser(userId: string): DbDevice[] {
    const stmt = this.db.prepare<DbDevice, { $userId: string }>(
      `SELECT * FROM devices WHERE user_id = $userId ORDER BY last_seen_at DESC`,
    );
    return stmt.all({ $userId: userId });
  }

  public deleteDevice(userId: string, deviceId: string): void {
    const stmt = this.db.prepare(
      `DELETE FROM devices WHERE user_id = $userId AND id = $deviceId`,
    );
    stmt.run({ $userId: userId, $deviceId: deviceId });
  }

  // --- User-Scoped Sync Changelog ---

  public appendUserDeltas(
    userId: string,
    deltas: SyncDelta[],
  ): { nextCursor: number; count: number } {
    const now = new Date().toISOString();
    const insertStmt = this.db.prepare(`
      INSERT INTO sync_changelog (user_id, delta, received_at)
      VALUES ($user_id, $delta, $received_at)
    `);

    let lastInsertedCursor = 0;

    // Use transaction for batch insertion
    const transaction = this.db.transaction((items: SyncDelta[]) => {
      for (const d of items) {
        const info = insertStmt.run({
          $user_id: userId,
          $delta: JSON.stringify(d),
          $received_at: now,
        });
        lastInsertedCursor = Number(info.lastInsertRowid);
      }
    });

    transaction(deltas);

    return {
      nextCursor: lastInsertedCursor,
      count: deltas.length,
    };
  }

  public getUserDeltasSince(
    userId: string,
    sinceCursor: number,
    limit = 100,
  ): { deltas: SyncDelta[]; nextCursor: number; hasMore: boolean } {
    const stmt = this.db.prepare<{ cursor: number; delta: string }, { $userId: string; $since: number; $limit: number }>(`
      SELECT cursor, delta FROM sync_changelog
      WHERE user_id = $userId AND cursor > $since
      ORDER BY cursor ASC
      LIMIT $limit
    `);

    // Fetch limit + 1 to accurately detect hasMore
    const rows = stmt.all({
      $userId: userId,
      $since: sinceCursor,
      $limit: limit + 1,
    });

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

  public upsertEmailOtp(email: string, otpCodeHash: string, expiresAt: string): void {
    const now = new Date().toISOString();
    const normalized = email.toLowerCase().trim();
    const stmt = this.db.prepare(`
      INSERT INTO email_verifications (email, otp_code_hash, attempts, expires_at, last_sent_at, created_at)
      VALUES ($email, $otp_code_hash, 0, $expires_at, $now, $now)
      ON CONFLICT(email) DO UPDATE SET
        otp_code_hash = $otp_code_hash,
        attempts = 0,
        expires_at = $expires_at,
        last_sent_at = $now;
    `);
    stmt.run({
      $email: normalized,
      $otp_code_hash: otpCodeHash,
      $expires_at: expiresAt,
      $now: now,
    });
  }

  public getEmailOtp(email: string): DbEmailOtp | null {
    const stmt = this.db.prepare(`SELECT * FROM email_verifications WHERE email = $email`);
    const row = stmt.get({ $email: email.toLowerCase().trim() }) as DbEmailOtp | null;
    return row ? { ...row } : null;
  }

  public incrementOtpAttempts(email: string): number {
    const stmt = this.db.prepare(`
      UPDATE email_verifications SET attempts = attempts + 1 WHERE email = $email RETURNING attempts
    `);
    const res = stmt.get({ $email: email.toLowerCase().trim() }) as { attempts: number } | null;
    return res?.attempts || 0;
  }

  public deleteEmailOtp(email: string): void {
    const stmt = this.db.prepare(`DELETE FROM email_verifications WHERE email = $email`);
    stmt.run({ $email: email.toLowerCase().trim() });
  }

  public wipeAllData(): void {
    this.db.run(`DELETE FROM email_verifications;`);
    this.db.run(`DELETE FROM sync_changelog;`);
    this.db.run(`DELETE FROM devices;`);
    this.db.run(`DELETE FROM sessions;`);
    this.db.run(`DELETE FROM users;`);
  }

  public close(): void {
    this.db.close();
  }
}
