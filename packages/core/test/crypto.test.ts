import { describe, expect, it } from 'bun:test';
import {
  deriveRecordKey,
  deriveSharedSessionKey,
  generateDeviceKeyPair,
  generateMasterKey,
  sealRecord,
  unsealRecord,
} from '../src/crypto/index.js';

describe('Crypto module', () => {
  it('generates 32-byte master key and derives deterministic record keys', () => {
    const masterKey = generateMasterKey();
    expect(masterKey.byteLength).toBe(32);

    const recordId = 'bookmark-12345';
    const key1 = deriveRecordKey(masterKey, recordId);
    const key2 = deriveRecordKey(masterKey, recordId);
    const keyDiff = deriveRecordKey(masterKey, 'bookmark-99999');

    expect(key1).toEqual(key2);
    expect(key1).not.toEqual(keyDiff);
  });

  it('seals and unseals record payload accurately with XChaCha20Poly1305', () => {
    const masterKey = generateMasterKey();
    const recordKey = deriveRecordKey(masterKey, 'record-abc');

    const originalData = {
      title: 'Secret Bookmark',
      url: 'https://internal.company.dev',
      tags: ['confidential', 'zero-knowledge'],
      notes: 'Super secret notes only readable with master key',
    };

    const sealed = sealRecord(recordKey, originalData);
    expect(sealed.ciphertext).toBeString();
    expect(sealed.nonce).toBeString();
    expect(sealed.ciphertext).not.toContain('Secret Bookmark');

    const unsealed = unsealRecord<typeof originalData>(
      recordKey,
      sealed.ciphertext,
      sealed.nonce,
    );

    expect(unsealed.error).toBeNull();
    expect(unsealed.data).toEqual(originalData);
  });

  it('fails decryption cleanly with wrong record key', () => {
    const masterKey1 = generateMasterKey();
    const masterKey2 = generateMasterKey();
    const recordKey1 = deriveRecordKey(masterKey1, 'item-1');
    const recordKey2 = deriveRecordKey(masterKey2, 'item-1');

    const sealed = sealRecord(recordKey1, { value: 42 });
    const result = unsealRecord(recordKey2, sealed.ciphertext, sealed.nonce);

    expect(result.data).toBeNull();
    expect(result.error).toContain('Unseal failed');
  });

  it('performs Diffie-Hellman X25519 key exchange between two devices', () => {
    const deviceA = generateDeviceKeyPair();
    const deviceB = generateDeviceKeyPair();

    const sharedSecretA = deriveSharedSessionKey(deviceA.privateKeyHex, deviceB.publicKeyHex);
    const sharedSecretB = deriveSharedSessionKey(deviceB.privateKeyHex, deviceA.publicKeyHex);

    expect(sharedSecretA).toEqual(sharedSecretB);
  });
});
