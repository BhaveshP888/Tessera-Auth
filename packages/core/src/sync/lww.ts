import type { Bookmark } from '@tessera/schemas';
import { mergeVectorClocks } from './vector-clock.js';

export interface FieldMetadata {
  lamportTs: number;
  deviceId: string;
}

export type EntityFieldClocks<T> = {
  [K in keyof T]?: FieldMetadata;
};

/**
 * Resolves a field-level conflict using Last-Write-Wins (LWW) with deterministic tie-breaking.
 */
export const resolveFieldLWW = <T>(
  currentValue: T,
  currentMeta: FieldMetadata | undefined,
  incomingValue: T,
  incomingMeta: FieldMetadata,
): { value: T; meta: FieldMetadata; changed: boolean } => {
  if (!currentMeta) {
    return { value: incomingValue, meta: incomingMeta, changed: true };
  }

  // 1. Higher Lamport Timestamp wins
  if (incomingMeta.lamportTs > currentMeta.lamportTs) {
    return { value: incomingValue, meta: incomingMeta, changed: true };
  }

  // 2. Tie-breaker: Lexicographical Device ID comparison
  if (
    incomingMeta.lamportTs === currentMeta.lamportTs &&
    incomingMeta.deviceId > currentMeta.deviceId
  ) {
    return { value: incomingValue, meta: incomingMeta, changed: true };
  }

  return { value: currentValue, meta: currentMeta, changed: false };
};

/**
 * Reconciles two Bookmark records using per-field Last-Write-Wins and vector clocks.
 */
export const reconcileBookmark = (
  local: Bookmark,
  incoming: Bookmark,
  localDeviceId: string,
  incomingDeviceId: string,
  incomingTs: number,
): Bookmark => {
  const mergedClock = mergeVectorClocks(local.versionClock, incoming.versionClock);

  // If incoming record is a tombstone (deletedAt set) with higher or equal update time
  const localUpdate = new Date(local.updatedAt).getTime();
  const incomingUpdate = new Date(incoming.updatedAt).getTime();

  let selected = { ...local };

  if (incomingUpdate >= localUpdate) {
    selected = {
      ...selected,
      title: incoming.title,
      url: incoming.url,
      description: incoming.description,
      notes: incoming.notes,
      faviconUrl: incoming.faviconUrl,
      previewImageUrl: incoming.previewImageUrl,
      tags: Array.from(new Set([...local.tags, ...incoming.tags])),
      collectionId: incoming.collectionId,
      isArchived: incoming.isArchived,
      isFavorite: incoming.isFavorite,
      isPinned: incoming.isPinned,
      updatedAt: incoming.updatedAt,
      deletedAt: incoming.deletedAt ?? local.deletedAt,
    };
  } else {
    // Preserve local fields, but merge tags and clock
    selected.tags = Array.from(new Set([...local.tags, ...incoming.tags]));
  }

  selected.versionClock = mergedClock;
  return selected;
};
