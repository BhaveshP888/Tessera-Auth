import crypto from 'node:crypto';
import { argon2id, uint8ArrayToHex, hexToUint8Array } from '@tessera/core';


export interface Argon2HashResult {
  hashHex: string;
  saltHex: string;
}

/**
 * Computes an Argon2id hash of the client's authKeyHash using a unique 16-byte random salt.
 * Uses RFC 9106 recommended parameters: t=2 iterations, m=19456 KiB memory (~19MB), p=1 lane.
 */
export const hashAuthKey = (authKeyHash: string): Argon2HashResult => {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString('hex');

  const hashedBytes = argon2id(authKeyHash, saltHex, {
    t: 2,
    m: 19456,
    p: 1,
    dkLen: 32,
  });

  return {
    hashHex: uint8ArrayToHex(hashedBytes),
    saltHex,
  };
};

/**
 * Verifies a client's authKeyHash against the stored Argon2id hash and salt in constant time.
 */
export const verifyAuthKey = (
  authKeyHash: string,
  storedHashHex: string,
  saltHex: string,
): boolean => {
  try {
    const computedBytes = argon2id(authKeyHash, saltHex, {
      t: 2,
      m: 19456,
      p: 1,
      dkLen: 32,
    });

    const expectedBuf = Buffer.from(storedHashHex, 'hex');
    const actualBuf = Buffer.from(computedBytes);

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
};
