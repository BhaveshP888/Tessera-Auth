import { useMemo } from 'react';
import { create } from 'zustand';
import type {
  AuditEvent,
  Bookmark,
  Collection,
  CreateBookmarkInput,
  ExtensionManifest,
  Tag,
  UpdateBookmarkInput,
  VaultConfig,
} from '@tessera/schemas';
import {
  LocalStoreEngine,
  fuzzyRankItems,
  base64ToUint8Array,
  type GistConfig,
  type FullBackupPayload,
  type VaultUnlockResult,
} from '@tessera/core';

const STORAGE_PREFIX = 'tessera_v1_';

const safeJsonParse = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (!item || item === 'undefined' || item === 'null') return fallback;
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
};

const getInitialServerUrl = (): string => {
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000' || window.location.port === '5173') {
      return 'http://localhost:8787';
    }
    return window.location.origin;
  }
  return 'http://localhost:8787';
};

// Singleton engine instance
let engineInstance: LocalStoreEngine | null = null;
export const getEngine = (): LocalStoreEngine => {
  if (!engineInstance) {
    const serverUrl = getInitialServerUrl();
    const boundFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : undefined;
    engineInstance = new LocalStoreEngine({
      syncServerUrl: serverUrl,
      fetchFn: boundFetch,
    });
  }
  return engineInstance;
};

const engine = getEngine();

const initialInstalledExtensions: ExtensionManifest[] = (() => {
  const raw = safeJsonParse<ExtensionManifest[]>(`${STORAGE_PREFIX}extensions`, []);
  const filtered = raw.filter((e) => e.id !== 'pinboard-import');
  const defaultExts: ExtensionManifest[] = [
    {
      id: 'html-import',
      name: 'Browser HTML Bookmarks',
      version: '1.0.0',
      description:
        'Import and export bookmarks, folders, and tags using the standard Netscape HTML bookmarks format used by Chrome, Firefox, Safari, Edge, and Arc.',
      author: 'tessera.community',
      permissions: ['bookmarks.read', 'bookmarks.write', 'tags.write'],
      ui: { commands: ['import-html-file', 'export-html-file'] },
    },
    {
      id: 'markdown-export',
      name: 'Markdown Exporter',
      version: '1.0.0',
      description: 'Export all bookmarks grouped by tag into clean Markdown.',
      author: 'tessera.community',
      permissions: ['bookmarks.read', 'tags.read'],
      ui: { commands: ['export-markdown'] },
    },
  ];
  for (const d of defaultExts) {
    if (!filtered.some((e) => e.id === d.id)) {
      filtered.push(d);
    }
  }
  return filtered;
})();

export interface LibraryState {
  // Data State
  bookmarks: Bookmark[];
  tags: Tag[];
  collections: Collection[];
  pendingDeltasCount: number;
  masterKeyBase64: string;
  isSyncing: boolean;
  syncServerUrl: string;
  deviceId: string;

  // Filter & Section UI State
  searchQuery: string;
  selectedTag: string | null;
  selectedCollectionId: string | null;
  viewFilter: 'all' | 'favorites' | 'archived' | 'pinned';
  activeSection: 'library' | 'vault';

  // Vault State
  vaultConfig: VaultConfig;
  isVaultUnlocked: boolean;

  // Audit Logs & Extensions
  auditLogs: AuditEvent[];
  installedExtensions: ExtensionManifest[];
  gistConfig: GistConfig;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedCollectionId: (id: string | null) => void;
  setViewFilter: (filter: 'all' | 'favorites' | 'archived' | 'pinned') => void;
  setActiveSection: (section: 'library' | 'vault') => void;
  setSyncServerUrl: (url: string) => void;

  addBookmark: (input: CreateBookmarkInput) => Bookmark;
  updateBookmark: (id: string, input: UpdateBookmarkInput) => Bookmark | null;
  deleteBookmark: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;

