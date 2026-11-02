import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Lock,
  Unlock,
  RefreshCw,
  Key,
  Shield,
  Puzzle,
  Download,
  Upload,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import type { Bookmark } from '@tessera/schemas';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface CommandPaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
  bookmarks?: Bookmark[];
  onOpenAddBookmark?: () => void;
  onOpenVault?: () => void;
  onLockVault?: () => void;
  isVaultUnlocked?: boolean;
  onSync?: () => void;
  onOpenKeyModal?: () => void;
  onOpenAuditModal?: () => void;
  onOpenExtensionModal?: () => void;
  onSelectBookmark?: (url: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'command-palette');
  const storeCloseModal = useUIStore((s) => s.closeModal);
  const storeOpenModal = useUIStore((s) => s.openModal);
  const storeOpenAddBookmarkModal = useUIStore((s) => s.openAddBookmarkModal);

  const storeBookmarks = useLibraryStore((s) => s.bookmarks);
  const storeIsVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);
  const storeLockVault = useLibraryStore((s) => s.lockVault);
  const storePerformSync = useLibraryStore((s) => s.performSync);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const bookmarks = props.bookmarks || storeBookmarks;
  const onOpenAddBookmark = props.onOpenAddBookmark || (() => storeOpenAddBookmarkModal(null));
  const onOpenVault = props.onOpenVault || (() => storeOpenModal('vault-pin'));
  const onLockVault = props.onLockVault || storeLockVault;
  const isVaultUnlocked =
    props.isVaultUnlocked !== undefined ? props.isVaultUnlocked : storeIsVaultUnlocked;
  const onSync = props.onSync || (() => storePerformSync());
  const onOpenKeyModal = props.onOpenKeyModal || (() => storeOpenModal('key'));
  const onOpenAuditModal = props.onOpenAuditModal || (() => storeOpenModal('audit'));
  const onOpenExtensionModal = props.onOpenExtensionModal || (() => storeOpenModal('extension'));
  const onSelectBookmark = props.onSelectBookmark || ((url: string) => window.open(url, '_blank'));
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'add-bookmark',
      title: 'Add New Bookmark',
      category: 'Actions',
      icon: <Plus size={16} />,
      run: onOpenAddBookmark,
    },
    {
      id: 'vault-toggle',
      title: isVaultUnlocked ? 'Lock Private Vault' : 'Unlock Private Vault (7-Digit PIN)',
      category: 'Security',
      icon: isVaultUnlocked ? <Lock size={16} style={{ color: 'var(--amber)' }} /> : <Unlock size={16} style={{ color: 'var(--green)' }} />,
      run: isVaultUnlocked ? onLockVault : onOpenVault,
    },
    {
      id: 'sync-now',
      title: 'Sync Encrypted Deltas with Relay',
      category: 'Sync',
      icon: <RefreshCw size={16} />,
      run: onSync,
    },
    {
      id: 'master-key',
      title: 'E2E Master Key Management & Backup',
      category: 'Security',
      icon: <Key size={16} />,
      run: onOpenKeyModal,
    },
    {
      id: 'audit-log',
      title: 'View Local Audit Log',
      category: 'Security',
      icon: <Shield size={16} />,
      run: onOpenAuditModal,
    },
    {
      id: 'extensions',
      title: 'Manage Sandboxed Extensions & Tools',
      category: 'Extensions',
      icon: <Puzzle size={16} />,
      run: onOpenExtensionModal,
    },
  ];

  // Filter actions and matching bookmarks
  const q = query.toLowerCase().trim();
  const matchedActions = actions.filter((a) => (a.title || '').toLowerCase().includes(q));
  const matchedBookmarks = q
    ? (bookmarks || [])
        .filter(
          (b) =>
            (b.title || '').toLowerCase().includes(q) ||
            (b.url || '').toLowerCase().includes(q) ||
            (b.tags || []).some((t) => (t || '').toLowerCase().includes(q))
        )
        .slice(0, 5)
    : [];

  const totalItems = matchedActions.length + matchedBookmarks.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < matchedActions.length) {
        matchedActions[selectedIndex]?.run();
        onClose();
      } else {
        const b = matchedBookmarks[selectedIndex - matchedActions.length];
        if (b) {
          window.open(b.url, '_blank', 'noopener,noreferrer');
          onClose();
        }
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="animate-modal"
        style={{
          width: '100%',
          maxWidth: '580px',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search bookmarks..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              fontSize: '15px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <kbd style={{ fontSize: '10px' }}>ESC</kbd>
        </div>

        {/* List items */}
        <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '8px' }}>
          {matchedActions.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  padding: '6px 12px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: 600,
                }}
              >
                Commands
              </div>
              {matchedActions.map((action, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={action.id}
                    onClick={() => {
                      action.run();
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--surface-hover)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {action.icon}
                      </span>
                      <span style={{ fontSize: '13.5px', fontWeight: isSelected ? 500 : 400 }}>
                        {action.title}
                      </span>
                    </div>
                    <ArrowRight size={13} style={{ opacity: isSelected ? 1 : 0 }} />
                  </div>
                );
              })}
            </div>
          )}

          {matchedBookmarks.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  padding: '6px 12px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: 600,
                }}
              >
                Matching Bookmarks
              </div>
              {matchedBookmarks.map((b, idx) => {
                const itemIndex = matchedActions.length + idx;
                const isSelected = selectedIndex === itemIndex;
                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      window.open(b.url, '_blank', 'noopener,noreferrer');
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--surface-hover)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {(() => {
                            try {
                              return new URL(b.url).hostname.replace(/^www\./, '');
                            } catch {
                              return b.url;
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                    <kbd style={{ fontSize: '9px' }}>OPEN</kbd>
                  </div>
                );
              })}
            </div>
          )}

          {totalItems === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No commands or bookmarks matching "{query}"
            </div>
          )}
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', gap: '14px' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Tessera Zero-AI</span>
        </div>
      </div>
    </div>
  );
};
