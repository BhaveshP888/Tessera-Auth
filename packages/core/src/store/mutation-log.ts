import type { Bookmark, Collection, SyncDelta, Tag } from '@tessera/schemas';
import { deriveRecordKey, sealRecord, unsealRecord } from '../crypto/index.js';
import { incrementVectorClock, reconcileBookmark } from '../sync/index.js';
import { getCollectionColor } from './engine.js';

export interface ReconcileParams {
  deltas: SyncDelta[];
  localBookmarks: Bookmark[];
  localCollections: Collection[];
  localTags: Tag[];
  masterKey: Uint8Array;
  vaultMasterKey: Uint8Array | null;
  deviceId: string;
}

export interface ReconcileResult {
  updatedBookmarks: Bookmark[];
  updatedCollections: Collection[];
  updatedTags: Tag[];
  pulledCount: number;
}

/**
 * MutationLog is a deep module that encapsulates all vector clock causality,
 * AEAD encryption/sealing, tombstone tracking, and conflict resolution.
 */
export class MutationLog {
  private tombstones: Record<string, string> = {};

  constructor(initialTombstones: Record<string, string> = {}) {
    this.tombstones = { ...initialTombstones };
  }

  public getTombstones(): Record<string, string> {
    return { ...this.tombstones };
  }

  public setTombstones(tombstones: Record<string, string>): void {
    this.tombstones = { ...tombstones };
  }

  public recordTombstone(entityId: string, timestamp: string = new Date().toISOString()): void {
    this.tombstones[entityId] = timestamp;
  }

  public isDeleted(entityId: string, itemTimestamp?: string): boolean {
    const tombstoneTime = this.tombstones[entityId];
    if (!tombstoneTime) return false;
    if (!itemTimestamp) return true;
    return new Date(itemTimestamp).getTime() <= new Date(tombstoneTime).getTime();
  }

  /**
   * Records a local bookmark mutation, advancing the vector clock and sealing the delta.
   */
  public recordBookmarkMutation(params: {
    bookmark: Bookmark;
    key: Uint8Array;
    deviceId: string;
    isDeleted?: boolean;
  }): { delta: SyncDelta; updatedBookmark: Bookmark } {
    const { bookmark, key, deviceId, isDeleted = false } = params;
    const now = new Date().toISOString();
    const clock = incrementVectorClock(bookmark.versionClock || {}, deviceId);

    const updatedBookmark: Bookmark = {
      ...bookmark,
      updatedAt: now,
      deletedAt: isDeleted ? now : bookmark.deletedAt || null,
      versionClock: clock,
    };

    if (isDeleted) {
      this.recordTombstone(bookmark.id, now);
    }

    const recordKey = deriveRecordKey(key, bookmark.id);
    const sealed = sealRecord(recordKey, updatedBookmark);

    const delta: SyncDelta = {
      id: crypto.randomUUID(),
      entityType: isDeleted ? 'tombstone' : 'bookmark',
      entityId: bookmark.id,
      deviceId,
      lamportTs: clock[deviceId] || 1,
      vectorClock: clock,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      createdAt: now,
    };

    return { delta, updatedBookmark };
  }

  /**
   * Records a local collection mutation and produces a sealed SyncDelta.
   */
  public recordCollectionMutation(params: {
    collection: Collection;
    masterKey: Uint8Array;
    deviceId: string;
    isDeleted?: boolean;
  }): SyncDelta {
    const { collection, masterKey, deviceId, isDeleted = false } = params;
    const now = new Date().toISOString();

    if (isDeleted) {
      this.recordTombstone(collection.id, now);
    }

    const colKey = deriveRecordKey(masterKey, collection.id);
    const sealed = sealRecord(colKey, collection);

    return {
      id: crypto.randomUUID(),
      entityType: isDeleted ? 'tombstone' : 'collection',
      entityId: collection.id,
      deviceId,
      lamportTs: 1,
      vectorClock: { [deviceId]: 1 },
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      createdAt: now,
    };
  }

