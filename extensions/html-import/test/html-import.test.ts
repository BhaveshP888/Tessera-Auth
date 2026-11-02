import { describe, expect, it } from 'bun:test';
import { parseNetscapeBookmarksHtml, exportToNetscapeHtml, manifest } from '../src/index.js';
import type { Bookmark, Collection } from '@tessera/schemas';

describe('Browser HTML Bookmarks Extension (@tessera/extension-html-import)', () => {
  it('defines valid extension manifest', () => {
    expect(manifest.id).toBe('html-import');
    expect(manifest.name).toBe('Browser HTML Bookmarks');
    expect(manifest.permissions).toContain('bookmarks.write');
    expect(manifest.permissions).toContain('tags.write');
  });

  it('parses standard Netscape Bookmarks HTML with folders, tags, and descriptions', () => {
    const sampleHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1610000000" LAST_MODIFIED="1610000000">Development</H3>
    <DL><p>
        <DT><A HREF="https://bun.sh" ADD_DATE="1610000000" ICON="https://bun.sh/favicon.ico" TAGS="javascript,runtime">Bun JavaScript</A>
        <DD>Fast all-in-one JavaScript runtime
        <DT><A HREF="https://github.com/torvalds/linux" ADD_DATE="1610000000" TAGS="kernel,c">Linux Kernel</A>
    </DL><p>
    <DT><A HREF="https://wikipedia.org" ADD_DATE="1610000000">Wikipedia</A>
</DL><p>`;

    const parsed = parseNetscapeBookmarksHtml(sampleHtml);
    expect(parsed.length).toBe(3);

    // Item 1
    expect(parsed[0]!.url).toBe('https://bun.sh');
    expect(parsed[0]!.title).toBe('Bun JavaScript');
    expect(parsed[0]!.collectionName).toBe('Development');
    expect(parsed[0]!.tags).toEqual(['javascript', 'runtime']);
    expect(parsed[0]!.description).toBe('Fast all-in-one JavaScript runtime');
    expect(parsed[0]!.faviconUrl).toBe('https://bun.sh/favicon.ico');

    // Item 2
    expect(parsed[1]!.url).toBe('https://github.com/torvalds/linux');
    expect(parsed[1]!.title).toBe('Linux Kernel');
    expect(parsed[1]!.collectionName).toBe('Development');
    expect(parsed[1]!.tags).toEqual(['kernel', 'c']);

    // Item 3 (Root)
    expect(parsed[2]!.url).toBe('https://wikipedia.org');
    expect(parsed[2]!.title).toBe('Wikipedia');
    expect(parsed[2]!.collectionName).toBeUndefined();
  });

  it('exports bookmarks and collections cleanly into standard Netscape HTML format', () => {
    const col: Collection = {
      id: 'c-dev',
      name: 'Development',
      color: '#38bdf8',
      parentId: null,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const bookmarks: Bookmark[] = [
      {
        id: 'b-1',
        url: 'https://bun.sh',
        title: 'Bun Runtime',
        description: 'Fast runtime',
        notes: '',
        faviconUrl: 'https://bun.sh/favicon.ico',
        previewImageUrl: '',
        tags: ['javascript', 'runtime'],
        collectionId: 'c-dev',
        isVault: false,
        isArchived: false,
        isFavorite: true,
        isPinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
        versionClock: {},
      },
      {
        id: 'b-2',
        url: 'https://eff.org',
        title: 'EFF',
        description: '',
        notes: '',
        faviconUrl: '',
        previewImageUrl: '',
        tags: ['privacy'],
        collectionId: null,
        isVault: false,
        isArchived: false,
        isFavorite: false,
        isPinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
        versionClock: {},
      },
    ];

    const html = exportToNetscapeHtml(bookmarks, [col]);
    expect(html.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html.includes('<H3 ADD_DATE=')).toBe(true);
    expect(html.includes('Development</H3>')).toBe(true);
    expect(html.includes('HREF="https://bun.sh"')).toBe(true);
    expect(html.includes('TAGS="javascript,runtime"')).toBe(true);
    expect(html.includes('HREF="https://eff.org"')).toBe(true);

    // Re-import exported HTML to verify roundtrip fidelity
    const reimported = parseNetscapeBookmarksHtml(html);
    expect(reimported.length).toBe(2);
    expect(reimported[0]!.url).toBe('https://bun.sh');
    expect(reimported[0]!.collectionName).toBe('Development');
    expect(reimported[1]!.url).toBe('https://eff.org');
  });
});
