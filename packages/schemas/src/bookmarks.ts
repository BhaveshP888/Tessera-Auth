import { z } from 'zod';

/**
 * Represents the vector clock for multi-device sync.
 * Mapping of deviceId -> lamport counter.
 */
export const VectorClockSchema = z.record(z.string(), z.number().int().nonnegative());
export type VectorClock = z.infer<typeof VectorClockSchema>;

/**
 * Tag model schema.
 */
export const TagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0891b2'),
  icon: z.string().max(32).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tag = z.infer<typeof TagSchema>;

/**
 * Collection / Folder model schema.
 */
export const CollectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1e3a5f'),
  icon: z.string().max(32).optional(),
  parentId: z.string().min(1).nullable().default(null),
  sortOrder: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Collection = z.infer<typeof CollectionSchema>;

/**
 * Core Bookmark entity schema.
 */
export const BookmarkSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1).max(512),
  description: z.string().max(4096).default(''),
  notes: z.string().max(65536).default(''),
  faviconUrl: z.string().url().or(z.string().length(0)).default(''),
  previewImageUrl: z.string().url().or(z.string().length(0)).default(''),
  tags: z.array(z.string().min(1)).default([]),
  collectionId: z.string().min(1).nullable().default(null),
  isVault: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
  versionClock: VectorClockSchema.default({}),
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

/**
 * Payload schema for creating a new bookmark.
 */
export const CreateBookmarkInputSchema = BookmarkSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  versionClock: true,
}).partial({
  description: true,
  notes: true,
  faviconUrl: true,
  previewImageUrl: true,
  tags: true,
  collectionId: true,
  isVault: true,
  isArchived: true,
  isFavorite: true,
  isPinned: true,
});
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkInputSchema>;

/**
 * Payload schema for updating an existing bookmark.
 */
export const UpdateBookmarkInputSchema = CreateBookmarkInputSchema.partial();
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkInputSchema>;
