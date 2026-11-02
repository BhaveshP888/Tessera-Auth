import { z } from 'zod';

/**
 * Capability-scoped permissions for extensions.
 */
export const ExtensionPermissionSchema = z.enum([
  'bookmarks.read',
  'bookmarks.write',
  'tags.read',
  'tags.write',
  'collections.read',
  'collections.write',
  'network.fetch',
  'storage',
]);
export type ExtensionPermission = z.infer<typeof ExtensionPermissionSchema>;

/**
 * Declared UI entry points.
 */
export const ExtensionUISchema = z.object({
  panel: z.string().optional(),
  commands: z.array(z.string()).default([]),
  icon: z.string().optional(),
});
export type ExtensionUI = z.infer<typeof ExtensionUISchema>;

/**
 * Extension manifest definition.
 */
export const ExtensionManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(512).default(''),
  author: z.string().min(1).max(128),
  permissions: z.array(ExtensionPermissionSchema).default([]),
  ui: ExtensionUISchema.optional(),
  main: z.string().optional(),
  contentHash: z.string().optional(),
  signature: z.string().optional(),
});
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

/**
 * Typed RPC request over postMessage / Web Worker.
 */
export const ExtensionRPCRequestSchema = z.object({
  id: z.string().uuid(),
  extensionId: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type ExtensionRPCRequest = z.infer<typeof ExtensionRPCRequestSchema>;

/**
 * Typed RPC response from host.
 */
export const ExtensionRPCResponseSchema = z.object({
  id: z.string().uuid(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type ExtensionRPCResponse = z.infer<typeof ExtensionRPCResponseSchema>;
