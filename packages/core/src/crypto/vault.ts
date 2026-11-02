import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  uint8ArrayToHex,
} from './keys.js';
import { PIN_REGEX } from '@tessera/schemas';

const PIN_PBKDF2_ITERATIONS = 100_000;
const PASSPHRASE_PBKDF2_ITERATIONS = 200_000;
const SALT_BYTE_LENGTH = 16;
const VAULT_KEY_BYTE_LENGTH = 32;
const NONCE_BYTE_LENGTH = 24;

/**
 * Validates that a string is a 7-digit numeric PIN.
 */
export const isValidPin = (pin: string): boolean => {
  return PIN_REGEX.test(pin.trim());
};

/**
 * Validates that a passphrase is at least 12 characters and not purely numeric.
 */
export const isValidSyncPassphrase = (passphrase: string): boolean => {
  const trimmed = passphrase.trim();
  if (trimmed.length < 12) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return true;
};

/**
 * Generates a random 16-byte salt for PIN or passphrase key derivation.
 */
export const generateVaultSalt = (): Uint8Array => {
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
};

/**
 * Generates a fresh 256-bit Vault Master Key.
 */
export const generateVaultMasterKey = (): Uint8Array => {
  const key = new Uint8Array(VAULT_KEY_BYTE_LENGTH);
  crypto.getRandomValues(key);
  return key;
};

/**
 * Derives a 256-bit Key Encryption Key (KEK) from a 7-digit PIN using PBKDF2-SHA256 (100k rounds).
 */
export const derivePinKey = (pin: string, salt: Uint8Array): Uint8Array => {
  if (!isValidPin(pin)) {
    throw new Error('PIN must be exactly 7 numeric digits');
  }
  const pinBytes = new TextEncoder().encode(pin);
  return pbkdf2(sha256, pinBytes, salt, { c: PIN_PBKDF2_ITERATIONS, dkLen: 32 });
};

/**
 * Derives a 256-bit Key Encryption Key (KEK) from a strong sync passphrase using PBKDF2-SHA256 (200k rounds).
 */
export const derivePassphraseKey = (passphrase: string, salt: Uint8Array): Uint8Array => {
  if (!isValidSyncPassphrase(passphrase)) {
    throw new Error('Passphrase must be at least 12 characters long and not purely numeric');
  }
  const passBytes = new TextEncoder().encode(passphrase);
  return pbkdf2(sha256, passBytes, salt, { c: PASSPHRASE_PBKDF2_ITERATIONS, dkLen: 32 });
};

/**
 * Derives a deterministic Vault Master Key from a Sync Passphrase and the paired Monorepo Master Key.
 * This allows all paired devices to derive the exact same Vault Master Key without needing to exchange key blobs.
 */
export const deriveVaultMasterKeyFromPassphrase = (
  passphrase: string,
  masterKey: Uint8Array,
): Uint8Array => {
  if (!isValidSyncPassphrase(passphrase)) {
    throw new Error('Passphrase must be at least 12 characters long and not purely numeric');
  }
  const passBytes = new TextEncoder().encode(`tessera_vault_v1:${passphrase}`);
  const salt = masterKey.slice(0, 16);
  return pbkdf2(sha256, passBytes, salt, { c: PASSPHRASE_PBKDF2_ITERATIONS, dkLen: 32 });
};

/**
 * Computes a verification hash for checking PIN correctness.
 */
export const computeSecretHash = (secret: string, salt: Uint8Array): string => {
  const bytes = new TextEncoder().encode(secret);
  const derived = pbkdf2(sha256, bytes, salt, { c: 10_000, dkLen: 32 });
  return uint8ArrayToHex(derived);
};

/**
 * Wraps (encrypts) the Vault Master Key using a Key Encryption Key (KEK).
 */
export const wrapVaultKey = (
  vaultMasterKey: Uint8Array,
  kek: Uint8Array,
): { ciphertext: string; nonce: string } => {
  const nonce = new Uint8Array(NONCE_BYTE_LENGTH);
  crypto.getRandomValues(nonce);

  const cipher = xchacha20poly1305(kek, nonce);
  const ciphertextBytes = cipher.encrypt(vaultMasterKey);

  return {
    ciphertext: uint8ArrayToBase64(ciphertextBytes),
    nonce: uint8ArrayToBase64(nonce),
  };
};

/**
 * Unwraps (decrypts) the Vault Master Key using a Key Encryption Key (KEK).
 */
export const unwrapVaultKey = (
  ciphertextB64: string,
  nonceB64: string,
  kek: Uint8Array,
): { data: Uint8Array | null; error: string | null } => {
  try {
    const ciphertext = base64ToUint8Array(ciphertextB64);
    const nonce = base64ToUint8Array(nonceB64);

    if (nonce.byteLength !== NONCE_BYTE_LENGTH) {
      return { data: null, error: 'Invalid nonce length' };
    }

    const cipher = xchacha20poly1305(kek, nonce);
    const decryptedBytes = cipher.decrypt(ciphertext);

    if (decryptedBytes.byteLength !== VAULT_KEY_BYTE_LENGTH) {
      return { data: null, error: 'Invalid decrypted key length' };
    }

    return { data: decryptedBytes, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message || 'Failed to unwrap vault key' };
  }
};
