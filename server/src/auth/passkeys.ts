import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

export interface PasskeyCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

export interface UserAccount {
  id: string;
  username: string;
  devices: PasskeyCredential[];
  currentChallenge?: string;
}

// In-memory user / passkey store for zero-knowledge self-host relay
const userStore = new Map<string, UserAccount>();

export const RP_NAME = 'Tessera Sync Relay';
export const RP_ID = 'localhost';
export const ORIGIN = 'http://localhost:3000';

/**
 * Generates WebAuthn registration options for a new passkey.
 */
export const getRegistrationOptions = async (userId: string, username: string) => {
  let user = userStore.get(userId);
  if (!user) {
    user = { id: userId, username, devices: [] };
    userStore.set(userId, user);
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  user.currentChallenge = options.challenge;
  return options;
};

/**
 * Verifies WebAuthn registration response.
 */
export const verifyRegistration = async (
  userId: string,
  response: any,
): Promise<{ verified: boolean; error?: string }> => {
  const user = userStore.get(userId);
  if (!user || !user.currentChallenge) {
    return { verified: false, error: 'User or challenge not found' };
  }

  try {
    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      user.devices.push({
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      });
      user.currentChallenge = undefined;
      return { verified: true };
    }

    return { verified: false, error: 'Verification failed' };
  } catch (err) {
    return { verified: false, error: (err as Error).message };
  }
};

/**
 * Generates WebAuthn authentication options.
 */
export const getAuthenticationOptions = async (userId: string) => {
  const user = userStore.get(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: user.devices.map((d) => ({
      id: d.id,
      transports: d.transports,
    })),
    userVerification: 'preferred',
  });

  user.currentChallenge = options.challenge;
  return options;
};

/**
 * Verifies WebAuthn authentication response.
 */
export const verifyAuthentication = async (
  userId: string,
  response: any,
): Promise<{ verified: boolean; error?: string }> => {
  const user = userStore.get(userId);
  if (!user || !user.currentChallenge) {
    return { verified: false, error: 'User or challenge not found' };
  }

  const credential = user.devices.find((d) => d.id === response.id);
  if (!credential) {
    return { verified: false, error: 'Authenticator not registered' };
  }

  try {
    const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey as any,
        counter: credential.counter,
        transports: credential.transports,
      },
    });

    if (verification.verified) {
      credential.counter = verification.authenticationInfo.newCounter;
      user.currentChallenge = undefined;
      return { verified: true };
    }

    return { verified: false, error: 'Auth failed' };
  } catch (err) {
    return { verified: false, error: (err as Error).message };
  }
};
