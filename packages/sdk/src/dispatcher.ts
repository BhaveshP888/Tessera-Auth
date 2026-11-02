import type {
  CreateBookmarkInput,
  ExtensionManifest,
  ExtensionPermission,
  ExtensionRPCRequest,
  ExtensionRPCResponse,
  UpdateBookmarkInput,
} from '@tessera/schemas';
import type { ExtensionHostServices } from './types.js';

export class CapabilityViolationError extends Error {
  constructor(
    public readonly extensionId: string,
    public readonly requiredPermission: ExtensionPermission,
  ) {
    super(
      `Permission denied: Extension '${extensionId}' requires '${requiredPermission}' capability.`,
    );
    this.name = 'CapabilityViolationError';
  }
}

/**
 * Validates and executes RPC requests from sandboxed extensions.
 */
export class ExtensionHostDispatcher {
  private registeredManifests = new Map<string, ExtensionManifest>();

  constructor(private readonly services: ExtensionHostServices) {}

  /**
   * Registers an installed extension manifest.
   */
  public registerExtension(manifest: ExtensionManifest): void {
    this.registeredManifests.set(manifest.id, manifest);
  }

  /**
   * Unregisters an extension.
   */
  public unregisterExtension(extensionId: string): void {
    this.registeredManifests.delete(extensionId);
  }

  /**
   * Checks whether the extension possesses a specific capability.
   */
  public hasPermission(
    extensionId: string,
    permission: ExtensionPermission,
  ): boolean {
    const manifest = this.registeredManifests.get(extensionId);
    if (!manifest) {
      return false;
    }
    return manifest.permissions.includes(permission);
  }

  /**
   * Dispatches an incoming RPC request with strict capability checks.
   */
  public async handleRequest(
    request: ExtensionRPCRequest,
  ): Promise<ExtensionRPCResponse> {
    const { id, extensionId, method, params } = request;

    try {
      if (!this.registeredManifests.has(extensionId)) {
        return {
          id,
          error: {
            code: 'NOT_REGISTERED',
            message: `Extension '${extensionId}' is not registered with the host.`,
          },
        };
      }

      let result: unknown;

      switch (method) {
        // Bookmarks
        case 'bookmarks.list': {
          this.assertCapability(extensionId, 'bookmarks.read');
          result = await this.services.bookmarks.list(params['query'] as string | undefined);
          break;
        }
        case 'bookmarks.create': {
          this.assertCapability(extensionId, 'bookmarks.write');
          result = await this.services.bookmarks.create(params['input'] as CreateBookmarkInput);
          break;
        }
        case 'bookmarks.update': {
          this.assertCapability(extensionId, 'bookmarks.write');
          result = await this.services.bookmarks.update(
            params['id'] as string,
            params['input'] as UpdateBookmarkInput,
          );
          break;
        }
        case 'bookmarks.delete': {
          this.assertCapability(extensionId, 'bookmarks.write');
          await this.services.bookmarks.delete(params['id'] as string);
          result = { success: true };
          break;
        }

        // Tags
        case 'tags.list': {
          this.assertCapability(extensionId, 'tags.read');
          result = await this.services.tags.list();
          break;
        }
        case 'tags.create': {
          this.assertCapability(extensionId, 'tags.write');
          result = await this.services.tags.create(
            params['name'] as string,
            params['color'] as string | undefined,
          );
          break;
        }

        // Collections
        case 'collections.list': {
          this.assertCapability(extensionId, 'collections.read');
          result = await this.services.collections.list();
          break;
        }
        case 'collections.create': {
          this.assertCapability(extensionId, 'collections.write');
          result = await this.services.collections.create(
            params['name'] as string,
            params['color'] as string | undefined,
            params['description'] as string | undefined,
          );
          break;
        }

        // Storage (isolated KV per extension)
        case 'storage.get': {
          this.assertCapability(extensionId, 'storage');
          result = await this.services.storage.get(extensionId, params['key'] as string);
          break;
        }
        case 'storage.set': {
          this.assertCapability(extensionId, 'storage');
          await this.services.storage.set(
            extensionId,
            params['key'] as string,
            params['value'],
          );
          result = { success: true };
          break;
        }
        case 'storage.delete': {
          this.assertCapability(extensionId, 'storage');
          await this.services.storage.delete(extensionId, params['key'] as string);
          result = { success: true };
          break;
        }

        // Network (proxied)
        case 'network.fetch': {
          this.assertCapability(extensionId, 'network.fetch');
          result = await this.services.network.proxyFetch(
            params['url'] as string,
            params['init'] as RequestInit | undefined,
          );
          break;
        }

        default:
          return {
            id,
            error: {
              code: 'METHOD_NOT_FOUND',
              message: `Unknown RPC method '${method}'`,
            },
          };
      }

      return { id, result };
    } catch (err) {
      if (err instanceof CapabilityViolationError) {
        return {
          id,
          error: {
            code: 'PERMISSION_DENIED',
            message: err.message,
          },
        };
      }

      const message = err instanceof Error ? err.message : 'Internal host error';
      return {
        id,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      };
    }
  }

  private assertCapability(
    extensionId: string,
    permission: ExtensionPermission,
  ): void {
    if (!this.hasPermission(extensionId, permission)) {
      throw new CapabilityViolationError(extensionId, permission);
    }
  }
}
