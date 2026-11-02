import { describe, expect, it } from 'bun:test';
import { VaultSessionManager } from '../src/crypto/vault-session.js';
import { generateMasterKey } from '../src/crypto/keys.js';
import type { Bookmark } from '@tessera/schemas';

describe('VaultSessionManager Deep Module', () => {
  const session = new VaultSessionManager();

  const sampleBookmark: Bookmark = {
    id: 'b-vault-test-1',
    url: 'https://secret.local/infra',
    title: 'Secret Infrastructure Config',
    description: 'Internal nodes and encryption keys',
    notes: 'Restricted access only',
    faviconUrl: '',
    previewImageUrl: '',
    tags: ['vault', 'infra'],
    collectionId: null,
    isVault: true,
    isArchived: false,
    isFavorite: true,
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  it('manages setup, unlock, sealing, and auto-lock memory safety', () => {
    expect(session.isUnlocked()).toBe(false);

    // Setup vault with 7-digit PIN
    const config = session.setup('1234567');
    expect(config.isConfigured).toBe(true);
    expect(session.isUnlocked()).toBe(true);

    // Seal bookmark with active session
    const sealed = session.seal(sampleBookmark);
    expect(sealed.ciphertext).toBeDefined();
    expect(sealed.nonce).toBeDefined();

    // Unseal record
    const unsealed = session.unseal(sealed.ciphertext, sealed.nonce, sampleBookmark.id);
    expect(unsealed).toBeDefined();
    expect(unsealed?.title).toBe('Secret Infrastructure Config');

    // Lock session
    session.lock();
    expect(session.isUnlocked()).toBe(false);

    // Sealed operations fail while locked
    expect(() => session.seal(sampleBookmark)).toThrow('Vault is locked');
    expect(session.unseal(sealed.ciphertext, sealed.nonce, sampleBookmark.id)).toBeNull();

    // Unlock with invalid PIN fails
    const badUnlock = session.unlock('9999999', config);
    expect(badUnlock).toBe(false);
    expect(session.isUnlocked()).toBe(false);

    // Unlock with correct PIN succeeds
    const goodUnlock = session.unlock('1234567', config);
    expect(goodUnlock).toBe(true);
    expect(session.isUnlocked()).toBe(true);

    // Unseal works again
    const reUnsealed = session.unseal(sealed.ciphertext, sealed.nonce, sampleBookmark.id);
    expect(reUnsealed?.url).toBe('https://secret.local/infra');
  });

  it('handles cross-device sync restoration deterministically', () => {
    const device1MasterKey = generateMasterKey();
    const syncPassphrase = 'my-ultra-strong-vault-passphrase-2026';

    const device1Session = new VaultSessionManager();
    const config1 = device1Session.setup('1111111', syncPassphrase, device1MasterKey);
    expect(config1.isSyncEnabled).toBe(true);

    // Device 1 seals a vault bookmark
    const sealed = device1Session.seal(sampleBookmark);

    // Device 2 restores from the same Master Key and Passphrase with its own local PIN
    const device2Session = new VaultSessionManager();
    const config2 = device2Session.restoreFromSync(syncPassphrase, device1MasterKey, '7777777');
    expect(config2.isSyncEnabled).toBe(true);
    expect(device2Session.isUnlocked()).toBe(true);

    // Device 2 unseals Device 1's record perfectly!
    const unsealedOnDevice2 = device2Session.unseal(sealed.ciphertext, sealed.nonce, sampleBookmark.id);
    expect(unsealedOnDevice2?.title).toBe('Secret Infrastructure Config');
  });
});
