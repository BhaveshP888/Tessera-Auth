import type { VectorClock } from '@tessera/schemas';

export type ClockOrdering = 'EQUAL' | 'BEFORE' | 'AFTER' | 'CONCURRENT';

/**
 * Creates a fresh empty vector clock.
 */
export const createVectorClock = (): VectorClock => ({});

/**
 * Increments the lamport counter for a specific device.
 */
export const incrementVectorClock = (
  clock?: VectorClock | null,
  deviceId?: string,
): VectorClock => {
  const safeClock = clock && typeof clock === 'object' ? clock : {};
  if (!deviceId) return { ...safeClock };
  const current = safeClock[deviceId] ?? 0;
  return {
    ...safeClock,
    [deviceId]: current + 1,
  };
};

/**
 * Merges two vector clocks by taking the pointwise maximum for every known device.
 */
export const mergeVectorClocks = (
  a?: VectorClock | null,
  b?: VectorClock | null,
): VectorClock => {
  const safeA = a && typeof a === 'object' ? a : {};
  const safeB = b && typeof b === 'object' ? b : {};
  const merged: VectorClock = { ...safeA };
  for (const [deviceId, counter] of Object.entries(safeB)) {
    const existing = merged[deviceId] ?? 0;
    merged[deviceId] = Math.max(existing, counter);
  }
  return merged;
};

/**
 * Compares two vector clocks to determine causality.
 */
export const compareVectorClocks = (
  a?: VectorClock | null,
  b?: VectorClock | null,
): ClockOrdering => {
  const safeA = a && typeof a === 'object' ? a : {};
  const safeB = b && typeof b === 'object' ? b : {};
  let aHasGreater = false;
  let bHasGreater = false;

  const allDevices = new Set([...Object.keys(safeA), ...Object.keys(safeB)]);

  for (const device of allDevices) {
    const counterA = safeA[device] ?? 0;
    const counterB = safeB[device] ?? 0;

    if (counterA > counterB) {
      aHasGreater = true;
    } else if (counterB > counterA) {
      bHasGreater = true;
    }
  }

  if (aHasGreater && bHasGreater) {
    return 'CONCURRENT';
  }
  if (aHasGreater) {
    return 'AFTER';
  }
  if (bHasGreater) {
    return 'BEFORE';
  }
  return 'EQUAL';
};
