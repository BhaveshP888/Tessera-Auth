import { defineExtension } from '@tessera/sdk';
import type { Bookmark, Collection, CreateBookmarkInput } from '@tessera/schemas';

export interface ParsedHtmlBookmark extends CreateBookmarkInput {
  collectionName?: string;
}

export const manifest = defineExtension({
  id: 'html-import',
  name: 'Browser HTML Bookmarks',
  version: '1.0.0',
  description: 'Import and export bookmarks, folders, and tags using the standard Netscape HTML bookmarks format used by Chrome, Firefox, Safari, Edge, and Arc.',
  author: 'tessera.community',
  permissions: ['bookmarks.read', 'bookmarks.write', 'tags.write'],
  ui: {
    commands: ['import-html-file', 'export-html-file'],
  },
});

/**
 * Parses a standard Netscape Bookmarks HTML export into Tessera bookmark inputs with folder collection mapping.
 */
export const parseNetscapeBookmarksHtml = (htmlContent: string): ParsedHtmlBookmark[] => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    throw new Error('Invalid HTML content: Expected non-empty string.');
  }

  const results: ParsedHtmlBookmark[] = [];

  // Browser DOMParser environment
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      const processContainer = (container: Element, currentCollection?: string) => {
        const children = Array.from(container.children);
        let activeFolder = currentCollection;

        for (const child of children) {
          const tagName = child.tagName.toUpperCase();

          if (tagName === 'H3') {
            activeFolder = child.textContent?.trim() || activeFolder;
          } else if (tagName === 'A') {
            const href = child.getAttribute('href') || '';
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
              const title = child.textContent?.trim() || href;
              const tagsAttr = child.getAttribute('tags') || '';
              const iconAttr = child.getAttribute('icon') || child.getAttribute('icon_uri') || '';
              const addDate = child.getAttribute('add_date');
              let createdAt = new Date().toISOString();
              if (addDate && /^\d+$/.test(addDate)) {
                const ts = parseInt(addDate, 10);
                // Handle second vs millisecond timestamps
                createdAt = new Date(ts > 1e11 ? ts : ts * 1000).toISOString();
              }

              // Check for next element <DD> for description
              let description = '';
              let nextElem = child.nextElementSibling;
              if (nextElem && nextElem.tagName.toUpperCase() === 'DD') {
                description = nextElem.textContent?.trim() || '';
              }

              const tags = tagsAttr
                ? tagsAttr.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
                : [];

              results.push({
                url: href,
                title,
                description,
                notes: '',
                tags,
                collectionName: activeFolder || undefined,
                faviconUrl: iconAttr,
                isFavorite: false,
                isPinned: false,
                isArchived: false,
              });
            }
          } else if (child.children.length > 0) {
            processContainer(child, activeFolder);
          }
        }
      };

      processContainer(doc.body);
      if (results.length > 0) return results;
    } catch {
      // Fallback to regex parsing if DOMParser fails
    }
  }

  // Regex-based universal parser (works in Node, Bun, and browser)
  const lines = htmlContent.split(/\r?\n/);
  const folderStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check for folder close </DL>
    if (/<\/DL>/i.test(line)) {
      folderStack.pop();
    }

    // Check for folder header <H3 ...>Folder Name</H3>
    const folderMatch = /<H3[^>]*>([^<]+)<\/H3>/i.exec(line);
    if (folderMatch && folderMatch[1]) {
      folderStack.push(folderMatch[1].trim());
      continue;
    }

    const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : undefined;

    // Check for anchor link <A HREF="..." ...>Title</A>
    const linkMatch = /<A\s+([^>]*HREF=["']([^"']+)["'][^>]*)>([^<]*)<\/A>/i.exec(line);
    if (linkMatch && linkMatch[2]) {
      const fullAttrs = linkMatch[1]!;
      const href = linkMatch[2]!.trim();
      const title = (linkMatch[3] || '').trim() || href;

      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        continue;
      }

      // Extract attributes
      const tagsMatch = /TAGS=["']([^"']+)["']/i.exec(fullAttrs);
      const tags = tagsMatch && tagsMatch[1]
        ? tagsMatch[1].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];

      const iconMatch = /ICON=["']([^"']+)["']/i.exec(fullAttrs);
      const faviconUrl = iconMatch && iconMatch[1] ? iconMatch[1] : '';

      const addDateMatch = /ADD_DATE=["'](\d+)["']/i.exec(fullAttrs);
      let createdAt = new Date().toISOString();
      if (addDateMatch && addDateMatch[1]) {
        const ts = parseInt(addDateMatch[1], 10);
        createdAt = new Date(ts > 1e11 ? ts : ts * 1000).toISOString();
      }

      // Check next line for description <DD>...
      let description = '';
      if (i + 1 < lines.length && /<DD>(.*)/i.test(lines[i + 1]!)) {
        description = lines[i + 1]!.replace(/<\/?DD>/gi, '').trim();
      }

      results.push({
        url: href,
        title,
        description,
        notes: '',
        tags,
        collectionName: currentFolder,
        faviconUrl,
        isFavorite: false,
        isPinned: false,
        isArchived: false,
      });
    }
  }

  return results;
};

/**
 * Exports a library of bookmarks and collections to a standard Netscape Bookmarks HTML file.
 */
export const exportToNetscapeHtml = (
  bookmarks: Bookmark[],
  collections: Collection[] = [],
): string => {
  const collectionMap = new Map<string, string>();
  for (const c of collections) {
    collectionMap.set(c.id, c.name);
  }

  // Group bookmarks by collection
  const grouped = new Map<string, Bookmark[]>();
  const unclassified: Bookmark[] = [];

  for (const b of bookmarks) {
    if (b.deletedAt) continue;
    if (b.collectionId && collectionMap.has(b.collectionId)) {
      const colName = collectionMap.get(b.collectionId)!;
      if (!grouped.has(colName)) grouped.set(colName, []);
      grouped.get(colName)!.push(b);
    } else {
      unclassified.push(b);
    }
  }

  const renderBookmarkLine = (b: Bookmark): string => {
    const addDate = Math.floor(new Date(b.createdAt || Date.now()).getTime() / 1000);
    const tagsAttr = b.tags && b.tags.length > 0 ? ` TAGS="${b.tags.join(',')}"` : '';
    const iconAttr = b.faviconUrl ? ` ICON="${b.faviconUrl}"` : '';
    const desc = b.description ? `\n        <DD>${escapeHtml(b.description)}` : '';
    return `    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${addDate}"${iconAttr}${tagsAttr}>${escapeHtml(b.title || b.url)}</A>${desc}`;
  };

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Tessera Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  // Render Folders
  for (const [colName, colBookmarks] of grouped.entries()) {
    const nowTs = Math.floor(Date.now() / 1000);
    html += `    <DT><H3 ADD_DATE="${nowTs}" LAST_MODIFIED="${nowTs}">${escapeHtml(colName)}</H3>\n    <DL><p>\n`;
    for (const b of colBookmarks) {
      html += `    ${renderBookmarkLine(b)}\n`;
    }
    html += `    </DL><p>\n`;
  }

  // Render Root / Unclassified bookmarks
  for (const b of unclassified) {
    html += `${renderBookmarkLine(b)}\n`;
  }

  html += `</DL><p>\n`;
  return html;
};
