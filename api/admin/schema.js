/**
 * api/admin/schema.js
 * GET /api/admin/schema
 *
 * Returns workflow metadata (statuses, transitions, labels, colors, plans, pageSize)
 * so the frontend and agents can discover valid values without hardcoding.
 */

import { requireAdmin } from '../../lib/adminAuth.js';
import { TRANSITIONS, ALL_STATUSES, STATUS_LABELS, STATUS_COLORS } from '../../lib/admin-transitions.js';
import { PLANS } from '../../lib/plans.js';

const PAGE_SIZE = 25;

// Pre-build the response once (immutable data)
const SCHEMA = {
  statuses:    ALL_STATUSES,
  transitions: TRANSITIONS,
  statusLabels: STATUS_LABELS,
  statusColors: STATUS_COLORS,
  plans:       Object.keys(PLANS),
  planDetails: PLANS,
  pageSize:    PAGE_SIZE,
};

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!requireAdmin(req, res)) return;

  return res.status(200).json(SCHEMA);
}
