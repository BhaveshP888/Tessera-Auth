import React from 'react';
import { BookmarkCard } from './BookmarkCard.js';
import type { Bookmark, Collection } from '@tessera/schemas';
import { Bookmark as BookmarkIcon, Plus } from 'lucide-react';
import { useFilteredBookmarks, useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface BookmarkListProps {
  bookmarks?: Bookmark[];
  collections?: Collection[];
  onToggleFavorite?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelectTag?: (tag: string) => void;
  onEditBookmark?: (bookmark: Bookmark) => void;
  searchQuery?: string;
  viewLayout?: 'grid' | 'list';
  onOpenAddModal?: () => void;
}

export const BookmarkList: React.FC<BookmarkListProps> = (props) => {
  const storeFilteredBookmarks = useFilteredBookmarks();
  const storeSearchQuery = useLibraryStore((s) => s.searchQuery);
  const storeViewLayout = useUIStore((s) => s.viewLayout);
  const storeOpenAddBookmarkModal = useUIStore((s) => s.openAddBookmarkModal);

  const items = props.bookmarks !== undefined ? props.bookmarks : storeFilteredBookmarks;
  const searchQuery = props.searchQuery !== undefined ? props.searchQuery : storeSearchQuery;
  const viewLayout = props.viewLayout || storeViewLayout;
  const onOpenAddModal = props.onOpenAddModal || (() => storeOpenAddBookmarkModal(null));

  if (items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}
        >
          <BookmarkIcon size={22} />
        </div>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          {searchQuery ? `No results for "${searchQuery}"` : 'No bookmarks in this view'}
        </h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '320px', lineHeight: 1.45, marginBottom: '18px' }}>
          {searchQuery
            ? 'Try adjusting your search terms or clearing the active tag filter.'
            : 'Save articles, docs, and links with zero-knowledge end-to-end encryption.'}
        </p>
        {onOpenAddModal && !searchQuery && (
          <button
            onClick={onOpenAddModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '12.5px',
              fontWeight: 500,
            }}
          >
            <Plus size={14} />
            <span>Add Bookmark</span>
          </button>
        )}
      </div>
    );
  }

  // Compact List Mode
  if (viewLayout === 'list') {
    return (
      <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            collections={props.collections}
            onToggleFavorite={props.onToggleFavorite}
            onTogglePin={props.onTogglePin}
            onToggleArchive={props.onToggleArchive}
            onDelete={props.onDelete}
            onSelectTag={props.onSelectTag}
            onEdit={props.onEditBookmark}
            isCompact={true}
          />
        ))}
      </div>
    );
  }

  // Modern Responsive Grid Mode
  return (
    <div
      style={{
        padding: '20px 28px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '14px',
      }}
    >
      {items.map((bookmark) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          collections={props.collections}
          onToggleFavorite={props.onToggleFavorite}
          onTogglePin={props.onTogglePin}
          onToggleArchive={props.onToggleArchive}
          onDelete={props.onDelete}
          onSelectTag={props.onSelectTag}
          onEdit={props.onEditBookmark}
          isCompact={false}
        />
      ))}
    </div>
  );
};
