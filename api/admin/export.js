/**
 * api/admin/export.js
 * GET /api/admin/export
 *
 * Exports applications as CSV with current filters applied.
 * UTF-8 BOM included for Excel compatibility.
 * RFC 4180 escaping for fields containing commas, quotes, or newlines.
 * Capped at 5000 rows to prevent serverless timeout.
 */

import { requireAdmin } from '../../lib/adminAuth.js';
import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS, ensureIndexes } from '../../lib/mongodb.js';
import { buildAdminFilter } from '../../lib/admin-filters.js';

const MAX_ROWS = 5000;

const PROJECTION = {
  ipAddress: 0,
  consentTimestamp: 0,
  razorpaySignature: 0,
};

const COLUMNS = [
  { key: 'firstName',         label: 'First Name' },
  { key: 'lastName',          label: 'Last Name' },
  { key: 'email',             label: 'Email' },
  { key: 'phone',             label: 'Phone' },
  { key: 'college',           label: 'College' },
  { key: 'domain',            label: 'Domain' },
  { key: 'mode',              label: 'Mode' },
  { key: 'city',              label: 'City' },
  { key: 'stipend',           label: 'Stipend' },
  { key: 'startDate',         label: 'Start Date' },
  { key: 'endDate',           label: 'End Date' },
  { key: 'durationStr',       label: 'Duration' },
  { key: 'note',              label: 'Note' },
  { key: 'plan',              label: 'Plan' },
  { key: 'planName',          label: 'Plan Name' },
  { key: 'amount',            label: 'Amount (INR)' },
  { key: 'razorpayOrderId',   label: 'Razorpay Order ID' },
  { key: 'razorpayPaymentId', label: 'Razorpay Payment ID' },
  { key: 'paymentStatus',     label: 'Payment Status' },
  { key: 'adminStatus',       label: 'Admin Status' },
  { key: 'adminReason',       label: 'Admin Reason' },
  { key: 'statusUpdatedAt',   label: 'Status Updated At' },
  { key: 'source',            label: 'Source' },
  { key: 'createdAt',         label: 'Created At' },
];

/** RFC 4180: escape fields containing comma, double-quote, or newline */
function csvField(val) {
  if (val == null) return '';
  let str = val instanceof Date
    ? val.toISOString()
    : String(val);
  // Defang formula injection (Excel/LibreOffice interpret =, +, -, @ as formulas)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!requireAdmin(req, res)) return;

  // ── Build filter (shared with applications.js) ────────────────────────────
  const filter = buildAdminFilter(req.query);

  // ── Query + build CSV ─────────────────────────────────────────────────────
  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);
    await ensureIndexes(col);

    const docs = await col.find(filter, { projection: PROJECTION })
      .sort({ createdAt: -1 })
      .limit(MAX_ROWS)
      .toArray();

    // Header row
    const header = COLUMNS.map(c => c.label).join(',');

    // Data rows
    const rows = docs.map(doc => {
      // Normalize legacy docs
      if (!doc.adminStatus) doc.adminStatus = 'paid';
      return COLUMNS.map(c => csvField(doc[c.key])).join(',');
    });

    // UTF-8 BOM + CSV content
    const csv = '\uFEFF' + header + '\r\n' + rows.join('\r\n') + '\r\n';

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="certifybridge-applications-${today}.csv"`);
    return res.status(200).end(csv);

  } catch (err) {
    console.error('[admin/export] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not export applications.' });
  }
}
