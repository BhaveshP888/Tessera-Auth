import { z } from 'zod';

/**
 * User representation returned to the client.
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  totpEnabled: z.boolean(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * Request to send an Email OTP for registration or verification.
 */
export const SendOtpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  purpose: z.enum(['registration', 'password_reset']).default('registration'),
});
export type SendOtpRequest = z.infer<typeof SendOtpRequestSchema>;

/**
 * Account registration request.
 * Contains client-derived authKeyHash, the wrapped Master Key, and the verified email OTP.
 */
export const RegisterRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  authKeyHash: z.string().min(32), // SHA-256 of client authKey in hex/base64
  wrappedMasterKey: z.string().min(1), // XChaCha20-Poly1305 encrypted masterKey
  wrappedMasterKeyNonce: z.string().min(1), // 24-byte nonce
  deviceId: z.string().min(1),
  deviceName: z.string().min(1).max(100).optional(),
  otpCode: z.string().length(6), // 6-digit numeric email verification code
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Account login request.
 */
export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  authKeyHash: z.string().min(32),
  deviceId: z.string().min(1),
  deviceName: z.string().min(1).max(100).optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Auth token payload returned on successful authentication.
 */
export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: UserSchema,
  wrappedMasterKey: z.string().min(1),
  wrappedMasterKeyNonce: z.string().min(1),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * 2FA Challenge response returned when login requires a second factor.
 */
export const Challenge2FAResponseSchema = z.object({
  requires2FA: z.literal(true),
  challengeToken: z.string().min(1),
});
export type Challenge2FAResponse = z.infer<typeof Challenge2FAResponseSchema>;

/**
 * Verify 2FA code during login.
 */
export const Verify2FARequestSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(6).max(16).transform((v) => v.trim().replace(/\s+/g, '')),
  deviceId: z.string().min(1),
});
export type Verify2FARequest = z.infer<typeof Verify2FARequestSchema>;

/**
 * Setup 2FA request (start).
 */
export const Setup2FAResponseSchema = z.object({
  secret: z.string().min(16),
  otpauthUri: z.string().url(),
  backupCodes: z.array(z.string()),
});
export type Setup2FAResponse = z.infer<typeof Setup2FAResponseSchema>;

/**
 * Enable 2FA request with verification of the first code.
 */
export const Enable2FARequestSchema = z.object({
  secret: z.string().min(16),
  code: z.string().length(6),
  backupCodes: z.array(z.string().min(6)),
});
export type Enable2FARequest = z.infer<typeof Enable2FARequestSchema>;

/**
 * Disable 2FA request (requires valid TOTP or backup code).
 */
export const Disable2FARequestSchema = z.object({
  code: z.string().min(6).max(16).transform((v) => v.trim().replace(/\s+/g, '')),
});
export type Disable2FARequest = z.infer<typeof Disable2FARequestSchema>;

/**
 * Token refresh request.
 */
export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

/**
 * Change password / re-wrap master key request.
 */
export const ChangePasswordRequestSchema = z.object({
  oldAuthKeyHash: z.string().min(32),
  newAuthKeyHash: z.string().min(32),
  newWrappedMasterKey: z.string().min(1),
  newWrappedMasterKeyNonce: z.string().min(1),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
