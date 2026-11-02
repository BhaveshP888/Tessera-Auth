import React, { useRef, useEffect, useState } from 'react';
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
  User as UserIcon,
  LogOut,
  ShieldCheck,
  ChevronDown,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

export interface HeaderProps {
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

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  const isMobile = useIsMobile();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  // Close account dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isAccountMenuOpen || isMoreMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAccountMenuOpen, isMoreMenuOpen]);

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
      className="app-header"
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
      {isMobile && isMobileSearchOpen ? (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search bookmarks (FTS5 + Trigram)..."
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)',
              border: '1px solid var(--accent)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => {
              setIsMobileSearchOpen(false);
              if (searchQuery) onSearchChange('');
            }}
            title="Close search"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
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
        className="hide-on-mobile"
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
        {/* Desktop Controls (Grid/List, Sync, Audit, Extensions, Master Key) */}
        <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        </div>

        {/* Mobile Search Button */}
        <button
          type="button"
          className="show-on-mobile"
          onClick={() => setIsMobileSearchOpen(true)}
          title="Search bookmarks"
          style={{
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Search size={14} />
        </button>

        {/* Mobile More Tools Menu ("...") */}
        <div className="show-on-mobile" style={{ position: 'relative' }} ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            title="More actions"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              background: isMoreMenuOpen ? 'var(--surface-active)' : 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <MoreHorizontal size={14} />
            {pendingDeltasCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--amber)',
                }}
              />
            )}
          </button>

          {isMoreMenuOpen && (
            <div
              className="animate-fade"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '200px',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '5px',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onSync();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw
                    size={13}
                    style={{
                      animation: isSyncing ? 'spin 1s linear infinite' : 'none',
                      color: pendingDeltasCount > 0 ? 'var(--amber)' : 'inherit',
                    }}
                  />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </div>
                {pendingDeltasCount > 0 && (
                  <span
                    style={{
                      background: 'var(--amber-dim)',
                      color: 'var(--amber)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontWeight: 600,
                    }}
                  >
                    {pendingDeltasCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onToggleLayout(viewLayout === 'grid' ? 'list' : 'grid');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {viewLayout === 'grid' ? <ListIcon size={13} /> : <LayoutGrid size={13} />}
                  <span>{viewLayout === 'grid' ? 'List View' : 'Grid View'}</span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {viewLayout.toUpperCase()}
                </span>
              </button>

              <div style={{ height: '1px', background: 'var(--border)', margin: '3px 0' }} />

              <button
                type="button"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenKeyModal();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Key size={13} style={{ color: 'var(--text-muted)' }} />
                <span>Master Encryption Key</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenExtensionModal();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Puzzle size={13} style={{ color: 'var(--text-muted)' }} />
                <span>Extensions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenAuditModal();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Shield size={13} style={{ color: 'var(--text-muted)' }} />
                <span>Local Audit Log</span>
              </button>
            </div>
          )}
        </div>

        {/* Account Auth Pill */}
        <div style={{ position: 'relative' }} ref={accountMenuRef}>
          {isAuthenticated && user ? (
            <button
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              title={`Logged in as ${user.email}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: isAccountMenuOpen ? 'var(--surface-active)' : 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  fontSize: '10px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {user.email.charAt(0).toUpperCase()}
              </div>
              <span
                className="hide-on-mobile"
                style={{
                  maxWidth: '110px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email.split('@')[0]}
              </span>
              {user.totpEnabled && (
                <ShieldCheck size={12} className="hide-on-mobile" style={{ color: 'var(--green)', flexShrink: 0 }} />
              )}
              <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          ) : (
            <button
              onClick={() => storeOpenModal('auth')}
              title="Sign in or register for zero-knowledge cross-device sync"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <UserIcon size={13} />
              <span className="hide-on-mobile">Sign In</span>
            </button>
          )}

          {/* Account Dropdown Popover */}
          {isAccountMenuOpen && user && (
            <div
              className="animate-fade"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '230px',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '6px',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {/* Profile summary */}
              <div
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border)',
                  marginBottom: '4px',
                }}
              >
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.email}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '3px',
                    fontSize: '10.5px',
                    color: user.totpEnabled ? 'var(--green)' : 'var(--text-muted)',
                  }}
                >
                  <ShieldCheck size={11} />
                  <span>{user.totpEnabled ? '2FA Enabled' : '2FA Not Configured'}</span>
                </div>
              </div>

              {/* 2FA Settings button */}
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  storeOpenModal('2fa-settings');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Shield size={13} style={{ color: 'var(--accent)' }} />
                <span>Two-Factor Security</span>
              </button>

              {/* Logout button */}
              <button
                type="button"
                onClick={async () => {
                  setIsAccountMenuOpen(false);
                  await logout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: '#f87171',
                  fontSize: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

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
            flexShrink: 0,
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>New</span>
        </button>
      </div>
      </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
