/**
 * lib/mongodb.js
 * Serverless-safe MongoDB singleton + shared utilities.
 *
 * Pattern: cache the MongoClient promise at module level.
 * - Cold start  → new connection opened and cached
 * - Warm start  → cached promise reused (no new TCP connection)
 * - Dev (hot-reload) → global._mongo prevents duplicate connections
 *
 * M0 free tier: 500 total connections. maxPoolSize:1 ensures each
 * serverless instance uses at most 1 connection.
 */

import { MongoClient } from 'mongodb';

// ── Constants ─────────────────────────────────────────────────────────────────
export const DB_NAME                = 'certifybridge';
export const COLLECTION_APPLICATIONS = 'applications';

// ── Client ────────────────────────────────────────────────────────────────────
const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error(
    'MONGODB_URI is not set. Add it to your .env file and Vercel environment variables.'
  );
}

const options = {
  maxPoolSize: 1,           // Conservative for M0: 1 connection per serverless instance
  minPoolSize: 0,
  maxIdleTimeMS: 60000,     // 1 min — aligns with Vercel container freeze cycle
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

let clientPromise;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect()
      .catch(err => {
        console.error('[mongodb] Dev connection failed:', err.message);
        throw err;
      });
  }
  clientPromise = global._mongoClientPromise;
} else {
  const client = new MongoClient(uri, options);
  clientPromise = client.connect()
    .catch(err => {
      console.error('[mongodb] Cold-start connection failed:', err.message);
      throw err;
    });
}

export default clientPromise;

// ── Shared index setup ────────────────────────────────────────────────────────
// Call once per cold start from any handler. createIndex is idempotent.
let _indexesEnsured = false;
export async function ensureIndexes(col) {
  if (_indexesEnsured) return;
  await Promise.all([
    // unique:true (no sparse) — razorpayOrderId is always present after HMAC verification
    col.createIndex({ razorpayOrderId: 1 }, { unique: true, name: 'razorpayOrderId_unique' }),
    col.createIndex({ email: 1 },           { name: 'email_lookup' }),
    col.createIndex({ createdAt: -1 },      { name: 'createdAt_sort' }),
    // Admin dashboard: filtered + sorted queries on status, plan, date
    col.createIndex({ adminStatus: 1, plan: 1, createdAt: -1 }, { name: 'admin_status_plan_date' }),
  ]);
  _indexesEnsured = true;
}
