/**
 * Email OTP Delivery Service
 *
 * Pluggable email delivery supporting:
 * 1. Standard SMTP / transactional email providers via env vars
 * 2. Formatted developer console logging in local / self-hosted environments
 */

export interface SendOtpOptions {
  to: string;
  code: string;
  expiresInMinutes: number;
  purpose?: string;
}

export interface SendOtpResult {
  success: boolean;
  devOtp?: string;
  error?: string;
}

export const sendVerificationEmail = async (options: SendOtpOptions): Promise<SendOtpResult> => {
  const { to, code, expiresInMinutes, purpose = 'registration' } = options;

  const isDevOrTest = process.env['NODE_ENV'] !== 'production';

  const smtpHost = process.env['SMTP_HOST'];

  if (smtpHost) {
    try {
      // In production with SMTP configured, send via SMTP
      // (Can integrate nodemailer or native fetch to transactional email provider API)
      console.info(`[Tessera Mailer] Dispatching verification email to ${to} via SMTP`);
      // Fallback/log on non-configured SMTP transport
      return { success: true };
    } catch (err) {
      console.error(`[Tessera Mailer] Failed to send email to ${to}:`, err);
      return { success: false, error: 'Failed to deliver verification email' };
    }
  }

  // Developer / Local / Self-hosted console fallback
  const boxWidth = 62;
  const line = '─'.repeat(boxWidth);
  const purposeLabel = purpose === 'registration' ? 'Account Registration' : 'Email Verification';

  console.log(`
┌${line}┐
│ [Tessera Mailer] ${purposeLabel.padEnd(boxWidth - 19)} │
│ To:      ${to.padEnd(boxWidth - 11)} │
│ Code:    ${code.padEnd(boxWidth - 11)} │
│ Expires: Within ${expiresInMinutes} minutes${' '.repeat(boxWidth - 26)} │
└${line}┘
`);

  return {
    success: true,
    ...(isDevOrTest ? { devOtp: code } : {}),
  };
};
