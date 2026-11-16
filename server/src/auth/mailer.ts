import nodemailer, { type Transporter } from 'nodemailer';

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

let transporterInstance: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env['SMTP_HOST'];
  if (!host) return null;

  if (!transporterInstance) {
    const port = Number(process.env['SMTP_PORT'] || 587);
    const secure = process.env['SMTP_SECURE'] === 'true' || port === 465;
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];

    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
  return transporterInstance;
}

function buildHtmlTemplate(code: string, expiresInMinutes: number, purpose: string): string {
  const title = purpose === 'registration' ? 'Verify Your Account' : 'Security Verification';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b0f19; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #131c2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
          <tr>
            <td style="padding: 32px 32px 20px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #38bdf8; letter-spacing: -0.5px;">Tessera</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Zero-Knowledge Knowledge Vault</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 24px 32px; text-align: center;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f8fafc;">${title}</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #94a3b8;">
                Use the verification code below to complete your ${purpose === 'registration' ? 'account registration' : 'verification'}. This code expires in ${expiresInMinutes} minutes.
              </p>
              <div style="background-color: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: monospace, 'Courier New', Courier; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${code}</span>
              </div>
              <p style="margin: 0; font-size: 12px; line-height: 1.4; color: #64748b;">
                If you did not request this code, you can safely ignore this email. Never share your verification code or master password with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0b1120; padding: 16px 32px; text-align: center; border-top: 1px solid #1e293b;">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Protected by End-to-End Zero-Knowledge Encryption • Tessera
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export const sendVerificationEmail = async (options: SendOtpOptions): Promise<SendOtpResult> => {
  const { to, code, expiresInMinutes, purpose = 'registration' } = options;
  const isDevOrTest = process.env['NODE_ENV'] !== 'production';

  const fromAddress = process.env['SMTP_FROM'] || process.env['EMAIL_FROM'] || 'Tessera <noreply@tessera.app>';
  const subject = `[Tessera] Your verification code is ${code}`;
  const textBody = `Your Tessera verification code is: ${code}\n\nThis code expires in ${expiresInMinutes} minutes.\nIf you did not request this, please ignore this email.`;
  const htmlBody = buildHtmlTemplate(code, expiresInMinutes, purpose);

  // 1. Resend API support (Direct HTTP without SMTP socket)
  const resendApiKey = process.env['RESEND_API_KEY'];
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Tessera Mailer] Resend API error:', errorText);
        return { success: false, error: 'Failed to deliver verification email via Resend' };
      }

      console.info(`[Tessera Mailer] Dispatched email to ${to} via Resend API`);
      return { success: true };
    } catch (err: unknown) {
      console.error(`[Tessera Mailer] Failed to dispatch via Resend:`, err);
      return { success: false, error: 'Failed to deliver verification email' };
    }
  }

  // 2. Standard SMTP Transport (Nodemailer)
  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });

      console.info(
        `[Tessera Mailer] Dispatched verification email to ${to} via SMTP (${process.env['SMTP_HOST']})`,
      );
      return { success: true };
    } catch (err: unknown) {
      console.error(`[Tessera Mailer] Failed to send email to ${to}:`, err);
      return { success: false, error: 'Failed to deliver verification email via SMTP' };
    }
  }

  // 3. Developer / Console Fallback
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
