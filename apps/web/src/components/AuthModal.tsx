import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  KeyRound,
  Shield,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useUIStore } from '../store/useUIStore.js';

export const AuthModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.activeModal === 'auth');
  const closeModal = useUIStore((s) => s.closeModal);

  const {
    login,
    register,
    verify2FA,
    requires2FA,
    resetTwoFactorChallenge,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    clearError();
    setLocalValidation(null);
    resetTwoFactorChallenge();
    closeModal();
  };

  const calculatePasswordStrength = (pwd: string): { label: string; color: string; score: number } => {
    if (!pwd) return { label: 'Empty', color: 'var(--text-muted)', score: 0 };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { label: 'Weak', color: '#ef4444', score: 25 };
    if (score <= 3) return { label: 'Fair', color: 'var(--amber)', score: 50 };
    if (score <= 4) return { label: 'Good', color: '#3b82f6', score: 75 };
    return { label: 'Strong', color: '#10b981', score: 100 };
  };

  const strength = calculatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidation(null);

    if (requires2FA) {
      if (!twoFactorCode.trim()) {
        setLocalValidation('Please enter your 6-digit 2FA code or backup code.');
        return;
      }
      const res = await verify2FA(twoFactorCode.trim());
      if (res.success) {
        handleClose();
      }
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setLocalValidation('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setLocalValidation('Password must be at least 8 characters long.');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setLocalValidation('Passwords do not match.');
        return;
      }

      const res = await register(email.trim(), password, deviceName.trim() || undefined);
      if (res.success) {
        handleClose();
      }
    } else {
      const res = await login(email.trim(), password, deviceName.trim() || undefined);
      if (res.success && !res.requires2FA) {
        handleClose();
      }
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
      onClick={handleClose}
    >
      <div
        className="animate-modal"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '460px',
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <Shield size={14} />
            </div>
            <span style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {requires2FA
                ? 'Two-Factor Authentication'
                : mode === 'login'
                  ? 'Sign In to Tessera'
                  : 'Create Zero-Knowledge Account'}
            </span>
          </div>
          <button
            onClick={handleClose}
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

        {/* Tab Selector (Hidden if in 2FA Challenge) */}
        {!requires2FA && (
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
                setLocalValidation(null);
              }}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: mode === 'login' ? 600 : 500,
                color: mode === 'login' ? 'var(--accent)' : 'var(--text-secondary)',
                background: mode === 'login' ? 'var(--surface-elevated)' : 'transparent',
                border: 'none',
                borderBottom: mode === 'login' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                clearError();
                setLocalValidation(null);
              }}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: mode === 'register' ? 600 : 500,
                color: mode === 'register' ? 'var(--accent)' : 'var(--text-secondary)',
                background: mode === 'register' ? 'var(--surface-elevated)' : 'transparent',
                border: 'none',
                borderBottom: mode === 'register' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Body Content */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Error Alert */}
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

          {requires2FA ? (
            /* 2FA Challenge View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--amber-dim)',
                    color: 'var(--amber)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <KeyRound size={18} />
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  This account is protected with 2-Factor Authentication. Enter the 6-digit code from your authenticator app.
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Authentication Code / Recovery Code
                </label>
                <input
                  type="text"
                  autoFocus
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                  placeholder="e.g. 123456"
                  maxLength={16}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    fontSize: '18px',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={resetTwoFactorChallenge}
                  style={{
                    flex: 1,
                    padding: '9px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    flex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {isLoading && <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  <span>Verify & Unlock</span>
                </button>
              </div>
            </div>
          ) : (
            /* Email & Password Form */
            <>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Email Address
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Mail
                    size={14}
                    style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock
                    size={14}
                    style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    style={{
                      width: '100%',
                      padding: '8px 34px 8px 32px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {mode === 'register' && password && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Strength</span>
                      <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                    </div>
                    <div style={{ height: '3px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${strength.score}%`,
                          background: strength.color,
                          transition: 'all 0.2s ease',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {mode === 'register' && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Lock
                      size={14}
                      style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 32px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Device Identifier (Optional)
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Smartphone
                    size={14}
                    style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
                  />
                  <input
                    type="text"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="e.g. Work MacBook, Home PC"
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Zero-Knowledge Security Notice */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '11.5px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                <CheckCircle2 size={14} style={{ color: 'var(--green)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Zero-Knowledge Architecture:</strong> Your master encryption key is wrapped locally via PBKDF2 (600,000 rounds) + HKDF. The server never receives your plaintext password or master key.
                </div>
              </div>

              {/* Submit Button */}
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
                  marginTop: '4px',
                }}
              >
                {isLoading ? (
                  <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <ArrowRight size={14} />
                )}
                <span>
                  {isLoading
                    ? 'Deriving Keys & Connecting...'
                    : mode === 'login'
                      ? 'Sign In & Decrypt'
                      : 'Create Account & Wrap Master Key'}
                </span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