  addTag: (name: string, color?: string) => void;
  deleteTag: (nameOrId: string) => void;
  addCollection: (name: string, color?: string, description?: string) => Collection;
  deleteCollection: (id: string) => void;

  setupVault: (
    pin: string,
    wipeAfterAttempts?: number,
    autoLockMinutes?: number,
  ) => { success: boolean; error?: string };
  restoreVaultFromSync: (
    passphrase: string,
    pin: string,
    wipeAfterAttempts?: number,
    autoLockMinutes?: number,
  ) => { success: boolean; error?: string };
  wipeVaultData: () => void;
  unlockVault: (pin: string) => VaultUnlockResult;
  lockVault: () => void;
  enableVaultSync: (passphrase: string) => { success: boolean; error?: string };
  disableVaultSync: () => void;

  importMasterKey: (b64: string) => { success: boolean; error?: string };
  performSync: (
    forceFullPush?: boolean,
  ) => Promise<{ success: boolean; pulledCount?: number; pushedCount?: number; error?: string }>;
  exportFullBackup: () => FullBackupPayload;
  restoreFullBackup: (
    backup: FullBackupPayload,
  ) => Promise<{ success: boolean; restoredCount: number; error?: string }>;
  setGistConfig: (updates: Partial<GistConfig>) => GistConfig | undefined;
  backupToGist: () => Promise<{ success: boolean; gistId?: string; error?: string }>;
  restoreFromGist: (
    gistId?: string,
  ) => Promise<{ success: boolean; restoredCount?: number; error?: string }>;
  logAudit: (
    type: AuditEvent['type'],
    status: AuditEvent['status'],
    details?: Record<string, unknown>,
    errorMessage?: string,
  ) => void;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  bookmarks: engine.getBookmarks(),
  tags: engine.getTags(),
  collections: engine.getCollections(),
  pendingDeltasCount: engine.getPendingDeltasCount(),
  masterKeyBase64: engine.getMasterKeyBase64(),
  isSyncing: engine.getIsSyncing(),
  syncServerUrl: getInitialServerUrl(),
  deviceId: engine.getDeviceId(),

  searchQuery: '',
  selectedTag: null,
  selectedCollectionId: null,
  viewFilter: 'all',
  activeSection: 'library',

  vaultConfig: engine.getVaultConfig(),
  isVaultUnlocked: engine.isVaultUnlocked(),

  auditLogs: safeJsonParse(`${STORAGE_PREFIX}auditLogs`, []),
  installedExtensions: initialInstalledExtensions,
  gistConfig: engine.getGistConfig(),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedCollectionId: (selectedCollectionId) => set({ selectedCollectionId }),
  setViewFilter: (viewFilter) => set({ viewFilter }),

  setActiveSection: (activeSection) => {
    set({
      activeSection,
      selectedCollectionId: null,
      selectedTag: null,
      searchQuery: '',
    });
  },

  setSyncServerUrl: (url) => {
    set({ syncServerUrl: url });
    engine.setSyncServerUrl(url);
  },

  logAudit: (type, status, details = {}, errorMessage) => {
    const entry: AuditEvent = {
      id: crypto.randomUUID(),
      type,
      status,
      timestamp: new Date().toISOString(),
      details,
      errorMessage,
    };
    const next = [entry, ...get().auditLogs].slice(0, 100);
    localStorage.setItem(`${STORAGE_PREFIX}auditLogs`, JSON.stringify(next));
    set({ auditLogs: next });
  },

  setupVault: (pin, wipeAfterAttempts = 5, autoLockMinutes = 5) => {
    const res = engine.setupVault(pin, wipeAfterAttempts, autoLockMinutes);
    if (res.success) {
      set({ vaultConfig: engine.getVaultConfig(), isVaultUnlocked: true });
      get().logAudit('vault_setup', 'success', {});
    } else {
      get().logAudit('vault_setup', 'error', {}, res.error);
    }
    return res;
  },

