import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Download,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useUIStore } from '../store/useUIStore.js';

export const TwoFactorSettingsModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.activeModal === '2fa-settings');
  const closeModal = useUIStore((s) => s.closeModal);

  const {
    user,
    setup2FA,
    enable2FA,
    disable2FA,
    twoFactorSetupData,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      clearError();
      setLocalValidation(null);
      setVerificationCode('');
      setDisableCode('');
    }
  }, [isOpen, clearError]);

  if (!isOpen) return null;

  const is2FAEnabled = Boolean(user?.totpEnabled);

  const handleStartSetup = async () => {
    clearError();
    setLocalValidation(null);
    await setup2FA();
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyBackupCodes = (codes: string[]) => {
    const text = `Tessera 2FA Backup Recovery Codes:\n\n${codes.join('\n')}\n\nKeep these codes in a safe place.`;
    navigator.clipboard.writeText(text);
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidation(null);

    if (!twoFactorSetupData) {
      setLocalValidation('Please initialize 2FA setup first.');
      return;
    }

    if (!verificationCode.trim() || verificationCode.trim().length < 6) {
      setLocalValidation('Please enter the 6-digit verification code.');
      return;
    }

    const res = await enable2FA(
      twoFactorSetupData.secret,
      verificationCode.trim(),
      twoFactorSetupData.backupCodes,
    );

    if (res.success) {
      setVerificationCode('');
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidation(null);

    if (!disableCode.trim()) {
      setLocalValidation('Please enter your 6-digit code or a backup code to disable 2FA.');
      return;
    }

    const res = await disable2FA(disableCode.trim());
    if (res.success) {
      setDisableCode('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
      }}
      onClick={closeModal}
    >
      <div
        className="animate-modal"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
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
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: is2FAEnabled ? 'var(--green-dim)' : 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: is2FAEnabled ? 'var(--green)' : 'var(--accent)',
              }}
            >
              {is2FAEnabled ? <ShieldCheck size={15} /> : <Shield size={14} />}
            </div>
            <span style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Two-Factor Authentication (2FA)
            </span>
          </div>
          <button
            onClick={closeModal}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Error Callout */}
          {(error || localValidation) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>{localValidation || error}</div>
            </div>
          )}

          {is2FAEnabled ? (
            /* Active 2FA Screen */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#10b981', marginBottom: '2px' }}>
                    2FA Protection Active
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Your account is secured with time-based one-time passwords (TOTP). Login requires both your master password and your authenticator code.
                  </div>
                </div>
              </div>

              {/* Disable 2FA Form */}
              <form
                onSubmit={handleDisable}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} style={{ color: 'var(--amber)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Disable 2FA Protection
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  To turn off two-factor authentication, confirm with a 6-digit code or backup code:
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                    placeholder="6-digit code or backup code"
                    maxLength={16}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      fontSize: '13px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isLoading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </div>
              </form>
            </div>
          ) : !twoFactorSetupData ? (
            /* Initial Prompt to Setup */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '16px 8px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                <Shield size={26} />
              </div>

              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Strengthen Your Account
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '380px', margin: '0 auto' }}>
                  Enable two-factor authentication to prevent unauthorized logins even if your password is compromised. Compatible with Google Authenticator, 1Password, Bitwarden, or Apple Keychain.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartSetup}
                disabled={isLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  margin: '0 auto',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {isLoading ? (
                  <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <KeyRound size={15} />
                )}
                <span>{isLoading ? 'Generating Keys...' : 'Setup Authenticator App'}</span>
              </button>
            </div>
          ) : (
            /* Setup in Progress (Secret, URI, Backup Codes, Verification) */
            <form onSubmit={handleEnable} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Step 1: Add Secret to Authenticator
                </div>
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, letterSpacing: '1px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {twoFactorSetupData.secret}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySecret(twoFactorSetupData.secret)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      color: copiedSecret ? 'var(--green)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedSecret ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Backup Codes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Step 2: Save Emergency Backup Codes
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyBackupCodes(twoFactorSetupData.backupCodes)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: copiedBackupCodes ? 'var(--green)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedBackupCodes ? <Check size={11} /> : <Download size={11} />}
                    <span>{copiedBackupCodes ? 'Copied All' : 'Copy Codes'}</span>
                  </button>
                </div>

                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {twoFactorSetupData.backupCodes.map((c, i) => (
                    <div key={i} style={{ padding: '2px 6px', background: 'var(--surface-elevated)', borderRadius: '3px' }}>
                      {c}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 3: Verification */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Step 3: Confirm with 6-Digit Code
                </div>
                <input
                  type="text"
                  autoFocus
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  maxLength={6}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '16px',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {isLoading && <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                <span>Activate Two-Factor Authentication</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
