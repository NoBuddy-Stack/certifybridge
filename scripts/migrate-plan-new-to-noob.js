/**
 * scripts/migrate-plan-new-to-noob.js
 *
 * One-time migration: rename plan:"new" → plan:"noob" in all existing
 * MongoDB application documents.
 *
 * Background: The plan key was renamed from "new" to "noob" in commit 7192e11.
 * Any documents created before that rename have plan:"new" which no longer
 * matches any key in lib/plans.js and cannot be looked up for display/reporting.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-plan-new-to-noob.js
 *
 * Run this ONCE against production before (or simultaneously with) deploying
 * the new code. The operation is idempotent — safe to run multiple times.
 */

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI env var is not set.');
  process.exit(1);
}

const DB_NAME   = 'certifybridge';
const COLL_NAME = 'applications';

async function run() {
  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    console.log('Connected to MongoDB.');

    const col = client.db(DB_NAME).collection(COLL_NAME);

    // Dry-run first: count affected documents
    const count = await col.countDocuments({ plan: 'new' });
    console.log(`Documents with plan:"new": ${count}`);

    if (count === 0) {
      console.log('Nothing to migrate. Exiting.');
      return;
    }

    // Confirm before mutating
    const args = process.argv.slice(2);
    if (!args.includes('--execute')) {
      console.log('\nDry-run complete. Re-run with --execute to apply the migration:');
      console.log('  node --env-file=.env scripts/migrate-plan-new-to-noob.js --execute');
      return;
    }

    const result = await col.updateMany(
      { plan: 'new' },
      {
        $set: {
          plan:     'noob',
          planName: 'Noob Plan',
        },
      }
    );

    console.log(`Migration complete.`);
    console.log(`  Matched:  ${result.matchedCount}`);
    console.log(`  Modified: ${result.modifiedCount}`);

    // Verify
    const remaining = await col.countDocuments({ plan: 'new' });
    if (remaining > 0) {
      console.error(`WARNING: ${remaining} documents still have plan:"new" — investigate.`);
      process.exitCode = 1;
    } else {
      console.log('Verification passed: zero documents with plan:"new" remain.');
    }

  } finally {
    await client.close();
    console.log('Connection closed.');
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