  restoreVaultFromSync: (passphrase, pin, wipeAfterAttempts = 5, autoLockMinutes = 5) => {
    const res = engine.restoreVaultFromSync(passphrase, pin, wipeAfterAttempts, autoLockMinutes);
    if (res.success) {
      set({ vaultConfig: engine.getVaultConfig(), isVaultUnlocked: true });
      get().logAudit('vault_unlocked', 'success', { source: 'sync_restore' });
    } else {
      get().logAudit('vault_unlocked', 'error', {}, res.error);
    }
    return res;
  },

  wipeVaultData: () => {
    engine.wipeVault();
    set({
      vaultConfig: engine.getVaultConfig(),
      isVaultUnlocked: false,
      activeSection: 'library',
    });
    get().logAudit('vault_wiped', 'warning', {});
  },

  unlockVault: (pin) => {
    const res = engine.unlockVault(pin);
    set({
      vaultConfig: engine.getVaultConfig(),
      isVaultUnlocked: engine.isVaultUnlocked(),
      ...(res.success ? { activeSection: 'vault' as const } : {}),
    });
    if (res.success) {
      get().logAudit('vault_unlocked', 'success', {});
    } else if (res.wiped) {
      get().logAudit('vault_wiped', 'error', { reason: 'max_failed_attempts_exceeded' });
    } else {
      get().logAudit('vault_pin_failed', 'warning', {
        remainingAttempts: res.remainingAttempts,
      });
    }
    return res;
  },

  lockVault: () => {
    engine.lockVault();
    set({
      vaultConfig: engine.getVaultConfig(),
      isVaultUnlocked: false,
      activeSection: 'library',
    });
    get().logAudit('vault_locked', 'success', {});
  },

  enableVaultSync: (passphrase) => {
    const res = engine.enableVaultSync(passphrase);
    if (res.success) {
      set({ vaultConfig: engine.getVaultConfig() });
      get().logAudit('vault_sync_enabled', 'success', {});
    } else {
      get().logAudit('vault_sync_enabled', 'error', {}, res.error);
    }
    return res;
  },

  disableVaultSync: () => {
    engine.disableVaultSync();
    set({ vaultConfig: engine.getVaultConfig() });
    get().logAudit('vault_sync_disabled', 'success', {});
  },

  addBookmark: (input) => {
    const isVault = input.isVault || get().activeSection === 'vault';
    const created = engine.addBookmark({ ...input, isVault });
    get().logAudit('sync_push', 'success', { action: 'create_bookmark', id: created.id });
    setTimeout(() => {
      engine.sync();
    }, 100);
    return created;
  },

  updateBookmark: (id, input) => {
    const updated = engine.updateBookmark(id, input);
    if (updated) {
      get().logAudit('sync_push', 'success', { action: 'update_bookmark', id });
      setTimeout(() => {
        engine.sync();
      }, 100);
    }
    return updated;
  },

  toggleFavorite: (id) => {
    const item = engine.getBookmarks().find((b) => b.id === id);
    if (item) {
      get().updateBookmark(id, { isFavorite: !item.isFavorite });
    }
  },

  togglePin: (id) => {
    const item = engine.getBookmarks().find((b) => b.id === id);
    if (item) {
      get().updateBookmark(id, { isPinned: !item.isPinned });
    }
  },

  toggleArchive: (id) => {
    const item = engine.getBookmarks().find((b) => b.id === id);
    if (item) {
      get().updateBookmark(id, { isArchived: !item.isArchived });
    }
  },

  deleteBookmark: (id) => {
    const deleted = engine.deleteBookmark(id);
    if (deleted) {
      get().logAudit('sync_push', 'success', { action: 'delete_bookmark', id });
      setTimeout(() => {
        engine.sync();
      }, 100);
    }
    return deleted;
  },

