import type {
  Bookmark,
  Collection,
  CreateBookmarkInput,
  ExtensionManifest,
  ExtensionPermission,
  Tag,
  UpdateBookmarkInput,
} from '@tessera/schemas';

export interface ExtensionContext {
  readonly manifest: ExtensionManifest;
  bookmarks: {
    list(query?: string): Promise<Bookmark[]>;
    create(input: CreateBookmarkInput): Promise<Bookmark>;
    update(id: string, input: UpdateBookmarkInput): Promise<Bookmark>;
    delete(id: string): Promise<void>;
  };
  tags: {
    list(): Promise<Tag[]>;
    create(name: string, color?: string): Promise<Tag>;
  };
  collections: {
    list(): Promise<Collection[]>;
    create(name: string, color?: string, description?: string): Promise<Collection>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  network: {
    fetch(url: string, init?: RequestInit): Promise<Response>;
  };
}

export type PermissionCheckFn = (
  extensionId: string,
  permission: ExtensionPermission,
) => boolean;

export interface ExtensionHostServices {
  bookmarks: {
    list: (query?: string) => Promise<Bookmark[]>;
    create: (input: CreateBookmarkInput) => Promise<Bookmark>;
    update: (id: string, input: UpdateBookmarkInput) => Promise<Bookmark>;
    delete: (id: string) => Promise<void>;
  };
  tags: {
    list: () => Promise<Tag[]>;
    create: (name: string, color?: string) => Promise<Tag>;
  };
  collections: {
    list: () => Promise<Collection[]>;
    create: (name: string, color?: string, description?: string) => Promise<Collection>;
  };
  storage: {
    get: (extensionId: string, key: string) => Promise<unknown>;
    set: (extensionId: string, key: string, value: unknown) => Promise<void>;
    delete: (extensionId: string, key: string) => Promise<void>;
  };
  network: {
    proxyFetch: (url: string, init?: RequestInit) => Promise<{ status: number; text: string }>;
  };
}
