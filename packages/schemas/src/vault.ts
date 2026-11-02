import { z } from 'zod';

export const PIN_REGEX = /^\d{7}$/;

/**
 * Validates a 7-digit numeric PIN.
 */
export const VaultPinSchema = z
  .string()
  .regex(PIN_REGEX, 'Vault PIN must be exactly 7 numeric digits (0-9)');

/**
 * Validates a strong passphrase for Vault Sync.
 * Enforces minimum 12 characters and rejects purely numeric sequences.
 */
export const VaultSyncPassphraseSchema = z
  .string()
  .min(12, 'Sync passphrase must be at least 12 characters long')
  .refine(
    (val) => !/^\d+$/.test(val),
    'Sync passphrase cannot be purely numeric. Use a passphrase with letters, words, or symbols.',
  );

/**
 * Vault configuration state.
 */
export const VaultConfigSchema = z.object({
  isConfigured: z.boolean().default(false),
  pinSalt: z.string().default(''),
  pinHash: z.string().default(''),
  wipeAfterAttempts: z.number().int().min(0).max(10).default(5),
  failedAttempts: z.number().int().nonnegative().default(0),
  isSyncEnabled: z.boolean().default(false),
  syncPassphraseSalt: z.string().optional(),
  syncPassphraseHash: z.string().optional(),
  encryptedVaultKeyWithPin: z.string().default(''),
  encryptedVaultKeyWithPassphrase: z.string().optional(),
  autoLockTimeoutMinutes: z.number().int().min(1).max(60).default(5),
});
export type VaultConfig = z.infer<typeof VaultConfigSchema>;

/**
 * Payload for initial Vault setup or changing PIN.
 */
export const VaultSetupInputSchema = z.object({
  pin: VaultPinSchema,
  wipeAfterAttempts: z.number().int().min(0).max(10).default(5),
  autoLockTimeoutMinutes: z.number().int().min(1).max(60).default(5),
});
export type VaultSetupInput = z.infer<typeof VaultSetupInputSchema>;

/**
 * Payload for unlocking the local Vault.
 */
export const VaultUnlockInputSchema = z.object({
  pin: VaultPinSchema,
});
export type VaultUnlockInput = z.infer<typeof VaultUnlockInputSchema>;

/**
 * Payload for enabling Vault Cloud Sync with a strong passphrase.
 */
export const VaultSyncEnableInputSchema = z.object({
  passphrase: VaultSyncPassphraseSchema,
});
export type VaultSyncEnableInput = z.infer<typeof VaultSyncEnableInputSchema>;
