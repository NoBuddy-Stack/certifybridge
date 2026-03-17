/**
 * api/admin/applications/[id].js
 * GET   /api/admin/applications/:id  — Fetch single application
 * PATCH /api/admin/applications/:id  — Update adminStatus
 *
 * Body (PATCH):
 *   status         - Target status (required)
 *   reason         - Rejection reason (optional, used when status='rejected')
 *   expectedStatus - Optimistic concurrency guard (optional but recommended)
 */

import { ObjectId } from 'mongodb';
import { requireAdmin } from '../../../lib/adminAuth.js';
import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS, COLLECTION_AUDIT_LOG, ensureIndexes } from '../../../lib/mongodb.js';
import { isValidTransition, TRANSITIONS } from '../../../lib/admin-transitions.js';
import { EMAIL_SENDERS } from '../../../lib/admin-emails.js';
import { checkRateLimit } from '../../../lib/rate-limit.js';

export const config = { api: { bodyParser: { sizeLimit: '10kb' } } };

const PROJECTION = {
  ipAddress: 0,
  consentTimestamp: 0,
  razorpaySignature: 0,
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!requireAdmin(req, res)) return;

  // ── Parse ID from URL ─────────────────────────────────────────────────────
  const { id } = req.query || {};

  if (!id || typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid application ID.' });
  }

  // ── Shared: get collection ──────────────────────────────────────────────────
  let col, db;
  try {
    const client = await clientPromise;
    db  = client.db(DB_NAME);
    col = db.collection(COLLECTION_APPLICATIONS);
    await ensureIndexes(col);
  } catch (err) {
    console.error('[admin/applications/[id]] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not connect to database.' });
  }

  // ── GET: return single application ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const doc = await col.findOne({ _id: new ObjectId(id) }, { projection: PROJECTION });
      if (!doc) {
        return res.status(404).json({ error: 'Application not found.' });
      }
      const status = doc.adminStatus || 'paid';
      const allowedTransitions = TRANSITIONS[status] || [];
      return res.status(200).json({ application: doc, allowedTransitions });
    } catch (err) {
      console.error('[admin/applications/[id]] GET error:', err.message);
      return res.status(500).json({ error: 'Could not retrieve application.' });
    }
  }

  // ── PATCH: update status ────────────────────────────────────────────────────

  // Stricter rate limit for mutations (x-real-ip is set by Vercel and not spoofable)
  const ip = req.headers['x-real-ip']
    || (req.headers['x-forwarded-for'] || '').split(',').pop().trim()
    || 'unknown';
  if (!checkRateLimit(ip, { max: 10, windowMs: 60_000, key: 'admin-update' })) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests.' });
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

  // ── Persistent audit log (fire-and-forget) ────────────────────────────────
  try {
    const auditCol = db.collection(COLLECTION_AUDIT_LOG);
    auditCol.insertOne({
      applicationId: new ObjectId(id),
      fromStatus:    currentStatus,
      toStatus:      newStatus,
      reason:        sanitizedReason || null,
      adminIp:       ip,
      timestamp:     new Date(),
    });
  } catch (err) {
    console.error('[admin/applications/[id]] Audit log error (non-blocking):', err.message);
  }

  // ── Trigger email (fire-and-forget) ───────────────────────────────────────
  let emailSent = false;
  const emailSender = EMAIL_SENDERS[newStatus];

  if (emailSender) {
    if (!doc.email) {
      console.warn('[admin/applications/[id]] No email on file, skipping email:', id);
      return res.status(200).json({
        success: true,
        emailSent: false,
        application: { _id: id, adminStatus: newStatus, statusUpdatedAt: update.$set.statusUpdatedAt },
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
    application: { _id: id, adminStatus: newStatus, statusUpdatedAt: update.$set.statusUpdatedAt },
  });
}
