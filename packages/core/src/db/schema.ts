import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Bookmarks table storing local state.
 */
export const bookmarksTable = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    faviconUrl: text('favicon_url').notNull().default(''),
    previewImageUrl: text('preview_image_url').notNull().default(''),
    tagsJson: text('tags_json').notNull().default('[]'),
    collectionId: text('collection_id'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    versionClockJson: text('version_clock_json').notNull().default('{}'),
  },
  (table) => [
    index('idx_bookmarks_url').on(table.url),
    index('idx_bookmarks_collection').on(table.collectionId),
    index('idx_bookmarks_updated').on(table.updatedAt),
    index('idx_bookmarks_deleted').on(table.deletedAt),
  ],
);

/**
 * Tags table.
 */
export const tagsTable = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    color: text('color').notNull().default('#0891b2'),
    icon: text('icon'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_tags_name').on(table.name),
  ],
);

/**
 * Collections table.
 */
export const collectionsTable = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#1e3a5f'),
    icon: text('icon'),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_collections_parent').on(table.parentId),
  ],
);

/**
 * Local sync delta changelog queue.
 */
export const syncDeltasTable = sqliteTable(
  'sync_deltas',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    deviceId: text('device_id').notNull(),
    lamportTs: integer('lamport_ts').notNull(),
    vectorClockJson: text('vector_clock_json').notNull(),
    ciphertext: text('ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    createdAt: text('created_at').notNull(),
    isPushed: integer('is_pushed', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('idx_sync_pushed').on(table.isPushed),
    index('idx_sync_entity').on(table.entityType, table.entityId),
  ],
);

/**
 * Local audit log table for tamper-evident activity tracking.
 */
export const auditLogsTable = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    timestamp: text('timestamp').notNull(),
    detailsJson: text('details_json').notNull().default('{}'),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('idx_audit_timestamp').on(table.timestamp),
    index('idx_audit_type').on(table.type),
  ],
);
