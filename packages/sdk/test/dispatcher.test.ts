import { describe, expect, it } from 'bun:test';
import type { Bookmark, ExtensionManifest } from '@tessera/schemas';
import { ExtensionHostDispatcher, type ExtensionHostServices } from '../src/index.js';

describe('ExtensionHostDispatcher', () => {
  const sampleBookmark: Bookmark = {
    id: 'b-100',
    url: 'https://bun.sh',
    title: 'Bun JavaScript Runtime',
    description: 'Fast all-in-one JavaScript runtime',
    notes: '',
    faviconUrl: '',
    previewImageUrl: '',
    tags: ['runtime', 'js'],
    collectionId: null,
    isArchived: false,
    isFavorite: true,
    isPinned: false,
    createdAt: '2026-08-16T12:00:00Z',
    updatedAt: '2026-08-16T12:00:00Z',
    deletedAt: null,
    versionClock: {},
  };

  const mockServices: ExtensionHostServices = {
    bookmarks: {
      list: async () => [sampleBookmark],
      create: async (input) => ({
        ...sampleBookmark,
        ...input,
        id: 'new-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        versionClock: {},
      }),
      update: async (id, input) => ({ ...sampleBookmark, ...input, id }),
      delete: async () => {},
    },
    tags: {
      list: async () => [],
      create: async (name, color) => ({
        id: 'tag-1',
        name,
        color: color || '#0891b2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    },
    collections: {
      list: async () => [],
      create: async (name) => ({
        id: 'col-1',
        name,
        color: '#1e3a5f',
        parentId: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    },
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
    network: {
      proxyFetch: async () => ({ status: 200, text: 'ok' }),
    },
  };

  it('allows granted capabilities and returns data', async () => {
    const dispatcher = new ExtensionHostDispatcher(mockServices);
    const readManifest: ExtensionManifest = {
      id: 'reader-plugin',
      name: 'Reader Plugin',
      version: '1.0.0',
      author: 'community',
      permissions: ['bookmarks.read'],
    };

    dispatcher.registerExtension(readManifest);

    const response = await dispatcher.handleRequest({
      id: 'req-1',
      extensionId: 'reader-plugin',
      method: 'bookmarks.list',
      params: {},
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual([sampleBookmark]);
  });

  it('denies ungranted capabilities with permission error', async () => {
    const dispatcher = new ExtensionHostDispatcher(mockServices);
    const readOnlyManifest: ExtensionManifest = {
      id: 'reader-plugin',
      name: 'Reader Plugin',
      version: '1.0.0',
      author: 'community',
      permissions: ['bookmarks.read'], // No bookmarks.write!
    };

    dispatcher.registerExtension(readOnlyManifest);

    const response = await dispatcher.handleRequest({
      id: 'req-2',
      extensionId: 'reader-plugin',
      method: 'bookmarks.delete',
      params: { id: 'b-100' },
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe('PERMISSION_DENIED');
    expect(response.error?.message).toContain("requires 'bookmarks.write'");
  });
});
