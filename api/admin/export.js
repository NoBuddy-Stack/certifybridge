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
import { ALL_STATUSES } from '../../lib/admin-transitions.js';
import { PLANS } from '../../lib/plans.js';

const MAX_ROWS = 5000;

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
  const str = val instanceof Date
    ? val.toISOString()
    : String(val);
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

  const { plan, status, search, dateFrom, dateTo } = req.query || {};

  // ── Build filter (same logic as applications.js) ──────────────────────────
  const filter = {};

  if (plan && Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    filter.plan = plan;
  }

  if (status && ALL_STATUSES.includes(status)) {
    if (status === 'paid') {
      filter.adminStatus = { $in: ['paid', null] };
    } else {
      filter.adminStatus = status;
    }
  }

  if (search && typeof search === 'string') {
    const term = search.trim().slice(0, 200);
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { firstName:        { $regex: escaped, $options: 'i' } },
        { lastName:         { $regex: escaped, $options: 'i' } },
        { email:            { $regex: escaped, $options: 'i' } },
        { college:          { $regex: escaped, $options: 'i' } },
        { razorpayOrderId:  { $regex: escaped, $options: 'i' } },
      ];
    }
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      const ms = Date.parse(dateFrom);
      if (!isNaN(ms)) filter.createdAt.$gte = new Date(ms);
    }
    if (dateTo) {
      const ms = Date.parse(dateTo);
      if (!isNaN(ms)) {
        const end = new Date(ms);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
  }

  // ── Query + build CSV ─────────────────────────────────────────────────────
  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);
    await ensureIndexes(col);

    const docs = await col.find(filter)
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
