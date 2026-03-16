/**
 * api/config.js
 * GET /api/config
 *
 * Returns public configuration that the frontend needs at runtime.
 * The Razorpay Key ID is public by design (Razorpay requires it in the browser)
 * but should come from the server so there is no hardcoded placeholder in HTML.
 */

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return res.status(200).json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  });
}
