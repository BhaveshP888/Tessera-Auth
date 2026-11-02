import { z } from 'zod';

/**
 * Local audit log event types.
 */
export const AuditEventTypeSchema = z.enum([
  'sync_push',
  'sync_pull',
  'key_generated',
  'master_key_exported',
  'master_key_imported',
  'device_registered',
  'device_revoked',
  'extension_installed',
  'extension_revoked',
  'extension_rpc_executed',
  'extension_rpc_denied',
  'export_data',
  'database_wiped',
  'vault_setup',
  'vault_unlocked',
  'vault_locked',
  'vault_pin_failed',
  'vault_wiped',
  'vault_sync_enabled',
  'vault_sync_disabled',
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

/**
 * Audit event log entry.
 */
export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  type: AuditEventTypeSchema,
  status: z.enum(['success', 'warning', 'error']),
  timestamp: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
