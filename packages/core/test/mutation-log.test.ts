import { describe, expect, it } from 'bun:test';
import type { Bookmark, Collection, Tag } from '@tessera/schemas';
import { generateMasterKey } from '../src/crypto/index.js';
import { MutationLog } from '../src/store/mutation-log.js';

describe('MutationLog Deep Module', () => {
  const masterKey = generateMasterKey();
  const deviceId = 'test-device-1';

  it('records bookmark mutations, advances vector clock, and seals delta', () => {
    const log = new MutationLog();
    const bookmark: Bookmark = {
      id: 'b-100',
      url: 'https://example.com/deep',
      title: 'Deep Architecture',
      description: 'Deep modules vs shallow modules',
      notes: 'Encrypted private note',
      faviconUrl: '',
      previewImageUrl: '',
      tags: ['architecture', 'design'],
      collectionId: null,
      isVault: false,
      isArchived: false,
      isFavorite: false,
      isPinned: false,
      createdAt: '2026-08-21T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
      deletedAt: null,
      versionClock: {},
    };

    const { delta, updatedBookmark } = log.recordBookmarkMutation({
      bookmark,
      key: masterKey,
      deviceId,
    });

    expect(delta.entityType).toBe('bookmark');
    expect(delta.entityId).toBe('b-100');
    expect(delta.deviceId).toBe(deviceId);
    expect(delta.ciphertext).toBeDefined();
    expect(delta.nonce).toBeDefined();
    expect(updatedBookmark.versionClock).toEqual({ [deviceId]: 1 });
  });

  it('records tombstone when deleting entity and prevents resurrection', () => {
    const log = new MutationLog();
    const bookmark: Bookmark = {
      id: 'b-del',
      url: 'https://example.com/delete-me',
      title: 'To Delete',
      description: '',
      notes: '',
      faviconUrl: '',
      previewImageUrl: '',
      tags: [],
      collectionId: null,
      isVault: false,
      isArchived: false,
      isFavorite: false,
      isPinned: false,
      createdAt: '2026-08-21T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
      deletedAt: null,
      versionClock: { [deviceId]: 1 },
    };

    const { delta } = log.recordBookmarkMutation({
      bookmark,
      key: masterKey,
      deviceId,
      isDeleted: true,
    });

    expect(delta.entityType).toBe('tombstone');
    expect(log.isDeleted('b-del')).toBe(true);
    expect(log.isDeleted('b-del', '2026-08-21T09:00:00.000Z')).toBe(true);
  });

  it('reconciles remote deltas, unseals entities, and auto-registers collections and tags', () => {
    const logA = new MutationLog();
    const logB = new MutationLog();
    const deviceB = 'test-device-2';

    // Device B creates a collection and a bookmark with a new tag
    const col: Collection = {
      id: 'c-dev',
      name: 'Development',
      color: '#38bdf8',
      parentId: null,
      sortOrder: 0,
      createdAt: '2026-08-21T11:00:00.000Z',
      updatedAt: '2026-08-21T11:00:00.000Z',
    };
    const colDelta = logB.recordCollectionMutation({
      collection: col,
      masterKey,
      deviceId: deviceB,
    });

    const bmk: Bookmark = {
      id: 'b-sync',
      url: 'https://bun.sh',
      title: 'Bun Toolkit',
      description: '',
      notes: '',
      faviconUrl: '',
      previewImageUrl: '',
      tags: ['javascript', 'runtime'],
      collectionId: 'Development',
      isVault: false,
      isArchived: false,
      isFavorite: false,
      isPinned: false,
      createdAt: '2026-08-21T11:05:00.000Z',
      updatedAt: '2026-08-21T11:05:00.000Z',
      deletedAt: null,
      versionClock: { [deviceB]: 1 },
    };
    const { delta: bmkDelta } = logB.recordBookmarkMutation({
      bookmark: bmk,
      key: masterKey,
      deviceId: deviceB,
    });

    // Reconcile on Device A
    const localBookmarks: Bookmark[] = [];
    const localCollections: Collection[] = [];
    const localTags: Tag[] = [];

    const result = logA.reconcileRemoteDeltas({
      deltas: [colDelta, bmkDelta],
      localBookmarks,
      localCollections,
      localTags,
      masterKey,
      vaultMasterKey: null,
      deviceId,
    });

    expect(result.pulledCount).toBe(2);
    expect(result.updatedCollections.length).toBe(1);
    expect(result.updatedCollections[0]!.name).toBe('Development');
    expect(result.updatedBookmarks.length).toBe(1);
    expect(result.updatedBookmarks[0]!.title).toBe('Bun Toolkit');
    expect(result.updatedBookmarks[0]!.collectionId).toBe('c-dev');
    expect(result.updatedTags.length).toBe(2);
    expect(result.updatedTags.map((t) => t.name)).toContain('javascript');
    expect(result.updatedTags.map((t) => t.name)).toContain('runtime');
  });
});
