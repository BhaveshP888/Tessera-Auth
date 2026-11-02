import { deriveRecordKey, sealRecord, unsealRecord } from '../crypto/index.js';
import type { FullBackupPayload } from '../store/engine.js';

export const GIST_BACKUP_FILENAME = 'tessera-encrypted-backup.json';
export const GIST_DESCRIPTION = 'Tessera Encrypted Cloud Backup (Zero-Knowledge)';

export interface GistConfig {
  token: string;
  gistId: string | null;
  autoSync: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface EncryptedGistPayload {
  type: 'tessera_encrypted_gist_backup';
  version: 1;
  encryptedAt: string;
  ciphertext: string;
  nonce: string;
  bookmarkCount?: number;
}

export interface GistSyncResult {
  success: boolean;
  gistId?: string;
  gistUrl?: string;
  updatedAt?: string;
  count?: number;
  error?: string;
}

/**
 * Pushes a zero-knowledge encrypted backup of the user's library to a secret GitHub Gist.
 * If gistId is null/empty, automatically creates a new secret Gist and returns its ID.
 */
export async function pushEncryptedGistBackup(
  token: string,
  gistId: string | null,
  payload: FullBackupPayload,
  masterKey: Uint8Array,
  fetchFn: typeof fetch = fetch,
): Promise<GistSyncResult> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { success: false, error: 'GitHub Personal Access Token is required.' };
  }

  try {
    // 1. Derive dedicated Gist backup key from Master Key
    const backupKey = deriveRecordKey(masterKey, 'tessera-gist-backup');
    const sealed = sealRecord(backupKey, payload);

    const gistContent: EncryptedGistPayload = {
      type: 'tessera_encrypted_gist_backup',
      version: 1,
      encryptedAt: new Date().toISOString(),
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      bookmarkCount: payload.bookmarks?.length ?? 0,
    };

    const fileContentStr = JSON.stringify(gistContent, null, 2);

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cleanToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    if (gistId && gistId.trim()) {
      // 2a. Update existing Gist
      const updateRes = await fetchFn(`https://api.github.com/gists/${gistId.trim()}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          files: {
            [GIST_BACKUP_FILENAME]: {
              content: fileContentStr,
            },
          },
        }),
      });

      if (!updateRes.ok) {
        if (updateRes.status === 404) {
          // Gist was deleted on GitHub, create a new one instead of failing permanently
          return pushEncryptedGistBackup(token, null, payload, masterKey, fetchFn);
        }
        const errText = await updateRes.text();
        return { success: false, error: `GitHub API error (${updateRes.status}): ${errText.slice(0, 200)}` };
      }

      const resData = (await updateRes.json()) as { id: string; html_url: string; updated_at: string };
      return {
        success: true,
        gistId: resData.id,
        gistUrl: resData.html_url,
        updatedAt: resData.updated_at || new Date().toISOString(),
        count: payload.bookmarks?.length ?? 0,
      };
    }

    // 2b. Create a new Secret Gist
    const createRes = await fetchFn('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_BACKUP_FILENAME]: {
            content: fileContentStr,
          },
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return { success: false, error: `GitHub API error (${createRes.status}): ${errText.slice(0, 200)}` };
    }

    const resData = (await createRes.json()) as { id: string; html_url: string; updated_at: string };
    return {
      success: true,
      gistId: resData.id,
      gistUrl: resData.html_url,
      updatedAt: resData.updated_at || new Date().toISOString(),
      count: payload.bookmarks?.length ?? 0,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Failed to push backup to GitHub Gist.' };
  }
}

/**
 * Pulls and decrypts a zero-knowledge backup from a secret GitHub Gist.
 */
export async function pullEncryptedGistBackup(
  token: string,
  gistId: string,
  masterKey: Uint8Array,
  fetchFn: typeof fetch = fetch,
): Promise<{ success: boolean; payload?: FullBackupPayload; error?: string; gistUrl?: string }> {
  const cleanToken = token.trim();
  const cleanGistId = gistId.trim();

  if (!cleanToken) {
    return { success: false, error: 'GitHub Personal Access Token is required.' };
  }
  if (!cleanGistId) {
    return { success: false, error: 'Gist ID is required to restore.' };
  }

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cleanToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const res = await fetchFn(`https://api.github.com/gists/${cleanGistId}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `GitHub API error (${res.status}): ${errText.slice(0, 200)}` };
    }

    const gistData = (await res.json()) as {
      html_url: string;
      files: Record<string, { content?: string; raw_url?: string; truncated?: boolean }>;
    };

    const file = gistData.files[GIST_BACKUP_FILENAME] || Object.values(gistData.files)[0];
    if (!file) {
      return { success: false, error: `No backup file found in Gist ${cleanGistId}.` };
    }

    let rawContent = file.content;
    if (!rawContent && file.raw_url) {
      const rawRes = await fetchFn(file.raw_url, { headers });
      rawContent = await rawRes.text();
    }

    if (!rawContent) {
      return { success: false, error: 'Empty backup file received from GitHub Gist.' };
    }

    const parsedGist = JSON.parse(rawContent) as EncryptedGistPayload;

    if (!parsedGist.ciphertext || !parsedGist.nonce) {
      return { success: false, error: 'Invalid or corrupt Gist backup structure.' };
    }

    // Decrypt with Master Key
    const backupKey = deriveRecordKey(masterKey, 'tessera-gist-backup');
    const { data, error } = unsealRecord<FullBackupPayload>(
      backupKey,
      parsedGist.ciphertext,
      parsedGist.nonce,
    );

    if (error || !data) {
      return {
        success: false,
        error: error || 'Decryption failed. Please verify that your Master Key matches this backup.',
      };
    }

    return {
      success: true,
      payload: data,
      gistUrl: gistData.html_url,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Failed to restore backup from GitHub Gist.' };
  }
}
