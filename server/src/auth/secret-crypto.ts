import crypto from 'node:crypto';

/**
 * Returns a 256-bit encryption key derived from environment secrets.
 */
const getEncryptionKey = (): Buffer => {
  const secret =
    process.env['TOTP_ENCRYPTION_KEY'] ||
    process.env['AUTH_SECRET'] ||
    process.env['JWT_SECRET'] ||
    'tessera-default-totp-encryption-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a sensitive secret (such as a TOTP key) using AES-256-GCM before database storage.
 */
export const encryptDatabaseSecret = (plaintext: string): string => {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts a database secret stored with AES-256-GCM.
 * Seamlessly falls back to raw plaintext if the string is in legacy unencrypted format.
 */
export const decryptDatabaseSecret = (storedValue: string): string => {
  if (!storedValue) return '';
  const parts = storedValue.split(':');
  if (parts.length !== 3) {
    // Legacy unencrypted secret fallback
    return storedValue;
  }

  try {
    const [ivHex, tagHex, dataHex] = parts;
    if (!ivHex || !tagHex || !dataHex) return storedValue;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');

    if (iv.length !== 12 || tag.length !== 16) {
      return storedValue;
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  } catch {
    // If decryption fails, return as-is for backward compatibility
    return storedValue;
  }
};
