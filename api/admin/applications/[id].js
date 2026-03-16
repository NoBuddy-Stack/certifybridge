/**
 * api/admin/applications/[id].js
 * PATCH /api/admin/applications/:id
 *
 * Updates the adminStatus of an application and triggers
 * the appropriate status-change email.
 *
 * Body:
 *   status         - Target status (required)
 *   reason         - Rejection reason (optional, used when status='rejected')
 *   expectedStatus - Optimistic concurrency guard (optional but recommended)
 */

import { ObjectId } from 'mongodb';
import { requireAdmin } from '../../../lib/adminAuth.js';
import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS, ensureIndexes } from '../../../lib/mongodb.js';
import { isValidTransition } from '../../../lib/admin-transitions.js';
import { EMAIL_SENDERS } from '../../../lib/admin-emails.js';
import { checkRateLimit } from '../../../lib/rate-limit.js';

export const config = { api: { bodyParser: { sizeLimit: '10kb' } } };

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!requireAdmin(req, res)) return;

  // Stricter rate limit for mutations
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(ip, { max: 10, windowMs: 60_000, key: 'admin-update' })) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests.' });
  }

  // ── Parse ID from URL ─────────────────────────────────────────────────────
  // Vercel populates req.query.id for [id].js dynamic routes.
  // Local server.js must also populate this.
  const { id } = req.query || {};

  if (!id || typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid application ID.' });
  }

  const { status: newStatus, reason, expectedStatus } = req.body || {};

  if (!newStatus || typeof newStatus !== 'string') {
    return res.status(400).json({ error: 'Status is required.' });
  }

  // Sanitize reason
  const sanitizedReason = reason
    ? String(reason).replace(/[\r\n\t]/g, ' ').trim().slice(0, 2000)
    : null;

  // ── Fetch current document ────────────────────────────────────────────────
  let doc;
  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);
    await ensureIndexes(col);

    doc = await col.findOne({ _id: new ObjectId(id) });
  } catch (err) {
    console.error('[admin/applications/[id]] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve application.' });
  }

  if (!doc) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const currentStatus = doc.adminStatus || 'paid';

  // ── Optimistic concurrency check ──────────────────────────────────────────
  if (expectedStatus) {
    const expected = expectedStatus === 'paid'
      ? [expectedStatus, null, undefined]
      : [expectedStatus];
    if (!expected.includes(doc.adminStatus)) {
      return res.status(409).json({
        error: 'Application was updated by another admin. Please refresh and try again.',
        currentStatus,
      });
    }
  }

  // ── Validate transition ───────────────────────────────────────────────────
  if (!isValidTransition(currentStatus, newStatus)) {
    return res.status(400).json({
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'.`,
      currentStatus,
    });
  }

  // ── Update MongoDB ────────────────────────────────────────────────────────
  const update = {
    $set: {
      adminStatus:    newStatus,
      statusUpdatedAt: new Date(),
    },
  };
  if (newStatus === 'rejected' && sanitizedReason) {
    update.$set.adminReason = sanitizedReason;
  }

  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);

    // Atomic update with status guard to prevent race conditions
    const statusFilter = currentStatus === 'paid'
      ? { adminStatus: { $in: ['paid', null] } }
      : { adminStatus: currentStatus };

    const result = await col.updateOne(
      { _id: new ObjectId(id), ...statusFilter },
      update,
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        error: 'Application was updated by another admin. Please refresh and try again.',
      });
    }
  } catch (err) {
    console.error('[admin/applications/[id]] Update error:', err.message);
    return res.status(500).json({ error: 'Could not update application.' });
  }

  console.log('[admin/applications/[id]] Status updated:', id, currentStatus, '→', newStatus);

  // ── Trigger email (fire-and-forget) ───────────────────────────────────────
  let emailSent = false;
  const emailSender = EMAIL_SENDERS[newStatus];

  if (emailSender) {
    if (!doc.email) {
      console.warn('[admin/applications/[id]] No email on file, skipping email:', id);
      return res.status(200).json({
        success: true,
        emailSent: false,
        warning: 'No email address on file — notification skipped.',
      });
    }

    try {
      const result = newStatus === 'rejected'
        ? await emailSender(doc, sanitizedReason)
        : await emailSender(doc);
      emailSent = result.sent;
    } catch (err) {
      console.error('[admin/applications/[id]] Email error (non-blocking):', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    emailSent,
  });
}
