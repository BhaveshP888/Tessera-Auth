import React, { useState } from 'react';
import {
  X,
  Shield,
  KeyRound,
  Trash2,
  CheckCircle,
  Cloud,
  Link,
  PlusCircle,
} from 'lucide-react';
import type { VaultConfig } from '@tessera/schemas';
import { isValidPin, isValidSyncPassphrase } from '@tessera/core';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface VaultSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  vaultConfig?: VaultConfig;
  isVaultUnlocked?: boolean;
  onSetupVault?: (pin: string, wipeAfterAttempts?: number, autoLockMinutes?: number) => { success: boolean; error?: string };
  onRestoreVaultFromSync?: (passphrase: string, pin: string, wipeAfterAttempts?: number, autoLockMinutes?: number) => { success: boolean; error?: string };
  onEnableSync?: (passphrase: string, userPin: string) => { success: boolean; error?: string };
  onDisableSync?: () => void;
  onWipeVault?: () => void;
}

export const VaultSettingsModal: React.FC<VaultSettingsModalProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'vault-settings');
  const storeCloseModal = useUIStore((s) => s.closeModal);

  const storeVaultConfig = useLibraryStore((s) => s.vaultConfig);
  const storeIsVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);
  const storeSetupVault = useLibraryStore((s) => s.setupVault);
  const storeRestoreVaultFromSync = useLibraryStore((s) => s.restoreVaultFromSync);
  const storeEnableSync = useLibraryStore((s) => s.enableVaultSync);
  const storeDisableSync = useLibraryStore((s) => s.disableVaultSync);
  const storeWipeVault = useLibraryStore((s) => s.wipeVaultData);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const vaultConfig = props.vaultConfig || storeVaultConfig;
  const isVaultUnlocked =
    props.isVaultUnlocked !== undefined ? props.isVaultUnlocked : storeIsVaultUnlocked;
  const onSetupVault = props.onSetupVault || storeSetupVault;
  const onRestoreVaultFromSync = props.onRestoreVaultFromSync || storeRestoreVaultFromSync;
  const onEnableSync = props.onEnableSync || storeEnableSync;
  const onDisableSync = props.onDisableSync || storeDisableSync;
  const onWipeVault = props.onWipeVault || storeWipeVault;

  const [activeTab, setActiveTab] = useState<'create' | 'restore'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [wipeThreshold, setWipeThreshold] = useState<number>(vaultConfig.wipeAfterAttempts || 5);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(vaultConfig.autoLockTimeoutMinutes || 5);
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [syncPin, setSyncPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isValidPin(pin)) {
      setErrorMessage('PIN must be exactly 7 numeric digits (0-9).');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMessage('PIN confirmation does not match.');
      return;
    }

    if (!vaultConfig.isConfigured && activeTab === 'restore') {
      if (!isValidSyncPassphrase(restorePassphrase)) {
        setErrorMessage('Sync passphrase must be at least 12 characters and not purely numeric.');
        return;
      }
      const res = onRestoreVaultFromSync(restorePassphrase, pin, wipeThreshold, autoLockMinutes);
      if (res.success) {
        setSuccessMessage('Vault restored & synchronized successfully!');
        setPin('');
        setConfirmPin('');
        setRestorePassphrase('');
        setTimeout(() => onClose(), 1000);
      } else {
        setErrorMessage(res.error || 'Failed to restore vault');
      }
      return;
    }

    const res = onSetupVault(pin, wipeThreshold, autoLockMinutes);
    if (res.success) {
      setSuccessMessage('Vault configured successfully with 7-digit PIN!');
      setPin('');
      setConfirmPin('');
    } else {
      setErrorMessage(res.error || 'Failed to setup vault');
    }
  };

  const handleToggleSync = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (vaultConfig.isSyncEnabled) {
      onDisableSync();
      setSuccessMessage('Vault Cloud Sync disabled. Vault is strictly local.');
    } else {
      if (!isValidSyncPassphrase(syncPassphrase)) {
        setErrorMessage('Sync passphrase must be at least 12 characters and not purely numeric.');
        return;
      }
      if (!isValidPin(syncPin)) {
        setErrorMessage('Your 7-digit PIN is required to authorize cloud synchronization.');
        return;
      }

      const res = onEnableSync(syncPassphrase, syncPin);
      if (res.success) {
        setSuccessMessage('Vault Cloud Sync enabled with strong passphrase encryption!');
        setSyncPassphrase('');
        setSyncPin('');
      } else {
        setErrorMessage(res.error || 'Failed to enable sync');
      }
    }
  };

  const isPassLengthValid = syncPassphrase.trim().length >= 12;
  const isPassNonNumericValid = !/^\d+$/.test(syncPassphrase.trim()) && syncPassphrase.trim().length > 0;

  const isRestorePassValid = restorePassphrase.trim().length >= 12 && !/^\d+$/.test(restorePassphrase.trim());

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 18, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 55,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="animate-modal"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} style={{ color: 'var(--amber)' }} />
            <div>
              <h3 style={{ fontSize: '14.5px', fontWeight: 600 }}>Private Vault Security & Sync</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                7-digit PIN &middot; Auto-wipe protection &middot; E2E encrypted sync
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {errorMessage && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--rose-dim)',
                color: 'var(--rose)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--green-dim)',
                color: 'var(--green)',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle size={14} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Setup Tabs if not configured */}
          {!vaultConfig.isConfigured && (
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--surface)',
                padding: '3px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab('create');
                  setErrorMessage(null);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'create' ? 'var(--surface-hover)' : 'transparent',
                  color: activeTab === 'create' ? 'var(--amber)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: activeTab === 'create' ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                <PlusCircle size={13} />
                <span>Create New Vault</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('restore');
                  setErrorMessage(null);
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'restore' ? 'var(--surface-hover)' : 'transparent',
                  color: activeTab === 'restore' ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: activeTab === 'restore' ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                <Link size={13} />
                <span>Connect Existing Cloud Vault</span>
              </button>
            </div>
          )}

          {/* Section 1: PIN Setup & Configuration */}
          <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <KeyRound size={14} style={{ color: 'var(--amber)' }} />
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                {vaultConfig.isConfigured
                  ? 'Update 7-Digit PIN & Policies'
                  : activeTab === 'restore'
                  ? 'Restore Vault from Cloud Passphrase'
                  : 'Setup 7-Digit PIN'}
              </span>
            </div>

            {!vaultConfig.isConfigured && activeTab === 'restore' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Sync Passphrase (from your other browser / device) *
                </label>
                <input
                  type="password"
                  required
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  placeholder="Enter your 12+ character sync passphrase..."
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '12.5px',
                    outline: 'none',
                  }}
                />
                <p style={{ fontSize: '10.5px', color: isRestorePassValid ? 'var(--green)' : 'var(--text-muted)', marginTop: '4px' }}>
                  {isRestorePassValid ? '✓ Valid Passphrase Format' : 'Must be at least 12 characters and not purely numeric'}
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {activeTab === 'restore' ? 'Set Local 7-Digit PIN *' : '7-Digit PIN *'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={7}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 8492015"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '2px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Confirm 7-Digit PIN *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={7}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 8492015"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '2px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Wipe After Failed Attempts
                </label>
                <select
                  value={wipeThreshold}
                  onChange={(e) => setWipeThreshold(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                >
                  <option value={3}>3 Failed Attempts</option>
                  <option value={5}>5 Failed Attempts (Default)</option>
                  <option value={10}>10 Failed Attempts</option>
                  <option value={0}>Disabled (No Wipe)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Auto-Lock Timeout
                </label>
                <select
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                >
                  <option value={1}>1 Minute</option>
                  <option value={5}>5 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
              <button
                type="submit"
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: activeTab === 'restore' ? 'var(--accent)' : 'var(--amber)',
                  color: '#030712',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {vaultConfig.isConfigured
                  ? 'Update Configuration'
                  : activeTab === 'restore'
                  ? 'Restore & Connect Vault'
                  : 'Save PIN & Initialize'}
              </button>
            </div>
          </form>

          {/* Section 2: Opt-In Passphrase Cloud Sync */}
          {vaultConfig.isConfigured && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cloud size={15} style={{ color: 'var(--accent)' }} />
                  <div>
                    <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Opt-In Vault Cloud Sync</span>
                    <p style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      Enforces strong passphrase encryption when vault leaves device
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    background: vaultConfig.isSyncEnabled ? 'var(--green-dim)' : 'var(--surface)',
                    color: vaultConfig.isSyncEnabled ? 'var(--green)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {vaultConfig.isSyncEnabled ? 'ACTIVE' : 'LOCAL'}
                </span>
              </div>

              {vaultConfig.isSyncEnabled ? (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    Sync encrypted with PBKDF2 (200k iterations).
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSync}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--rose-dim)',
                      color: 'var(--rose)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                    }}
                  >
                    Disable
                  </button>
                </div>
              ) : (
                <form onSubmit={handleToggleSync} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="password"
                    value={syncPassphrase}
                    onChange={(e) => setSyncPassphrase(e.target.value)}
                    placeholder="Enter sync passphrase (min 12 characters)..."
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />

                  <div style={{ display: 'flex', gap: '12px', fontSize: '10.5px' }}>
                    <span style={{ color: isPassLengthValid ? 'var(--green)' : 'var(--text-muted)' }}>
                      {isPassLengthValid ? '✓' : '○'} Min 12 chars
                    </span>
                    <span style={{ color: isPassNonNumericValid ? 'var(--green)' : 'var(--text-muted)' }}>
                      {isPassNonNumericValid ? '✓' : '○'} Non-numeric
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={!isPassLengthValid || !isPassNonNumericValid}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: isPassLengthValid && isPassNonNumericValid ? 'var(--accent)' : 'var(--surface)',
                        color: isPassLengthValid && isPassNonNumericValid ? '#030712' : 'var(--text-muted)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                      }}
                    >
                      Enable Vault Sync
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Section 3: Destructive Wipe */}
          {vaultConfig.isConfigured && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--rose)' }}>
                    Purge & Wipe Vault
                  </span>
                  <p style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Permanently delete all vault items and keys
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to permanently delete all vault items and wipe keys?')) {
                      onWipeVault();
                      onClose();
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--rose-dim)',
                    border: '1px solid var(--rose)',
                    color: 'var(--rose)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                  }}
                >
                  <Trash2 size={12} />
                  <span>Wipe</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
