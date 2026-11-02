import React from 'react';
import { useLibraryStore, useFilteredBookmarks } from './store/useLibraryStore.js';
import { useUIStore } from './store/useUIStore.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { BookmarkList } from './components/BookmarkList.js';
import { AddBookmarkModal } from './components/AddBookmarkModal.js';
import { KeyManagementModal } from './components/KeyManagementModal.js';
import { AuditLogModal } from './components/AuditLogModal.js';
import { ExtensionManagerModal } from './components/ExtensionManagerModal.js';
import { VaultPinModal } from './components/VaultPinModal.js';
import { VaultSettingsModal } from './components/VaultSettingsModal.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Lock, Shield, KeyRound } from 'lucide-react';

export const App: React.FC = () => {
  const activeSection = useLibraryStore((s) => s.activeSection);
  const isVaultConfigured = useLibraryStore((s) => s.vaultConfig.isConfigured);
  const isVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);
  const lockVault = useLibraryStore((s) => s.lockVault);
  const selectedTag = useLibraryStore((s) => s.selectedTag);
  const selectedCollectionId = useLibraryStore((s) => s.selectedCollectionId);
  const collections = useLibraryStore((s) => s.collections);
  const viewFilter = useLibraryStore((s) => s.viewFilter);
  const searchQuery = useLibraryStore((s) => s.searchQuery);

  const openModal = useUIStore((s) => s.openModal);

  const filteredBookmarks = useFilteredBookmarks();
  const isViewingVault = activeSection === 'vault';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />

        <main style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 57px)' }}>
          {/* Vault locked hero state */}
          {isViewingVault && !isVaultUnlocked ? (
            <div
              className="animate-fade"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '90px 20px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-hover)',
                  color: 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <Lock size={26} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.3px' }}>
                {isVaultConfigured ? 'Private Vault is Locked' : 'Private Vault Not Configured'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.45, marginBottom: '22px' }}>
                {isVaultConfigured
                  ? 'Enter your 7-digit PIN to decrypt isolated vault bookmarks and notes.'
                  : 'Configure a 7-digit PIN with wipe-after-N protection to store sensitive items.'}
              </p>
              <div>
                {isVaultConfigured ? (
                  <button
                    onClick={() => openModal('vault-pin')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 20px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--amber)',
                      color: '#030712',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <KeyRound size={15} />
                    <span>Enter 7-Digit PIN</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openModal('vault-settings')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 20px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent)',
                      color: '#030712',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <Shield size={15} />
                    <span>Configure Vault</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* View summary header */}
              <div
                style={{
                  padding: '16px 28px 4px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
                      {isViewingVault
                        ? 'Private Vault'
                        : selectedTag
                          ? `#${selectedTag}`
                          : selectedCollectionId
                            ? collections.find((c) => c.id === selectedCollectionId)?.name || 'Collection'
                            : viewFilter === 'favorites'
                              ? 'Favorites'
                              : viewFilter === 'pinned'
                                ? 'Pinned'
                                : viewFilter === 'archived'
                                  ? 'Archive'
                                  : 'All Bookmarks'}
                    </h2>
                    {isViewingVault && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'var(--green-dim)',
                          color: 'var(--green)',
                          fontWeight: 600,
                        }}
                      >
                        DECRYPTED
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {filteredBookmarks.length} {filteredBookmarks.length === 1 ? 'item' : 'items'}
                    {searchQuery && ` matching "${searchQuery}"`}
                  </span>
                </div>

                {isViewingVault && (
                  <button
                    onClick={lockVault}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                    }}
                  >
                    <Lock size={12} />
                    <span>Lock Vault</span>
                  </button>
                )}
              </div>

              <BookmarkList />
            </>
          )}
        </main>
      </div>

      {/* Modals & Command Palette */}
      <CommandPalette />
      <AddBookmarkModal />
      <KeyManagementModal />
      <AuditLogModal />
      <ExtensionManagerModal />
      <VaultPinModal />
      <VaultSettingsModal />
    </div>
  );
};
