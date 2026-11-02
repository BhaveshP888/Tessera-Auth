/**
 * Extension popup script with dynamic cloud sync and real collection unsealing
 */
import {
  base64ToUint8Array,
  deriveRecordKey,
  sealRecord,
  unsealRecord,
} from '@tessera/core';
import type { SyncDelta, SyncPushRequest, SyncPullRequest } from '@tessera/schemas';

const normalizeUrl = (raw: string): string => {
  let u = raw.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  return u;
};

document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('url') as HTMLInputElement;
  const titleInput = document.getElementById('title') as HTMLInputElement;
  const collectionSelect = document.getElementById('collection') as HTMLSelectElement;
  const customColWrap = document.getElementById('custom-col-wrap') as HTMLDivElement;
  const customColInput = document.getElementById('custom-collection') as HTMLInputElement;
  const tagsInput = document.getElementById('tags') as HTMLInputElement;
  const notesInput = document.getElementById('notes') as HTMLTextAreaElement;
  const btnSaveLibrary = document.getElementById('btn-save-library') as HTMLButtonElement;
  const btnSaveVault = document.getElementById('btn-save-vault') as HTMLButtonElement;
  const statusEl = document.getElementById('status') as HTMLDivElement;

  // Settings elements
  const btnToggleSettings = document.getElementById('btn-toggle-settings') as HTMLButtonElement;
  const settingsDrawer = document.getElementById('settings-drawer') as HTMLDivElement;
  const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
  const masterKeyInput = document.getElementById('master-key') as HTMLInputElement;
  const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement;
  const syncDot = document.getElementById('sync-dot') as HTMLSpanElement;
  const syncLabel = document.getElementById('sync-label') as HTMLSpanElement;

  // Toggle settings drawer
  btnToggleSettings.addEventListener('click', () => {
    settingsDrawer.classList.toggle('open');
  });

  // Helper to re-render collection dropdown
  const renderCollections = (collectionNames: string[]) => {
    const existingSelected = collectionSelect.value;

    // Reset options to base
    collectionSelect.innerHTML = `
      <option value="">None (General Library)</option>
      <option value="__new__">+ New collection...</option>
    `;

    // Filter duplicates and empty strings
    const unique = Array.from(new Set(collectionNames.filter(Boolean)));
    for (const name of unique) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      collectionSelect.insertBefore(opt, collectionSelect.lastElementChild);
    }

    if (unique.includes(existingSelected)) {
      collectionSelect.value = existingSelected;
    }
  };

  // Pull collections from storage and cloud
  const refreshCollectionsAndStatus = async () => {
    let serverUrl = 'https://tesserabm.vercel.app';
    let masterKeyBase64 = '';
    let localCollections: string[] = [];

    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.local.get([
        'tessera_server_url',
        'tessera_master_key',
        'tessera_collections',
      ]);
      serverUrl = data['tessera_server_url'] || 'https://tesserabm.vercel.app';
      masterKeyBase64 = data['tessera_master_key'] || '';
      localCollections = data['tessera_collections'] || [];

      serverUrlInput.value = serverUrl;
      masterKeyInput.value = masterKeyBase64;
    } else {
      serverUrlInput.value = serverUrl;
    }

    renderCollections(localCollections);

    const cleanUrl = normalizeUrl(serverUrl);

    if (cleanUrl) {
      syncDot.className = 'sync-indicator online';
      syncLabel.textContent = 'CONNECTING...';

      try {
        // Test health endpoint first
        const healthRes = await fetch(`${cleanUrl}/api/health`);
        if (!healthRes.ok) {
          throw new Error(`Server returned ${healthRes.status}`);
        }

        syncDot.className = 'sync-indicator online';
        syncLabel.textContent = 'CLOUD READY';

        // If Master Key is present, pull real collections
        if (masterKeyBase64.trim()) {
          const pullPayload: SyncPullRequest = {
            deviceId: 'browser-extension',
            sinceCursor: 0,
            limit: 500,
          };

          const res = await fetch(`${cleanUrl}/api/sync/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pullPayload),
          });

          if (res.ok) {
            const body = (await res.json()) as { deltas: SyncDelta[] };
            const pulledCollections = new Set<string>(localCollections);
            const masterKey = base64ToUint8Array(masterKeyBase64.trim());

            for (const delta of body.deltas || []) {
              if (delta.ciphertext && delta.nonce) {
                if (delta.entityType === 'collection') {
                  try {
                    const recordKey = deriveRecordKey(masterKey, delta.entityId);
                    const unsealed = unsealRecord<{ name?: string }>(recordKey, delta.ciphertext, delta.nonce);
                    if (unsealed?.data?.name) {
                      pulledCollections.add(unsealed.data.name);
                    }
                  } catch (err) {
                    console.warn('[Tessera Extension] Failed to unseal collection:', err);
                  }
                } else if (delta.entityType === 'bookmark') {
                  try {
                    const recordKey = deriveRecordKey(masterKey, delta.entityId);
                    const unsealed = unsealRecord<{ collection?: string }>(recordKey, delta.ciphertext, delta.nonce);
                    if (unsealed?.data?.collection && typeof unsealed.data.collection === 'string') {
                      pulledCollections.add(unsealed.data.collection);
                    }
                  } catch {}
                }
              }
            }

            const updatedList = Array.from(pulledCollections).filter(Boolean);
            renderCollections(updatedList);

            if (typeof chrome !== 'undefined' && chrome.storage) {
              await chrome.storage.local.set({ tessera_collections: updatedList });
            }
          }
        }
      } catch (err) {
        console.error('[Tessera Extension] Cloud connection failed:', err);
        syncDot.className = 'sync-indicator';
        syncLabel.textContent = 'OFFLINE';
      }
    } else {
      syncDot.className = 'sync-indicator';
      syncLabel.textContent = 'LOCAL';
    }
  };

  // Save Settings handler
  btnSaveSettings.addEventListener('click', async () => {
    const rawServerUrl = serverUrlInput.value.trim();
    const serverUrl = normalizeUrl(rawServerUrl);
    const masterKey = masterKeyInput.value.trim();

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({
        tessera_server_url: serverUrl,
        tessera_master_key: masterKey,
      });
    }

    settingsDrawer.classList.remove('open');
    statusEl.className = 'status status-info';
    statusEl.textContent = '⚙️ Testing cloud connection...';
    statusEl.style.display = 'block';

    await refreshCollectionsAndStatus();
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 2000);
  });

  // Auto-populate current tab URL and Title
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        urlInput.value = tab.url;
        titleInput.value = tab.title || tab.url;
      }
    } catch {}
  }

  // Handle Collection dropdown
  collectionSelect.addEventListener('change', () => {
    if (collectionSelect.value === '__new__') {
      customColWrap.style.display = 'block';
      customColInput.focus();
    } else {
      customColWrap.style.display = 'none';
    }
  });

  // Save bookmark logic
  const handleSave = async (isVault: boolean) => {
    const rawUrl = urlInput.value.trim();
    const rawTitle = titleInput.value.trim();

    if (!rawUrl) {
      urlInput.focus();
      return;
    }

    let selectedCollection = collectionSelect.value;
    let newCollectionId: string | null = null;

    if (selectedCollection === '__new__') {
      selectedCollection = customColInput.value.trim();
      if (selectedCollection) {
        newCollectionId = crypto.randomUUID();
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const existing = (await chrome.storage.local.get('tessera_collections'))?.['tessera_collections'] || [];
          if (!existing.includes(selectedCollection)) {
            await chrome.storage.local.set({
              tessera_collections: [...existing, selectedCollection],
            });
          }
        }
      }
    }

    const bookmarkId = crypto.randomUUID();
    const now = new Date().toISOString();
    let hostname = '';
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      hostname = '';
    }

    const parsedTags = tagsInput.value
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9-_]/g, ''))
      .filter(Boolean);

    const bookmarkData = {
      id: bookmarkId,
      url: rawUrl,
      title: rawTitle || rawUrl,
      description: '',
      notes: notesInput.value.trim(),
      faviconUrl: hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : '',
      previewImageUrl: '',
      collection: selectedCollection || null,
      collectionId: newCollectionId || selectedCollection || null,
      isVault: Boolean(isVault),
      isArchived: false,
      isFavorite: false,
      isPinned: false,
      tags: parsedTags,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      versionClock: { 'browser-extension': 1 },
    };

    let pushedToCloud = false;
    let pushErrorMessage = '';

    // Check if cloud sync is available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.local.get(['tessera_server_url', 'tessera_master_key']);
      const rawServerUrl = data['tessera_server_url'] || 'https://tesserabm.vercel.app';
      const masterKeyBase64 = data['tessera_master_key'] || '';
      const cleanUrl = normalizeUrl(rawServerUrl);

      if (cleanUrl && masterKeyBase64.trim()) {
        try {
          const masterKey = base64ToUint8Array(masterKeyBase64.trim());
          const deltasToPush: SyncDelta[] = [];

          // If new collection created, push collection delta too
          if (newCollectionId && selectedCollection) {
            const colKey = deriveRecordKey(masterKey, newCollectionId);
            const sealedCol = sealRecord(colKey, {
              id: newCollectionId,
              name: selectedCollection,
              color: '#38bdf8',
              createdAt: now,
              updatedAt: now,
            });
            deltasToPush.push({
              id: crypto.randomUUID(),
              entityType: 'collection',
              entityId: newCollectionId,
              deviceId: 'browser-extension',
              lamportTs: Date.now(),
              vectorClock: { 'browser-extension': 1 },
              ciphertext: sealedCol.ciphertext,
              nonce: sealedCol.nonce,
              createdAt: now,
            });
          }

          // Seal Bookmark
          const recordKey = deriveRecordKey(masterKey, bookmarkId);
          const sealed = sealRecord(recordKey, bookmarkData);

          deltasToPush.push({
            id: crypto.randomUUID(),
            entityType: 'bookmark',
            entityId: bookmarkId,
            deviceId: 'browser-extension',
            lamportTs: Date.now(),
            vectorClock: { 'browser-extension': 1 },
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            createdAt: now,
          });

          const pushBody: SyncPushRequest = {
            deviceId: 'browser-extension',
            clientCursor: 0,
            deltas: deltasToPush,
          };

          const res = await fetch(`${cleanUrl}/api/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pushBody),
          });

          if (res.ok) {
            pushedToCloud = true;
          } else {
            const errText = await res.text();
            pushErrorMessage = `Server ${res.status}: ${errText}`;
            console.error('[Tessera Extension] Push failed:', pushErrorMessage);
          }
        } catch (err) {
          pushErrorMessage = (err as Error).message;
          console.error('[Tessera Extension] Encryption/push error:', err);
        }
      } else if (!masterKeyBase64.trim()) {
        pushErrorMessage = 'Master Key not set. Click ⚙️ in top right to pair your Master Key.';
      }

      // Always save to quick queue as backup
      const existing = (await chrome.storage.local.get('tessera_quick_queue'))?.['tessera_quick_queue'] || [];
      await chrome.storage.local.set({
        tessera_quick_queue: [...existing, bookmarkData],
      });

      if (chrome.action) {
        chrome.action.setBadgeText({ text: isVault ? '🔒' : '✓' });
        chrome.action.setBadgeBackgroundColor({ color: isVault ? '#f59e0b' : '#38bdf8' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
      }
    }

    if (pushErrorMessage) {
      statusEl.className = 'status status-vault';
      statusEl.textContent = `Saved locally (Cloud push: ${pushErrorMessage})`;
    } else {
      statusEl.className = `status ${isVault ? 'status-vault' : 'status-library'}`;
      statusEl.textContent = pushedToCloud
        ? (isVault ? '🔒 Synced to Cloud Vault & Saved' : '✓ Synced to Cloud Library & Saved')
        : (isVault ? '🔒 Saved to Local Vault & Queued' : '✓ Saved to Local Library & Queued');
    }
    statusEl.style.display = 'block';

    btnSaveLibrary.disabled = true;
    btnSaveVault.disabled = true;

    setTimeout(() => {
      window.close();
    }, 1400);
  };

  btnSaveLibrary.addEventListener('click', () => handleSave(false));
  btnSaveVault.addEventListener('click', () => handleSave(true));

  // Initialize
  await refreshCollectionsAndStatus();
});
