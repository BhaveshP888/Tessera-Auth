import React, { useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  Key,
  Shield,
  Puzzle,
  LayoutGrid,
  List as ListIcon,
  Command,
  PanelLeft,
} from 'lucide-react';
import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface HeaderProps {
  // All props are now optional for backward compatibility
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenAddModal?: () => void;
  onOpenKeyModal?: () => void;
  onOpenAuditModal?: () => void;
  onOpenExtensionModal?: () => void;
  onOpenVaultModal?: () => void;
  onOpenVaultSettings?: () => void;
  onOpenCommandPalette?: () => void;
  isVaultConfigured?: boolean;
  isVaultUnlocked?: boolean;
  onSync?: () => void;
  isSyncing?: boolean;
  pendingDeltasCount?: number;
  viewLayout?: 'grid' | 'list';
  onToggleLayout?: (layout: 'grid' | 'list') => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = (props) => {
  const storeSearchQuery = useLibraryStore((s) => s.searchQuery);
  const storeSetSearchQuery = useLibraryStore((s) => s.setSearchQuery);
  const storePerformSync = useLibraryStore((s) => s.performSync);
  const storeIsSyncing = useLibraryStore((s) => s.isSyncing);
  const storePendingDeltasCount = useLibraryStore((s) => s.pendingDeltasCount);

  const storeViewLayout = useUIStore((s) => s.viewLayout);
  const storeSetViewLayout = useUIStore((s) => s.setViewLayout);
  const storeIsSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const storeToggleSidebar = useUIStore((s) => s.toggleSidebar);
  const storeOpenModal = useUIStore((s) => s.openModal);
  const storeOpenAddBookmarkModal = useUIStore((s) => s.openAddBookmarkModal);

  // Resolved values (store takes precedence, props used as fallbacks)
  const searchQuery = props.searchQuery !== undefined ? props.searchQuery : storeSearchQuery;
  const onSearchChange = props.onSearchChange || storeSetSearchQuery;
  const isSyncing = props.isSyncing !== undefined ? props.isSyncing : storeIsSyncing;
  const pendingDeltasCount =
    props.pendingDeltasCount !== undefined ? props.pendingDeltasCount : storePendingDeltasCount;
  const viewLayout = props.viewLayout || storeViewLayout;
  const onToggleLayout = props.onToggleLayout || storeSetViewLayout;
  const isSidebarOpen = props.isSidebarOpen !== undefined ? props.isSidebarOpen : storeIsSidebarOpen;
  const onToggleSidebar = props.onToggleSidebar || storeToggleSidebar;

  const onOpenCommandPalette =
    props.onOpenCommandPalette || (() => storeOpenModal('command-palette'));
  const onOpenAddModal = props.onOpenAddModal || (() => storeOpenAddBookmarkModal(null));
  const onOpenKeyModal = props.onOpenKeyModal || (() => storeOpenModal('key'));
  const onOpenAuditModal = props.onOpenAuditModal || (() => storeOpenModal('audit'));
  const onOpenExtensionModal = props.onOpenExtensionModal || (() => storeOpenModal('extension'));
  const onSync = props.onSync || (() => storePerformSync());

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global hotkeys ('/' to focus search, 'Cmd+K' / 'Ctrl+K' for command palette)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenCommandPalette]);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        gap: '16px',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Brand & Sidebar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 800 }}>T</span>
          </div>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: 'var(--text-primary)',
            }}
          >
            Tessera
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse to compact sidebar' : 'Expand full sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            borderRadius: 'var(--radius-sm)',
            background: isSidebarOpen ? 'var(--surface-hover)' : 'transparent',
            border: '1px solid var(--border)',
            color: isSidebarOpen ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.background = 'var(--surface-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isSidebarOpen
              ? 'var(--text-primary)'
              : 'var(--text-muted)';
            e.currentTarget.style.background = isSidebarOpen
              ? 'var(--surface-hover)'
              : 'transparent';
          }}
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* Center Search / Command Trigger */}
      <div
        style={{
          flex: 1,
          maxWidth: '480px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: '12px',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search bookmarks (FTS5 + Trigram)..."
          style={{
            width: '100%',
            padding: '8px 64px 8px 34px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: '13px',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K)"
          style={{
            position: 'absolute',
            right: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '3px 6px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: '10px',
          }}
        >
          <Command size={10} />
          <span>K</span>
        </button>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Layout Switcher (Grid / List) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
          }}
        >
          <button
            onClick={() => onToggleLayout('grid')}
            title="Grid View"
            style={{
              padding: '5px',
              borderRadius: '4px',
              background: viewLayout === 'grid' ? 'var(--surface-active)' : 'transparent',
              color: viewLayout === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => onToggleLayout('list')}
            title="Compact List View"
            style={{
              padding: '5px',
              borderRadius: '4px',
              background: viewLayout === 'list' ? 'var(--surface-active)' : 'transparent',
              color: viewLayout === 'list' ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ListIcon size={14} />
          </button>
        </div>

        {/* Sync Trigger */}
        <button
          onClick={onSync}
          disabled={isSyncing}
          title="Sync deltas with zero-knowledge relay"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            fontWeight: 500,
            color: pendingDeltasCount > 0 ? 'var(--amber)' : 'var(--text-secondary)',
          }}
        >
          <RefreshCw
            size={13}
            style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}
          />
          <span>{isSyncing ? 'Syncing' : 'Sync'}</span>
          {pendingDeltasCount > 0 && (
            <span
              style={{
                background: 'var(--amber-dim)',
                color: 'var(--amber)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '0 4px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {pendingDeltasCount}
            </span>
          )}
        </button>

        {/* Audit Log */}
        <button
          onClick={onOpenAuditModal}
          title="Local Audit Log"
          style={{
            padding: '7px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Shield size={14} />
        </button>

        {/* Extensions */}
        <button
          onClick={onOpenExtensionModal}
          title="Sandboxed Extensions"
          style={{
            padding: '7px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Puzzle size={14} />
        </button>

        {/* Master Key */}
        <button
          onClick={onOpenKeyModal}
          title="Master Encryption Key"
          style={{
            padding: '7px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Key size={14} />
        </button>

        {/* New Bookmark Button */}
        <button
          onClick={onOpenAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            fontSize: '12.5px',
            fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>New</span>
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
