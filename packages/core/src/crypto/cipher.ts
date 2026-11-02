import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
} from './keys.js';

const NONCE_BYTE_LENGTH = 24;

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

/**
 * Seals an arbitrary serializable payload using XChaCha20-Poly1305 AEAD.
 *
 * @param recordKey 32-byte derived record key
 * @param plaintext Arbitrary JS object, string, or number
 * @returns Base64 encoded ciphertext and 24-byte random nonce
 */
export const sealRecord = (
  recordKey: Uint8Array,
  plaintext: unknown,
): EncryptedPayload => {
  const nonce = new Uint8Array(NONCE_BYTE_LENGTH);
  crypto.getRandomValues(nonce);

  const jsonString = JSON.stringify(plaintext);
  const encodedPlaintext = new TextEncoder().encode(jsonString);

  const cipher = xchacha20poly1305(recordKey, nonce);
  const ciphertextBytes = cipher.encrypt(encodedPlaintext);

  return {
    ciphertext: uint8ArrayToBase64(ciphertextBytes),
    nonce: uint8ArrayToBase64(nonce),
  };
};

/**
 * Unseals an encrypted payload using XChaCha20-Poly1305 AEAD.
 *
 * @param recordKey 32-byte derived record key
 * @param ciphertext Base64 encoded ciphertext
 * @param nonce Base64 encoded 24-byte nonce
 * @returns Decrypted object parsed from JSON
 */
export const unsealRecord = <T>(
  recordKey: Uint8Array,
  ciphertext: string,
  nonce: string,
): { data: T | null; error: string | null } => {
  try {
    const ciphertextBytes = base64ToUint8Array(ciphertext);
    const nonceBytes = base64ToUint8Array(nonce);

    if (nonceBytes.byteLength !== NONCE_BYTE_LENGTH) {
      return { data: null, error: 'Invalid nonce length. Expected 24 bytes.' };
    }

    const cipher = xchacha20poly1305(recordKey, nonceBytes);
    const decryptedBytes = cipher.decrypt(ciphertextBytes);
    const jsonString = new TextDecoder().decode(decryptedBytes);
    const data = JSON.parse(jsonString) as T;

    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Decryption failed';
    return { data: null, error: `Unseal failed: ${message}` };
  }
};
