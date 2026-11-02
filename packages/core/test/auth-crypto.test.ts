import { describe, expect, it } from 'bun:test';
import {
  deriveAuthAndEncryptionKeys,
  wrapMasterKey,
  unwrapMasterKey,
  generateMasterKey,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUri,
  generateBackupCodes,
} from '../src/index.js';

describe('Auth Cryptography & Zero-Knowledge Key Exchange', () => {
  it('deterministically derives authKey, encKey, and authKeyHash from email & password', () => {
    const email = 'user@example.com';
    const password = 'SuperSecretMasterPassword123!';

    // Using lower iterations for test execution speed
    const keys1 = deriveAuthAndEncryptionKeys(email, password, 5_000);
    const keys2 = deriveAuthAndEncryptionKeys('  USER@example.com  ', password, 5_000);

    expect(keys1.authKey).toEqual(keys2.authKey);
    expect(keys1.encKey).toEqual(keys2.encKey);
    expect(keys1.authKeyHash).toEqual(keys2.authKeyHash);
    expect(keys1.authKeyHash).toHaveLength(64);

    // Different password yields different keys
    const keysDiff = deriveAuthAndEncryptionKeys(email, 'DifferentPassword!', 5_000);
    expect(keysDiff.authKeyHash).not.toEqual(keys1.authKeyHash);
    expect(keysDiff.encKey).not.toEqual(keys1.encKey);
  });

  it('wraps and unwraps the master key accurately with encKey', () => {
    const masterKey = generateMasterKey();
    const { encKey } = deriveAuthAndEncryptionKeys('test@test.com', 'mypassword', 5_000);

    const envelope = wrapMasterKey(masterKey, encKey);
    expect(envelope.wrappedMasterKey).toBeDefined();
    expect(envelope.wrappedMasterKeyNonce).toBeDefined();

    // Unwrap on a second device with the same encKey
    const unwrapped = unwrapMasterKey(
      envelope.wrappedMasterKey,
      envelope.wrappedMasterKeyNonce,
      encKey,
    );

    expect(unwrapped.error).toBeNull();
    expect(unwrapped.masterKey).toEqual(masterKey);

    // Fail unwrap with wrong encKey
    const wrongKeys = deriveAuthAndEncryptionKeys('test@test.com', 'wrongpassword', 5_000);
    const failUnwrapped = unwrapMasterKey(
      envelope.wrappedMasterKey,
      envelope.wrappedMasterKeyNonce,
      wrongKeys.encKey,
    );
    expect(failUnwrapped.masterKey).toBeNull();
    expect(failUnwrapped.error).toBeDefined();
  });

  it('generates and verifies RFC 6238 TOTP codes accurately', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    const now = Date.now();
    const code = generateTotpCode(secret, now);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    // Verify current code
    expect(verifyTotpCode(secret, code, now)).toBe(true);

    // Verify code within ±30s window
    expect(verifyTotpCode(secret, code, now + 25_000)).toBe(true);
    expect(verifyTotpCode(secret, code, now - 25_000)).toBe(true);

    // Reject invalid / expired code (> 60s skew)
    expect(verifyTotpCode(secret, code, now + 90_000)).toBe(false);
    expect(verifyTotpCode(secret, '999999', now)).toBe(false);

    // Generate URI
    const uri = generateTotpUri(secret, 'alice@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(secret);
    expect(uri).toContain('alice%40example.com');

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    expect(backupCodes).toHaveLength(10);
    expect(backupCodes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});