  /**
   * Reconciles remote SyncDeltas against local bookmarks, collections, and tags.
   */
  public reconcileRemoteDeltas(params: ReconcileParams): ReconcileResult {
    const {
      deltas,
      localBookmarks,
      localCollections,
      localTags,
      masterKey,
      vaultMasterKey,
      deviceId,
    } = params;

    let bookmarks = [...localBookmarks];
    let collections = [...localCollections];
    let tags = [...localTags];
    let pulledCount = 0;

    const findOrAddCollection = (nameOrId: string): Collection => {
      const match = collections.find(
        (c) => c.id === nameOrId || c.name.toLowerCase() === nameOrId.toLowerCase(),
      );
      if (match) return match;

      const newCol: Collection = {
        id: `c-${crypto.randomUUID().slice(0, 8)}`,
        name: nameOrId,
        color: getCollectionColor(nameOrId),
        parentId: null,
        sortOrder: collections.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      collections = [...collections, newCol];
      return newCol;
    };

    const ensureTagRegistered = (tagName: string) => {
      const clean = tagName.trim().toLowerCase();
      if (clean && !tags.some((t) => t.name.toLowerCase() === clean)) {
        tags.push({
          id: `t-${crypto.randomUUID().slice(0, 8)}`,
          name: clean,
          color: '#0891b2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    };

    for (const delta of deltas) {
      if (delta.deviceId === deviceId) continue;

      // 1. Handle Collection deltas
      if (
        delta.entityType === 'collection' ||
        (delta.entityType === 'tombstone' && delta.entityId.startsWith('c-'))
      ) {
        try {
          const colRecordKey = deriveRecordKey(masterKey, delta.entityId);
          const unsealedCol = unsealRecord<Collection>(
            colRecordKey,
            delta.ciphertext,
            delta.nonce,
          );
          if (unsealedCol.data) {
            const incomingCol = unsealedCol.data;
            const isDeleted =
              delta.entityType === 'tombstone' || Boolean((incomingCol as any).deletedAt);

            if (isDeleted) {
              this.recordTombstone(delta.entityId, delta.createdAt);
              collections = collections.filter(
                (c) =>
                  c.id !== delta.entityId &&
                  c.name.toLowerCase() !== incomingCol.name?.toLowerCase(),
              );
            } else {
              pulledCount++;
              const existingIdx = collections.findIndex(
                (c) =>
                  c.id === incomingCol.id ||
                  c.name.toLowerCase() === incomingCol.name.toLowerCase(),
              );
              if (existingIdx >= 0) {
                collections[existingIdx] = incomingCol;
              } else {
                collections = [...collections, incomingCol];
              }
            }
          }
        } catch (err) {
          console.warn('[MutationLog] Failed to unseal collection delta:', err);
        }
        continue;
      }

      // 2. Handle Bookmark deltas
      const recordKey = deriveRecordKey(masterKey, delta.entityId);
      let unsealed = unsealRecord<Bookmark>(recordKey, delta.ciphertext, delta.nonce);

      // Try Vault Master Key if Master Key failed
      if (!unsealed.data && vaultMasterKey) {
        const vRecordKey = deriveRecordKey(vaultMasterKey, delta.entityId);
        unsealed = unsealRecord<Bookmark>(vRecordKey, delta.ciphertext, delta.nonce);
      }

      if (unsealed.data) {
        const incoming = unsealed.data;
        const isDeleted = delta.entityType === 'tombstone' || Boolean(incoming.deletedAt);

        if (isDeleted) {
          const delTime = incoming.deletedAt || delta.createdAt || new Date().toISOString();
          this.recordTombstone(delta.entityId, delTime);
          bookmarks = bookmarks.filter((b) => b.id !== delta.entityId);
          pulledCount++;
        } else {
          if (this.isDeleted(delta.entityId, incoming.updatedAt || delta.createdAt)) {
            continue;
          }

          // Map collection name/id to registered collection
          const candidateCol = incoming.collectionId || (incoming as any).collection;
          if (candidateCol) {
            const matched = findOrAddCollection(candidateCol);
            incoming.collectionId = matched.id;
          }

          // Auto-register any new tags
          if (Array.isArray(incoming.tags)) {
            for (const t of incoming.tags) {
              ensureTagRegistered(t);
            }
          }

          pulledCount++;
          const existingIndex = bookmarks.findIndex((b) => b.id === incoming.id);
          if (existingIndex >= 0) {
            const reconciled = reconcileBookmark(
              bookmarks[existingIndex]!,
              incoming,
              deviceId,
              delta.deviceId,
              delta.lamportTs,
            );
            bookmarks[existingIndex] = reconciled;
          } else {
            bookmarks = [incoming, ...bookmarks];
          }
        }
      }
    }

    return {
      updatedBookmarks: bookmarks,
      updatedCollections: collections,
      updatedTags: tags,
      pulledCount,
    };
  }
}
