import type {
  Bookmark,
  Collection,
  CreateBookmarkInput,
  SyncDelta,
  Tag,
  UpdateBookmarkInput,
  VaultConfig,
  User,
} from '@tessera/schemas';
import {
  base64ToUint8Array,
  deriveRecordKey,
  generateMasterKey,
  uint8ArrayToBase64,
  unsealRecord,
  deriveAuthAndEncryptionKeys,
  wrapMasterKey,
  unwrapMasterKey,
} from '../crypto/index.js';
import { VaultSessionManager } from '../crypto/vault-session.js';
import {
  pullEncryptedGistBackup,
  pushEncryptedGistBackup,
  type GistConfig,
} from '../backup/gist-backup.js';
import { MutationLog } from './mutation-log.js';
import { RelayHttpTransport, type SyncTransport } from '../sync/transport.js';

export type { GistConfig, VaultConfig, User };

export type VaultUnlockResult =
  | { success: true }
  | { success: false; error: string; remainingAttempts: number; wiped: boolean };

export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  isConfigured: false,
  pinSalt: '',
  pinHash: '',
  wipeAfterAttempts: 5,
  failedAttempts: 0,
  isSyncEnabled: false,
  encryptedVaultKeyWithPin: '',
  autoLockTimeoutMinutes: 5,
};

export const COLLECTION_PALETTE = [
  '#38bdf8', // Sky Blue
  '#f59e0b', // Amber
  '#ec4899', // Pink / Rose
  '#10b981', // Emerald
  '#a855f7', // Violet
  '#f97316', // Orange
  '#06b6d4', // Teal
  '#6366f1', // Indigo
  '#ef4444', // Coral / Red
  '#14b8a6', // Turquoise
  '#eab308', // Yellow
  '#d946ef', // Fuchsia
];

export function getCollectionColor(collectionNameOrId: string, customColor?: string): string {
  if (
    customColor &&
    customColor.startsWith('#') &&
    customColor !== '#1e3a5f' &&
    customColor !== '#1e293b' &&
    customColor !== '#0f172a' &&
    customColor !== '#000000'
  ) {
    return customColor;
  }
  const key = (collectionNameOrId || '').trim().toLowerCase();
  if (!key) return COLLECTION_PALETTE[0]!;

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % COLLECTION_PALETTE.length;
  return COLLECTION_PALETTE[idx]!;
}

export interface IStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export class MemoryStorageAdapter implements IStorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

export class BrowserLocalStorageAdapter implements IStorageAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
  clear(): void {
    try {
      localStorage.clear();
    } catch {}
  }
}

export interface LocalStoreEngineOptions {
  storage?: IStorageAdapter;
  prefix?: string;
  deviceId?: string;
  syncServerUrl?: string;
  fetchFn?: typeof fetch;
  syncTransport?: SyncTransport;
}

export interface FullBackupPayload {
  version: number;
  exportedAt: string;
  deviceId: string;
  masterKey?: string;
  bookmarks: Bookmark[];
  collections: Collection[];
  tags: Tag[];
  tombstones: Record<string, string>;
  vaultConfig?: VaultConfig;
}

/**
 * LocalStoreEngine is the primary local storage and state management deep module.
 * Delegates causality, cryptographic sealing, and conflict resolution to MutationLog,
 * and delegates cloud networking to SyncTransport.
 */
export class LocalStoreEngine {
  private storage: IStorageAdapter;
  private prefix: string;
  private deviceId: string;
  private masterKeyBase64: string = '';
  private masterKey: Uint8Array;

  private bookmarks: Bookmark[] = [];
  private tags: Tag[] = [];
  private collections: Collection[] = [];
  private pendingDeltas: SyncDelta[] = [];
  private syncCursor = 0;
  private isSyncing = false;

  private readonly mutationLog: MutationLog;
  private readonly relayTransport: RelayHttpTransport;
  private customTransport?: SyncTransport;

  private gistConfig: GistConfig = {
    token: '',
    gistId: null,
    autoSync: false,
    lastSyncAt: null,
    lastError: null,
  };
  private gistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private vaultConfig: VaultConfig = { ...DEFAULT_VAULT_CONFIG };
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private authToken: string | null = null;
  private authUser: User | null = null;

  public readonly vaultSession = new VaultSessionManager();
  private subscribers = new Set<() => void>();

  constructor(options: LocalStoreEngineOptions = {}) {
    this.storage =
      options.storage ||
      (typeof window !== 'undefined'
        ? new BrowserLocalStorageAdapter()
        : new MemoryStorageAdapter());
    this.prefix = options.prefix || 'tessera_v1_';

    const serverUrl = (options.syncServerUrl || 'http://127.0.0.1:8787').trim().replace(/\/+$/, '');
    this.relayTransport = new RelayHttpTransport(serverUrl, options.fetchFn);
    this.customTransport = options.syncTransport;

    // 1. Device ID
    const savedDeviceId = this.storage.getItem(`${this.prefix}deviceId`);
    if (savedDeviceId) {
      this.deviceId = savedDeviceId;
    } else {
      this.deviceId = options.deviceId || `device-${crypto.randomUUID().slice(0, 8)}`;
      this.storage.setItem(`${this.prefix}deviceId`, this.deviceId);
    }

    // 2. Master Key
    const savedKey = this.storage.getItem(`${this.prefix}masterKey`);
    if (savedKey) {
      this.masterKeyBase64 = savedKey;
      this.masterKey = base64ToUint8Array(savedKey);
    } else {
      const generated = generateMasterKey();
      this.masterKey = generated;
      this.masterKeyBase64 = uint8ArrayToBase64(generated);
      this.storage.setItem(`${this.prefix}masterKey`, this.masterKeyBase64);
    }

    // 3. Load persisted entities & initialize MutationLog
    const initialTombstones = this.safeJsonParse<Record<string, string>>('deletedTombstones', {});
    this.mutationLog = new MutationLog(initialTombstones);
    this.loadPersistedState();

    // 4. Restore Auth State
    const savedToken = this.storage.getItem(`${this.prefix}authToken`);
    if (savedToken) {
      this.authToken = savedToken;
      this.relayTransport.setAuthToken(savedToken);
    }
    this.authUser = this.safeJsonParse<User | null>('authUser', null);
  }

