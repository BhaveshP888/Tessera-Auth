import React, { useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  Star,
  Pin,
  Archive,
  Folder,
  Tag as TagIcon,
  Plus,
  Lock,
  Unlock,
  Radio,
  ChevronRight,
  Trash2,
  X,
} from 'lucide-react';
import type { Collection, Tag } from '@tessera/schemas';
import { getCollectionColor } from '@tessera/core';
import { useLibraryStore, useBookmarkCounts } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

export interface SidebarProps {
  viewFilter?: 'all' | 'favorites' | 'archived' | 'pinned';
  onSelectView?: (view: 'all' | 'favorites' | 'archived' | 'pinned') => void;
  collections?: Collection[];
  selectedCollectionId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  onAddCollection?: (name: string, color?: string) => void;
  onDeleteCollection?: (id: string) => void;
  tags?: Tag[];
  selectedTag?: string | null;
  onSelectTag?: (name: string | null) => void;
  onAddTag?: (name: string) => void;
  onDeleteTag?: (nameOrId: string) => void;
  allBookmarksCount?: number;
  vaultBookmarksCount?: number;
  activeSection?: 'library' | 'vault';
  onSelectSection?: (section: 'library' | 'vault') => void;
  isVaultConfigured?: boolean;
  isVaultUnlocked?: boolean;
  onOpenVaultPinModal?: () => void;
  onOpenVaultSettingsModal?: () => void;
  onLockVault?: () => void;
  deviceId?: string;
  isCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const storeViewFilter = useLibraryStore((s) => s.viewFilter);
  const storeSetViewFilter = useLibraryStore((s) => s.setViewFilter);
  const storeCollections = useLibraryStore((s) => s.collections);
  const storeSelectedCollectionId = useLibraryStore((s) => s.selectedCollectionId);
  const storeSetSelectedCollectionId = useLibraryStore((s) => s.setSelectedCollectionId);
  const storeAddCollection = useLibraryStore((s) => s.addCollection);
  const storeDeleteCollection = useLibraryStore((s) => s.deleteCollection);
  const storeTags = useLibraryStore((s) => s.tags);
  const storeSelectedTag = useLibraryStore((s) => s.selectedTag);
  const storeSetSelectedTag = useLibraryStore((s) => s.setSelectedTag);
  const storeAddTag = useLibraryStore((s) => s.addTag);
  const storeDeleteTag = useLibraryStore((s) => s.deleteTag);
  const { allBookmarksCount: storeAllCount, vaultBookmarksCount: storeVaultCount } =
    useBookmarkCounts();
  const storeActiveSection = useLibraryStore((s) => s.activeSection);
  const storeSetActiveSection = useLibraryStore((s) => s.setActiveSection);
  const storeIsVaultConfigured = useLibraryStore((s) => s.vaultConfig.isConfigured);
  const storeIsVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);
  const storeLockVault = useLibraryStore((s) => s.lockVault);
  const storeDeviceId = useLibraryStore((s) => s.deviceId);

  const storeIsSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const storeSetSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const storeOpenModal = useUIStore((s) => s.openModal);
  const isMobile = useIsMobile();

  const closeOnMobile = () => {
    if (isMobile) {
      storeSetSidebarOpen(false);
    }
  };

  // Fallbacks
  const isCollapsed =
    props.isCollapsed !== undefined ? props.isCollapsed : !storeIsSidebarOpen;
  const viewFilter = props.viewFilter || storeViewFilter;
  const onSelectView = props.onSelectView || storeSetViewFilter;
  const collections = props.collections || storeCollections;
  const selectedCollectionId =
    props.selectedCollectionId !== undefined
      ? props.selectedCollectionId
      : storeSelectedCollectionId;
  const onSelectCollection = props.onSelectCollection || storeSetSelectedCollectionId;
  const onAddCollection = props.onAddCollection || storeAddCollection;
  const onDeleteCollection = props.onDeleteCollection || storeDeleteCollection;
  const tags = props.tags || storeTags;
  const selectedTag = props.selectedTag !== undefined ? props.selectedTag : storeSelectedTag;
  const onSelectTag = props.onSelectTag || storeSetSelectedTag;
  const onAddTag = props.onAddTag || storeAddTag;
  const onDeleteTag = props.onDeleteTag || storeDeleteTag;
  const allBookmarksCount =
    props.allBookmarksCount !== undefined ? props.allBookmarksCount : storeAllCount;
  const vaultBookmarksCount =
    props.vaultBookmarksCount !== undefined ? props.vaultBookmarksCount : storeVaultCount;
  const activeSection = props.activeSection || storeActiveSection;
  const onSelectSection = props.onSelectSection || storeSetActiveSection;
  const isVaultConfigured =
    props.isVaultConfigured !== undefined ? props.isVaultConfigured : storeIsVaultConfigured;
  const isVaultUnlocked =
    props.isVaultUnlocked !== undefined ? props.isVaultUnlocked : storeIsVaultUnlocked;
  const onOpenVaultPinModal =
    props.onOpenVaultPinModal || (() => storeOpenModal('vault-pin'));
  const onOpenVaultSettingsModal =
    props.onOpenVaultSettingsModal || (() => storeOpenModal('vault-settings'));
  const onLockVault = props.onLockVault || storeLockVault;
  const deviceId = props.deviceId || storeDeviceId;

  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColName.trim()) {
      onAddCollection(newColName.trim());
      setNewColName('');
      setIsAddingCollection(false);
    }
  };

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagName.trim()) {
      onAddTag(newTagName.trim());
      setNewTagName('');
      setIsAddingTag(false);
    }
  };

  const handleVaultClick = () => {
    onSelectSection('vault');
    onSelectView('all');
    onSelectCollection(null);
    onSelectTag(null);
    closeOnMobile();
    if (!isVaultConfigured) {
      onOpenVaultSettingsModal();
    } else if (!isVaultUnlocked) {
      onOpenVaultPinModal();
    }
  };

  // On mobile devices, collapsed means completely hidden (null)
  if (isMobile && isCollapsed) {
    return null;
  }

  // Compact Icon-Only Sidebar Mode (Desktop / Tablet only)
  if (isCollapsed) {
    return (
      <aside
        style={{
          width: '56px',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: 'calc(100vh - 57px)',
          overflowY: 'auto',
          padding: '14px 6px',
          userSelect: 'none',
          gap: '4px',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Library */}
        <button
          type="button"
          onClick={() => {
            onSelectSection('library');
            onSelectView('all');
            onSelectCollection(null);
            onSelectTag(null);
          }}
          title={`Library (${allBookmarksCount} bookmarks)`}
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background:
              activeSection === 'library' && viewFilter === 'all' && !selectedCollectionId && !selectedTag
                ? 'var(--surface-hover)'
                : 'transparent',
            color:
              activeSection === 'library' && viewFilter === 'all' && !selectedCollectionId && !selectedTag
                ? 'var(--accent)'
                : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <BookmarkIcon size={17} style={{ color: 'var(--accent)' }} />
        </button>

        {/* Private Vault */}
        <button
          type="button"
          onClick={handleVaultClick}
          title={isVaultUnlocked ? 'Private Vault (Unlocked)' : isVaultConfigured ? 'Private Vault (Locked)' : 'Setup Private Vault'}
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'vault' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'vault' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {isVaultUnlocked ? (
            <Unlock size={17} style={{ color: 'var(--green)' }} />
          ) : (
            <Lock size={17} style={{ color: 'var(--amber)' }} />
          )}
        </button>

        {/* Pinned */}
        <button
          type="button"
          onClick={() => {
            onSelectSection('library');
            onSelectView('pinned');
            onSelectCollection(null);
            onSelectTag(null);
          }}
          title="Pinned Bookmarks"
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'pinned' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'pinned' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Pin size={17} style={{ color: 'var(--amber)' }} />
        </button>

        {/* Favorites */}
        <button
          type="button"
          onClick={() => {
            onSelectSection('library');
            onSelectView('favorites');
            onSelectCollection(null);
            onSelectTag(null);
          }}
          title="Favorites"
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'favorites' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'favorites' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Star size={17} style={{ color: 'var(--rose)' }} />
        </button>

        {/* Archive */}
        <button
          type="button"
          onClick={() => {
            onSelectSection('library');
            onSelectView('archived');
            onSelectCollection(null);
            onSelectTag(null);
          }}
          title="Archive"
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'archived' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'archived' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Archive size={17} style={{ color: 'var(--text-muted)' }} />
        </button>

        {/* Divider */}
        {collections.length > 0 && (
          <div style={{ width: '24px', height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        )}

        {/* Collections (Dots) */}
        {(collections || []).map((col) => {
          const isSelected = selectedCollectionId === col.id && activeSection === 'library';
          const colColor = getCollectionColor(col.name, col.color);
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => {
                onSelectSection('library');
                onSelectCollection(isSelected ? null : col.id);
                onSelectTag(null);
              }}
              title={`Collection: ${col.name}`}
              style={{
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'var(--surface-hover)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: isSelected ? '10px' : '8px',
                  height: isSelected ? '10px' : '8px',
                  borderRadius: '50%',
                  background: colColor,
                  border: isSelected ? '2px solid var(--text-primary)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              />
            </button>
          );
        })}

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ width: '24px', height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        )}
        {(tags || []).slice(0, 6).map((tag) => {
          const isSelected = selectedTag === tag.name && activeSection === 'library';
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => {
                onSelectSection('library');
                onSelectTag(isSelected ? null : tag.name);
                onSelectCollection(null);
              }}
              title={`Tag: #${tag.name}`}
              style={{
                width: '34px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'var(--accent)' : 'var(--surface)',
                color: isSelected ? '#030712' : 'var(--text-muted)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              #{tag.name.slice(0, 2)}
            </button>
          );
        })}

        {/* Device Status Dot at bottom */}
        <div
          title={`Device: ${deviceId}`}
          style={{
            marginTop: 'auto',
            paddingTop: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)' }} />
        </div>
      </aside>
    );
  }

  const renderNavigationContent = () => (
    <>
      {/* Primary Navigation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            onSelectSection('library');
            onSelectView('all');
            onSelectCollection(null);
            onSelectTag(null);
            closeOnMobile();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background:
              activeSection === 'library' && viewFilter === 'all' && !selectedCollectionId && !selectedTag
                ? 'var(--surface-hover)'
                : 'transparent',
            color:
              activeSection === 'library' && viewFilter === 'all' && !selectedCollectionId && !selectedTag
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookmarkIcon size={15} style={{ color: 'var(--accent)' }} />
            <span>Library</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {allBookmarksCount}
          </span>
        </button>

        {/* Private Vault Navigation Item */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 6px 3px 10px',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'vault' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'vault' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <button
            onClick={handleVaultClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              fontSize: '13px',
              fontWeight: 500,
              textAlign: 'left',
              color: 'inherit',
            }}
          >
            {isVaultUnlocked ? (
              <Unlock size={15} style={{ color: 'var(--green)' }} />
            ) : (
              <Lock size={15} style={{ color: 'var(--amber)' }} />
            )}
            <span>Private Vault</span>
          </button>

          {isVaultConfigured ? (
            isVaultUnlocked ? (
              <button
                onClick={onLockVault}
                title="Lock Vault"
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'var(--green-dim)',
                  color: 'var(--green)',
                  fontWeight: 600,
                }}
              >
                OPEN
              </button>
            ) : (
              <button
                onClick={onOpenVaultPinModal}
                title="Unlock Vault with 7-digit PIN"
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'var(--amber-dim)',
                  color: 'var(--amber)',
                  fontWeight: 600,
                }}
              >
                LOCK
              </button>
            )
          ) : (
            <button
              onClick={onOpenVaultSettingsModal}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'var(--surface)',
                color: 'var(--text-muted)',
              }}
            >
              SETUP
            </button>
          )}
        </div>

        <button
          onClick={() => {
            onSelectSection('library');
            onSelectView('pinned');
            onSelectCollection(null);
            onSelectTag(null);
            closeOnMobile();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'pinned' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'pinned' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Pin size={15} style={{ color: 'var(--amber)' }} />
          <span>Pinned</span>
        </button>

        <button
          onClick={() => {
            onSelectSection('library');
            onSelectView('favorites');
            onSelectCollection(null);
            onSelectTag(null);
            closeOnMobile();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'favorites' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'favorites' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Star size={15} style={{ color: 'var(--rose)' }} />
          <span>Favorites</span>
        </button>

        <button
          onClick={() => {
            onSelectSection('library');
            onSelectView('archived');
            onSelectCollection(null);
            onSelectTag(null);
            closeOnMobile();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background: activeSection === 'library' && viewFilter === 'archived' ? 'var(--surface-hover)' : 'transparent',
            color: activeSection === 'library' && viewFilter === 'archived' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Archive size={15} style={{ color: 'var(--text-muted)' }} />
          <span>Archive</span>
        </button>
      </div>

      {/* Collections Section */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px 6px 8px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.8px',
              fontWeight: 600,
            }}
          >
            Collections
          </span>
          <button
            onClick={() => setIsAddingCollection(true)}
            style={{ color: 'var(--text-muted)', padding: '2px' }}
            title="New Collection"
          >
            <Plus size={13} />
          </button>
        </div>

        {isAddingCollection && (
          <form onSubmit={handleCreateCollection} style={{ padding: '0 4px 6px 4px' }}>
            <input
              type="text"
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Collection name..."
              style={{
                width: '100%',
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--accent)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              onBlur={() => setIsAddingCollection(false)}
            />
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {(collections || []).map((col) => {
            const isSelected = selectedCollectionId === col.id && activeSection === 'library';
            const colColor = getCollectionColor(col.name, col.color);
            return (
              <div
                key={col.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--surface-hover)' : 'transparent',
                  paddingRight: '4px',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => {
                    onSelectSection('library');
                    onSelectCollection(isSelected ? null : col.id);
                    onSelectTag(null);
                    closeOnMobile();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    flex: 1,
                    minWidth: 0,
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12.5px',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: colColor,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {col.name}
                  </span>
                </button>

                {onDeleteCollection && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete collection "${col.name}"? Bookmarks will remain in your library.`)) {
                        onDeleteCollection(col.id);
                        if (selectedCollectionId === col.id) {
                          onSelectCollection(null);
                        }
                      }
                    }}
                    title={`Delete "${col.name}"`}
                    style={{
                      padding: '4px',
                      color: 'var(--text-muted)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--rose)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tags Section */}
      <div style={{ flex: 1, marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px 6px 8px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.8px',
              fontWeight: 600,
            }}
          >
            Tags
          </span>
          <button
            onClick={() => setIsAddingTag(true)}
            style={{ color: 'var(--text-muted)', padding: '2px' }}
            title="New Tag"
          >
            <Plus size={13} />
          </button>
        </div>

        {isAddingTag && (
          <form onSubmit={handleCreateTag} style={{ padding: '0 4px 6px 4px' }}>
            <input
              type="text"
              autoFocus
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name..."
              style={{
                width: '100%',
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--accent)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              onBlur={() => setIsAddingTag(false)}
            />
          </form>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 4px' }}>
          {(tags || []).map((tag) => {
            const isSelected = selectedTag === tag.name && activeSection === 'library';
            return (
              <div
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--accent)' : 'var(--surface)',
                  color: isSelected ? '#030712' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => {
                    onSelectSection('library');
                    onSelectTag(isSelected ? null : tag.name);
                    onSelectCollection(null);
                    closeOnMobile();
                  }}
                  style={{
                    padding: '3px 6px',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                  }}
                >
                  #{tag.name}
                </button>
                {onDeleteTag && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTag(tag.name);
                      if (selectedTag === tag.name) {
                        onSelectTag(null);
                      }
                    }}
                    title={`Delete tag #${tag.name}`}
                    style={{
                      padding: '3px 4px',
                      color: isSelected ? '#030712' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      borderLeft: `1px solid ${isSelected ? 'rgba(0,0,0,0.15)' : 'var(--border)'}`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--rose)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = isSelected ? '#030712' : 'var(--text-muted)')}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Device Identifier */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deviceId}
        </span>
      </div>
    </>
  );

  // Mobile Drawer Mode
  if (isMobile) {
    return (
      <>
        {/* Backdrop overlay */}
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => storeSetSidebarOpen(false)}
        />
        <aside
          className="mobile-sidebar-drawer"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 14px',
            userSelect: 'none',
            overflowY: 'auto',
          }}
        >
          {/* Mobile Drawer Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '12px',
              marginBottom: '14px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-hover)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 800 }}>T</span>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
                Tessera
              </span>
            </div>
            <button
              type="button"
              onClick={() => storeSetSidebarOpen(false)}
              title="Close sidebar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {renderNavigationContent()}
        </aside>
      </>
    );
  }

  // Full Expanded Sidebar Mode (Desktop / Tablet >= 721px)
  return (
    <aside
      style={{
        width: '240px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 57px)',
        overflowY: 'auto',
        padding: '16px 12px',
        userSelect: 'none',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {renderNavigationContent()}
    </aside>
  );
};
