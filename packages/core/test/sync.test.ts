import { describe, expect, it } from 'bun:test';
import type { Bookmark } from '@tessera/schemas';
import {
  compareVectorClocks,
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  reconcileBookmark,
  resolveFieldLWW,
} from '../src/sync/index.js';

describe('Sync & Vector Clocks', () => {
  it('increments and tracks causality across devices', () => {
    let clockA = createVectorClock();
    clockA = incrementVectorClock(clockA, 'device-A'); // { A: 1 }

    let clockB = { ...clockA };
    clockB = incrementVectorClock(clockB, 'device-B'); // { A: 1, B: 1 }

    expect(compareVectorClocks(clockB, clockA)).toBe('AFTER');
    expect(compareVectorClocks(clockA, clockB)).toBe('BEFORE');

    // Concurrent branch
    let clockC = incrementVectorClock(clockA, 'device-C'); // { A: 1, C: 1 }
    expect(compareVectorClocks(clockB, clockC)).toBe('CONCURRENT');

    // Merged clock
    const merged = mergeVectorClocks(clockB, clockC);
    expect(merged).toEqual({ 'device-A': 1, 'device-B': 1, 'device-C': 1 });
  });

  it('resolves LWW fields with higher timestamp or tie breaker', () => {
    const currentMeta = { lamportTs: 10, deviceId: 'dev-1' };
    const incomingNewer = { lamportTs: 11, deviceId: 'dev-2' };
    const incomingOlder = { lamportTs: 9, deviceId: 'dev-2' };

    const winRes = resolveFieldLWW('old', currentMeta, 'new', incomingNewer);
    expect(winRes.value).toBe('new');
    expect(winRes.changed).toBe(true);

    const loseRes = resolveFieldLWW('old', currentMeta, 'new', incomingOlder);
    expect(loseRes.value).toBe('old');
    expect(loseRes.changed).toBe(false);
  });

  it('reconciles bookmarks and merges tags union and vector clocks', () => {
    const local: Bookmark = {
      id: 'b-1',
      url: 'https://example.com',
      title: 'Local Title',
      description: 'Local desc',
      notes: '',
      faviconUrl: '',
      previewImageUrl: '',
      tags: ['local-tag', 'shared-tag'],
      collectionId: null,
      isArchived: false,
      isFavorite: false,
      isPinned: false,
      createdAt: '2026-08-16T10:00:00Z',
      updatedAt: '2026-08-16T10:00:00Z',
      deletedAt: null,
      versionClock: { 'dev-A': 1 },
    };

    const incoming: Bookmark = {
      ...local,
      title: 'Updated Incoming Title',
      tags: ['incoming-tag', 'shared-tag'],
      updatedAt: '2026-08-16T10:05:00Z',
      versionClock: { 'dev-B': 2 },
    };

    const reconciled = reconcileBookmark(local, incoming, 'dev-A', 'dev-B', 2);
    expect(reconciled.title).toBe('Updated Incoming Title');
    expect(reconciled.tags).toContain('local-tag');
    expect(reconciled.tags).toContain('incoming-tag');
    expect(reconciled.tags).toContain('shared-tag');
    expect(reconciled.versionClock).toEqual({ 'dev-A': 1, 'dev-B': 2 });
  });
});
