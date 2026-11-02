import type {
  Bookmark,
  Collection,
  CreateBookmarkInput,
  ExtensionManifest,
  ExtensionRPCRequest,
  ExtensionRPCResponse,
  Tag,
  UpdateBookmarkInput,
} from '@tessera/schemas';
import type { ExtensionContext } from './types.js';

export type SendRPCHandler = (request: ExtensionRPCRequest) => Promise<ExtensionRPCResponse>;

/**
 * Creates the typed ExtensionContext bound to an RPC sender.
 */
export const createExtensionContext = (
  manifest: ExtensionManifest,
  sendRPC: SendRPCHandler,
): ExtensionContext => {
  const callMethod = async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const id = crypto.randomUUID();
    const response = await sendRPC({
      id,
      extensionId: manifest.id,
      method,
      params,
    });

    if (response.error) {
      throw new Error(`[${response.error.code}] ${response.error.message}`);
    }

    return response.result as T;
  };

  return {
    manifest,
    bookmarks: {
      list: (query?: string) => callMethod<Bookmark[]>('bookmarks.list', { query }),
      create: (input: CreateBookmarkInput) => callMethod<Bookmark>('bookmarks.create', { input }),
      update: (id: string, input: UpdateBookmarkInput) =>
        callMethod<Bookmark>('bookmarks.update', { id, input }),
      delete: (id: string) => callMethod<void>('bookmarks.delete', { id }),
    },
    tags: {
      list: () => callMethod<Tag[]>('tags.list'),
      create: (name: string, color?: string) => callMethod<Tag>('tags.create', { name, color }),
    },
    collections: {
      list: () => callMethod<Collection[]>('collections.list'),
      create: (name: string, color?: string, description?: string) =>
        callMethod<Collection>('collections.create', { name, color, description }),
    },
    storage: {
      get: <T>(key: string) => callMethod<T | null>('storage.get', { key }),
      set: <T>(key: string, value: T) => callMethod<void>('storage.set', { key, value }),
      delete: (key: string) => callMethod<void>('storage.delete', { key }),
    },
    network: {
      fetch: async (url: string, init?: RequestInit) => {
        const result = await callMethod<{ status: number; text: string }>('network.fetch', {
          url,
          init,
        });
        return new Response(result.text, { status: result.status });
      },
    },
  };
};
