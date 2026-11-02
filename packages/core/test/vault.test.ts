import { describe, expect, it } from 'bun:test';
import {
  computeSecretHash,
  derivePassphraseKey,
  derivePinKey,
  deriveVaultMasterKeyFromPassphrase,
  generateVaultMasterKey,
  generateVaultSalt,
  isValidPin,
  isValidSyncPassphrase,
  unwrapVaultKey,
  wrapVaultKey,
} from '../src/crypto/vault.js';

describe('Vault Cryptography & Policy', () => {
  it('strictly validates 7-digit numeric PINs', () => {
    expect(isValidPin('1234567')).toBe(true);
    expect(isValidPin('0000000')).toBe(true);
    expect(isValidPin('9876543')).toBe(true);

    // Invalid PINs
    expect(isValidPin('1234')).toBe(false);       // 4 digits
    expect(isValidPin('123456')).toBe(false);     // 6 digits
    expect(isValidPin('12345678')).toBe(false);   // 8 digits
    expect(isValidPin('123456a')).toBe(false);   // non-numeric
    expect(isValidPin('       ')).toBe(false);   // spaces
  });

  it('strictly enforces minimum 12-char non-numeric passphrase for sync', () => {
    // Valid passphrases
    expect(isValidSyncPassphrase('correct-horse-battery-staple')).toBe(true);
    expect(isValidSyncPassphrase('MySecurePassphrase2026!')).toBe(true);
    expect(isValidSyncPassphrase('twelve chars!!')).toBe(true);

    // Invalid passphrases
    expect(isValidSyncPassphrase('short')).toBe(false);                  // < 12 chars
    expect(isValidSyncPassphrase('123456789012')).toBe(false);          // 12 digits, but purely numeric!
    expect(isValidSyncPassphrase('99999999999999999')).toBe(false);     // purely numeric
    expect(isValidSyncPassphrase('1234567')).toBe(false);               // 7-digit PIN cannot be used for sync!
  });

  it('wraps and unwraps Vault Master Key using 7-digit PIN key', () => {
    const salt = generateVaultSalt();
    const vaultMasterKey = generateVaultMasterKey();
    const pin = '4829103';

    // 1. Derive PIN KEK
    const pinKek = derivePinKey(pin, salt);
    expect(pinKek.byteLength).toBe(32);

    // 2. Wrap Vault Master Key
    const wrapped = wrapVaultKey(vaultMasterKey, pinKek);
    expect(wrapped.ciphertext).toBeString();
    expect(wrapped.nonce).toBeString();

    // 3. Unwrap with correct PIN KEK
    const unwrapRes = unwrapVaultKey(wrapped.ciphertext, wrapped.nonce, pinKek);
    expect(unwrapRes.error).toBeNull();
    expect(unwrapRes.data).toEqual(vaultMasterKey);

    // 4. Unwrap with wrong PIN KEK fails cleanly
    const wrongKek = derivePinKey('9999999', salt);
    const failRes = unwrapVaultKey(wrapped.ciphertext, wrapped.nonce, wrongKek);
    expect(failRes.data).toBeNull();
    expect(failRes.error).toBeDefined();
  });

  it('wraps and unwraps Vault Master Key using strong Sync Passphrase', () => {
    const salt = generateVaultSalt();
    const vaultMasterKey = generateVaultMasterKey();
    const passphrase = 'tessera-zero-knowledge-vault-2026';

    const passKek = derivePassphraseKey(passphrase, salt);
    expect(passKek.byteLength).toBe(32);

    const wrapped = wrapVaultKey(vaultMasterKey, passKek);

    const unwrapRes = unwrapVaultKey(wrapped.ciphertext, wrapped.nonce, passKek);
    expect(unwrapRes.error).toBeNull();
    expect(unwrapRes.data).toEqual(vaultMasterKey);
  });

  it('computes deterministic verification hashes for PIN checks', () => {
    const salt = generateVaultSalt();
    const hash1 = computeSecretHash('1234567', salt);
    const hash2 = computeSecretHash('1234567', salt);
    const hashDiff = computeSecretHash('7654321', salt);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
  });

  it('derives identical Vault Master Key on multiple paired devices using the same Passphrase', () => {
    const sharedMasterKey = new Uint8Array(32).fill(42);
    const passphrase = 'my-vault-sync-passphrase-2026';

    const keyDeviceA = deriveVaultMasterKeyFromPassphrase(passphrase, sharedMasterKey);
    const keyDeviceB = deriveVaultMasterKeyFromPassphrase(passphrase, sharedMasterKey);

    expect(keyDeviceA.byteLength).toBe(32);
    expect(keyDeviceA).toEqual(keyDeviceB);
  });
});
