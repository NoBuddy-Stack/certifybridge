/**
 * api/admin/applications.js
 * GET /api/admin/applications
 *
 * Returns a paginated, filterable list of internship applications.
 * All requests require a valid ADMIN_TOKEN via Bearer header.
 *
 * Query params:
 *   page     - Page number (default 1)
 *   plan     - Filter by plan (noob|pro|hacker)
 *   status   - Filter by adminStatus
 *   search   - Case-insensitive substring match on name, email, college, orderId
 *   dateFrom - Filter createdAt >= (ISO date string)
 *   dateTo   - Filter createdAt <= (ISO date string)
 */

import { requireAdmin } from '../../lib/adminAuth.js';
import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS, ensureIndexes } from '../../lib/mongodb.js';
import { buildAdminFilter } from '../../lib/admin-filters.js';

const PAGE_SIZE = 25;

const PROJECTION = {
  ipAddress: 0,
  consentTimestamp: 0,
  razorpaySignature: 0,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!requireAdmin(req, res)) return;

  const { page: pageStr } = req.query || {};

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // ── Build filter ──────────────────────────────────────────────────────────
  const filter = buildAdminFilter(req.query);

  // ── Query ─────────────────────────────────────────────────────────────────
  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);
    await ensureIndexes(col);

    const [applications, total] = await Promise.all([
      col.find(filter, { projection: PROJECTION })
         .sort({ createdAt: -1 })
         .skip(skip)
         .limit(PAGE_SIZE)
         .toArray(),
      col.countDocuments(filter),
    ]);

    return res.status(200).json({
      applications,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE) || 1,
    });

  } catch (err) {
    console.error('[admin/applications] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve applications.' });
  }
}
