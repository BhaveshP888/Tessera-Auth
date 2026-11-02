import { ExtensionManifestSchema, type ExtensionManifest } from '@tessera/schemas';

/**
 * Type-safe helper to define and validate an extension manifest.
 */
export const defineExtension = (manifest: ExtensionManifest): ExtensionManifest => {
  const result = ExtensionManifestSchema.safeParse(manifest);
  if (!result.success) {
    throw new Error(
      `Invalid extension manifest: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
    );
  }
  return result.data;
};