  addTag: (name, color) => {
    engine.addTag(name, color);
  },

  deleteTag: (nameOrId) => {
    engine.deleteTag(nameOrId);
  },

  addCollection: (name, color, description) => {
    return engine.addCollection(name, color, description);
  },

  deleteCollection: (id) => {
    engine.deleteCollection(id);
  },

  importMasterKey: (b64) => {
    const res = engine.setMasterKey(b64);
    if (res.success) {
      get().logAudit('master_key_imported', 'success', {});
      setTimeout(() => {
        engine.sync(false);
      }, 100);
    } else {
      get().logAudit('master_key_imported', 'error', {}, res.error);
    }
    return res;
  },

  performSync: async (forceFullPush = false) => {
    const res = await engine.sync(forceFullPush);
    if (res.success) {
      if (res.pulledCount > 0) get().logAudit('sync_pull', 'success', { pulledCount: res.pulledCount });
      if (res.pushedCount > 0) get().logAudit('sync_push', 'success', { pushedCount: res.pushedCount });
    } else {
      get().logAudit('sync_pull', 'error', {}, res.error);
    }
    return res;
  },

  exportFullBackup: () => {
    return engine.exportBackup();
  },

  restoreFullBackup: async (backup) => {
    const res = await engine.restoreBackup(backup);
    if (res.success) {
      set({ vaultConfig: engine.getVaultConfig() });
      get().logAudit('master_key_imported', 'success', { backupRestored: true, count: res.restoredCount });
    }
    return res;
  },

  setGistConfig: (updates) => {
    engine.setGistConfig(updates);
    const cfg = engine.getGistConfig();
    set({ gistConfig: cfg });
    return cfg;
  },

  backupToGist: async () => {
    const res = await engine.backupToGist();
    set({ gistConfig: engine.getGistConfig() });
    if (res.success) {
      get().logAudit('sync_push', 'success', { action: 'gist_backup', gistId: res.gistId });
    } else {
      get().logAudit('sync_push', 'error', { action: 'gist_backup' }, res.error);
    }
    return res;
  },

  restoreFromGist: async (gistId) => {
    const res = await engine.restoreFromGist(gistId);
    set({ gistConfig: engine.getGistConfig() });
    if (res.success) {
      get().logAudit('master_key_imported', 'success', { action: 'gist_restore', count: res.restoredCount });
    } else {
      get().logAudit('master_key_imported', 'error', { action: 'gist_restore' }, res.error);
    }
    return res;
  },
}));

// Sync engine events directly into Zustand store
engine.subscribe(() => {
  const isUnlocked = engine.isVaultUnlocked();
  useLibraryStore.setState((state) => ({
    bookmarks: engine.getBookmarks(),
    tags: engine.getTags(),
    collections: engine.getCollections(),
    pendingDeltasCount: engine.getPendingDeltasCount(),
    masterKeyBase64: engine.getMasterKeyBase64(),
    isSyncing: engine.getIsSyncing(),
    isVaultUnlocked: isUnlocked,
    vaultConfig: engine.getVaultConfig(),
    gistConfig: engine.getGistConfig(),
    ...(!isUnlocked && state.activeSection === 'vault' ? { activeSection: 'library' as const } : {}),
  }));
});

