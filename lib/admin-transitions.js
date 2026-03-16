/**
 * lib/admin-transitions.js
 * Status workflow definition for admin application management.
 *
 * Workflow:
 *   paid → under_review → approved → certificate_issued
 *                       ↘ rejected
 *
 * Both certificate_issued and rejected are terminal states.
 * Uses Object.create(null) to prevent prototype pollution (matching plans.js pattern).
 */

export const TRANSITIONS = Object.assign(Object.create(null), {
  paid:               ['under_review'],
  under_review:       ['approved', 'rejected'],
  approved:           ['certificate_issued'],
  rejected:           [],
  certificate_issued: [],
});

export const ALL_STATUSES = Object.keys(TRANSITIONS);

export const STATUS_LABELS = Object.assign(Object.create(null), {
  paid:               'Paid',
  under_review:       'Under Review',
  approved:           'Approved',
  rejected:           'Rejected',
  certificate_issued: 'Certificate Issued',
});

/** Hex colours for UI badges */
export const STATUS_COLORS = Object.assign(Object.create(null), {
  paid:               '#666666',
  under_review:       '#d4a017',
  approved:           '#22c55e',
  rejected:           '#ff4444',
  certificate_issued: '#0000ee',
});

/**
 * Returns true if transitioning from `from` to `to` is allowed.
 * Treats null/undefined `from` as 'paid' (legacy documents).
 */
export function isValidTransition(from, to) {
  const current = from || 'paid';
  const allowed = TRANSITIONS[current];
  return Array.isArray(allowed) && allowed.includes(to);
}
