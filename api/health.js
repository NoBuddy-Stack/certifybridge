/**
 * api/health.js
 * GET /api/health
 *
 * Lightweight health check for uptime monitors and deployment smoke tests.
 * Returns 200 when all env vars are set and MongoDB is reachable.
 * Returns 503 when any critical dependency is unavailable.
 *
 * Safe to expose publicly: only boolean presence checks, no sensitive values.
 */

import clientPromise from '../lib/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const checks = {
    razorpayKeyId:     !!process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    mongodbUri:        !!process.env.MONGODB_URI,
    resendApiKey:      !!process.env.RESEND_API_KEY,
    mongodb:           'unknown',
  };

  try {
    const client = await Promise.race([
      clientPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB connection timeout')), 3000)
      ),
    ]);
    await client.db('certifybridge').command({ ping: 1 });
    checks.mongodb = 'ok';
  } catch (err) {
    checks.mongodb = 'error: ' + err.message;
  }

  const ok = checks.razorpayKeyId &&
             checks.razorpayKeySecret &&
             checks.mongodbUri &&
             checks.resendApiKey &&
             checks.mongodb === 'ok';

  return res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    checks,
  });
}
