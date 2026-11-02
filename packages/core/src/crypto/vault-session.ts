import type { Bookmark, VaultConfig } from '@tessera/schemas';
import {
  generateVaultSalt,
  generateVaultMasterKey,
  derivePinKey,
  deriveVaultMasterKeyFromPassphrase,
  computeSecretHash,
  wrapVaultKey,
  unwrapVaultKey,
} from './vault.js';
import { deriveRecordKey, uint8ArrayToHex, hexToUint8Array } from './keys.js';
import { sealRecord, unsealRecord } from './cipher.js';

export interface IVaultSessionManager {
  isUnlocked(): boolean;
  setup(pin: string, passphrase?: string, masterKey?: Uint8Array): VaultConfig;
  unlock(pin: string, config: VaultConfig): boolean;
  lock(): void;
  seal(bookmark: Bookmark): { ciphertext: string; nonce: string };
  unseal(ciphertext: string, nonce: string, entityId: string): Bookmark | null;
  enableSync(passphrase: string, masterKey: Uint8Array, config: VaultConfig): VaultConfig;
  restoreFromSync(passphrase: string, masterKey: Uint8Array, localPin: string): VaultConfig;
  wipe(): void;
}

/**
 * VaultSessionManager encapsulates the cryptographic lifecycle, memory safety,
 * and key unsealing of the Private Vault behind a deep, cohesive module interface.
 */
export class VaultSessionManager implements IVaultSessionManager {
  private activeVaultMasterKey: Uint8Array | null = null;

  public isUnlocked(): boolean {
    return this.activeVaultMasterKey !== null;
  }

  public getVaultMasterKey(): Uint8Array | null {
    return this.activeVaultMasterKey;
  }

  /**
   * Initializes a brand-new Private Vault with a 7-digit numeric PIN
   * and optional multi-device sync passphrase.
   */
  public setup(pin: string, passphrase?: string, masterKey?: Uint8Array): VaultConfig {
    const pinSalt = generateVaultSalt();
    const pinKek = derivePinKey(pin, pinSalt);

    let vaultMasterKey: Uint8Array;
    let isSyncEnabled = false;
    let syncPassphraseSalt: string | undefined = undefined;

    if (passphrase && masterKey) {
      vaultMasterKey = deriveVaultMasterKeyFromPassphrase(passphrase, masterKey);
      isSyncEnabled = true;
      syncPassphraseSalt = uint8ArrayToHex(pinSalt);
    } else {
      vaultMasterKey = generateVaultMasterKey();
    }

    const wrappedKeyPin = wrapVaultKey(vaultMasterKey, pinKek);
    const pinVerificationHash = computeSecretHash(pin, pinSalt);

    // Retain key in active memory
    this.activeVaultMasterKey = new Uint8Array(vaultMasterKey);

    return {
      isConfigured: true,
      pinSalt: uint8ArrayToHex(pinSalt),
      pinHash: pinVerificationHash,
      wipeAfterAttempts: 5,
      failedAttempts: 0,
      isSyncEnabled,
      syncPassphraseSalt,
      encryptedVaultKeyWithPin: `${wrappedKeyPin.ciphertext}:${wrappedKeyPin.nonce}`,
      autoLockTimeoutMinutes: 5,
    };
  }

  /**
   * Unlocks the vault using the user's 7-digit numeric PIN.
   */
  public unlock(pin: string, config: VaultConfig): boolean {
    if (!config.isConfigured || !config.pinSalt || !config.pinHash) {
      return false;
    }

    const salt = hexToUint8Array(config.pinSalt);
    const expectedHash = computeSecretHash(pin, salt);
    if (expectedHash !== config.pinHash) {
      return false;
    }

    const pinKek = derivePinKey(pin, salt);
    const parts = (config.encryptedVaultKeyWithPin || '').split(':');
    if (parts.length !== 2) return false;

    const [ciphertextB64, nonceB64] = parts;
    const unwrapResult = unwrapVaultKey(
      ciphertextB64!,
      nonceB64!,
      pinKek,
    );

    if (!unwrapResult.data) {
      return false;
    }

    this.activeVaultMasterKey = unwrapResult.data;
    return true;
  }

  /**
   * Immediately zeroes out the vault master key from memory and locks the vault.
   */
  public lock(): void {
    if (this.activeVaultMasterKey) {
      this.activeVaultMasterKey.fill(0);
      this.activeVaultMasterKey = null;
    }
  }

  /**
   * Seals a vault bookmark record with XChaCha20-Poly1305 using the active Vault Master Key.
   */
  public seal(bookmark: Bookmark): { ciphertext: string; nonce: string } {
    if (!this.activeVaultMasterKey) {
      throw new Error('Cannot seal bookmark: Vault is locked.');
    }
    const recordKey = deriveRecordKey(this.activeVaultMasterKey, bookmark.id);
    return sealRecord(recordKey, bookmark);
  }

  /**
   * Unseals a vault bookmark ciphertext with the active Vault Master Key.
   */
  public unseal(ciphertext: string, nonce: string, entityId: string): Bookmark | null {
    if (!this.activeVaultMasterKey) {
      return null;
    }
    const recordKey = deriveRecordKey(this.activeVaultMasterKey, entityId);
    const unsealed = unsealRecord<Bookmark>(recordKey, ciphertext, nonce);
    return unsealed.data;
  }

  /**
   * Enables cross-device sync on an existing vault using a sync passphrase.
   */
  public enableSync(passphrase: string, masterKey: Uint8Array, config: VaultConfig): VaultConfig {
    if (!this.activeVaultMasterKey) {
      throw new Error('Cannot enable sync: Vault is locked.');
    }

    // Deterministically derive synced vault master key
    const syncedVaultMasterKey = deriveVaultMasterKeyFromPassphrase(passphrase, masterKey);
    this.activeVaultMasterKey = new Uint8Array(syncedVaultMasterKey);

    const pinSalt = hexToUint8Array(config.pinSalt);
    const dummyPinKek = derivePinKey('0000000', pinSalt);
    const wrappedKeyPin = wrapVaultKey(syncedVaultMasterKey, dummyPinKek);

    return {
      ...config,
      isSyncEnabled: true,
      syncPassphraseSalt: config.pinSalt,
      encryptedVaultKeyWithPin: `${wrappedKeyPin.ciphertext}:${wrappedKeyPin.nonce}`,
    };
  }

  /**
   * Restores a paired cloud vault on another device using the sync passphrase and sets a local PIN.
   */
  public restoreFromSync(passphrase: string, masterKey: Uint8Array, localPin: string): VaultConfig {
    const vaultMasterKey = deriveVaultMasterKeyFromPassphrase(passphrase, masterKey);
    const pinSalt = generateVaultSalt();
    const pinKek = derivePinKey(localPin, pinSalt);
    const wrappedKeyPin = wrapVaultKey(vaultMasterKey, pinKek);
    const pinVerificationHash = computeSecretHash(localPin, pinSalt);

    this.activeVaultMasterKey = new Uint8Array(vaultMasterKey);

    return {
      isConfigured: true,
      pinSalt: uint8ArrayToHex(pinSalt),
      pinHash: pinVerificationHash,
      wipeAfterAttempts: 5,
      failedAttempts: 0,
      isSyncEnabled: true,
      syncPassphraseSalt: uint8ArrayToHex(pinSalt),
      encryptedVaultKeyWithPin: `${wrappedKeyPin.ciphertext}:${wrappedKeyPin.nonce}`,
      autoLockTimeoutMinutes: 5,
    };
  }

  /**
   * Destroys all vault session data and wipes active memory.
   */
  public wipe(): void {
    this.lock();
  }
}
