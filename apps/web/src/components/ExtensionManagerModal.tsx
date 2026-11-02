import React, { useState, useRef } from 'react';
import { X, Puzzle, Play, CheckCircle, AlertTriangle, ShieldCheck, Download, Upload, FileCode } from 'lucide-react';
import type { ExtensionManifest, Bookmark, Tag, Collection } from '@tessera/schemas';
import { parseNetscapeBookmarksHtml, exportToNetscapeHtml } from '@tessera/extension-html-import';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface ExtensionManagerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  installedExtensions?: ExtensionManifest[];
  bookmarks?: Bookmark[];
  tags?: Tag[];
  collections?: Collection[];
  onAddBookmark?: (bookmark: any) => void;
  onAddTag?: (name: string) => void;
  onAddCollection?: (name: string, color?: string, description?: string) => any;
  onLogAudit?: (
    type: any,
    status: any,
    details?: Record<string, unknown>,
    errorMessage?: string,
  ) => void;
}

export const ExtensionManagerModal: React.FC<ExtensionManagerModalProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'extension');
  const storeCloseModal = useUIStore((s) => s.closeModal);

  const storeInstalledExtensions = useLibraryStore((s) => s.installedExtensions);
  const storeBookmarks = useLibraryStore((s) => s.bookmarks);
  const storeTags = useLibraryStore((s) => s.tags);
  const storeCollections = useLibraryStore((s) => s.collections);
  const storeAddBookmark = useLibraryStore((s) => s.addBookmark);
  const storeAddTag = useLibraryStore((s) => s.addTag);
  const storeAddCollection = useLibraryStore((s) => s.addCollection);
  const storeLogAudit = useLibraryStore((s) => s.logAudit);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const installedExtensions = props.installedExtensions || storeInstalledExtensions;
  const bookmarks = props.bookmarks || storeBookmarks;
  const tags = props.tags || storeTags;
  const collections = props.collections || storeCollections;
  const onAddBookmark = props.onAddBookmark || storeAddBookmark;
  const onAddTag = props.onAddTag || storeAddTag;
  const onAddCollection = props.onAddCollection || storeAddCollection;
  const onLogAudit = props.onLogAudit || storeLogAudit;

  const [runningExtId, setRunningExtId] = useState<string | null>(null);
  const [executionOutput, setExecutionOutput] = useState<string | null>(null);
  const [importInput, setImportInput] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportInput(content);
        setExecutionOutput(`Loaded ${file.name} (${Math.round(file.size / 1024)} KB). Click "Run Import" to process.`);
      }
    };
    reader.readAsText(file);
  };

  const handleExportHtml = () => {
    try {
      const htmlContent = exportToNetscapeHtml(bookmarks, collections);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tessera_bookmarks_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);

      onLogAudit('export_data', 'success', { format: 'netscape_html', count: bookmarks.length });
      setExecutionOutput(`Successfully exported ${bookmarks.length} bookmark(s) to Netscape HTML format!`);
    } catch (err) {
      const msg = (err as Error).message;
      setExecutionOutput(`Export Error: ${msg}`);
      onLogAudit('export_data', 'error', { format: 'netscape_html' }, msg);
    }
  };

  const handleRunExtension = async (ext: ExtensionManifest) => {
    setRunningExtId(ext.id);
    setExecutionOutput(null);

    try {
      if (ext.id === 'html-import') {
        if (!importInput.trim()) {
          setExecutionOutput('Please upload a bookmarks.html file or paste HTML into the box below.');
          setRunningExtId(null);
          return;
        }

        const parsedItems = parseNetscapeBookmarksHtml(importInput);
        if (!parsedItems || parsedItems.length === 0) {
          throw new Error('No valid bookmarks found in HTML. Ensure the file was exported from Chrome, Firefox, Safari, or Arc.');
        }

        let importedCount = 0;
        let createdCollectionsCount = 0;
        const collectionCache = new Map<string, string>();

        for (const c of collections) {
          collectionCache.set(c.name.toLowerCase(), c.id);
        }

        for (const item of parsedItems) {
          let colId: string | null = null;
          if (item.collectionName && item.collectionName.trim()) {
            const cleanCol = item.collectionName.trim();
            const lowerCol = cleanCol.toLowerCase();
            if (collectionCache.has(lowerCol)) {
              colId = collectionCache.get(lowerCol)!;
            } else if (onAddCollection) {
              const newCol = onAddCollection(cleanCol);
              if (newCol && newCol.id) {
                colId = newCol.id;
                collectionCache.set(lowerCol, newCol.id);
                createdCollectionsCount++;
              }
            }
          }

          for (const t of item.tags || []) {
            onAddTag(t);
          }

          onAddBookmark({
            url: item.url,
            title: item.title,
            description: item.description || '',
            notes: item.notes || '',
            tags: item.tags || [],
            collectionId: colId,
            faviconUrl: item.faviconUrl || '',
            isFavorite: item.isFavorite || false,
            isPinned: item.isPinned || false,
            isVault: false,
          });
          importedCount++;
        }

        onLogAudit('extension_rpc_executed', 'success', {
          extensionId: ext.id,
          importedCount,
          createdCollectionsCount,
        });

        setExecutionOutput(
          `Successfully imported ${importedCount} bookmark(s)${
            createdCollectionsCount > 0 ? ` into ${createdCollectionsCount} new collection(s)` : ''
          }!`,
        );
        setImportInput('');
        setUploadedFileName(null);
      } else if (ext.id === 'markdown-export') {
        const lines: string[] = [
          `# Tessera Bookmark Library Export`,
          `*Exported on ${new Date().toLocaleString()}*`,
          '',
        ];

        for (const b of bookmarks || []) {
          const tagStr = (b.tags || []).map((t) => `#${t}`).join(' ');
          lines.push(`- [${b.title}](${b.url}) ${tagStr}`);
          if (b.description) lines.push(`  > ${b.description}`);
          if (b.notes) lines.push(`  \`\`\`notes\n  ${b.notes}\n  \`\`\``);
        }

        const mdContent = lines.join('\n');
        const blob = new Blob([mdContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tessera-export-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);

        onLogAudit('export_data', 'success', { format: 'markdown', count: (bookmarks || []).length });
        setExecutionOutput(`Successfully exported ${(bookmarks || []).length} bookmarks to Markdown!`);
      }
    } catch (err) {
      const msg = (err as Error).message;
      setExecutionOutput(`Execution Error: ${msg}`);
      onLogAudit('extension_rpc_denied', 'error', { extensionId: ext.id }, msg);
    } finally {
      setRunningExtId(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 9, 18, 0.75)',
        backdropFilter: 'blur(6px)',
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
          maxWidth: '680px',
          maxHeight: '85vh',
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
            <Puzzle size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <h3 style={{ fontSize: '14.5px', fontWeight: 600 }}>Extension Manager</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Native plugins with zero server data leakage
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Extension Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {installedExtensions.map((ext) => (
              <div
                key={ext.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {ext.name}
                      </span>
                      <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        v{ext.version}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
                      {ext.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {ext.id === 'html-import' && (
                      <button
                        onClick={handleExportHtml}
                        title="Export library to standard Netscape HTML format"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-active)',
                          border: '1px solid var(--border)',
                          fontSize: '11.5px',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                      >
                        <Download size={12} />
                        <span>Export HTML</span>
                      </button>
                    )}

                    {ext.id !== 'html-import' && (
                      <button
                        onClick={() => handleRunExtension(ext)}
                        disabled={runningExtId === ext.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent-dim)',
                          border: '1px solid var(--accent)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--accent-text)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Play size={12} />
                        <span>Run</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions / Capabilities pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    <ShieldCheck size={12} style={{ color: 'var(--green)' }} />
                    <span>Permissions:</span>
                  </div>
                  {(ext.permissions || (ext as any).capabilities || []).map((perm: string) => (
                    <span
                      key={perm}
                      style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'var(--surface-active)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {perm}
                    </span>
                  ))}
                </div>

                {/* Browser HTML Input & File Upload */}
                {ext.id === 'html-import' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".html,.htm"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-hover)',
                            border: '1px solid var(--border)',
                            fontSize: '11.5px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          <FileCode size={13} />
                          <span>{uploadedFileName ? `File: ${uploadedFileName}` : 'Select bookmarks.html file...'}</span>
                        </button>

                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          or paste HTML below:
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRunExtension(ext)}
                        disabled={runningExtId === ext.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent-dim)',
                          border: '1px solid var(--accent)',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--accent-text)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Upload size={12} />
                        <span>Run Import</span>
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      value={importInput}
                      onChange={(e) => setImportInput(e.target.value)}
                      placeholder='Paste Chrome/Firefox/Safari exported HTML here (<!DOCTYPE NETSCAPE-Bookmark-file-1>...)...'
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                        resize: 'none',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Output feedback */}
          {executionOutput && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--accent)',
                color: 'var(--accent-text)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.4,
              }}
            >
              {executionOutput}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
