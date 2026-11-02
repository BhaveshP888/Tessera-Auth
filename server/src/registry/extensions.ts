import type { ExtensionManifest } from '@tessera/schemas';

export const officialManifests: ExtensionManifest[] = [
  {
    id: 'html-import',
    name: 'Browser HTML Bookmarks',
    version: '1.0.0',
    description: 'Import and export bookmarks, folders, and tags using the standard Netscape HTML bookmarks format used by Chrome, Firefox, Safari, Edge, and Arc.',
    author: 'tessera.community',
    permissions: ['bookmarks.read', 'bookmarks.write', 'tags.write'],
    ui: {
      commands: ['import-html-file', 'export-html-file'],
    },
  },
  {
    id: 'markdown-export',
    name: 'Markdown Exporter',
    version: '1.0.0',
    description: 'Export all bookmarks grouped by collection or tag into clean Markdown.',
    author: 'tessera.community',
    permissions: ['bookmarks.read', 'tags.read', 'collections.read'],
    ui: {
      commands: ['export-to-markdown'],
    },
  },
];

export class ExtensionRegistry {
  private registry = new Map<string, ExtensionManifest>();

  constructor() {
    for (const manifest of officialManifests) {
      this.registry.set(manifest.id, manifest);
    }
  }

  public listExtensions(): ExtensionManifest[] {
    return Array.from(this.registry.values());
  }

  public getExtension(id: string): ExtensionManifest | undefined {
    return this.registry.get(id);
  }

  public registerExtension(manifest: ExtensionManifest): void {
    this.registry.set(manifest.id, manifest);
  }
}

export const extensionRegistry = new ExtensionRegistry();
