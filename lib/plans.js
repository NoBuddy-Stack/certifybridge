/**
 * lib/plans.js
 * Single source of truth for plan configuration.
 *
 * Uses Object.create(null) to prevent prototype pollution attacks —
 * keys like "__proto__", "toString", "valueOf" would otherwise resolve
 * to truthy inherited values on plain object literals, bypassing validation.
 */

export const PLANS = Object.assign(Object.create(null), {
  noob:   { amount: 499,  name: 'Noob Plan'   },
  pro:    { amount: 999,  name: 'Pro Plan'     },
  hacker: { amount: 1599, name: 'Hacker Plan'  },
});
