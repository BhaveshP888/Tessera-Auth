import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, KeyRound, AlertTriangle, ShieldAlert } from 'lucide-react';
import { isValidPin } from '@tessera/core';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface VaultPinModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onUnlock?: (pin: string) => { success: boolean; error?: string; remainingAttempts?: number; wiped?: boolean };
  failedAttempts?: number;
  wipeAfterAttempts?: number;
}

export const VaultPinModal: React.FC<VaultPinModalProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'vault-pin');
  const storeCloseModal = useUIStore((s) => s.closeModal);

  const storeUnlockVault = useLibraryStore((s) => s.unlockVault);
  const storeFailedAttempts = useLibraryStore((s) => s.vaultConfig.failedAttempts);
  const storeWipeAfterAttempts = useLibraryStore((s) => s.vaultConfig.wipeAfterAttempts);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const onUnlock = props.onUnlock || storeUnlockVault;
  const failedAttempts =
    props.failedAttempts !== undefined ? props.failedAttempts : storeFailedAttempts;
  const wipeAfterAttempts =
    props.wipeAfterAttempts !== undefined ? props.wipeAfterAttempts : storeWipeAfterAttempts;
  const [pinDigits, setPinDigits] = useState<string[]>(Array(7).fill(''));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWiped, setIsWiped] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPinDigits(Array(7).fill(''));
      setErrorMessage(null);
      setIsWiped(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, val: string) => {
    const numeric = val.replace(/\D/g, '');
    if (!numeric) {
      const copy = [...pinDigits];
      copy[index] = '';
      setPinDigits(copy);
      return;
    }

    if (numeric.length >= 7) {
      const fullPin = numeric.slice(0, 7).split('');
      setPinDigits(fullPin);
      inputRefs.current[6]?.focus();
      handleAttemptUnlock(fullPin.join(''));
      return;
    }

    const copy = [...pinDigits];
    copy[index] = numeric[numeric.length - 1]!;
    setPinDigits(copy);

    if (index < 6) {
      inputRefs.current[index + 1]?.focus();
    }

    const full = copy.join('');
    if (full.length === 7) {
      handleAttemptUnlock(full);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleAttemptUnlock = (pin: string) => {
    if (!isValidPin(pin)) {
      setErrorMessage('PIN must be exactly 7 numeric digits.');
      return;
    }

    const res = onUnlock(pin);
    if (res.success) {
      onClose();
    } else {
      if (res.wiped) {
        setIsWiped(true);
      }
      setErrorMessage(res.error || 'Incorrect PIN');
      setPinDigits(Array(7).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const handleNumpadClick = (num: number) => {
    const emptyIndex = pinDigits.findIndex((d) => d === '');
    if (emptyIndex !== -1) {
      handleDigitChange(emptyIndex, num.toString());
    }
  };

  const remaining = wipeAfterAttempts > 0 ? Math.max(0, wipeAfterAttempts - failedAttempts) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
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
          maxWidth: '400px',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={15} style={{ color: 'var(--amber)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Private Vault</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '22px 18px', overflowY: 'auto', flex: 1 }}>
          {isWiped ? (
            <div style={{ padding: '16px 0' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--rose-dim)',
                  color: 'var(--rose)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <ShieldAlert size={24} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--rose)', marginBottom: '6px' }}>
                Vault Purged & Sanitized
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '18px' }}>
                Maximum failed attempts reached. All vault items and keys have been permanently destroyed.
              </p>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--amber-dim)',
                  color: 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                }}
              >
                <KeyRound size={20} />
              </div>

              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                Enter 7-Digit PIN
              </h3>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                End-to-end encrypted with PBKDF2-SHA256 (100k rounds)
              </p>

              {remaining !== null && remaining <= 3 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--rose-dim)',
                    color: 'var(--rose)',
                    fontSize: '11px',
                    fontWeight: 500,
                    marginBottom: '14px',
                  }}
                >
                  <AlertTriangle size={13} />
                  <span>Warning: {remaining} attempt(s) left before vault purge!</span>
                </div>
              )}

              {/* 7-Digit Inputs */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '18px' }}>
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    style={{
                      width: '36px',
                      height: '44px',
                      textAlign: 'center',
                      fontSize: '18px',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: digit ? '1.5px solid var(--amber)' : '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                ))}
              </div>

              {errorMessage && (
                <p style={{ fontSize: '11.5px', color: 'var(--rose)', marginBottom: '14px', fontWeight: 500 }}>
                  {errorMessage}
                </p>
              )}

              {/* Numpad */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                  maxWidth: '220px',
                  margin: '0 auto',
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumpadClick(num)}
                    style={{
                      padding: '10px 0',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPinDigits(Array(7).fill(''))}
                  style={{
                    padding: '10px 0',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                  }}
                >
                  CLR
                </button>
                <button
                  type="button"
                  onClick={() => handleNumpadClick(0)}
                  style={{
                    padding: '10px 0',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lastIdx = pinDigits.findLastIndex((d) => d !== '');
                    if (lastIdx !== -1) {
                      const copy = [...pinDigits];
                      copy[lastIdx] = '';
                      setPinDigits(copy);
                      inputRefs.current[lastIdx]?.focus();
                    }
                  }}
                  style={{
                    padding: '10px 0',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                  }}
                >
                  ⌫
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
