/**
 * api/verify-payment.js
 * POST /api/verify-payment
 *
 * Responsibilities (in order):
 *   1. Guard: RAZORPAY_KEY_SECRET must be non-empty (missing = forgeable HMAC)
 *   2. Validate plan (prototype-pollution-safe)
 *   3. Verify Razorpay HMAC SHA256 signature with timingSafeEqual
 *   4. Validate + sanitize form inputs (email format, CRLF stripping, truncation)
 *   5. Save to MongoDB (idempotent via unique index on razorpayOrderId)
 *   6. Alert operator on DB failure (fire-and-forget Slack/webhook)
 *   7. Send confirmation email via Resend (fire-and-forget)
 *
 * A 200 response means: payment is cryptographically verified.
 * DB/email failures are logged but do NOT cause a non-200 response.
 */

import crypto        from 'crypto';
import { Resend }    from 'resend';
import clientPromise from '../lib/mongodb.js';
import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js';

// Singleton Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Indexes created once per cold start, not on every warm request
let indexesEnsured = false;

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // ── Guard: empty RAZORPAY_KEY_SECRET → predictable HMAC → signature forgery
  if (!process.env.RAZORPAY_KEY_SECRET) {
    console.error('[verify-payment] RAZORPAY_KEY_SECRET is not configured.');
    return res.status(500).json({ error: 'Payment verification is unavailable.' });
  }

  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
    // Applicant
    firstName, lastName, email, phone, college,
    // Preferences
    domain, mode, city, stipend,
    startDate, endDate, duration, note,
    // Plan & consent
    plan, consent,
  } = req.body || {};

  // ── 1. Presence check ────────────────────────────────────────────────────
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing Razorpay payment fields.' });
  }

  // Prototype-pollution-safe plan validation
  if (!plan || !Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  // DPDPA 2023: explicit consent is required for collecting personal data
  if (!consent) {
    return res.status(400).json({ error: 'Consent is required to process your application.' });
  }

  // ── 2. Verify Razorpay signature ─────────────────────────────────────────
  // Formula: HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
  // timingSafeEqual prevents timing-based signature forgery attacks.
  const sigPayload  = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedHex = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sigPayload)
    .digest('hex');

  let isValid = false;
  try {
    const sigBuf      = Buffer.from(razorpay_signature, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    isValid = sigBuf.length === expectedBuf.length &&
              crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    isValid = false;
  }

  // Extract only the first IP from the (potentially multi-value) header
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

  if (!isValid) {
    console.error('[verify-payment] Signature mismatch', {
      razorpay_order_id,
      razorpay_payment_id,
      ip: clientIp,
    });
    return res.status(400).json({
      error: 'Payment verification failed. Please contact support with your payment ID: ' + razorpay_payment_id,
    });
  }

  // ── 3. Sanitize inputs ───────────────────────────────────────────────────
  // Strip control characters (CRLF / tab injection) then trim and truncate
  const s = (v, max = 200) => String(v || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);

  // Validate email format — an invalid email means the confirmation never arrives
  const emailVal = s(email, 200).toLowerCase();
  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const amount = PLAN_AMOUNTS[plan];

  const doc = {
    // Applicant
    firstName:  s(firstName, 100),
    lastName:   s(lastName, 100),
    email:      emailVal,
    phone:      s(phone, 20),
    college:    s(college, 300),
    // Preferences
    domain:     s(domain, 200),
    mode:       s(mode, 50),
    city:       city ? s(city, 100) : null,
    stipend:    s(stipend, 50),
    startDate:  s(startDate, 20),
    endDate:    s(endDate, 20),
    duration:   s(duration, 100),
    note:       note ? s(note, 2000) : null,
    // Plan & Payment
    plan,
    planName:          PLAN_NAMES[plan],
    amount,                              // INR integer
    amountPaise:       amount * 100,     // paise integer (accounting safe)
    razorpayOrderId:   razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    paymentStatus:     'paid',
    // Consent (DPDPA 2023)
    consentGiven:     true,
    consentTimestamp: new Date(),
    // Meta
    createdAt: new Date(),
    ipAddress: clientIp ? s(clientIp, 45) : null,
  };

  // ── 4. Save to MongoDB ────────────────────────────────────────────────────
  try {
    const client = await clientPromise;
    const col    = client.db('certifybridge').collection('applications');

    // ensureIndexes runs only once per cold start (module-level flag)
    await ensureIndexes(col);

    // insertOne with unique index on razorpayOrderId:
    //   - First call  → saves the document
    //   - Retry call  → throws error code 11000 (duplicate key) → silently ignored
    await col.insertOne(doc);
    console.log('[verify-payment] Application saved:', razorpay_order_id);

  } catch (dbErr) {
    if (dbErr.code === 11000) {
      // Duplicate — already saved on a previous attempt. Safe to ignore.
      console.log('[verify-payment] Duplicate save ignored:', razorpay_order_id);
    } else {
      // Real DB error — payment is confirmed but record is missing.
      // Alert operator immediately so no application is silently lost.
      console.error('[verify-payment] MongoDB save error:', dbErr.message);
      if (process.env.ALERT_WEBHOOK_URL) {
        fetch(process.env.ALERT_WEBHOOK_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            text: `[AstraForge] DB save failed — payment ${razorpay_payment_id} (order ${razorpay_order_id}): ${dbErr.message}`,
          }),
        }).catch(() => {}); // fire-and-forget
      }
    }
  }

  // ── 5. Send confirmation email (fire-and-forget) ──────────────────────────
  // Pass the already-sanitised doc values — no double-sanitisation
  sendConfirmationEmail(doc)
    .catch(err => console.error('[verify-payment] Email error (non-blocking):', err.message));

  return res.status(200).json({ success: true });
}

