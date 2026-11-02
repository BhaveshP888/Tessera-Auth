import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/sha1';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes bytes to RFC 4648 Base32 (no padding).
 */
export const uint8ArrayToBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

/**
 * Decodes an RFC 4648 Base32 string to bytes.
 */
export const base32ToUint8Array = (base32: string): Uint8Array => {
  const clean = base32.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
};

/**
 * Generates a fresh cryptographically random 20-byte Base32 secret for TOTP.
 */
export const generateTotpSecret = (): string => {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return uint8ArrayToBase32(bytes);
};

/**
 * Computes an RFC 6238 TOTP 6-digit code for a given timestamp.
 */
export const generateTotpCode = (
  secretBase32: string,
  timestampMs = Date.now(),
  stepSeconds = 30,
): string => {
  const key = base32ToUint8Array(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);

  // 8-byte big-endian counter buffer
  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  // HMAC-SHA1
  const hmacResult = hmac(sha1, key, counterBytes);

  // Dynamic truncation
  const offset = hmacResult[hmacResult.length - 1]! & 0x0f;
  const binary =
    ((hmacResult[offset]! & 0x7f) << 24) |
    ((hmacResult[offset + 1]! & 0xff) << 16) |
    ((hmacResult[offset + 2]! & 0xff) << 8) |
    (hmacResult[offset + 3]! & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
};

/**
 * Verifies a 6-digit TOTP code against a secret within a ±window (default: 1 step = ±30s).
 */
export const verifyTotpCode = (
  secretBase32: string,
  code: string,
  timestampMs = Date.now(),
  window = 1,
  stepSeconds = 30,
): boolean => {
  const cleanCode = code.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  try {
    for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
      const checkTime = timestampMs + errorWindow * stepSeconds * 1000;
      const expected = generateTotpCode(secretBase32, checkTime, stepSeconds);
      if (expected === cleanCode) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
};

/**
 * Generates the standard otpauth:// URI for QR code scanning in authenticator apps.
 */
export const generateTotpUri = (
  secretBase32: string,
  email: string,
  issuer = 'Tessera',
): string => {
  const cleanEmail = email.trim();
  const label = encodeURIComponent(`${issuer}:${cleanEmail}`);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
};

/**
 * Generates an array of secure 8-character alphanumeric backup recovery codes.
 */
export const generateBackupCodes = (count = 10): string[] => {
  const codes: string[] = [];
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += chars[bytes[j]! % chars.length];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
};
