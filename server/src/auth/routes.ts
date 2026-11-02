import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  Verify2FARequestSchema,
  Enable2FARequestSchema,
  Disable2FARequestSchema,
  RefreshTokenRequestSchema,
  ChangePasswordRequestSchema,
} from '@tessera/schemas';
import {
  generateTotpSecret,
  generateTotpUri,
  verifyTotpCode,
  generateBackupCodes,
} from '@tessera/core';
import type { TesseraDatabase } from '../db/sqlite.js';
import {
  signAccessToken,
  verifyAccessToken,
  sign2FAChallengeToken,
  verify2FAChallengeToken,
  generateRefreshToken,
  hashRefreshToken,
} from './jwt.js';
import { hashAuthKey, verifyAuthKey } from './hash.js';

export interface AuthContext {
  userId: string;
  email: string;
  deviceId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export const registerAuthRoutes = (app: FastifyInstance, db: TesseraDatabase): void => {
  // Authentication middleware helper
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);
    if (!payload) {
      return reply.status(401).send({ error: 'Access token is invalid or expired' });
    }

    request.authContext = {
      userId: payload.sub,
      email: payload.email,
      deviceId: payload.deviceId,
    };
  };

  // 1. Register
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = RegisterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }

    const { email, authKeyHash, wrappedMasterKey, wrappedMasterKeyNonce, deviceId, deviceName } =
      parsed.data;

    // Check existing email
    const existing = db.getUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'An account with this email already exists.' });
    }

    // Hash authKeyHash using Argon2id
    const { hashHex, saltHex } = hashAuthKey(authKeyHash);
    const userId = crypto.randomUUID();

    const user = db.createUser({
      id: userId,
      email,
      authKeyHash: hashHex,
      authKeySalt: saltHex,
      wrappedMasterKey,
      wrappedMasterKeyNonce,
    });

    // Register initial device
    db.upsertDevice({
      id: deviceId,
      userId: user.id,
      name: deviceName || 'Primary Device',
    });

    // Issue tokens
    const accessToken = signAccessToken(user.id, user.email, deviceId);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId,
      refreshTokenHash,
      expiresAt,
    });

    return reply.status(201).send({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        totpEnabled: Boolean(user.totp_enabled),
        createdAt: user.created_at,
      },
      wrappedMasterKey: user.wrapped_master_key,
      wrappedMasterKeyNonce: user.wrapped_master_key_nonce,
    });
  });

  // 2. Login
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }

    const { email, authKeyHash, deviceId, deviceName } = parsed.data;

    const user = db.getUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    const isValid = verifyAuthKey(authKeyHash, user.auth_key_hash, user.auth_key_salt);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid email or password.' });
    }

    // Check if 2FA is required
    if (user.totp_enabled === 1 && user.totp_secret) {
      const challengeToken = sign2FAChallengeToken(user.id, user.email, deviceId);
      return reply.send({
        requires2FA: true,
        challengeToken,
      });
    }

    // Register/update device
    db.upsertDevice({
      id: deviceId,
      userId: user.id,
      name: deviceName || 'Device',
    });

    // Issue tokens
    const accessToken = signAccessToken(user.id, user.email, deviceId);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId,
      refreshTokenHash,
      expiresAt,
    });

    return reply.send({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        totpEnabled: false,
        createdAt: user.created_at,
      },
      wrappedMasterKey: user.wrapped_master_key,
      wrappedMasterKeyNonce: user.wrapped_master_key_nonce,
    });
  });

  // 3. Verify 2FA
  app.post('/api/auth/2fa/verify', async (request, reply) => {
    const parsed = Verify2FARequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }

    const { challengeToken, code, deviceId } = parsed.data;

    const challenge = verify2FAChallengeToken(challengeToken);
    if (!challenge) {
      return reply.status(401).send({ error: '2FA session has expired. Please log in again.' });
    }

    const user = db.getUserById(challenge.sub);
    if (!user || !user.totp_secret) {
      return reply.status(401).send({ error: 'User account not found.' });
    }

    let isCodeValid = verifyTotpCode(user.totp_secret, code);

    // If TOTP failed, check backup codes
    if (!isCodeValid && user.backup_codes) {
      try {
        const storedHashedCodes = JSON.parse(user.backup_codes) as string[];
        const inputHashed = crypto.createHash('sha256').update(code.toLowerCase()).digest('hex');
        const codeIndex = storedHashedCodes.indexOf(inputHashed);

        if (codeIndex !== -1) {
          isCodeValid = true;
          // Burn the used backup code
          storedHashedCodes.splice(codeIndex, 1);
          db.updateUser(user.id, { backup_codes: JSON.stringify(storedHashedCodes) });
        }
      } catch {}
    }

    if (!isCodeValid) {
      return reply.status(401).send({ error: 'Invalid two-factor authentication code.' });
    }

    // Register device
    db.upsertDevice({
      id: deviceId,
      userId: user.id,
      name: 'Authenticated Device',
    });

    // Issue tokens
    const accessToken = signAccessToken(user.id, user.email, deviceId);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId,
      refreshTokenHash,
      expiresAt,
    });

    return reply.send({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        totpEnabled: true,
        createdAt: user.created_at,
      },
      wrappedMasterKey: user.wrapped_master_key,
      wrappedMasterKeyNonce: user.wrapped_master_key_nonce,
    });
  });

  // 4. Setup 2FA (Get Secret & QR URI)
  app.post(
    '/api/auth/2fa/setup',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { email } = request.authContext!;
      const secret = generateTotpSecret();
      const otpauthUri = generateTotpUri(secret, email);
      const backupCodes = generateBackupCodes(10);

      return reply.send({
        secret,
        otpauthUri,
        backupCodes,
      });
    },
  );

  // 5. Enable 2FA
  app.post(
    '/api/auth/2fa/enable',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = Enable2FARequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.message });
      }

      const { secret, code, backupCodes } = parsed.data;
      const { userId } = request.authContext!;

      // Verify the provided code against the provided secret before enabling
      const isVerified = verifyTotpCode(secret, code);
      if (!isVerified) {
        return reply.status(400).send({ error: 'Invalid verification code. Check your authenticator app.' });
      }

      // Hash backup codes before storing
      const hashedBackupCodes = backupCodes.map((c) =>
        crypto.createHash('sha256').update(c.toLowerCase().trim()).digest('hex'),
      );

      db.updateUser(userId, {
        totp_secret: secret,
        totp_enabled: 1,
        backup_codes: JSON.stringify(hashedBackupCodes),
      });

      return reply.send({ success: true });
    },
  );

  // 6. Disable 2FA
  app.post(
    '/api/auth/2fa/disable',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = Disable2FARequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.message });
      }

      const { code } = parsed.data;
      const { userId } = request.authContext!;
      const user = db.getUserById(userId);

      if (!user || !user.totp_secret) {
        return reply.status(400).send({ error: '2FA is not enabled on this account.' });
      }

      let isCodeValid = verifyTotpCode(user.totp_secret, code);
      if (!isCodeValid && user.backup_codes) {
        try {
          const storedHashedCodes = JSON.parse(user.backup_codes) as string[];
          const inputHashed = crypto.createHash('sha256').update(code.toLowerCase()).digest('hex');
          if (storedHashedCodes.includes(inputHashed)) {
            isCodeValid = true;
          }
        } catch {}
      }

      if (!isCodeValid) {
        return reply.status(400).send({ error: 'Invalid 2FA confirmation code.' });
      }

      db.updateUser(userId, {
        totp_secret: null,
        totp_enabled: 0,
        backup_codes: null,
      });

      return reply.send({ success: true });
    },
  );

  // 7. Refresh Token
  app.post('/api/auth/refresh', async (request, reply) => {
    const parsed = RefreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }

    const { refreshToken } = parsed.data;
    const tokenHash = hashRefreshToken(refreshToken);
    const session = db.getSessionByTokenHash(tokenHash);

    if (!session) {
      return reply.status(401).send({ error: 'Invalid or revoked refresh token.' });
    }

    if (new Date(session.expires_at) < new Date()) {
      db.deleteSessionByTokenHash(tokenHash);
      return reply.status(401).send({ error: 'Refresh token has expired. Please log in again.' });
    }

    const user = db.getUserById(session.user_id);
    if (!user) {
      db.deleteSessionByTokenHash(tokenHash);
      return reply.status(401).send({ error: 'User not found.' });
    }

    // Rotate refresh token
    db.deleteSessionByTokenHash(tokenHash);
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId: session.device_id,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
    });

    const accessToken = signAccessToken(user.id, user.email, session.device_id);

    return reply.send({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    });
  });

  // 8. Logout
  app.post(
    '/api/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body || {}) as { refreshToken?: string };
      if (body.refreshToken) {
        db.deleteSessionByTokenHash(hashRefreshToken(body.refreshToken));
      }

      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const payload = verifyAccessToken(authHeader.slice(7).trim());
        if (payload) {
          db.deleteSessionsForUser(payload.sub);
        }
      }

      return reply.send({ success: true });
    },
  );

  // 9. Current User Profile
  app.get(
    '/api/auth/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.authContext!;
      const user = db.getUserById(userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          totpEnabled: Boolean(user.totp_enabled),
          createdAt: user.created_at,
        },
      });
    },
  );

  // 10. Change Password / Re-wrap Master Key
  app.post(
    '/api/auth/password/change',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ChangePasswordRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.message });
      }

      const { oldAuthKeyHash, newAuthKeyHash, newWrappedMasterKey, newWrappedMasterKeyNonce } =
        parsed.data;
      const { userId } = request.authContext!;
      const user = db.getUserById(userId);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const isOldValid = verifyAuthKey(oldAuthKeyHash, user.auth_key_hash, user.auth_key_salt);
      if (!isOldValid) {
        return reply.status(401).send({ error: 'Current password is incorrect.' });
      }

      const { hashHex, saltHex } = hashAuthKey(newAuthKeyHash);

      db.updateUser(user.id, {
        auth_key_hash: hashHex,
        auth_key_salt: saltHex,
        wrapped_master_key: newWrappedMasterKey,
        wrapped_master_key_nonce: newWrappedMasterKeyNonce,
      });

      // Revoke all sessions to enforce re-login with new password
      db.deleteSessionsForUser(user.id);

      return reply.send({ success: true });
    },
  );
};