  private safeJsonParse<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(`${this.prefix}${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  private loadPersistedState(): void {
    const rawBookmarks = this.safeJsonParse<any[]>('bookmarks', []);
    this.bookmarks = Array.isArray(rawBookmarks)
      ? rawBookmarks
          .filter((b) => {
            // Discard corrupted empty placeholders without url or ciphertext
            if (
              b?.isVault &&
              !b?.url &&
              (!b?.ciphertext || !b?.nonce) &&
              b?.title === 'Locked Vault Item'
            ) {
              return false;
            }
            return true;
          })
          .map((b) => {
            if (b?.isVault) {
              if (b.ciphertext && b.nonce) {
                return {
                  id: b.id,
                  url: '',
                  title: 'Locked Vault Item',
                  description: '',
                  notes: '',
                  faviconUrl: '',
                  previewImageUrl: '',
                  tags: [],
                  collectionId: b.collectionId || null,
                  isVault: true,
                  isArchived: Boolean(b.isArchived),
                  isFavorite: Boolean(b.isFavorite),
                  isPinned: Boolean(b.isPinned),
                  createdAt: b.createdAt || new Date().toISOString(),
                  updatedAt: b.updatedAt || new Date().toISOString(),
                  deletedAt: null,
                  versionClock: b?.versionClock && typeof b.versionClock === 'object' ? b.versionClock : {},
                  ciphertext: b.ciphertext,
                  nonce: b.nonce,
                };
              }
              // If stored in legacy unmasked format, retain fields
              return {
                ...b,
                versionClock:
                  b?.versionClock && typeof b.versionClock === 'object' ? b.versionClock : {},
              };
            }
            return {
              ...b,
              versionClock:
                b?.versionClock && typeof b.versionClock === 'object' ? b.versionClock : {},
            };
          })
      : [];
    this.tags = this.safeJsonParse<Tag[]>('tags', []);
    this.collections = this.safeJsonParse<Collection[]>('collections', []);
    this.pendingDeltas = this.safeJsonParse<SyncDelta[]>('pendingDeltas', []);
    this.gistConfig = this.safeJsonParse<GistConfig>('gistConfig', {
      token: '',
      gistId: null,
      autoSync: false,
      lastSyncAt: null,
      lastError: null,
    });
    this.vaultConfig = this.safeJsonParse<VaultConfig>('vaultConfig', {
      ...DEFAULT_VAULT_CONFIG,
    });
  }

  private persistBookmarks(): void {
    const isVaultUnlocked = this.vaultSession.isUnlocked();
    const serialized = this.bookmarks.map((b) => {
      if (b.isVault) {
        if (isVaultUnlocked && b.url && b.title !== 'Locked Vault Item') {
          try {
            const sealed = this.vaultSession.seal(b);
            return {
              id: b.id,
              isVault: true,
              ciphertext: sealed.ciphertext,
              nonce: sealed.nonce,
              createdAt: b.createdAt,
              updatedAt: b.updatedAt,
              deletedAt: b.deletedAt || null,
              isPinned: Boolean(b.isPinned),
              isFavorite: Boolean(b.isFavorite),
              isArchived: Boolean(b.isArchived),
              collectionId: b.collectionId || null,
              versionClock: b.versionClock || {},
            };
          } catch {
            // Sealing fallback
          }
        }
        if ((b as any).ciphertext && (b as any).nonce) {
          return {
            id: b.id,
            isVault: true,
            ciphertext: (b as any).ciphertext,
            nonce: (b as any).nonce,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
            deletedAt: b.deletedAt || null,
            isPinned: Boolean(b.isPinned),
            isFavorite: Boolean(b.isFavorite),
            isArchived: Boolean(b.isArchived),
            collectionId: b.collectionId || null,
            versionClock: b.versionClock || {},
          };
        }
      }
      return b;
    });

    this.persist('bookmarks', serialized);
  }

  // --- Private Vault Seam ---

  public getVaultConfig(): VaultConfig {
    return { ...this.vaultConfig };
  }

  public isVaultUnlocked(): boolean {
    return this.vaultSession.isUnlocked();
  }

  private armAutoLockTimer(): void {
    this.clearAutoLockTimer();
    const minutes = this.vaultConfig.autoLockTimeoutMinutes || 5;
    if (minutes > 0) {
      this.autoLockTimer = setTimeout(() => {
        this.lockVault();
      }, minutes * 60 * 1000);
    }
  }

  private clearAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  private unsealVaultBookmarksInMemory(): void {
    const vaultKey = this.vaultSession.getVaultMasterKey();

    this.bookmarks = this.bookmarks.map((b) => {
      if (b.isVault) {
        // 1. Primary unseal: from bookmark envelope ciphertext
        if ((b as any).ciphertext && (b as any).nonce) {
          const unsealed = this.vaultSession.unseal(
            (b as any).ciphertext,
            (b as any).nonce,
            b.id,
          );
          if (unsealed) {
            return {
              ...unsealed,
              isVault: true,
              isPinned: b.isPinned ?? unsealed.isPinned,
              isFavorite: b.isFavorite ?? unsealed.isFavorite,
              isArchived: b.isArchived ?? unsealed.isArchived,
              collectionId: b.collectionId ?? unsealed.collectionId,
              ciphertext: (b as any).ciphertext,
              nonce: (b as any).nonce,
            };
          }
        }

        // 2. Recovery unseal: if title is 'Locked Vault Item' or URL missing, look up sync delta
        if ((!b.url || b.title === 'Locked Vault Item') && vaultKey) {
          const matchingDelta = this.pendingDeltas.find((d) => d.entityId === b.id);
          if (matchingDelta) {
            try {
              const recordKey = deriveRecordKey(vaultKey, b.id);
              const unsealed = unsealRecord<Bookmark>(recordKey, matchingDelta.ciphertext, matchingDelta.nonce);
              if (unsealed?.data) {
                return {
                  ...unsealed.data,
                  isVault: true,
                  isPinned: b.isPinned ?? unsealed.data.isPinned,
                  isFavorite: b.isFavorite ?? unsealed.data.isFavorite,
                  isArchived: b.isArchived ?? unsealed.data.isArchived,
                  collectionId: b.collectionId ?? unsealed.data.collectionId,
                  ciphertext: matchingDelta.ciphertext,
                  nonce: matchingDelta.nonce,
                };
              }
            } catch {}

            try {
              const masterRecordKey = deriveRecordKey(this.masterKey, b.id);
              const unsealed = unsealRecord<Bookmark>(masterRecordKey, matchingDelta.ciphertext, matchingDelta.nonce);
              if (unsealed?.data) {
                return {
                  ...unsealed.data,
                  isVault: true,
                  isPinned: b.isPinned ?? unsealed.data.isPinned,
                  isFavorite: b.isFavorite ?? unsealed.data.isFavorite,
                  isArchived: b.isArchived ?? unsealed.data.isArchived,
                  collectionId: b.collectionId ?? unsealed.data.collectionId,
                  ciphertext: matchingDelta.ciphertext,
                  nonce: matchingDelta.nonce,
                };
              }
            } catch {}
          }
        }
      }
      return b;
    });

    // Discard any remaining unrecoverable corrupted items that have no URL and no ciphertext
    this.bookmarks = this.bookmarks.filter(
      (b) => !(b.isVault && !b.url && b.title === 'Locked Vault Item' && !(b as any).ciphertext),
    );

    this.persistBookmarks();
  }

  public setupVault(
    pin: string,
    wipeAfterAttempts = 5,
    autoLockMinutes = 5,
  ): { success: boolean; error?: string } {
    try {
      const config = this.vaultSession.setup(pin, undefined, this.masterKey);
      config.wipeAfterAttempts = wipeAfterAttempts;
      config.autoLockTimeoutMinutes = autoLockMinutes;
      config.failedAttempts = 0;
      this.vaultConfig = config;
      this.persist('vaultConfig', this.vaultConfig);
      this.armAutoLockTimer();
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public restoreVaultFromSync(
    passphrase: string,
    pin: string,
    wipeAfterAttempts = 5,
    autoLockMinutes = 5,
  ): { success: boolean; error?: string } {
    try {
      const config = this.vaultSession.restoreFromSync(passphrase, this.masterKey, pin);
      config.wipeAfterAttempts = wipeAfterAttempts;
      config.autoLockTimeoutMinutes = autoLockMinutes;
      config.failedAttempts = 0;
      this.vaultConfig = config;
      this.persist('vaultConfig', this.vaultConfig);

      this.unsealVaultBookmarksInMemory();
      this.armAutoLockTimer();
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public unlockVault(pin: string, externalConfig?: VaultConfig): VaultUnlockResult {
    const activeConfig = externalConfig || this.vaultConfig;
    if (!activeConfig.isConfigured) {
      return {
        success: false,
        error: 'Private Vault is not configured.',
        remainingAttempts: 0,
        wiped: false,
      };
    }

    const success = this.vaultSession.unlock(pin, activeConfig);
    if (success) {
      this.vaultConfig = { ...activeConfig, failedAttempts: 0 };
      this.persist('vaultConfig', this.vaultConfig);
      this.unsealVaultBookmarksInMemory();
      this.armAutoLockTimer();
      this.notify();
      return { success: true };
    }

    // Failed attempt calculation and auto-wipe
    const newFailed = (activeConfig.failedAttempts || 0) + 1;
    const wipeThreshold = activeConfig.wipeAfterAttempts || 5;

    if (newFailed >= wipeThreshold) {
      this.wipeVault();
      return {
        success: false,
        error: 'Vault permanently wiped due to too many failed attempts.',
        remainingAttempts: 0,
        wiped: true,
      };
    }

    const remaining = wipeThreshold - newFailed;
    this.vaultConfig = { ...activeConfig, failedAttempts: newFailed };
    this.persist('vaultConfig', this.vaultConfig);
    this.notify();
    return {
      success: false,
      error: 'Incorrect 7-digit PIN.',
      remainingAttempts: remaining,
      wiped: false,
    };
  }

  public lockVault(): void {
    this.clearAutoLockTimer();

    // 1. If currently unlocked, seal all in-memory vault items and attach ciphertext/nonce
    if (this.vaultSession.isUnlocked()) {
      this.bookmarks = this.bookmarks.map((b) => {
        if (b.isVault && b.url && b.title !== 'Locked Vault Item') {
          try {
            const sealed = this.vaultSession.seal(b);
            return {
              id: b.id,
              url: '',
              title: 'Locked Vault Item',
              description: '',
              notes: '',
              faviconUrl: '',
              previewImageUrl: '',
              tags: [],
              collectionId: b.collectionId || null,
              isVault: true,
              isArchived: Boolean(b.isArchived),
              isFavorite: Boolean(b.isFavorite),
              isPinned: Boolean(b.isPinned),
              createdAt: b.createdAt,
              updatedAt: b.updatedAt,
              deletedAt: b.deletedAt || null,
              versionClock: b.versionClock || {},
              ciphertext: sealed.ciphertext,
              nonce: sealed.nonce,
            };
          } catch {}
        }
        return b;
      });
    }

    // 2. Persist sealed state to storage
    this.persistBookmarks();

    // 3. Zero out key from memory
    this.vaultSession.lock();

    // 4. Notify UI
    this.notify();
  }

  public wipeVault(): void {
    this.clearAutoLockTimer();
    this.vaultSession.wipe();

    // Remove all vault bookmarks from memory & mutation log
    const vaultBookmarks = this.bookmarks.filter((b) => b.isVault);
    this.bookmarks = this.bookmarks.filter((b) => !b.isVault);
    this.persistBookmarks();

    for (const b of vaultBookmarks) {
      this.mutationLog.recordTombstone(b.id);
    }
    this.persist('deletedTombstones', this.mutationLog.getTombstones());

    // Reset vault config to unconfigured
    this.vaultConfig = {
      ...DEFAULT_VAULT_CONFIG,
      isConfigured: false,
    };
    this.persist('vaultConfig', this.vaultConfig);
    this.notify();
  }

  public enableVaultSync(passphrase: string, userPin: string): { success: boolean; error?: string } {
    try {
      const config = this.vaultSession.enableSync(passphrase, this.masterKey, userPin, this.vaultConfig);
      this.vaultConfig = config;
      this.persist('vaultConfig', this.vaultConfig);
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public disableVaultSync(): void {
    this.vaultConfig = { ...this.vaultConfig, isSyncEnabled: false };
    this.persist('vaultConfig', this.vaultConfig);
    this.notify();
  }

  private persist(key: string, data: unknown): void {
    this.storage.setItem(`${this.prefix}${key}`, JSON.stringify(data));
  }

  private notify(): void {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch {}
    }
  }

  public subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // --- Getters ---

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getBookmarks(): Bookmark[] {
    return [...this.bookmarks];
  }

  public getBookmark(id: string): Bookmark | null {
    return this.bookmarks.find((b) => b.id === id) || null;
  }

  public getTags(): Tag[] {
    return [...this.tags];
  }

  public getCollections(): Collection[] {
    return [...this.collections];
  }

  public getPendingDeltasCount(): number {
    return this.pendingDeltas.length;
  }

  public getSyncCursor(): number {
    return this.syncCursor;
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  public getSyncServerUrl(): string {
    return this.relayTransport.getServerUrl();
  }

  public setSyncServerUrl(url: string): void {
    this.relayTransport.setServerUrl(url);
  }

  // --- Authentication Seam ---

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public getAuthUser(): User | null {
    return this.authUser ? { ...this.authUser } : null;
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
    this.relayTransport.setAuthToken(token);
    if (token) {
      this.storage.setItem(`${this.prefix}authToken`, token);
    } else {
      this.storage.removeItem(`${this.prefix}authToken`);
    }
  }

  public setAuthUser(user: User | null): void {
    this.authUser = user;
    if (user) {
      this.persist('authUser', user);
    } else {
      this.storage.removeItem(`${this.prefix}authUser`);
    }
  }

  public async sendRegistrationOtp(
    email: string,
  ): Promise<{ success: boolean; message?: string; devOtp?: string; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl) {
      return { success: false, error: 'Sync server URL is not configured' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/register/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || `Failed to send verification code (${res.status})` };
      }

      return {
        success: true,
        message: data.message || 'Verification code sent.',
        devOtp: data.devOtp,
      };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Network error sending OTP' };
    }
  }

  public async registerAccount(
    email: string,
    password: string,
    otpCode: string,
    deviceName?: string,
    pbkdf2Rounds?: number,
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl) {
      return { success: false, error: 'Sync server URL is not configured' };
    }

    try {
      const { authKeyHash, encKey } = deriveAuthAndEncryptionKeys(email, password, pbkdf2Rounds);
      const envelope = wrapMasterKey(this.masterKey, encKey);

      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          authKeyHash,
          wrappedMasterKey: envelope.wrappedMasterKey,
          wrappedMasterKeyNonce: envelope.wrappedMasterKeyNonce,
          deviceId: this.deviceId,
          deviceName,
          otpCode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || `Registration failed with status ${res.status}` };
      }

      const data = await res.json();
      this.setAuthToken(data.accessToken);
      this.setAuthUser(data.user);
      if (data.refreshToken) {
        this.storage.setItem(`${this.prefix}refreshToken`, data.refreshToken);
      }

      // Initial sync
      await this.sync(true).catch(() => {});
      this.notify();

      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Registration request failed' };
    }
  }

  public async loginAccount(
    email: string,
    password: string,
    deviceName?: string,
    pbkdf2Rounds?: number,
  ): Promise<{
    success: boolean;
    requires2FA?: boolean;
    challengeToken?: string;
    user?: User;
    error?: string;
  }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl) {
      return { success: false, error: 'Sync server URL is not configured' };
    }

    try {
      const { authKeyHash, encKey } = deriveAuthAndEncryptionKeys(email, password, pbkdf2Rounds);
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;

      const res = await fetchFn(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          authKeyHash,
          deviceId: this.deviceId,
          deviceName,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || `Login failed with status ${res.status}` };
      }

      const data = await res.json();

      if (data.requires2FA) {
        return {
          success: true,
          requires2FA: true,
          challengeToken: data.challengeToken,
        };
      }

      // Unwrap and install remote Master Key
      if (data.wrappedMasterKey && data.wrappedMasterKeyNonce) {
        const unwrapRes = unwrapMasterKey(data.wrappedMasterKey, data.wrappedMasterKeyNonce, encKey);
        if (unwrapRes.masterKey) {
          this.setMasterKey(uint8ArrayToBase64(unwrapRes.masterKey));
        } else {
          return { success: false, error: `Failed to decrypt master key: ${unwrapRes.error}` };
        }
      }

      this.setAuthToken(data.accessToken);
      this.setAuthUser(data.user);
      if (data.refreshToken) {
        this.storage.setItem(`${this.prefix}refreshToken`, data.refreshToken);
      }

      // Initial sync
      await this.sync(false).catch(() => {});
      this.notify();

      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Login request failed' };
    }
  }

  public async verify2FALogin(
    challengeToken: string,
    code: string,
    email: string,
    password: string,
    pbkdf2Rounds?: number,
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl) {
      return { success: false, error: 'Sync server URL is not configured' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          code,
          deviceId: this.deviceId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || '2FA verification failed' };
      }

      const data = await res.json();
      const { encKey } = deriveAuthAndEncryptionKeys(email, password, pbkdf2Rounds);

      if (data.wrappedMasterKey && data.wrappedMasterKeyNonce) {
        const unwrapRes = unwrapMasterKey(data.wrappedMasterKey, data.wrappedMasterKeyNonce, encKey);
        if (unwrapRes.masterKey) {
          this.setMasterKey(uint8ArrayToBase64(unwrapRes.masterKey));
        } else {
          return { success: false, error: `Failed to decrypt master key: ${unwrapRes.error}` };
        }
      }

      this.setAuthToken(data.accessToken);
      this.setAuthUser(data.user);
      if (data.refreshToken) {
        this.storage.setItem(`${this.prefix}refreshToken`, data.refreshToken);
      }

      await this.sync(false).catch(() => {});
      this.notify();

      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: (err as Error).message || '2FA verification request failed' };
    }
  }

  public async logoutAccount(): Promise<void> {
    const serverUrl = this.getSyncServerUrl();
    const refreshToken = this.storage.getItem(`${this.prefix}refreshToken`);

    if (serverUrl) {
      try {
        const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
        await fetchFn(`${serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
    }

    this.setAuthToken(null);
    this.setAuthUser(null);
    this.storage.removeItem(`${this.prefix}refreshToken`);
    this.notify();
  }

