import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519';

const MASTER_KEY_BYTE_LENGTH = 32;
const HKDF_SALT = new TextEncoder().encode('tessera-v1-record-encryption-salt');

/**
 * Converts a Uint8Array to a hex string.
 */
export const uint8ArrayToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Converts a hex string to a Uint8Array.
 */
export const hexToUint8Array = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return array;
};

/**
 * Converts a Uint8Array to a Base64 string.
 */
export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
};

/**
 * Converts a Base64 string to a Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Generates a cryptographically secure 256-bit (32-byte) master key.
 */
export const generateMasterKey = (): Uint8Array => {
  const key = new Uint8Array(MASTER_KEY_BYTE_LENGTH);
  crypto.getRandomValues(key);
  return key;
};

/**
 * Derives a deterministic per-record 256-bit encryption key using HKDF-SHA256.
 *
 * @param masterKey The root 32-byte master key
 * @param recordId Unique identifier for the entity record
 */
export const deriveRecordKey = (masterKey: Uint8Array, recordId: string): Uint8Array => {
  if (masterKey.byteLength !== MASTER_KEY_BYTE_LENGTH) {
    throw new Error(`Master key must be exactly ${MASTER_KEY_BYTE_LENGTH} bytes`);
  }
  const info = new TextEncoder().encode(`record:${recordId}`);
  return hkdf(sha256, masterKey, HKDF_SALT, info, 32);
};

/**
 * Generates an X25519 keypair for device sync identification & diffie-hellman key exchange.
 */
export const generateDeviceKeyPair = (): {
  publicKeyHex: string;
  privateKeyHex: string;
} => {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    publicKeyHex: uint8ArrayToHex(publicKey),
    privateKeyHex: uint8ArrayToHex(privateKey),
  };
};

/**
 * Derives a shared session encryption key between two X25519 devices.
 */
export const deriveSharedSessionKey = (
  privateKeyHex: string,
  peerPublicKeyHex: string,
): Uint8Array => {
  const priv = hexToUint8Array(privateKeyHex);
  const pub = hexToUint8Array(peerPublicKeyHex);
  return x25519.getSharedSecret(priv, pub);
};