// Auto-sync with cloud relay on mount, tab focus, and interval
if (typeof window !== 'undefined') {
  engine.sync().catch(() => {});

  window.addEventListener('focus', () => {
    engine.sync().catch(() => {});
  });

  setInterval(() => {
    engine.sync().catch(() => {});
  }, 10000);

  interface ChromeQueueItem {
    url: string;
    title?: string;
    tags?: string[];
    notes?: string;
    collection?: string;
    isVault?: boolean;
  }

  interface ChromeStorageBridge {
    storage?: {
      local?: {
        get: (keys: string[]) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
      };
    };
  }

  // Drain browser extension quick queue
  const drainExtensionQueue = () => {
    const bridge = (window as unknown as { chrome?: ChromeStorageBridge }).chrome;
    const localStore = bridge?.storage?.local;
    if (!localStore) return;

    // 1. Sync live collections to extension
    const colNames = useLibraryStore.getState().collections.map((c) => c.name);
    localStore.set({ tessera_collections: colNames }).catch(() => {});

    // 2. Drain quick queue
    localStore
      .get(['tessera_quick_queue'])
      .then((result) => {
        const queue = result?.['tessera_quick_queue'] as ChromeQueueItem[] | undefined;
        if (Array.isArray(queue) && queue.length > 0) {
          for (const item of queue) {
            let collectionId: string | null = null;
            if (item.collection) {
              const found = engine
                .getCollections()
                .find((c) => c.name.toLowerCase() === item.collection?.toLowerCase());
              if (found) {
                collectionId = found.id;
              } else {
                const newCol = engine.addCollection(item.collection);
                collectionId = newCol.id;
              }
            }

            engine.addBookmark({
              url: item.url,
              title: item.title || item.url,
              tags: item.tags || [],
              notes: item.notes || '',
              collectionId,
              isVault: Boolean(item.isVault),
            });
          }
          localStore.set({ tessera_quick_queue: [] }).catch(() => {});
        }
      })
      .catch(() => {});
  };

  drainExtensionQueue();
  setInterval(drainExtensionQueue, 5000);
}

/**
 * Hook to select and compute filtered bookmarks based on search and active filters
 */
export const useFilteredBookmarks = (): Bookmark[] => {
  const bookmarks = useLibraryStore((s) => s.bookmarks);
  const activeSection = useLibraryStore((s) => s.activeSection);
  const viewFilter = useLibraryStore((s) => s.viewFilter);
  const selectedCollectionId = useLibraryStore((s) => s.selectedCollectionId);
  const selectedTag = useLibraryStore((s) => s.selectedTag);
  const searchQuery = useLibraryStore((s) => s.searchQuery);
  const isVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);

  return useMemo(() => {
    const isViewingVault = activeSection === 'vault';
    if (isViewingVault && !isVaultUnlocked) {
      return [];
    }

    const target = bookmarks.filter((b) => {
      if (b.deletedAt) return false;
      return isViewingVault ? b.isVault === true : !b.isVault;
    });

    const filtered = target.filter((b) => {
      if (viewFilter === 'favorites' && !b.isFavorite) return false;
      if (viewFilter === 'archived' && !b.isArchived) return false;
      if (viewFilter === 'pinned' && !b.isPinned) return false;
      if (viewFilter === 'all' && b.isArchived) return false;

      if (selectedCollectionId && b.collectionId !== selectedCollectionId) return false;
      if (selectedTag && !(b.tags || []).includes(selectedTag)) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (viewFilter === 'all' || viewFilter === 'favorites') {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
      }
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    if (!searchQuery.trim()) {
      return filtered;
    }

    return fuzzyRankItems(
      filtered,
      searchQuery,
      (b) =>
        `${b.title || ''} ${b.url || ''} ${b.description || ''} ${(b.tags || []).join(' ')} ${b.notes || ''}`,
      0.1,
    ).map((r) => r.item);
  }, [
    bookmarks,
    activeSection,
    viewFilter,
    selectedCollectionId,
    selectedTag,
    searchQuery,
    isVaultUnlocked,
  ]);
};

/**
 * Hook to select library counts
 */
export const useBookmarkCounts = () => {
  const bookmarks = useLibraryStore((s) => s.bookmarks);
  return useMemo(() => {
    return {
      allBookmarksCount: bookmarks.filter((b) => !b.deletedAt && !b.isArchived && !b.isVault).length,
      vaultBookmarksCount: bookmarks.filter((b) => !b.deletedAt && b.isVault).length,
    };
  }, [bookmarks]);
};
