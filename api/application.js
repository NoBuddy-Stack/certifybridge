/**
 * api/application.js
 * GET /api/application?orderId=<razorpayOrderId>
 *
 * Read-back endpoint — lets clients and agents confirm a payment record
 * was persisted after POST /api/verify-payment.
 *
 * Returns the application document (excluding sensitive fields).
 * Returns 404 if no record exists for the given orderId.
 */

import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS } from '../lib/mongodb.js';

// Fields excluded from the response to avoid exposing sensitive data
const EXCLUDED_FIELDS = { razorpaySignature: 0, ipAddress: 0, _id: 0 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { orderId } = req.query || {};

  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'orderId query parameter is required.' });
  }

  // Basic format check — Razorpay order IDs start with "order_"
  if (!orderId.startsWith('order_') || orderId.length > 64) {
    return res.status(400).json({ error: 'Invalid orderId format.' });
  }

  try {
    const client = await clientPromise;
    const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);

    const doc = await col.findOne(
      { razorpayOrderId: orderId },
      { projection: EXCLUDED_FIELDS }
    );

    if (!doc) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    return res.status(200).json({ application: doc });

  } catch (err) {
    console.error('[application] MongoDB error:', err.message);
    return res.status(500).json({ error: 'Could not retrieve application.' });
  }
}
