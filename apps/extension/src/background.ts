/**
 * Tessera MV3 Service Worker
 */

chrome.runtime.onInstalled.addListener(() => {
  // Register right-click context menu
  chrome.contextMenus.create({
    id: 'tessera-save-page',
    title: 'Save Page to Tessera',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'tessera-save-selection',
    title: 'Save Selection to Tessera as Note',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;

  const bookmarkData = {
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    description: '',
    notes: info.selectionText ? `"${info.selectionText}"` : '',
    tags: ['quick-save'],
    createdAt: new Date().toISOString(),
  };

  // Save to chrome.storage.local queue
  const existing = (await chrome.storage.local.get('tessera_quick_queue'))?.['tessera_quick_queue'] || [];
  await chrome.storage.local.set({
    tessera_quick_queue: [...existing, bookmarkData],
  });

  // Notify user via badge
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#38bdf8' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 2000);
});
