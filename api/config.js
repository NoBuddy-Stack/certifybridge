/**
 * api/config.js
 * GET /api/config
 *
 * Returns all public runtime configuration the frontend needs.
 * Cached at CDN for 1 hour — only changes on re-deploy.
 *
 * Also serves as the machine-readable API contract for agents:
 * includes call flow, plan definitions, and enumerated option lists.
 */

import { PLANS } from '../lib/plans.js';

// Enumerated option lists — single source of truth shared with frontend
const DOMAIN_PRESETS = [
  'Web Development', 'Data Science & AI', 'Mobile Development',
  'UI/UX Design', 'Digital Marketing', 'Cybersecurity',
  'Cloud & DevOps', 'Blockchain', 'Machine Learning',
  'Business Analytics', 'Content Writing', 'Video Editing',
  'Graphic Design', 'Finance & Accounting',
];

const WORK_MODES     = ['Online', 'Offline', 'Hybrid'];
const STIPEND_RANGES = ['Unpaid', '₹2k-5k', '₹5k-10k', '₹10k-15k', '₹15k+'];
const CITIES         = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata'];

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Cache at CDN for 24 hours; browsers revalidate after 1 hour
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');

  return res.status(200).json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    supportEmail:  process.env.SUPPORT_EMAIL   || 'contact@certifybridge.com',
    companyName:   process.env.COMPANY_NAME    || 'CertifyBridge',
    whatsappNumber: process.env.WHATSAPP_NUMBER || '',

    // Agent-readable call flow
    flow: [
      'GET  /api/config           → get razorpayKeyId + options',
      'POST /api/create-order     → { plan } → { orderId, amount, currency }',
      'razorpay-checkout          → user pays, returns { razorpay_order_id, razorpay_payment_id, razorpay_signature }',
      'POST /api/verify-payment   → submit all fields → { success: true, duration }',
      'GET  /api/application?orderId=<id> → confirm record was saved',
    ],

    // Plan definitions
    plans: Object.keys(PLANS).map(key => ({
      key,
      amount: PLANS[key].amount,
      name:   PLANS[key].name,
    })),

    // Enumerated option lists
    options: {
      domainPresets: DOMAIN_PRESETS,
      workModes:     WORK_MODES,
      stipendRanges: STIPEND_RANGES,
      cities:        CITIES,
    },

    // Date range constraints
    dateConstraints: {
      minDays: 30,
      maxDays: 365,
    },
  });
}
