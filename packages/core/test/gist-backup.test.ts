import { describe, it, expect } from 'bun:test';
import {
  pushEncryptedGistBackup,
  pullEncryptedGistBackup,
  GIST_BACKUP_FILENAME,
} from '../src/backup/gist-backup.js';
import { generateMasterKey } from '../src/crypto/keys.js';
import type { FullBackupPayload } from '../src/store/engine.js';

describe('GitHub Gist Zero-Knowledge Backup & Restore', () => {
  const masterKey = generateMasterKey();
  const samplePayload: FullBackupPayload = {
    type: 'tessera_full_backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    masterKey: 'test-master-key-base64',
    bookmarks: [
      {
        id: 'b-101',
        url: 'https://roadmap.sh/frontend',
        title: 'Frontend Developer Roadmap',
        description: 'Step by step guide to becoming a modern frontend developer.',
        notes: 'Review performance optimization & React 19',
        faviconUrl: 'https://roadmap.sh/favicon.ico',
        previewImageUrl: '',
        tags: ['frontend', 'learning'],
        collectionId: 'c-dev',
        isVault: false,
        isArchived: false,
        isFavorite: true,
        isPinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        versionClock: { 'device-1': 5 },
      },
    ],
    tags: [
      {
        id: 't-1',
        name: 'frontend',
        color: '#0891b2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    collections: [
      {
        id: 'c-dev',
        name: 'Development',
        color: '#1e3a5f',
        parentId: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  it('fails gracefully when GitHub token is missing', async () => {
    const res = await pushEncryptedGistBackup('', null, samplePayload, masterKey);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Token is required');
  });

  it('creates and pushes a zero-knowledge encrypted secret Gist', async () => {
    let pushedBody: any = null;

    const mockFetch: typeof fetch = async (url, options = {}) => {
      pushedBody = JSON.parse(options.body as string);
      return new Response(
        JSON.stringify({
          id: 'mock-gist-12345',
          html_url: 'https://gist.github.com/user/mock-gist-12345',
          updated_at: '2026-08-21T18:00:00Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await pushEncryptedGistBackup(
      'ghp_mocktoken123',
      null,
      samplePayload,
      masterKey,
      mockFetch,
    );

    expect(res.success).toBe(true);
    expect(res.gistId).toBe('mock-gist-12345');
    expect(res.count).toBe(1);

    // Verify Zero-Knowledge payload on GitHub
    const fileContent = JSON.parse(pushedBody.files[GIST_BACKUP_FILENAME].content);
    expect(fileContent.type).toBe('tessera_encrypted_gist_backup');
    expect(fileContent.ciphertext).toBeDefined();
    expect(fileContent.nonce).toBeDefined();
    // Verify plaintext titles/URLs are NOT exposed
    expect(pushedBody.files[GIST_BACKUP_FILENAME].content).not.toContain('roadmap.sh');
    expect(pushedBody.files[GIST_BACKUP_FILENAME].content).not.toContain('Frontend Developer Roadmap');
  });

  it('pulls and decrypts backup from Gist using Master Key accurately', async () => {
    // 1. Create encrypted payload
    let storedGistFile = '';
    const mockPushFetch: typeof fetch = async (url, options = {}) => {
      const parsed = JSON.parse(options.body as string);
      storedGistFile = parsed.files[GIST_BACKUP_FILENAME].content;
      return new Response(
        JSON.stringify({ id: 'mock-gist-999', html_url: 'https://gist.github.com/user/999' }),
        { status: 200 },
      );
    };

    await pushEncryptedGistBackup('ghp_test', 'mock-gist-999', samplePayload, masterKey, mockPushFetch);

    // 2. Pull and decrypt
    const mockPullFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          html_url: 'https://gist.github.com/user/999',
          files: {
            [GIST_BACKUP_FILENAME]: {
              content: storedGistFile,
            },
          },
        }),
        { status: 200 },
      );
    };

    const pullRes = await pullEncryptedGistBackup('ghp_test', 'mock-gist-999', masterKey, mockPullFetch);
    expect(pullRes.success).toBe(true);
    expect(pullRes.payload?.bookmarks.length).toBe(1);
    expect(pullRes.payload?.bookmarks[0]!.title).toBe('Frontend Developer Roadmap');
    expect(pullRes.payload?.bookmarks[0]!.url).toBe('https://roadmap.sh/frontend');
    expect(pullRes.payload?.collections.length).toBe(1);
  });

  it('fails decryption cleanly when pulling with wrong Master Key', async () => {
    const wrongKey = generateMasterKey();

    let storedGistFile = '';
    const mockPushFetch: typeof fetch = async (url, options = {}) => {
      const parsed = JSON.parse(options.body as string);
      storedGistFile = parsed.files[GIST_BACKUP_FILENAME].content;
      return new Response(
        JSON.stringify({ id: 'mock-gist-999' }),
        { status: 200 },
      );
    };

    await pushEncryptedGistBackup('ghp_test', 'mock-gist-999', samplePayload, masterKey, mockPushFetch);

    const mockPullFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          files: {
            [GIST_BACKUP_FILENAME]: {
              content: storedGistFile,
            },
          },
        }),
        { status: 200 },
      );
    };

    const pullRes = await pullEncryptedGistBackup('ghp_test', 'mock-gist-999', wrongKey, mockPullFetch);
    expect(pullRes.success).toBe(false);
    expect(pullRes.error).toBeDefined();
    expect(pullRes.payload).toBeUndefined();
  });
});
