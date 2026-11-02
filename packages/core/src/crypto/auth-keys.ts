import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { argon2id } from '@noble/hashes/argon2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

export { argon2id };

import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  uint8ArrayToHex,
} from './keys.js';

export const DEFAULT_AUTH_PBKDF2_ROUNDS = 600_000;
const MASTER_KEY_BYTE_LENGTH = 32;
const NONCE_BYTE_LENGTH = 24;

export interface DerivedAuthKeys {
  authKey: Uint8Array;
  encKey: Uint8Array;
  authKeyHash: string; // Hex-encoded SHA-256 of authKey sent to the server
}

export interface WrappedMasterKeyEnvelope {
  wrappedMasterKey: string;
  wrappedMasterKeyNonce: string;
}

/**
 * Derives the authKey (for server authentication) and encKey (for wrapping the local master key)
 * deterministically from the user's email and master password using PBKDF2-SHA256 and HKDF-SHA256.
 *
 * Neither the master password, nor the master PRF, nor the encKey is EVER transmitted to the server.
 */
export const deriveAuthAndEncryptionKeys = (
  email: string,
  password: string,
  iterations = DEFAULT_AUTH_PBKDF2_ROUNDS,
): DerivedAuthKeys => {
  const normalizedEmail = email.trim().toLowerCase();
  const salt = new TextEncoder().encode(`tessera_auth_salt_v1:${normalizedEmail}`);
  const passwordBytes = new TextEncoder().encode(password);

  // 1. Master PRF via PBKDF2
  const masterPrf = pbkdf2(sha256, passwordBytes, salt, {
    c: iterations,
    dkLen: 32,
  });

  // 2. Separate authKey and encKey using domain-separated HKDF
  const authInfo = new TextEncoder().encode('tessera-v1-auth-key');
  const encInfo = new TextEncoder().encode('tessera-v1-encryption-key');

  const authKey = hkdf(sha256, masterPrf, salt, authInfo, 32);
  const encKey = hkdf(sha256, masterPrf, salt, encInfo, 32);

  // 3. Client auth key hash (SHA-256)
  const authKeyHash = uint8ArrayToHex(sha256(authKey));

  return {
    authKey,
    encKey,
    authKeyHash,
  };
};

/**
 * Wraps (encrypts) the local 32-byte Master Key using the password-derived Encryption Key (encKey).
 */
export const wrapMasterKey = (
  masterKey: Uint8Array,
  encKey: Uint8Array,
): WrappedMasterKeyEnvelope => {
  if (masterKey.byteLength !== MASTER_KEY_BYTE_LENGTH) {
    throw new Error(`Master key must be exactly ${MASTER_KEY_BYTE_LENGTH} bytes`);
  }
  if (encKey.byteLength !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes');
  }

  const nonce = new Uint8Array(NONCE_BYTE_LENGTH);
  crypto.getRandomValues(nonce);

  const cipher = xchacha20poly1305(encKey, nonce);
  const ciphertextBytes = cipher.encrypt(masterKey);

  return {
    wrappedMasterKey: uint8ArrayToBase64(ciphertextBytes),
    wrappedMasterKeyNonce: uint8ArrayToBase64(nonce),
  };
};

/**
 * Unwraps (decrypts) the Master Key using the password-derived Encryption Key (encKey).
 */
export const unwrapMasterKey = (
  wrappedMasterKey: string,
  nonceB64: string,
  encKey: Uint8Array,
): { masterKey: Uint8Array | null; error: string | null } => {
  try {
    const ciphertext = base64ToUint8Array(wrappedMasterKey);
    const nonce = base64ToUint8Array(nonceB64);

    if (nonce.byteLength !== NONCE_BYTE_LENGTH) {
      return { masterKey: null, error: 'Invalid nonce length' };
    }

    const cipher = xchacha20poly1305(encKey, nonce);
    const decryptedBytes = cipher.decrypt(ciphertext);

    if (decryptedBytes.byteLength !== MASTER_KEY_BYTE_LENGTH) {
      return { masterKey: null, error: 'Invalid decrypted master key length' };
    }

    return { masterKey: decryptedBytes, error: null };
  } catch (err) {
    return { masterKey: null, error: (err as Error).message || 'Failed to unwrap master key' };
  }
};
