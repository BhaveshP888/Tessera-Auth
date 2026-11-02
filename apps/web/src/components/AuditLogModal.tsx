import React from 'react';
import { X, Shield, Download } from 'lucide-react';
import type { AuditEvent } from '@tessera/schemas';

import { useLibraryStore } from '../store/useLibraryStore.js';
import { useUIStore } from '../store/useUIStore.js';

export interface AuditLogModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  auditLogs?: AuditEvent[];
}

export const AuditLogModal: React.FC<AuditLogModalProps> = (props) => {
  const storeIsOpen = useUIStore((s) => s.activeModal === 'audit');
  const storeCloseModal = useUIStore((s) => s.closeModal);
  const storeAuditLogs = useLibraryStore((s) => s.auditLogs);

  const isOpen = props.isOpen !== undefined ? props.isOpen : storeIsOpen;
  const onClose = props.onClose || storeCloseModal;
  const auditLogs = props.auditLogs || storeAuditLogs;

  if (!isOpen) return null;

  const handleExportLogs = () => {
    const payload = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tessera-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActionColor = (actionStr?: string): string => {
    if (!actionStr || typeof actionStr !== 'string') return 'var(--text-secondary)';
    const act = actionStr.toLowerCase();
    if (act.includes('create') || act.includes('unlocked') || act.includes('generate')) return 'var(--green)';
    if (act.includes('delete') || act.includes('wiped') || act.includes('failed') || act.includes('error')) return 'var(--rose)';
    if (act.includes('sync') || act.includes('push') || act.includes('pull')) return 'var(--accent)';
    if (act.includes('vault') || act.includes('key')) return 'var(--amber)';
    return 'var(--text-secondary)';
  };

  const logs = Array.isArray(auditLogs) ? auditLogs : [];

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
            <Shield size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <h3 style={{ fontSize: '14.5px', fontWeight: 600 }}>Local Audit Log</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Tamper-evident log of all cryptographic and library events
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleExportLogs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
              }}
            >
              <Download size={12} />
              <span>Export</span>
            </button>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', padding: '4px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Log Entries List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No audit logs recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {logs.map((log) => {
                const eventType = log.type || (log as any).action || 'event';
                const eventTime = log.timestamp || (log as any).createdAt || new Date().toISOString();
                const color = getActionColor(eventType);
                let formattedTime = '';
                try {
                  const d = new Date(eventTime);
                  formattedTime = `${d.toLocaleTimeString()} · ${d.toLocaleDateString()}`;
                } catch {
                  formattedTime = eventTime;
                }

                return (
                  <div
                    key={log.id || Math.random().toString()}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color, fontWeight: 600, flexShrink: 0 }}>
                        {eventType}
                      </span>
                      {log.status && log.status !== 'success' && (
                        <span style={{ fontSize: '10px', color: 'var(--rose)', background: 'var(--rose-dim)', padding: '1px 4px', borderRadius: '3px' }}>
                          {log.status}
                        </span>
                      )}
                      {log.errorMessage && (
                        <span style={{ color: 'var(--rose)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>
                          {log.errorMessage}
                        </span>
                      )}
                    </div>

                    <span style={{ color: 'var(--text-muted)', fontSize: '10.5px', flexShrink: 0 }}>
                      {formattedTime}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
