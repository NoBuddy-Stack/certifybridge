/**
 * lib/admin-filters.js
 * Shared filter builder for admin dashboard endpoints.
 */

import { ALL_STATUSES } from './admin-transitions.js';
import { PLANS } from './plans.js';

/**
 * Builds a MongoDB filter object from admin query parameters.
 * Used by both the list and export endpoints.
 *
 * @param {object} query - { plan, status, search, dateFrom, dateTo }
 * @returns {object} MongoDB filter
 */
export function buildAdminFilter(query) {
  const { plan, status, search, dateFrom, dateTo } = query || {};
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
        const end = new Date(ms);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
  }

  return filter;
}
