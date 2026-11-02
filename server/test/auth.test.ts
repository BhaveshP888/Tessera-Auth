import { describe, expect, it } from 'bun:test';
import { buildServer } from '../src/app.js';
import { TesseraDatabase } from '../src/db/sqlite.js';
import {
  deriveAuthAndEncryptionKeys,
  wrapMasterKey,
  generateMasterKey,
  generateTotpCode,
} from '@tessera/core';

describe('Server Authentication & User-Scoped Sync', () => {
  it('registers, logs in, manages 2FA, and isolates user sync deltas', async () => {
    // In-memory test database
    const db = new TesseraDatabase(':memory:');
    const app = await buildServer({ db });

    // 1. Client-side key derivation for User A
    const userAEmail = 'userA@example.com';
    const userAPassword = 'MasterPasswordForUserA123!';
    const userAKeys = deriveAuthAndEncryptionKeys(userAEmail, userAPassword, 5_000);
    const userAMasterKey = generateMasterKey();
    const userAEnvelope = wrapMasterKey(userAMasterKey, userAKeys.encKey);

    // 0. Send Email OTP
    const sendOtpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register/send-otp',
      payload: { email: userAEmail },
    });
    expect(sendOtpRes.statusCode).toBe(200);
    const otpData = JSON.parse(sendOtpRes.body);
    expect(otpData.devOtp).toBeDefined();
    const validOtp = otpData.devOtp;

    // Reject registration with wrong OTP code
    const badOtpRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: userAEmail,
        authKeyHash: userAKeys.authKeyHash,
        wrappedMasterKey: userAEnvelope.wrappedMasterKey,
        wrappedMasterKeyNonce: userAEnvelope.wrappedMasterKeyNonce,
        deviceId: 'device-a-1',
        deviceName: 'MacBook Pro',
        otpCode: '000000',
      },
    });
    expect(badOtpRes.statusCode).toBe(400);

    // Register User A with correct OTP
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: userAEmail,
        authKeyHash: userAKeys.authKeyHash,
        wrappedMasterKey: userAEnvelope.wrappedMasterKey,
        wrappedMasterKeyNonce: userAEnvelope.wrappedMasterKeyNonce,
        deviceId: 'device-a-1',
        deviceName: 'MacBook Pro',
        otpCode: validOtp,
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regData = JSON.parse(regRes.body);
    expect(regData.accessToken).toBeDefined();
    expect(regData.refreshToken).toBeDefined();
    expect(regData.user.email).toBe(userAEmail.toLowerCase());
    expect(regData.wrappedMasterKey).toBe(userAEnvelope.wrappedMasterKey);

    const userAAccessToken = regData.accessToken;

    // 2. Reject duplicate email
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: userAEmail,
        authKeyHash: userAKeys.authKeyHash,
        wrappedMasterKey: userAEnvelope.wrappedMasterKey,
        wrappedMasterKeyNonce: userAEnvelope.wrappedMasterKeyNonce,
        deviceId: 'device-a-2',
        otpCode: '123456',
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // 3. Login User A on another device
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: userAEmail,
        authKeyHash: userAKeys.authKeyHash,
        deviceId: 'device-a-2',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = JSON.parse(loginRes.body);
    expect(loginData.requires2FA).toBeUndefined();
    expect(loginData.wrappedMasterKey).toBe(userAEnvelope.wrappedMasterKey);

    // 4. Reject wrong password
    const wrongKeys = deriveAuthAndEncryptionKeys(userAEmail, 'WrongPassword123!', 5_000);
    const failLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: userAEmail,
        authKeyHash: wrongKeys.authKeyHash,
        deviceId: 'device-a-3',
      },
    });
    expect(failLoginRes.statusCode).toBe(401);

    // 5. Setup and Enable 2FA for User A
    const setup2FARes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/setup',
      headers: { authorization: `Bearer ${userAAccessToken}` },
    });
    expect(setup2FARes.statusCode).toBe(200);
    const setup2FAData = JSON.parse(setup2FARes.body);
    expect(setup2FAData.secret).toBeDefined();
    expect(setup2FAData.otpauthUri).toContain('otpauth://totp/');
    expect(setup2FAData.backupCodes).toHaveLength(10);

    const totpSecret = setup2FAData.secret;
    const currentTotp = generateTotpCode(totpSecret);

    const enable2FARes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/enable',
      headers: { authorization: `Bearer ${userAAccessToken}` },
      payload: {
        secret: totpSecret,
        code: currentTotp,
        backupCodes: setup2FAData.backupCodes,
      },
    });
    expect(enable2FARes.statusCode).toBe(200);

    // 6. Login now requires 2FA challenge
    const loginWith2FARes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: userAEmail,
        authKeyHash: userAKeys.authKeyHash,
        deviceId: 'device-a-4',
      },
    });
    expect(loginWith2FARes.statusCode).toBe(200);
    const challengeData = JSON.parse(loginWith2FARes.body);
    expect(challengeData.requires2FA).toBe(true);
    expect(challengeData.challengeToken).toBeDefined();

    // Verify 2FA challenge with valid code
    const validCode = generateTotpCode(totpSecret);
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/verify',
      payload: {
        challengeToken: challengeData.challengeToken,
        code: validCode,
        deviceId: 'device-a-4',
      },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifiedData = JSON.parse(verifyRes.body);
    expect(verifiedData.accessToken).toBeDefined();
    expect(verifiedData.wrappedMasterKey).toBe(userAEnvelope.wrappedMasterKey);

    // 7. Token Refresh
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: {
        refreshToken: verifiedData.refreshToken,
      },
    });
    expect(refreshRes.statusCode).toBe(200);
    const refreshData = JSON.parse(refreshRes.body);
    expect(refreshData.accessToken).toBeDefined();
    expect(refreshData.refreshToken).toBeDefined();

    // 8. User-Scoped Sync Isolation Test
    // Register User B
    const userBEmail = 'userB@example.com';
    const userBKeys = deriveAuthAndEncryptionKeys(userBEmail, 'UserBPassword123!', 5_000);
    const userBMasterKey = generateMasterKey();
    const userBEnvelope = wrapMasterKey(userBMasterKey, userBKeys.encKey);

    const sendOtpBRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register/send-otp',
      payload: { email: userBEmail },
    });
    expect(sendOtpBRes.statusCode).toBe(200);
    const otpBData = JSON.parse(sendOtpBRes.body);

    const regBRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: userBEmail,
        authKeyHash: userBKeys.authKeyHash,
        wrappedMasterKey: userBEnvelope.wrappedMasterKey,
        wrappedMasterKeyNonce: userBEnvelope.wrappedMasterKeyNonce,
        deviceId: 'device-b-1',
        otpCode: otpBData.devOtp,
      },
    });
    expect(regBRes.statusCode).toBe(201);
    const userBAccessToken = JSON.parse(regBRes.body).accessToken;

    // User A pushes 1 delta
    const sampleDelta = {
      id: 'delta-a-1',
      entityType: 'bookmark',
      entityId: 'bm-1',
      deviceId: 'device-a-1',
      lamportTs: 1,
      vectorClock: { 'device-a-1': 1 },
      ciphertext: 'secret-a-content',
      nonce: 'nonce-123',
      createdAt: new Date().toISOString(),
    };

    const pushRes = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: { authorization: `Bearer ${userAAccessToken}` },
      payload: {
        deviceId: 'device-a-1',
        clientCursor: 0,
        deltas: [sampleDelta],
      },
    });
    expect(pushRes.statusCode).toBe(200);

    // User B pulls deltas -> Must NOT see User A's delta!
    const pullBRes = await app.inject({
      method: 'POST',
      url: '/api/sync/pull',
      headers: { authorization: `Bearer ${userBAccessToken}` },
      payload: {
        deviceId: 'device-b-1',
        sinceCursor: 0,
      },
    });
    expect(pullBRes.statusCode).toBe(200);
    const pullBData = JSON.parse(pullBRes.body);
    expect(pullBData.deltas).toHaveLength(0);

    // User A pulls deltas -> Sees their own delta
    const pullARes = await app.inject({
      method: 'POST',
      url: '/api/sync/pull',
      headers: { authorization: `Bearer ${userAAccessToken}` },
      payload: {
        deviceId: 'device-a-1',
        sinceCursor: 0,
      },
    });
    expect(pullARes.statusCode).toBe(200);
    const pullAData = JSON.parse(pullARes.body);
    expect(pullAData.deltas).toHaveLength(1);
    expect(pullAData.deltas[0].id).toBe('delta-a-1');
  });
});