// ── Index setup (once per cold start) ────────────────────────────────────────

async function ensureIndexes(col) {
  if (indexesEnsured) return;
  // Run both in parallel — halves cold-start DB setup time
  await Promise.all([
    col.createIndex(
      { razorpayOrderId: 1 },
      { unique: true, sparse: true, name: 'razorpayOrderId_unique' }
    ),
    col.createIndex({ email: 1 }, { name: 'email_lookup' }),
  ]);
  indexesEnsured = true;
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

function he(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

// ── Confirmation email ────────────────────────────────────────────────────────

async function sendConfirmationEmail(doc) {
  const {
    firstName, email,
    domain, mode, city, duration, startDate, endDate, stipend,
    planName, amount, razorpayPaymentId,
  } = doc;

  const modeDisplay  = city ? `${mode} · ${city}` : mode;
  const amountFmt    = `₹${amount.toLocaleString('en-IN')}`;
  const companyName  = process.env.COMPANY_NAME  || 'CertifyBridge';
  const supportEmail = process.env.SUPPORT_EMAIL || 'contact@certifybridge.com';
  const waNumber     = process.env.WHATSAPP_NUMBER || '';

  const { data, error } = await resend.emails.send({
    from:     process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to:       [email],
    reply_to: supportEmail,
    subject:  `Your Internship Application is Confirmed — ${planName} | ${companyName}`,
    text: [
      `Hi ${firstName},`,
      '',
      `Your internship application has been confirmed and your payment of ${amountFmt} is received.`,
      '',
      `Plan: ${planName}`,
      `Domain: ${domain}`,
      `Mode: ${modeDisplay}`,
      `Duration: ${duration} (${startDate} → ${endDate})`,
      `Stipend Range: ${stipend}`,
      `Payment ID: ${razorpayPaymentId}`,
      '',
      `Our team will review your details and share all resources within 24 hours.`,
      '',
      `Questions? Email us at ${supportEmail}${waNumber ? ` or WhatsApp: +${waNumber}` : ''}.`,
      '',
      `— Team ${companyName}`,
    ].join('\n'),
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Application Confirmed</title>
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
                <td style="padding-left:8px;font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">${he(companyName)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Confirmed badge -->
        <tr>
          <td style="padding:0 40px 8px;">
            <span style="background:#0000ee;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:100px;text-transform:uppercase;letter-spacing:1px;">
              ✓ &nbsp;Confirmed
            </span>
          </td>
        </tr>

        <!-- Headline -->
        <tr>
          <td style="padding:12px 40px 8px;">
            <h1 style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1.1;">
              We've got you, ${he(firstName)}! 🎉
            </h1>
          </td>
        </tr>

        <!-- Body text -->
        <tr>
          <td style="padding:12px 40px 28px;">
            <p style="margin:0;font-size:15px;color:#ffffffb3;line-height:1.7;">
              Your internship application has been successfully registered and your
              payment is confirmed. Our team will review your details and share all
              resources as per your <strong style="color:#0000ee;">${he(planName)}</strong>
              within <strong style="color:#fff;">24 hours</strong>.
            </p>
          </td>
        </tr>

        <!-- Summary table -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#ffffff08;border:1px solid #ffffff1a;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;width:40%;">Plan</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:14px;color:#fff;font-weight:600;">${he(planName)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Domain</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:14px;color:#fff;font-weight:600;">${he(domain)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Mode</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:14px;color:#fff;font-weight:600;">${he(modeDisplay)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Duration</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:14px;color:#fff;font-weight:600;">${he(duration)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Stipend Range</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:14px;color:#fff;font-weight:600;">${he(stipend)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Payment ID</td>
                <td style="padding:14px 16px;border-bottom:1px solid #ffffff12;font-size:12px;color:#ffffff66;font-family:monospace;">${he(razorpayPaymentId)}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;font-size:12px;color:#ffffff66;text-transform:uppercase;letter-spacing:.5px;">Amount Paid</td>
                <td style="padding:14px 16px;font-size:20px;font-weight:900;color:#0000ee;letter-spacing:-0.5px;">${he(amountFmt)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Contact -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="margin:0 0 16px;font-size:14px;color:#ffffff66;line-height:1.6;">
              Need help? Reach us at any time:
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:10px;">
                  <a href="mailto:${he(supportEmail)}"
                     style="display:inline-flex;align-items:center;gap:6px;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:100px;padding:8px 16px;font-size:13px;font-weight:500;color:#ffffffb3;text-decoration:none;">
                    ✉️ &nbsp;${he(supportEmail)}
                  </a>
                </td>
                ${waNumber ? `
                <td>
                  <a href="https://wa.me/${he(waNumber)}"
                     style="display:inline-flex;align-items:center;gap:6px;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:100px;padding:8px 16px;font-size:13px;font-weight:500;color:#ffffffb3;text-decoration:none;">
                    💬 &nbsp;WhatsApp
                  </a>
                </td>` : ''}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #ffffff0d;">
            <p style="margin:0;font-size:12px;color:#ffffff33;line-height:1.5;">
              This is an automated confirmation from ${he(companyName)}.<br>
              Please keep this email as proof of your payment (ID: ${he(razorpayPaymentId)}).
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error('[verify-payment] Resend error:', error);
  } else {
    console.log('[verify-payment] Email sent, id:', data?.id);
  }
}
