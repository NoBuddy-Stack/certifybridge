/**
 * lib/plans.js
 * Single source of truth for plan configuration.
 *
 * Uses Object.create(null) to prevent prototype pollution attacks —
 * keys like "__proto__", "toString", "valueOf" would otherwise resolve
 * to truthy inherited values on plain object literals, bypassing validation.
 */

export const PLAN_AMOUNTS = Object.assign(Object.create(null), {
  new:    999,
  pro:    1999,
  hacker: 4999,
});

export const PLAN_NAMES = Object.assign(Object.create(null), {
  new:    'New Plan',
  pro:    'Pro Plan',
  hacker: 'Hacker Plan',
});
