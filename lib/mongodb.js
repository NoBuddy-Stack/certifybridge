/**
 * lib/mongodb.js
 * Serverless-safe MongoDB singleton connection.
 *
 * Pattern: cache the MongoClient promise at module level using a global variable.
 * - On cold start  → new connection is opened and cached
 * - On warm start  → cached promise is reused (no new TCP connection)
 * - In dev (hot-reload) → global._mongo prevents duplicate connections
 *
 * M0 free tier limits: 500 total connections.
 * maxPoolSize: 1 ensures each serverless instance uses at most 1 connection.
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error(
    'MONGODB_URI is not set. Add it to your .env file and Vercel environment variables.'
  );
}

const options = {
  maxPoolSize: 1,           // Conservative for M0: 1 connection per serverless instance
  minPoolSize: 0,
  maxIdleTimeMS: 300000,    // Keep connection alive for 5 min (aligns with Vercel container keep-alive)
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

let clientPromise;

if (process.env.NODE_ENV === 'development') {
  // In development, attach to global to survive Next.js hot-module reloads
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production (Vercel), module-level variable persists across warm invocations
  const client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
