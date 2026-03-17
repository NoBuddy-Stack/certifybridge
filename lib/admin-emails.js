/**
 * lib/admin-emails.js
 * Status-change email templates for admin dashboard.
 *
 * Follows the same Resend pattern as verify-payment.js:
 * - Both text and HTML bodies
 * - Inline HTML escaping via he()
 * - Table-based email layout for client compatibility
 * - Fire-and-forget: returns { sent, error? } — never throws
 */

import { Resend } from 'resend';

// ── Lazy Resend singleton (reused across warm starts) ───────────────────────────
let _resend;
function getResend() {
  if (!_resend && process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// ── HTML escaping ───────────────────────────────────────────────────────────────

function he(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Shared config ───────────────────────────────────────────────────────────────

function getConfig() {
  return {
    companyName:  process.env.COMPANY_NAME  || 'CertifyBridge',
    supportEmail: process.env.SUPPORT_EMAIL || 'contact@certifybridge.com',
    fromEmail:    process.env.FROM_EMAIL    || 'onboarding@resend.dev',
    waNumber:     process.env.WHATSAPP_NUMBER || '',
  };
}

function contactBlock(cfg) {
  return `
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:10px;">
          <a href="mailto:${he(cfg.supportEmail)}"
             style="display:inline-block;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:100px;padding:8px 16px;font-size:13px;font-weight:500;color:#ffffffb3;text-decoration:none;">
            ${he(cfg.supportEmail)}
          </a>
        </td>
        ${cfg.waNumber ? `
        <td>
          <a href="https://wa.me/${he(cfg.waNumber)}"
             style="display:inline-block;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:100px;padding:8px 16px;font-size:13px;font-weight:500;color:#ffffffb3;text-decoration:none;">
            WhatsApp
          </a>
        </td>` : ''}
      </tr>
    </table>`;
}

function emailWrapper(cfg, badge, badgeColor, headline, bodyHtml, footerText) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${he(badge)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#000;border-radius:16px;overflow:hidden;border:1px solid #ffffff1a;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:8px;height:8px;background:#0000ee;border-radius:50%;box-shadow:0 0 8px #0000ee;"></td>
                <td style="padding-left:8px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">${he(cfg.companyName)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Badge -->
        <tr>
          <td style="padding:0 40px 8px;">
            <span style="background:${badgeColor};color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:100px;text-transform:uppercase;letter-spacing:1px;">
              ${he(badge)}
            </span>
          </td>
        </tr>
        <!-- Headline -->
        <tr>
          <td style="padding:12px 40px 8px;">
            <h1 style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1.1;">
              ${headline}
            </h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:12px 40px 28px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Contact -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#ffffff66;line-height:1.6;">
              Need help? Reach us at any time:
            </p>
            ${contactBlock(cfg)}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #ffffff0d;">
            <p style="margin:0;font-size:12px;color:#ffffff33;line-height:1.5;">
              ${he(footerText)}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send helper ─────────────────────────────────────────────────────────────────

async function send(to, subject, text, html) {
  const resend = getResend();
  if (!resend) {
    console.warn('[admin-emails] RESEND_API_KEY not configured, skipping email.');
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }
  const cfg = getConfig();
  const { data, error } = await resend.emails.send({
    from:     cfg.fromEmail,
    to:       [to],
    reply_to: cfg.supportEmail,
    subject,
    text,
    html,
  });
  if (error) {
    console.error('[admin-emails] Resend error:', error);
    return { sent: false, error: error.message || String(error) };
  }
  console.log('[admin-emails] Email sent, id:', data?.id);
  return { sent: true };
}

// ── Approval email ──────────────────────────────────────────────────────────────

export async function sendApprovalEmail(doc) {
  const cfg = getConfig();
  const name = doc.firstName || 'Applicant';

  const text = [
    `Hi ${name},`,
    '',
    `Great news! Your internship application has been approved.`,
    '',
    `Plan: ${doc.planName}`,
    `Domain: ${doc.domain}`,
    '',
    `Our team will share your onboarding resources and offer letter shortly.`,
    '',
    `Questions? Email us at ${cfg.supportEmail}${cfg.waNumber ? ` or WhatsApp: +${cfg.waNumber}` : ''}.`,
    '',
    `— Team ${cfg.companyName}`,
  ].join('\n');

  const html = emailWrapper(
    cfg,
    'Approved',
    '#22c55e',
    `You're in, ${he(name)}!`,
    `<p style="margin:0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      Your internship application for <strong style="color:#0000ee;">${he(doc.planName)}</strong>
      in <strong style="color:#fff;">${he(doc.domain)}</strong> has been approved.
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      Our team will share your onboarding resources and offer letter shortly.
      Keep an eye on your inbox.
    </p>`,
    `This is an automated notification from ${cfg.companyName}.`,
  );

  return send(doc.email, `Application Approved — ${doc.planName} | ${cfg.companyName}`, text, html);
}

// ── Rejection email ─────────────────────────────────────────────────────────────

export async function sendRejectionEmail(doc, reason) {
  const cfg  = getConfig();
  const name = doc.firstName || 'Applicant';

  const reasonLine = reason
    ? `Reason: ${reason}`
    : 'No specific reason was provided.';

  const text = [
    `Hi ${name},`,
    '',
    `We've reviewed your internship application and unfortunately we're unable to proceed at this time.`,
    '',
    reasonLine,
    '',
    `If you believe this was a mistake or have questions, please reach out to us at ${cfg.supportEmail}.`,
    '',
    `— Team ${cfg.companyName}`,
  ].join('\n');

  const reasonHtml = reason
    ? `<div style="margin:16px 0 0;padding:16px;background:#ffffff08;border:1px solid #ffffff1a;border-radius:8px;">
        <p style="margin:0;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Reason</p>
        <p style="margin:8px 0 0;font-size:14px;color:#ffffffb3;line-height:1.6;">${he(reason)}</p>
      </div>`
    : '';

  const html = emailWrapper(
    cfg,
    'Update',
    '#ff4444',
    `Application Update, ${he(name)}`,
    `<p style="margin:0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      We've reviewed your internship application and unfortunately we're unable
      to proceed at this time.
    </p>
    ${reasonHtml}
    <p style="margin:16px 0 0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      If you believe this was a mistake, please reach out to us.
    </p>`,
    `This is an automated notification from ${cfg.companyName}.`,
  );

  return send(doc.email, `Application Update — ${cfg.companyName}`, text, html);
}

// ── Certificate issued email ────────────────────────────────────────────────────

export async function sendCertificateIssuedEmail(doc) {
  const cfg  = getConfig();
  const name = doc.firstName || 'Applicant';

  const text = [
    `Hi ${name},`,
    '',
    `Your internship completion certificate has been issued!`,
    '',
    `Plan: ${doc.planName}`,
    `Domain: ${doc.domain}`,
    '',
    `You'll receive your certificate and related documents via email shortly.`,
    '',
    `Questions? Email us at ${cfg.supportEmail}${cfg.waNumber ? ` or WhatsApp: +${cfg.waNumber}` : ''}.`,
    '',
    `— Team ${cfg.companyName}`,
  ].join('\n');

  const html = emailWrapper(
    cfg,
    'Certificate Issued',
    '#0000ee',
    `Certificate ready, ${he(name)}!`,
    `<p style="margin:0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      Your internship completion certificate for
      <strong style="color:#0000ee;">${he(doc.planName)}</strong>
      in <strong style="color:#fff;">${he(doc.domain)}</strong> has been issued.
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#ffffffb3;line-height:1.7;">
      You'll receive your certificate and related documents via email shortly.
    </p>`,
    `This is an automated notification from ${cfg.companyName}.`,
  );

  return send(doc.email, `Certificate Issued — ${doc.planName} | ${cfg.companyName}`, text, html);
}

/** Map status → email sender for use in the PATCH handler */
export const EMAIL_SENDERS = Object.assign(Object.create(null), {
  approved:           sendApprovalEmail,
  rejected:           sendRejectionEmail,
  certificate_issued: sendCertificateIssuedEmail,
});