  public async setup2FA(): Promise<{
    success: boolean;
    data?: { secret: string; otpauthUri: string; backupCodes: string[] };
    error?: string;
  }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl || !this.authToken) {
      return { success: false, error: 'Not authenticated or server URL missing' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/2fa/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to setup 2FA' };
      }

      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message || '2FA setup request failed' };
    }
  }

  public async enable2FA(
    secret: string,
    code: string,
    backupCodes: string[],
  ): Promise<{ success: boolean; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl || !this.authToken) {
      return { success: false, error: 'Not authenticated or server URL missing' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/2fa/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ secret, code, backupCodes }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to enable 2FA' };
      }

      if (this.authUser) {
        this.setAuthUser({ ...this.authUser, totpEnabled: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message || '2FA enable request failed' };
    }
  }

  public async disable2FA(code: string): Promise<{ success: boolean; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl || !this.authToken) {
      return { success: false, error: 'Not authenticated or server URL missing' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to disable 2FA' };
      }

      if (this.authUser) {
        this.setAuthUser({ ...this.authUser, totpEnabled: false });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message || '2FA disable request failed' };
    }
  }

  public async checkAuthSession(): Promise<{ success: boolean; user?: User; error?: string }> {
    const serverUrl = this.getSyncServerUrl();
    if (!serverUrl || !this.authToken) {
      return { success: false, error: 'No active session' };
    }

    try {
      const fetchFn = (this.relayTransport as any).fetchFn || globalThis.fetch;
      const res = await fetchFn(`${serverUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        this.setAuthUser(data.user);
        return { success: true, user: data.user };
      }

      const refreshToken = this.storage.getItem(`${this.prefix}refreshToken`);
      if (res.status === 401 && refreshToken) {
        const refreshRes = await fetchFn(`${serverUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          this.setAuthToken(refreshData.accessToken);
          if (refreshData.refreshToken) {
            this.storage.setItem(`${this.prefix}refreshToken`, refreshData.refreshToken);
          }
          const profileRes = await fetchFn(`${serverUrl}/api/auth/me`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${refreshData.accessToken}` },
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            this.setAuthUser(profileData.user);
            return { success: true, user: profileData.user };
          }
        }
      }

      await this.logoutAccount();
      return { success: false, error: 'Session expired' };
    } catch (err) {
      return { success: false, error: (err as Error).message || 'Session verification failed' };
    }
  }

  // --- Mutation Operations ---

  public addBookmark(input: CreateBookmarkInput): Bookmark {
    const id = (input as any).id || crypto.randomUUID();
    const isVaultItem = Boolean(input.isVault);

    let normalizedUrl = (input.url || '').trim();
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    let hostname = '';
    try {
      hostname = new URL(normalizedUrl).hostname;
    } catch {
      hostname = normalizedUrl;
    }

    const bookmark: Bookmark = {
      id,
      url: normalizedUrl,
      title: input.title || normalizedUrl,
      description: input.description || '',
      notes: input.notes || '',
      faviconUrl: input.faviconUrl || `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
      previewImageUrl: input.previewImageUrl || '',
      tags: input.tags || [],
      collectionId: input.collectionId || null,
      isVault: isVaultItem,
      isArchived: input.isArchived || false,
      isFavorite: input.isFavorite || false,
      isPinned: input.isPinned || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      versionClock: {},
    };

    // Auto-register any new tags
    if (Array.isArray(input.tags)) {
      for (const t of input.tags) {
        const clean = t.trim().toLowerCase();
        if (clean && !this.tags.some((x) => x.name.toLowerCase() === clean)) {
          this.addTag(clean);
        }
      }
    }

    const key =
      isVaultItem && this.vaultSession.isUnlocked()
        ? this.vaultSession.getVaultMasterKey()!
        : this.masterKey;

    const { delta, updatedBookmark } = this.mutationLog.recordBookmarkMutation({
      bookmark,
      key,
      deviceId: this.deviceId,
    });

    const bookmarkWithEnvelope = isVaultItem
      ? { ...updatedBookmark, ciphertext: delta.ciphertext, nonce: delta.nonce }
      : updatedBookmark;

    this.pendingDeltas.push(delta);
    this.bookmarks = [bookmarkWithEnvelope, ...this.bookmarks];

    this.persistBookmarks();
    this.persist('pendingDeltas', this.pendingDeltas);
    this.persist('deletedTombstones', this.mutationLog.getTombstones());
    if (isVaultItem && this.vaultSession.isUnlocked()) {
      this.armAutoLockTimer();
    }
    this.notify();
    this.triggerGistAutoBackup();

    return bookmarkWithEnvelope;
  }

  public updateBookmark(id: string, input: UpdateBookmarkInput): Bookmark | null {
    const existingIndex = this.bookmarks.findIndex((b) => b.id === id);
    if (existingIndex < 0) return null;

    const existing = this.bookmarks[existingIndex]!;

    // Auto-register any new tags
    if (Array.isArray(input.tags)) {
      for (const t of input.tags) {
        const clean = t.trim().toLowerCase();
        if (clean && !this.tags.some((x) => x.name.toLowerCase() === clean)) {
          this.addTag(clean);
        }
      }
    }

    const updated: Bookmark = {
      ...existing,
      ...input,
    };

    const key =
      updated.isVault && this.vaultSession.isUnlocked()
        ? this.vaultSession.getVaultMasterKey()!
        : this.masterKey;

    const { delta, updatedBookmark } = this.mutationLog.recordBookmarkMutation({
      bookmark: updated,
      key,
      deviceId: this.deviceId,
    });

    const bookmarkWithEnvelope = updated.isVault
      ? { ...updatedBookmark, ciphertext: delta.ciphertext, nonce: delta.nonce }
      : updatedBookmark;

    this.bookmarks = [
      ...this.bookmarks.slice(0, existingIndex),
      bookmarkWithEnvelope,
      ...this.bookmarks.slice(existingIndex + 1),
    ];

    this.pendingDeltas.push(delta);
    this.persistBookmarks();
    this.persist('pendingDeltas', this.pendingDeltas);
    if (updated.isVault && this.vaultSession.isUnlocked()) {
      this.armAutoLockTimer();
    }
    this.notify();
    this.triggerGistAutoBackup();

    return updatedBookmark;
  }

  public deleteBookmark(id: string): boolean {
    const existingIndex = this.bookmarks.findIndex((b) => b.id === id);
    if (existingIndex < 0) return false;

    const b = this.bookmarks[existingIndex]!;
    const key =
      b.isVault && this.vaultSession.isUnlocked()
        ? this.vaultSession.getVaultMasterKey()!
        : this.masterKey;

    const { delta } = this.mutationLog.recordBookmarkMutation({
      bookmark: b,
      key,
      deviceId: this.deviceId,
      isDeleted: true,
    });

    this.bookmarks = this.bookmarks.filter((item) => item.id !== id);
    this.pendingDeltas.push(delta);

    this.persistBookmarks();
    this.persist('pendingDeltas', this.pendingDeltas);
    this.persist('deletedTombstones', this.mutationLog.getTombstones());
    if (b.isVault && this.vaultSession.isUnlocked()) {
      this.armAutoLockTimer();
    }
    this.notify();
    this.triggerGistAutoBackup();

    return true;
  }

  public addTag(name: string, color = '#0891b2'): Tag {
    const trimmed = name.trim().toLowerCase();
    const existing = this.tags.find((t) => t.name === trimmed);
    if (existing) return existing;

    const newTag: Tag = {
      id: `t-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tags.push(newTag);
    this.persist('tags', this.tags);
    this.notify();
    return newTag;
  }

  public deleteTag(target: string): boolean {
    const initialLen = this.tags.length;
    this.tags = this.tags.filter((t) => t.id !== target && t.name.toLowerCase() !== target.toLowerCase());
    if (this.tags.length === initialLen) return false;

    this.bookmarks = this.bookmarks.map((b) => {
      if (b.tags.includes(target)) {
        return {
          ...b,
          tags: b.tags.filter((t) => t !== target && t.toLowerCase() !== target.toLowerCase()),
        };
      }
      return b;
    });

    this.persist('bookmarks', this.bookmarks);
    this.persist('tags', this.tags);
    this.notify();
    return true;
  }

  public addCollection(name: string, color?: string, parentId: string | null = null): Collection {
    const trimmed = name.trim();
    const existing = this.collections.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const assignedColor = getCollectionColor(trimmed, color);

    const newCol: Collection = {
      id: `c-${crypto.randomUUID().slice(0, 8)}`,
      name: trimmed,
      color: assignedColor,
      parentId,
      sortOrder: this.collections.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.collections.push(newCol);

    const delta = this.mutationLog.recordCollectionMutation({
      collection: newCol,
      masterKey: this.masterKey,
      deviceId: this.deviceId,
    });

    this.pendingDeltas.push(delta);
    this.persist('collections', this.collections);
    this.persist('pendingDeltas', this.pendingDeltas);
    this.notify();
    this.triggerGistAutoBackup();

    setTimeout(() => {
      this.sync().catch(() => {});
    }, 50);

    return newCol;
  }

  public deleteCollection(id: string): boolean {
    const col = this.collections.find((c) => c.id === id);
    if (!col) return false;

    this.collections = this.collections.filter((c) => c.id !== id);

    this.bookmarks = this.bookmarks.map((b) => {
      if (b.collectionId === id) {
        return { ...b, collectionId: null };
      }
      return b;
    });

    const delta = this.mutationLog.recordCollectionMutation({
      collection: col,
      masterKey: this.masterKey,
      deviceId: this.deviceId,
      isDeleted: true,
    });

    this.pendingDeltas.push(delta);
    this.persist('collections', this.collections);
    this.persist('bookmarks', this.bookmarks);
    this.persist('pendingDeltas', this.pendingDeltas);
    this.persist('deletedTombstones', this.mutationLog.getTombstones());
    this.notify();
    this.triggerGistAutoBackup();

    setTimeout(() => {
      this.sync().catch(() => {});
    }, 50);

    return true;
  }

  // --- Key Management ---

  public getMasterKeyBase64(): string {
    return this.masterKeyBase64;
  }

  public setMasterKey(b64: string): { success: boolean; error?: string } {
    try {
      const trimmed = b64.trim();
      const bytes = base64ToUint8Array(trimmed);
      if (bytes.byteLength !== 32) {
        throw new Error('Key must be exactly 32 bytes (256 bits)');
      }
      this.masterKeyBase64 = trimmed;
      this.masterKey = bytes;
      this.storage.setItem(`${this.prefix}masterKey`, trimmed);
      this.syncCursor = 0;
      this.notify();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // --- Synchronization via SyncTransport Seam ---

  public async sync(forceFullPush = false): Promise<{
    success: boolean;
    pulledCount: number;
    pushedCount: number;
    error?: string;
  }> {
    if (this.isSyncing) return { success: false, pulledCount: 0, pushedCount: 0 };
    this.isSyncing = true;
    this.notify();

    let pushedCount = 0;
    let pulledCount = 0;
    const transport = this.customTransport || this.relayTransport;

    try {
      let deltasToPush = [...this.pendingDeltas];

      // Full push: package all local non-deleted bookmarks and collections
      if (forceFullPush && (this.bookmarks.length > 0 || this.collections.length > 0)) {
        deltasToPush = [...this.pendingDeltas];
        for (const b of this.bookmarks) {
          if (b.deletedAt || this.mutationLog.isDeleted(b.id)) continue;
          const key =
            b.isVault && this.vaultSession.isUnlocked()
              ? this.vaultSession.getVaultMasterKey()!
              : this.masterKey;

          const { delta } = this.mutationLog.recordBookmarkMutation({
            bookmark: b,
            key,
            deviceId: this.deviceId,
          });
          deltasToPush.push(delta);
        }

        for (const col of this.collections) {
          const delta = this.mutationLog.recordCollectionMutation({
            collection: col,
            masterKey: this.masterKey,
            deviceId: this.deviceId,
          });
          deltasToPush.push(delta);
        }
      }

      // 1. Push
      if (deltasToPush.length > 0) {
        const pushRes = await transport.push({
          deviceId: this.deviceId,
          clientCursor: this.syncCursor,
          deltas: deltasToPush,
        });

        if (pushRes.success) {
          pushedCount = deltasToPush.length;
          this.pendingDeltas = [];
          this.persist('pendingDeltas', this.pendingDeltas);
        }
      }

      // 2. Pull
      const pullRes = await transport.pull({
        deviceId: this.deviceId,
        sinceCursor: this.syncCursor,
        limit: 200,
      });

      if (pullRes.success && pullRes.deltas.length > 0) {
        const result = this.mutationLog.reconcileRemoteDeltas({
          deltas: pullRes.deltas,
          localBookmarks: this.bookmarks,
          localCollections: this.collections,
          localTags: this.tags,
          masterKey: this.masterKey,
          vaultMasterKey: this.vaultSession.isUnlocked()
            ? this.vaultSession.getVaultMasterKey()!
            : null,
          deviceId: this.deviceId,
        });

        this.bookmarks = result.updatedBookmarks;
        this.collections = result.updatedCollections;
        this.tags = result.updatedTags;
        pulledCount = result.pulledCount;
        this.syncCursor = pullRes.nextCursor;

        this.persistBookmarks();
        this.persist('collections', this.collections);
        this.persist('tags', this.tags);
        this.persist('deletedTombstones', this.mutationLog.getTombstones());
      }

      this.isSyncing = false;
      this.notify();
      return { success: true, pulledCount, pushedCount };
    } catch (err) {
      this.isSyncing = false;
      this.notify();
      return {
        success: false,
        pulledCount: 0,
        pushedCount: 0,
        error: (err as Error).message,
      };
    }
  }

  // --- GitHub Gist Backup & Restore ---

  public getGistConfig(): GistConfig {
    return { ...this.gistConfig };
  }

  public setGistConfig(config: Partial<GistConfig>): void {
    this.gistConfig = { ...this.gistConfig, ...config };
    this.persist('gistConfig', this.gistConfig);
    this.notify();
  }

  public async backupToGist(): Promise<{
    success: boolean;
    gistId?: string;
    error?: string;
  }> {
    if (!this.gistConfig.token.trim()) {
      return { success: false, error: 'GitHub Personal Access Token is required' };
    }

    try {
      const payload: FullBackupPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        deviceId: this.deviceId,
        bookmarks: this.bookmarks,
        collections: this.collections,
        tags: this.tags,
        tombstones: this.mutationLog.getTombstones(),
        vaultConfig: this.vaultConfig,
      };

      const result = await pushEncryptedGistBackup(
        this.gistConfig.token,
        this.gistConfig.gistId,
        payload,
        this.masterKey,
      );

      if (result.success) {
        this.setGistConfig({
          gistId: result.gistId || this.gistConfig.gistId,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });
      } else {
        this.setGistConfig({ lastError: result.error || 'Backup failed' });
      }

      return result;
    } catch (err) {
      const errMsg = (err as Error).message;
      this.setGistConfig({ lastError: errMsg });
      return { success: false, error: errMsg };
    }
  }

  public async restoreFromGist(targetGistId?: string): Promise<{
    success: boolean;
    restoredCount?: number;
    error?: string;
  }> {
    const gistIdToUse = targetGistId || this.gistConfig.gistId;
    if (!this.gistConfig.token.trim() || !gistIdToUse) {
      return { success: false, error: 'GitHub Token and Gist ID are required' };
    }

    try {
      const result = await pullEncryptedGistBackup(
        this.gistConfig.token,
        gistIdToUse,
        this.masterKey,
      );

      if (!result.success || !result.payload) {
        return { success: false, error: result.error || 'Failed to pull Gist backup' };
      }

      const res = this.restoreFromPayload(result.payload);
      if (res.success) {
        this.setGistConfig({
          gistId: gistIdToUse,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        });
      }
      return res;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  public triggerGistAutoBackup(): void {
    if (!this.gistConfig.autoSync || !this.gistConfig.token.trim()) return;

    if (this.gistDebounceTimer) {
      clearTimeout(this.gistDebounceTimer);
    }

    this.gistDebounceTimer = setTimeout(() => {
      this.backupToGist().catch((err) => {
        console.warn('[LocalStoreEngine] Gist auto-backup failed:', err);
      });
    }, 2500);
  }

  // --- Full Backup Payload Export & Restore ---

  public exportBackup(): FullBackupPayload {
    return this.exportFullBackupPayload();
  }

  public restoreBackup(payload: FullBackupPayload): {
    success: boolean;
    restoredCount: number;
    error?: string;
  } {
    return this.restoreFromPayload(payload);
  }

  public exportFullBackupPayload(): FullBackupPayload {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      masterKey: this.masterKeyBase64,
      bookmarks: this.bookmarks,
      collections: this.collections,
      tags: this.tags,
      tombstones: this.mutationLog.getTombstones(),
      vaultConfig: this.vaultConfig,
    };
  }

  public restoreFromPayload(payload: FullBackupPayload): {
    success: boolean;
    restoredCount: number;
    error?: string;
  } {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid backup payload format');
      }

      if (payload.masterKey) {
        this.setMasterKey(payload.masterKey);
      }

      const incomingBookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
      const incomingCollections = Array.isArray(payload.collections) ? payload.collections : [];
      const incomingTags = Array.isArray(payload.tags) ? payload.tags : [];
      const incomingTombstones =
        payload.tombstones && typeof payload.tombstones === 'object' ? payload.tombstones : {};

      // Merge collections
      for (const col of incomingCollections) {
        const existingIdx = this.collections.findIndex((c) => c.id === col.id);
        if (existingIdx >= 0) {
          this.collections[existingIdx] = col;
        } else {
          this.collections.push(col);
        }
      }

      // Merge tags
      for (const t of incomingTags) {
        if (!this.tags.some((x) => x.name.toLowerCase() === t.name.toLowerCase())) {
          this.tags.push(t);
        }
      }

      // Merge tombstones
      const mergedTombstones = { ...this.mutationLog.getTombstones(), ...incomingTombstones };
      this.mutationLog.setTombstones(mergedTombstones);

      // Merge bookmarks
      for (const b of incomingBookmarks) {
        if (this.mutationLog.isDeleted(b.id, b.updatedAt)) continue;

        const existingIdx = this.bookmarks.findIndex((x) => x.id === b.id);
        if (existingIdx >= 0) {
          this.bookmarks[existingIdx] = b;
        } else {
          this.bookmarks.push(b);
        }
      }

      // Restore vault configuration if present in payload
      if (payload.vaultConfig && typeof payload.vaultConfig === 'object') {
        this.vaultConfig = {
          ...DEFAULT_VAULT_CONFIG,
          ...payload.vaultConfig,
        };
        this.persist('vaultConfig', this.vaultConfig);
      }

      this.persistBookmarks();
      this.persist('collections', this.collections);
      this.persist('tags', this.tags);
      this.persist('deletedTombstones', this.mutationLog.getTombstones());

      this.notify();
      return { success: true, restoredCount: incomingBookmarks.length };
    } catch (err) {
      return { success: false, restoredCount: 0, error: (err as Error).message };
    }
  }

  public destroy(): void {
    this.clearAutoLockTimer();
    if (this.gistDebounceTimer) {
      clearTimeout(this.gistDebounceTimer);
      this.gistDebounceTimer = null;
    }
    this.subscribers.clear();
  }
}
