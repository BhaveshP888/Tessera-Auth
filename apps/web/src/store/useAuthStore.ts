import { create } from 'zustand';
import type { User } from '@tessera/core';
import { getEngine, useLibraryStore } from './useLibraryStore.js';

export interface TwoFactorSetupData {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // 2FA Challenge State
  requires2FA: boolean;
  challengeToken: string | null;
  tempEmail: string | null;
  tempPassword: string | null;

  // 2FA Setup State
  twoFactorSetupData: TwoFactorSetupData | null;

  // Actions
  register: (
    email: string,
    password: string,
    deviceName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  login: (
    email: string,
    password: string,
    deviceName?: string,
  ) => Promise<{ success: boolean; requires2FA?: boolean; error?: string }>;
  verify2FA: (code: string) => Promise<{ success: boolean; error?: string }>;
  setup2FA: () => Promise<{ success: boolean; data?: TwoFactorSetupData; error?: string }>;
  enable2FA: (
    secret: string,
    code: string,
    backupCodes: string[],
  ) => Promise<{ success: boolean; error?: string }>;
  disable2FA: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
  resetTwoFactorChallenge: () => void;
}

const syncLibraryStateWithEngine = () => {
  const engine = getEngine();
  useLibraryStore.setState({
    bookmarks: engine.getBookmarks(),
    tags: engine.getTags(),
    collections: engine.getCollections(),
    pendingDeltasCount: engine.getPendingDeltasCount(),
    masterKeyBase64: engine.getMasterKeyBase64(),
    isSyncing: engine.getIsSyncing(),
  });
};

export const useAuthStore = create<AuthState>()((set, get) => {
  const engine = getEngine();
  const initialUser = engine.getAuthUser();

  return {
    user: initialUser,
    isAuthenticated: Boolean(initialUser && engine.getAuthToken()),
    isLoading: false,
    error: null,
    requires2FA: false,
    challengeToken: null,
    tempEmail: null,
    tempPassword: null,
    twoFactorSetupData: null,

    register: async (email: string, password: string, deviceName?: string) => {
      set({ isLoading: true, error: null });
      try {
        const result = await engine.registerAccount(email, password, deviceName);
        if (!result.success || !result.user) {
          set({ isLoading: false, error: result.error || 'Registration failed' });
          return { success: false, error: result.error || 'Registration failed' };
        }

        set({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });

        syncLibraryStateWithEngine();
        useLibraryStore.getState().logAudit('auth_register', 'success', {
          email: result.user.email,
        });

        return { success: true };
      } catch (err) {
        const message = (err as Error).message || 'Registration failed';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    login: async (email: string, password: string, deviceName?: string) => {
      set({ isLoading: true, error: null });
      try {
        const result = await engine.loginAccount(email, password, deviceName);
        if (!result.success) {
          set({ isLoading: false, error: result.error || 'Invalid email or password' });
          return { success: false, error: result.error || 'Invalid email or password' };
        }

        if (result.requires2FA && result.challengeToken) {
          set({
            isLoading: false,
            requires2FA: true,
            challengeToken: result.challengeToken,
            tempEmail: email,
            tempPassword: password,
            error: null,
          });
          return { success: true, requires2FA: true };
        }

        if (result.user) {
          set({
            user: result.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            requires2FA: false,
            challengeToken: null,
            tempEmail: null,
            tempPassword: null,
          });

          syncLibraryStateWithEngine();
          useLibraryStore.getState().logAudit('auth_login', 'success', {
            email: result.user.email,
          });

          return { success: true };
        }

        set({ isLoading: false, error: 'Unexpected login response' });
        return { success: false, error: 'Unexpected login response' };
      } catch (err) {
        const message = (err as Error).message || 'Login failed';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    verify2FA: async (code: string) => {
      const { challengeToken, tempEmail, tempPassword } = get();
      if (!challengeToken || !tempEmail || !tempPassword) {
        set({ error: '2FA session expired. Please enter your credentials again.' });
        return { success: false, error: '2FA session expired. Please enter your credentials again.' };
      }

      set({ isLoading: true, error: null });
      try {
        const result = await engine.verify2FALogin(
          challengeToken,
          code,
          tempEmail,
          tempPassword,
        );

        if (!result.success || !result.user) {
          set({ isLoading: false, error: result.error || 'Invalid authentication code' });
          return { success: false, error: result.error || 'Invalid authentication code' };
        }

        set({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          requires2FA: false,
          challengeToken: null,
          tempEmail: null,
          tempPassword: null,
        });

        syncLibraryStateWithEngine();
        useLibraryStore.getState().logAudit('auth_login', 'success', {
          action: '2fa_verified',
          email: result.user.email,
        });

        return { success: true };
      } catch (err) {
        const message = (err as Error).message || 'Verification failed';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    setup2FA: async () => {
      set({ isLoading: true, error: null });
      try {
        const result = await engine.setup2FA();
        if (!result.success || !result.data) {
          set({ isLoading: false, error: result.error || 'Failed to initialize 2FA setup' });
          return { success: false, error: result.error || 'Failed to initialize 2FA setup' };
        }

        set({
          isLoading: false,
          twoFactorSetupData: result.data,
          error: null,
        });
        return { success: true, data: result.data };
      } catch (err) {
        const message = (err as Error).message || 'Failed to setup 2FA';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    enable2FA: async (secret: string, code: string, backupCodes: string[]) => {
      set({ isLoading: true, error: null });
      try {
        const result = await engine.enable2FA(secret, code, backupCodes);
        if (!result.success) {
          set({ isLoading: false, error: result.error || 'Failed to enable 2FA' });
          return { success: false, error: result.error || 'Failed to enable 2FA' };
        }

        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, totpEnabled: true } });
        }

        set({
          isLoading: false,
          twoFactorSetupData: null,
          error: null,
        });

        useLibraryStore.getState().logAudit('auth_2fa_enabled', 'success', {});

        return { success: true };
      } catch (err) {
        const message = (err as Error).message || 'Failed to enable 2FA';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    disable2FA: async (code: string) => {
      set({ isLoading: true, error: null });
      try {
        const result = await engine.disable2FA(code);
        if (!result.success) {
          set({ isLoading: false, error: result.error || 'Failed to disable 2FA' });
          return { success: false, error: result.error || 'Failed to disable 2FA' };
        }

        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, totpEnabled: false } });
        }

        set({ isLoading: false, error: null });

        useLibraryStore.getState().logAudit('auth_2fa_disabled', 'success', {});

        return { success: true };
      } catch (err) {
        const message = (err as Error).message || 'Failed to disable 2FA';
        set({ isLoading: false, error: message });
        return { success: false, error: message };
      }
    },

    logout: async () => {
      set({ isLoading: true });
      try {
        await engine.logoutAccount();
      } finally {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          requires2FA: false,
          challengeToken: null,
          tempEmail: null,
          tempPassword: null,
          twoFactorSetupData: null,
        });
        syncLibraryStateWithEngine();
        useLibraryStore.getState().logAudit('auth_logout', 'success', {});
      }
    },

    checkSession: async () => {
      if (!engine.getAuthToken()) {
        set({ isAuthenticated: false, user: null });
        return;
      }

      const result = await engine.checkAuthSession();
      if (result.success && result.user) {
        set({ user: result.user, isAuthenticated: true });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    },

    clearError: () => set({ error: null }),

    resetTwoFactorChallenge: () =>
      set({
        requires2FA: false,
        challengeToken: null,
        tempEmail: null,
        tempPassword: null,
        error: null,
      }),
  };
});
