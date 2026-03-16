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
import { ALL_STATUSES } from '../../lib/admin-transitions.js';
import { PLANS } from '../../lib/plans.js';

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

  const { page: pageStr, plan, status, search, dateFrom, dateTo } = req.query || {};

  // ── Pagination ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // ── Build filter ──────────────────────────────────────────────────────────
  const filter = {};

  // Plan filter — validate against known plans
  if (plan && Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    filter.plan = plan;
  }

  // Status filter — treat 'paid' as including legacy docs (adminStatus: null)
  if (status && ALL_STATUSES.includes(status)) {
    if (status === 'paid') {
      filter.adminStatus = { $in: ['paid', null] };
    } else {
      filter.adminStatus = status;
    }
  }

  // Search — case-insensitive substring on multiple fields
  if (search && typeof search === 'string') {
    const term = search.trim().slice(0, 200);
    if (term) {
      // Escape regex special characters to prevent injection
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

  // Date range on createdAt
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      const ms = Date.parse(dateFrom);
      if (!isNaN(ms)) filter.createdAt.$gte = new Date(ms);
    }
    if (dateTo) {
      const ms = Date.parse(dateTo);
      if (!isNaN(ms)) {
        // Include the entire end day
        const end = new Date(ms);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    // Clean up empty object
    if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
  }

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
      totalPages: Math.ceil(total / PAGE_SIZE) || 1,
    });

  } catch (err) {
    console.error('[admin/applications] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve applications.' });
  }
}
