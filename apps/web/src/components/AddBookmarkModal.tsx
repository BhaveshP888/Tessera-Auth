import React, { useState, useEffect } from 'react';
import { X, Globe, Sparkles, Pin, Star, Lock, CheckCircle, AlertCircle, Loader2, Pencil } from 'lucide-react';
import type { Bookmark, Collection, Tag } from '@tessera/schemas';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface AddBookmarkModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onAdd?: (bookmark: {
    url: string;
    title: string;
    description?: string;
    notes?: string;
    tags?: string[];
    collectionId?: string | null;
    isVault?: boolean;
    isFavorite?: boolean;
    isPinned?: boolean;
    faviconUrl?: string;
    previewImageUrl?: string;
  }) => void;
  onUpdate?: (id: string, updates: {
    url: string;
    title: string;
    description?: string;
    notes?: string;
    tags?: string[];
    collectionId?: string | null;
    isVault?: boolean;
    isFavorite?: boolean;
    isPinned?: boolean;
    faviconUrl?: string;
    previewImageUrl?: string;
  }) => void;
  bookmarkToEdit?: Bookmark | null;
  collections?: Collection[];
  tags?: Tag[];
  serverUrl?: string;
  isVaultUnlocked?: boolean;
  defaultIsVault?: boolean;
}

