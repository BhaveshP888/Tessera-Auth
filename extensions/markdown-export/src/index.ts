import { defineExtension } from '@tessera/sdk';
import type { Bookmark, Collection } from '@tessera/schemas';

export const manifest = defineExtension({
  id: 'markdown-export',
  name: 'Markdown Exporter',
  version: '1.0.0',
  description: 'Export all library bookmarks grouped by collection or tag into clean Markdown.',
  author: 'tessera.community',
  permissions: ['bookmarks.read', 'tags.read', 'collections.read'],
  ui: {
    commands: ['export-markdown'],
  },
});

/**
 * Generates structured Markdown text from a list of bookmarks and collections.
 */
export const formatBookmarksToMarkdown = (
  bookmarks: Bookmark[],
  collections: Collection[],
): string => {
  const collectionMap = new Map(collections.map((c) => [c.id, c.name]));
  const grouped = new Map<string, Bookmark[]>();

  for (const b of bookmarks) {
    if (b.deletedAt || b.isArchived) continue;
    const colName = b.collectionId ? collectionMap.get(b.collectionId) || 'Uncategorized' : 'Uncategorized';
    const list = grouped.get(colName) || [];
    list.push(b);
    grouped.set(colName, list);
  }

  let output = `# Tessera Bookmark Library Export\n\n*Generated on ${new Date().toISOString()}*\n\n`;

  for (const [colName, items] of grouped.entries()) {
    output += `## 📁 ${colName}\n\n`;
    for (const item of items) {
      output += `- [${item.title}](${item.url})`;
      if (item.tags.length > 0) {
        output += ` — *tags: ${item.tags.map((t) => `#${t}`).join(' ')}*`;
      }
      output += '\n';
      if (item.description) {
        output += `  > ${item.description}\n`;
      }
      if (item.notes) {
        output += `  *Notes:* ${item.notes.replace(/\n/g, ' ')}\n`;
      }
    }
    output += '\n';
  }

  return output;
};
