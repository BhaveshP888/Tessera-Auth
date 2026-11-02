import { z } from 'zod';
import { VectorClockSchema } from './bookmarks.js';

/**
 * Supported sync entity types.
 */
export const SyncEntityTypeSchema = z.enum([
  'bookmark',
  'tag',
  'collection',
  'tombstone',
]);
export type SyncEntityType = z.infer<typeof SyncEntityTypeSchema>;

/**
 * Opaque encrypted sync delta passed to the server relay.
 * Server cannot inspect the ciphertext or record key.
 */
export const SyncDeltaSchema = z.object({
  id: z.string().min(1),
  entityType: SyncEntityTypeSchema,
  entityId: z.string().min(1),
  deviceId: z.string().min(1),
  lamportTs: z.number().int().nonnegative(),
  vectorClock: VectorClockSchema,
  ciphertext: z.string().min(1), // Base64-encoded encrypted payload
  nonce: z.string().min(1),      // Base64-encoded nonce (24 bytes for XChaCha20)
  authTag: z.string().optional(), // If not bundled in ciphertext
  createdAt: z.string().datetime(),
});
export type SyncDelta = z.infer<typeof SyncDeltaSchema>;

/**
 * Sync batch push payload from client to relay.
 */
export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  deltas: z.array(SyncDeltaSchema),
  clientCursor: z.number().int().nonnegative(),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

/**
 * Sync pull request by cursor.
 */
export const SyncPullRequestSchema = z.object({
  deviceId: z.string().min(1),
  sinceCursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(100),
});
export type SyncPullRequest = z.infer<typeof SyncPullRequestSchema>;

/**
 * Sync pull response from relay.
 */
export const SyncPullResponseSchema = z.object({
  deltas: z.array(SyncDeltaSchema),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

/**
 * Device registration in the zero-knowledge device registry.
 */
export const RegisteredDeviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  publicKey: z.string().min(1), // Base64 X25519 public key
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  isRevoked: z.boolean().default(false),
});
export type RegisteredDevice = z.infer<typeof RegisteredDeviceSchema>;
