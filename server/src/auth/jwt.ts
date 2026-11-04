import crypto from 'node:crypto';

// Multi-tiered Secret Resolution per secure coding guidelines:
// Environment -> Ephemeral cryptographically random secret with warning
let cachedJwtSecret: string | null = null;

export const getJwtSecret = (): string => {
  if (cachedJwtSecret) return cachedJwtSecret;

  if (process.env['JWT_SECRET']) {
    cachedJwtSecret = process.env['JWT_SECRET'];
    return cachedJwtSecret;
  }

  if (process.env['AUTH_SECRET']) {
    cachedJwtSecret = process.env['AUTH_SECRET'];
    return cachedJwtSecret;
  }

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET or AUTH_SECRET environment variable is not defined in production mode. Refusing to generate an insecure ephemeral secret.',
    );
  }

  console.warn(
    '[Tessera Auth] JWT_SECRET environment variable is not set. Generating ephemeral 256-bit secret for local development.',
  );
  cachedJwtSecret = crypto.randomBytes(32).toString('hex');
  return cachedJwtSecret;
};

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  deviceId: string;
  purpose: 'access';
  iat: number;
  exp: number;
}

export interface Challenge2FAPayload {
  sub: string; // userId
  email: string;
  deviceId: string;
  purpose: '2fa_challenge';
  iat: number;
  exp: number;
}

const base64UrlEncode = (str: string): string => {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const base64UrlDecode = (b64url: string): string => {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
};

const signJwt = (payload: Record<string, unknown>, expiresInSeconds: number): string => {
  const secret = getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
};

const verifyJwt = <T extends { exp: number }>(token: string): T | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    // 1. Strict algorithm check: Reject 'none' and require HS256
    const header = JSON.parse(base64UrlDecode(headerB64));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    // 2. Constant-time signature verification
    const secret = getJwtSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(sigB64);

    if (expectedBuf.length !== actualBuf.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return null;
    }

    // 3. Expiration check
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as T;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

/**
 * Signs a 15-minute access token.
 */
export const signAccessToken = (
  userId: string,
  email: string,
  deviceId: string,
): string => {
  return signJwt(
    {
      sub: userId,
      email,
      deviceId,
      purpose: 'access',
    },
    15 * 60, // 15 minutes
  );
};

/**
 * Verifies an access token.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  const payload = verifyJwt<AccessTokenPayload>(token);
  if (!payload || payload.purpose !== 'access') return null;
  return payload;
};

/**
 * Signs a 5-minute 2FA challenge token.
 */
export const sign2FAChallengeToken = (
  userId: string,
  email: string,
  deviceId: string,
): string => {
  return signJwt(
    {
      sub: userId,
      email,
      deviceId,
      purpose: '2fa_challenge',
    },
    5 * 60, // 5 minutes
  );
};

/**
 * Verifies a 2FA challenge token.
 */
export const verify2FAChallengeToken = (token: string): Challenge2FAPayload | null => {
  const payload = verifyJwt<Challenge2FAPayload>(token);
  if (!payload || payload.purpose !== '2fa_challenge') return null;
  return payload;
};

/**
 * Generates an opaque random 32-byte refresh token.
 */
export const generateRefreshToken = (): string => {
  return crypto.randomBytes(32).toString('base64url');
};

/**
 * Computes SHA-256 hash of a refresh token for safe storage in the database.
 */
export const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