export const AddBookmarkModal: React.FC<AddBookmarkModalProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'add');
  const storeCloseModal = useUIStore((s) => s.closeModal);
  const storeBookmarkToEdit = useUIStore((s) => s.editingBookmark);

  const storeAddBookmark = useLibraryStore((s) => s.addBookmark);
  const storeUpdateBookmark = useLibraryStore((s) => s.updateBookmark);
  const storeCollections = useLibraryStore((s) => s.collections);
  const storeTags = useLibraryStore((s) => s.tags);
  const storeServerUrl = useLibraryStore((s) => s.syncServerUrl);
  const storeIsVaultUnlocked = useLibraryStore((s) => s.isVaultUnlocked);
  const storeActiveSection = useLibraryStore((s) => s.activeSection);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const bookmarkToEdit =
    props.bookmarkToEdit !== undefined ? props.bookmarkToEdit : storeBookmarkToEdit;
  const onAdd = props.onAdd || storeAddBookmark;
  const onUpdate = props.onUpdate || storeUpdateBookmark;
  const collections = props.collections || storeCollections;
  const tags = props.tags || storeTags;
  const serverUrl = props.serverUrl || storeServerUrl;
  const isVaultUnlocked =
    props.isVaultUnlocked !== undefined ? props.isVaultUnlocked : storeIsVaultUnlocked;
  const defaultIsVault =
    props.defaultIsVault !== undefined ? props.defaultIsVault : storeActiveSection === 'vault';

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [isVault, setIsVault] = useState(defaultIsVault);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [autofillStatus, setAutofillStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (bookmarkToEdit) {
        setUrl(bookmarkToEdit.url || '');
        setTitle(bookmarkToEdit.title || '');
        setDescription(bookmarkToEdit.description || '');
        setNotes(bookmarkToEdit.notes || '');
        setFaviconUrl(bookmarkToEdit.faviconUrl || '');
        setPreviewImageUrl(bookmarkToEdit.previewImageUrl || '');
        setSelectedTags(bookmarkToEdit.tags || []);
        setCollectionId(bookmarkToEdit.collectionId || null);
        setIsVault(Boolean(bookmarkToEdit.isVault));
        setIsFavorite(Boolean(bookmarkToEdit.isFavorite));
        setIsPinned(Boolean(bookmarkToEdit.isPinned));
      } else {
        setUrl('');
        setTitle('');
        setDescription('');
        setNotes('');
        setFaviconUrl('');
        setPreviewImageUrl('');
        setSelectedTags([]);
        setCollectionId(null);
        setIsVault(defaultIsVault);
        setIsFavorite(false);
        setIsPinned(false);
      }
      setAutofillStatus(null);
    }
  }, [isOpen, bookmarkToEdit, defaultIsVault]);

  if (!isOpen) return null;

  const normalizeUrlString = (raw: string): string => {
    let u = raw.trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) {
      u = `https://${u}`;
    }
    return u;
  };

  const handleFetchMetadata = async (targetUrl?: string) => {
    const rawToFetch = targetUrl || url;
    if (!rawToFetch.trim()) return;

    const normalized = normalizeUrlString(rawToFetch);
    setUrl(normalized);

    try {
      setIsFetchingMetadata(true);
      setAutofillStatus('Fetching page metadata...');

      // Derive base API URL (handles relative or absolute endpoint)
      const apiUrl = serverUrl.endsWith('/') ? `${serverUrl}api/proxy/metadata` : `${serverUrl}/api/proxy/metadata`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });

      if (res.ok) {
        const result = await res.json();
        const meta = result.data || result;
        if (meta && typeof meta === 'object') {
          if (meta.title) setTitle(meta.title);
          if (meta.description) setDescription(meta.description);
          if (meta.faviconUrl) setFaviconUrl(meta.faviconUrl);
          if (meta.previewImageUrl) setPreviewImageUrl(meta.previewImageUrl);
          setAutofillStatus('Metadata autofilled successfully!');
          setTimeout(() => setAutofillStatus(null), 2500);
          return;
        }
      }

      // Local fallback derivation
      fallbackMetadata(normalized);
    } catch {
      fallbackMetadata(normalized);
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  const fallbackMetadata = (normalizedUrl: string) => {
    try {
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.replace(/^www\./, '');
      if (!title) {
        // Capitalize domain name for friendly fallback title
        const hostParts = host.split('.');
        const domainName = hostParts[0] ? hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1) : host;
        setTitle(domainName);
      }
      if (!faviconUrl) {
        setFaviconUrl(`https://www.google.com/s2/favicons?domain=${host}&sz=64`);
      }
      setAutofillStatus('Extracted domain details');
      setTimeout(() => setAutofillStatus(null), 2000);
    } catch {
      setAutofillStatus(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalUrl = normalizeUrlString(url);
      if (!finalUrl || !title.trim()) return;

      let safeFavicon = faviconUrl;
      if (!safeFavicon) {
        try {
          const parsed = new URL(finalUrl);
          safeFavicon = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
        } catch {
          safeFavicon = '';
        }
      }

      // Collect any uncommitted tags in newTagInput
      const finalTags = [...selectedTags];
      if (newTagInput.trim()) {
        const rawParts = newTagInput.split(/[\s,]+/);
        for (const part of rawParts) {
          const clean = part.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
          if (clean && !finalTags.includes(clean)) {
            finalTags.push(clean);
          }
        }
      }

      const payload = {
        url: finalUrl,
        title: title.trim(),
        description: description.trim(),
        notes: notes.trim(),
        tags: finalTags,
        collectionId: collectionId || null,
        isVault: Boolean(isVault),
        isFavorite: Boolean(isFavorite),
        isPinned: Boolean(isPinned),
        faviconUrl: safeFavicon,
        previewImageUrl: previewImageUrl.trim(),
      };

      if (bookmarkToEdit && onUpdate) {
        onUpdate(bookmarkToEdit.id, payload);
      } else {
        onAdd(payload);
      }

      onClose();
    } catch (err) {
      console.error('[AddBookmarkModal] Submit error:', err);
    }
  };

  const handleAddCustomTag = () => {
    const rawParts = newTagInput.split(/[\s,]+/);
    const newTags: string[] = [];
    for (const part of rawParts) {
      const clean = part.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
      if (clean && !selectedTags.includes(clean) && !newTags.includes(clean)) {
        newTags.push(clean);
      }
    }
    if (newTags.length > 0) {
      setSelectedTags([...selectedTags, ...newTags]);
      setNewTagInput('');
    }
  };

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter((t) => t !== tagName));
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 12, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="animate-modal"
        style={{
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-hover)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {bookmarkToEdit ? (
              <Pencil size={16} style={{ color: 'var(--accent)' }} />
            ) : (
              <Globe size={16} style={{ color: 'var(--accent)' }} />
            )}
            <span style={{ fontSize: '14.5px', fontWeight: 600 }}>
              {bookmarkToEdit ? 'Edit Bookmark' : 'Add Bookmark'}
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* URL Input with Autofill button */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                URL *
              </label>
              {autofillStatus && (
                <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={11} />
                  <span>{autofillStatus}</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                required
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => {
                  if (url && !title) handleFetchMetadata();
                }}
                placeholder="github.com/facebook/react or https://..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => handleFetchMetadata()}
                disabled={isFetchingMetadata || !url.trim()}
                title="Autofill title & description"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: isFetchingMetadata ? 'var(--surface-active)' : 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: isFetchingMetadata ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: isFetchingMetadata || !url.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isFetchingMetadata ? (
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                )}
                <span>{isFetchingMetadata ? 'Fetching...' : 'Autofill'}</span>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Title *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {faviconUrl && (
                <img
                  src={faviconUrl}
                  alt=""
                  style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0 }}
                  onError={() => setFaviconUrl('')}
                />
              )}
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary or excerpt..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12.5px',
                resize: 'none',
                outline: 'none',
              }}
            />
          </div>

          {/* Private Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Encrypted Private Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal notes (end-to-end encrypted)..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '12px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* Collection & Flags Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Collection
              </label>
              <select
                value={collectionId || ''}
                onChange={(e) => setCollectionId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '12.5px',
                  outline: 'none',
                }}
              >
                <option value="">No Collection</option>
                {(collections || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Flags & Vault
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsPinned(!isPinned)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '7px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: isPinned ? 'var(--amber-dim)' : 'var(--surface)',
                    color: isPinned ? 'var(--amber)' : 'var(--text-muted)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                  }}
                >
                  <Pin size={12} fill={isPinned ? 'var(--amber)' : 'none'} />
                  <span>Pin</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFavorite(!isFavorite)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '7px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: isFavorite ? 'var(--rose-dim)' : 'var(--surface)',
                    color: isFavorite ? 'var(--rose)' : 'var(--text-muted)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                  }}
                >
                  <Star size={12} fill={isFavorite ? 'var(--rose)' : 'none'} />
                  <span>Fav</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVault(!isVault)}
                  title="Store in Private Vault"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '7px',
                    borderRadius: 'var(--radius-sm)',
                    border: isVault ? '1px solid var(--amber)' : '1px solid var(--border)',
                    background: isVault ? 'var(--amber-dim)' : 'var(--surface)',
                    color: isVault ? 'var(--amber)' : 'var(--text-muted)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                  }}
                >
                  <Lock size={12} />
                  <span>Vault</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              Tags
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
              {Array.from(new Set([...(tags || []).map((t) => t.name), ...(selectedTags || [])])).map((tagName) => {
                const isSelected = (selectedTags || []).includes(tagName);
                return (
                  <button
                    key={tagName}
                    type="button"
                    onClick={() => toggleTag(tagName)}
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--accent)' : 'var(--surface)',
                      color: isSelected ? '#030712' : 'var(--text-secondary)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    #{tagName}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Add custom tag (e.g. tools, react)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '4px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '7px 18px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)',
                color: '#030712',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {bookmarkToEdit ? 'Save Changes' : 'Save Bookmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
