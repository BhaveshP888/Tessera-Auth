import { describe, expect, it } from 'bun:test';
import {
  BookmarkSchema,
  CreateBookmarkInputSchema,
  ExtensionManifestSchema,
  SyncDeltaSchema,
} from '../src/index.js';

describe('Schemas', () => {
  it('validates a correct bookmark entity', () => {
    const valid = {
      id: 'd9b2d63d-a23d-4c3e-9f37-123456789abc',
      url: 'https://example.com/article',
      title: 'Example Article',
      description: 'A great article about local-first software',
      notes: 'Read closely regarding LWW sync',
      faviconUrl: 'https://example.com/favicon.ico',
      previewImageUrl: 'https://example.com/og.png',
      tags: ['software', 'architecture'],
      collectionId: null,
      isArchived: false,
      isFavorite: true,
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      versionClock: { 'device-1': 5, 'device-2': 3 },
    };

    const parsed = BookmarkSchema.parse(valid);
    expect(parsed.title).toBe('Example Article');
    expect(parsed.tags).toHaveLength(2);
  });

  it('rejects invalid urls', () => {
    expect(() =>
      BookmarkSchema.parse({
        id: 'd9b2d63d-a23d-4c3e-9f37-123456789abc',
        url: 'not-a-valid-url',
        title: 'Bad URL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('validates extension manifest capabilities', () => {
    const manifest = {
      id: 'html-import',
      name: 'Browser HTML Bookmarks',
      version: '1.0.0',
      description: 'Imports and exports bookmarks in standard Netscape HTML format',
      author: 'tessera.community',
      permissions: ['bookmarks.read', 'bookmarks.write', 'tags.write'],
      ui: {
        panel: './panel.html',
        commands: ['import-html-file', 'export-html-file'],
      },
    };

    const parsed = ExtensionManifestSchema.parse(manifest);
    expect(parsed.permissions).toContain('bookmarks.write');
  });

  it('validates sync deltas', () => {
    const delta = {
      id: '7b2e8c28-98e1-45a8-bf29-37384a29a1bb',
      entityType: 'bookmark',
      entityId: 'd9b2d63d-a23d-4c3e-9f37-123456789abc',
      deviceId: 'laptop-1',
      lamportTs: 42,
      vectorClock: { 'laptop-1': 42 },
      ciphertext: 'k8d/2...encrypted...',
      nonce: '123456789012345678901234',
      createdAt: new Date().toISOString(),
    };

    const parsed = SyncDeltaSchema.parse(delta);
    expect(parsed.lamportTs).toBe(42);
  });
});
