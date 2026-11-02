import React, { useState } from 'react';
import {
  ExternalLink,
  Star,
  Pin,
  Archive,
  Trash2,
  Copy,
  Check,
  Lock,
  Pencil,
} from 'lucide-react';
import type { Bookmark, Collection } from '@tessera/schemas';
import { getCollectionColor } from '@tessera/core';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface BookmarkCardProps {
  bookmark: Bookmark;
  collections?: Collection[];
  onToggleFavorite?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelectTag?: (tag: string) => void;
  onEdit?: (bookmark: Bookmark) => void;
  isCompact?: boolean;
}

export const BookmarkCard: React.FC<BookmarkCardProps> = (props) => {
  const storeCollections = useLibraryStore((s) => s.collections);
  const storeToggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const storeTogglePin = useLibraryStore((s) => s.togglePin);
  const storeToggleArchive = useLibraryStore((s) => s.toggleArchive);
  const storeDelete = useLibraryStore((s) => s.deleteBookmark);
  const storeSetSelectedTag = useLibraryStore((s) => s.setSelectedTag);
  const storeOpenAddBookmarkModal = useUIStore((s) => s.openAddBookmarkModal);

  const { bookmark, isCompact = false } = props;
  const collections = props.collections || storeCollections;
  const onToggleFavorite = props.onToggleFavorite || storeToggleFavorite;
  const onTogglePin = props.onTogglePin || storeTogglePin;
  const onToggleArchive = props.onToggleArchive || storeToggleArchive;
  const onDelete = props.onDelete || storeDelete;
  const onSelectTag = props.onSelectTag || storeSetSelectedTag;
  const onEdit = props.onEdit || storeOpenAddBookmarkModal;

  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const collection = (collections || []).find((c) => c && c.id === bookmark.collectionId);

  const getHostname = (urlStr: string): string => {
    try {
      return new URL(urlStr).hostname.replace(/^www\./, '');
    } catch {
      return urlStr;
    }
  };

  const handleCopy = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(bookmark.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const domain = getHostname(bookmark.url);
  const favicon = bookmark.faviconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  // Compact Row Layout
  if (isCompact) {
    return (
      <div
        className="animate-fade"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 14px',
          background: isHovered ? 'var(--surface-hover)' : 'var(--surface)',
          border: `1px solid ${bookmark.isPinned ? 'rgba(56, 189, 248, 0.3)' : isHovered ? 'var(--border-hover)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          gap: '6px',
          transition: 'all 0.12s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <img
              src={favicon}
              alt=""
              style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0 }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              {bookmark.isVault && <Lock size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />}
              {bookmark.isPinned && <Pin size={12} fill="var(--amber)" style={{ color: 'var(--amber)', flexShrink: 0 }} />}
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              >
                {bookmark.title}
              </a>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                {domain}
              </span>
            </div>
          </div>

          {/* Tags & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {(bookmark.tags || []).slice(0, 2).map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                style={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-dim)',
                  color: 'var(--accent-text)',
                }}
              >
                #{tag}
              </button>
            ))}

            {/* Quick Actions (Hover) */}
            <div className="bookmark-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: isHovered ? 1 : 0.75, transition: 'opacity 0.15s ease', zIndex: 5 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              title="Copy URL"
              style={{ padding: '4px', color: copied ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(bookmark);
                }}
                title="Edit Bookmark"
                style={{ padding: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <Pencil size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(bookmark.id);
              }}
              title={bookmark.isPinned ? 'Unpin' : 'Pin to top'}
              style={{
                padding: '4px',
                color: bookmark.isPinned ? '#38bdf8' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Pin size={13} fill={bookmark.isPinned ? '#38bdf8' : 'none'} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(bookmark.id);
              }}
              title={bookmark.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
              style={{
                padding: '4px',
                color: bookmark.isFavorite ? '#fbbf24' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Star size={13} fill={bookmark.isFavorite ? '#fbbf24' : 'none'} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleArchive(bookmark.id);
              }}
              title={bookmark.isArchived ? 'Unarchive (Move to Library)' : 'Archive'}
              style={{
                padding: '4px',
                color: bookmark.isArchived ? '#c084fc' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <Archive size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(bookmark.id);
              }}
              title="Delete"
              style={{ padding: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

        {/* Notes in compact row */}
        {bookmark.notes && (
          <div
            style={{
              padding: '5px 10px',
              background: 'var(--surface-elevated)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
              borderLeft: '2px solid var(--accent)',
              wordBreak: 'break-word',
              marginLeft: '26px',
            }}
          >
            {bookmark.notes}
          </div>
        )}
      </div>
    );
  }

  // Grid Card Layout
  return (
    <div
      className="animate-fade"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${bookmark.isPinned ? 'rgba(56, 189, 248, 0.3)' : isHovered ? 'var(--border-hover)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        position: 'relative',
        boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header: domain, badge, action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <img
            src={favicon}
            alt=""
            style={{ width: '15px', height: '15px', borderRadius: '3px' }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
            {domain}
          </span>
          {bookmark.isPinned && (
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontWeight: 600,
              }}
            >
              PINNED
            </span>
          )}
          {bookmark.isVault && (
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'var(--amber-dim)',
                color: 'var(--amber)',
                fontWeight: 600,
              }}
            >
              VAULT
            </span>
          )}
        </div>

          {/* Action icons */}
        <div className="bookmark-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: isHovered ? 1 : 0.85, transition: 'opacity 0.15s ease', zIndex: 5 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(e);
            }}
            title="Copy URL"
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              color: copied ? 'var(--green)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(bookmark);
              }}
              title="Edit Bookmark"
              style={{
                padding: '3px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Pencil size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(bookmark.id);
            }}
            title={bookmark.isPinned ? 'Unpin' : 'Pin to top'}
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              color: bookmark.isPinned ? '#38bdf8' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Pin size={12} fill={bookmark.isPinned ? '#38bdf8' : 'none'} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(bookmark.id);
            }}
            title={bookmark.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              color: bookmark.isFavorite ? '#fbbf24' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Star size={12} fill={bookmark.isFavorite ? '#fbbf24' : 'none'} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleArchive(bookmark.id);
            }}
            title={bookmark.isArchived ? 'Unarchive (Move to Library)' : 'Archive'}
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              color: bookmark.isArchived ? '#c084fc' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Archive size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(bookmark.id);
            }}
            title="Delete"
            style={{
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Title & External Link */}
      <div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textDecoration: 'none',
            lineHeight: 1.35,
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: '5px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        >
          <span>{bookmark.title}</span>
          <ExternalLink size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </a>

        {bookmark.description && (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.45,
              marginTop: '4px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {bookmark.description}
          </p>
        )}
      </div>

      {/* Always Visible Notes */}
      {bookmark.notes && (
        <div
          style={{
            marginTop: '2px',
            padding: '7px 10px',
            background: 'var(--surface-elevated)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11.5px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.45,
            borderLeft: '2px solid var(--accent)',
            wordBreak: 'break-word',
          }}
        >
          {bookmark.notes}
        </div>
      )}

      {/* Bottom: Tags & Collection */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '6px',
          marginTop: 'auto',
          paddingTop: '2px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {(bookmark.tags || []).map((tag) => (
            <button
              key={tag}
              onClick={() => onSelectTag(tag)}
              style={{
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-dim)',
                color: 'var(--accent-text)',
                fontWeight: 500,
              }}
            >
              #{tag}
            </button>
          ))}
        </div>

        {collection && (
          <div
            style={{
              fontSize: '10.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: getCollectionColor(collection.name, collection.color),
              }}
            />
            <span>{collection.name}</span>
          </div>
        )}
      </div>
    </div>
  );
};
