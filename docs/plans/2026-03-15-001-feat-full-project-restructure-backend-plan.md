---
title: "Full Project Restructure — Secure Backend with Razorpay, MongoDB Atlas & Resend"
type: feat
status: active
date: 2026-03-15
---

# Full Project Restructure — Secure Backend with Razorpay, MongoDB Atlas & Resend

## Overview

Transform the current single-file static HTML internship application (`apply.html`) into a production-grade, full-stack application deployed on Vercel. The backend uses Vercel Serverless Functions (Node.js) for secure payment processing, MongoDB Atlas (Mumbai region, free M0) for data persistence, and Resend for automated transactional emails. The frontend (`apply.html`) is updated to call the new API routes instead of handling payments client-side.

This is a **real-money, real-user** production project. Every architectural decision prioritizes security, reliability, and Indian regulatory compliance (DPDPA 2023).

---

## Problem Statement

The current `apply.html` has critical production gaps:

| Gap | Risk | Impact |
|---|---|---|
| Amount set client-side (`amt * 100`) | User opens DevTools → changes plan price to ₹1 | Direct financial loss |
| No Razorpay signature verification | Payment callback can be faked/replayed | Fraudulent applications |
| No data persistence | Submissions lost on page close | Cannot fulfill orders |
| Client-side EmailJS (public key exposed) | API key scraped → email quota drained | Email service disrupted |
| No server-side validation | Form data untrusted | Bad data in system |
| No idempotency | Network retry → duplicate orders | Duplicate charges to user |

---

## Proposed Solution

### Architecture Overview

```
Browser (apply.html)
    │
    ├─ POST /api/create-order     ← Step 1: Lock amount server-side
    │       ↓
    │   Razorpay API (create order)
    │       ↓ order_id returned
    │
    ├─ [Razorpay Modal opens in browser]
    │       ↓ User pays
    │
    ├─ POST /api/verify-payment   ← Step 2: Verify + persist + notify
    │       ├─ HMAC signature check (Razorpay secret key)
    │       ├─ MongoDB Atlas → save application document
    │       └─ Resend → confirmation email to applicant
    │
    └─ [Success modal shown]
```

### Tech Stack

| Layer | Tool | Tier | Region |
|---|---|---|---|
| Hosting | Vercel | Free Hobby | Auto |
| Serverless Functions | Vercel API Routes (Node.js 20) | Free | Auto |
| Database | MongoDB Atlas M0 | Free (512MB) | Mumbai ap-south-1 |
| Payments | Razorpay | 2% per txn | India |
| Email | Resend | Free (3k/month) | Global |
| Frontend | Static HTML | — | CDN |

---

## Final Folder Structure

```
astra-forge-apply/           ← root of the Vercel project
├── public/
│   └── apply.html           ← frontend form (updated API calls)
├── api/
│   ├── create-order.js      ← POST /api/create-order
│   └── verify-payment.js    ← POST /api/verify-payment
├── lib/
│   └── mongodb.js           ← shared DB connection (singleton)
├── package.json
├── vercel.json
└── .env.example             ← template for required env vars
```

> **Note:** `lib/` is not an API route — it's a shared utility imported by the API functions. Vercel does not expose it as an endpoint.

---

## Technical Approach

### Phase 1 — Project Scaffolding

#### 1.1 Initialize Node.js project

**`package.json`**
```json
{
  "name": "astra-forge-apply",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": "20.x" },
  "dependencies": {
    "razorpay": "^2.9.2",
    "mongodb": "^6.5.0",
    "resend": "^3.2.0"
  }
}
```

> Use the native MongoDB driver (not Mongoose) — lighter weight, better for serverless cold starts. No schema needed for a simple document store.

#### 1.2 Vercel configuration

**`vercel.json`**
```json
{
  "version": 2,
  "regions": ["bom1"],
  "routes": [
    { "src": "/", "dest": "/public/apply.html" },
    { "src": "/apply", "dest": "/public/apply.html" }
  ],
  "functions": {
    "api/**": { "maxDuration": 10 }
  }
}
```

> `bom1` = Vercel's Mumbai region. This co-locates your serverless functions with your MongoDB Atlas Mumbai cluster, keeping function→DB latency ~5ms instead of ~150ms if functions ran in the US.

#### 1.3 Environment variables

**`.env.example`** (commit this; never commit `.env`)
```bash
# Razorpay — get from dashboard.razorpay.com
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx

# MongoDB Atlas — get from cloud.mongodb.com
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/astra_forge?retryWrites=true&w=majority

# Resend — get from resend.com
RESEND_API_KEY=re_xxxxxxxxxxxx

# App config
FROM_EMAIL=noreply@yourdomain.com
SUPPORT_EMAIL=contact@yourdomain.com
WHATSAPP_NUMBER=919999999999
COMPANY_NAME=Astra Forge
```

Set all of these in **Vercel Dashboard → Project → Settings → Environment Variables**.

---

### Phase 2 — Database Layer (`lib/mongodb.js`)

The biggest serverless pitfall with MongoDB is **connection exhaustion**. Each Vercel function invocation is a separate Node.js process. Without a singleton, every request opens a new connection — M0 free tier allows only 500 connections. With a singleton, the connection is reused across warm invocations of the same function instance.

**`lib/mongodb.js`**
```js
// Singleton MongoDB connection — reused across warm serverless invocations
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) throw new Error('MONGODB_URI env var is not set');

// Attach to global to survive hot-reloads in dev and warm starts in prod
let cached = global._mongoClientPromise;

if (!cached) {
  const client = new MongoClient(uri, {
    maxPoolSize: 1,          // M0 free tier: 500 total connections ÷ potential instances = 1 per instance
    bufferCommands: false,   // fail fast if not connected — important for serverless
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });
  cached = global._mongoClientPromise = client.connect();
}

export default cached;
```

**MongoDB collection: `applications`**

Each document structure:
```js
{
  _id: ObjectId,                    // auto-generated
  // Personal
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  college: String,
  // Preferences
  domain: String,
  mode: String,                     // "Online" | "Offline" | "Hybrid"
  city: String | null,              // null if Online
  stipend: String,
  startDate: String,                // "YYYY-MM-DD"
  endDate: String,
  duration: String,                 // "2 months 15 days"
  note: String | null,
  // Plan & Payment
  plan: String,                     // "new" | "pro" | "hacker"
  planName: String,                 // "New Plan" etc.
  amount: Number,                   // in INR (not paise) e.g. 1999
  // Razorpay
  razorpayOrderId: String,          // order_xxxxxxxxxxxx
  razorpayPaymentId: String,        // pay_xxxxxxxxxxxx
  razorpaySignature: String,        // verified HMAC
  paymentStatus: String,            // "paid"
  // Meta
  createdAt: Date,
  ipAddress: String,                // for fraud detection
}
```

**MongoDB Atlas M0 index budget:** M0 allows max 3 indexes total — 1 is `_id` (auto), leaving **2 custom slots**. Choose carefully:

```js
// Index 1: Unique on razorpayOrderId — prevents duplicate saves AND enables idempotent retries
db.applications.createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true })

// Index 2: Query by email — for user lookup and duplicate-application checks
db.applications.createIndex({ email: 1 })

// NOTE: Do NOT add a { createdAt: -1 } index on M0 — you have no more slots.
// For admin sorting by date, use a collection scan (acceptable at this scale).
// Upgrade to M2+ ($9/month) if you need more indexes.
```

---

### Phase 3 — API Route: `create-order.js`

**`api/create-order.js`**
```js
import Razorpay from 'razorpay';

const PLAN_AMOUNTS = {
  new:    999,
  pro:    1999,
  hacker: 4999,
};

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan } = req.body;

  // Validate plan on server — never trust client-supplied amount
  if (!plan || !PLAN_AMOUNTS[plan]) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  const amount = PLAN_AMOUNTS[plan]; // amount in INR

  try {
    const order = await razorpay.orders.create({
      amount:   amount * 100,   // Razorpay expects paise
      currency: 'INR',
      receipt:  `receipt_${Date.now()}`,
      notes: { plan },
    });

    return res.status(200).json({
      orderId: order.id,
      amount,                   // send INR back to client for display only
      currency: 'INR',
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    return res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
}
```

**Security guarantee:** The `amount` is set inside `PLAN_AMOUNTS` on the server. Even if the client sends `plan: "hacker"` with `amount: 1`, the server uses `PLAN_AMOUNTS["hacker"] = 4999`. No client value for amount is ever used.

---

### Phase 4 — API Route: `verify-payment.js`

This is the most critical function. It:
1. Verifies the Razorpay payment signature (cryptographic proof of payment)
2. Saves the application to MongoDB (with duplicate protection)
3. Sends confirmation email via Resend

**`api/verify-payment.js`**
```js
import crypto from 'crypto';
import { Resend } from 'resend';
import clientPromise from '../lib/mongodb.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const PLAN_NAMES = { new: 'New Plan', pro: 'Pro Plan', hacker: 'Hacker Plan' };
const PLAN_AMOUNTS = { new: 999, pro: 1999, hacker: 4999 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    // Form data
    firstName, lastName, email, phone, college,
    domain, mode, city, stipend,
    startDate, endDate, duration, note,
    plan,
  } = req.body;

  // ── Step 1: Verify Razorpay signature ──────────────────────────────────
  // This is the ONLY way to prove the payment actually happened.
  // Formula: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks (string === leaks timing info)
  const sigBuf      = Buffer.from(razorpay_signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  const isValid = sigBuf.length === expectedBuf.length &&
                  crypto.timingSafeEqual(sigBuf, expectedBuf);

  if (!isValid) {
    console.error('Signature mismatch — possible tamper attempt', {
      razorpay_order_id, razorpay_payment_id,
    });
    return res.status(400).json({ error: 'Payment verification failed. Please contact support.' });
  }

  // ── Step 2: Validate plan ──────────────────────────────────────────────
  if (!plan || !PLAN_AMOUNTS[plan]) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  const amount = PLAN_AMOUNTS[plan];

  // ── Step 3: Save to MongoDB ────────────────────────────────────────────
  let savedApplication;
  try {
    const client = await clientPromise;
    const db = client.db('astra_forge');
    const col = db.collection('applications');

    const doc = {
      // Personal
      firstName: String(firstName || '').trim().slice(0, 100),
      lastName:  String(lastName  || '').trim().slice(0, 100),
      email:     String(email     || '').trim().toLowerCase().slice(0, 200),
      phone:     String(phone     || '').trim().slice(0, 20),
      college:   String(college   || '').trim().slice(0, 300),
      // Preferences
      domain:    String(domain    || '').trim().slice(0, 200),
      mode:      String(mode      || '').trim().slice(0, 50),
      city:      city ? String(city).trim().slice(0, 100) : null,
      stipend:   String(stipend   || '').trim().slice(0, 50),
      startDate: String(startDate || '').trim().slice(0, 20),
      endDate:   String(endDate   || '').trim().slice(0, 20),
      duration:  String(duration  || '').trim().slice(0, 100),
      note:      note ? String(note).trim().slice(0, 2000) : null,
      // Plan & Payment
      plan,
      planName:          PLAN_NAMES[plan],
      amount,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paymentStatus:     'paid',
      // Meta
      createdAt: new Date(),
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
    };

    // insertOne with unique index on razorpayOrderId prevents duplicates
    savedApplication = await col.insertOne(doc);
  } catch (dbErr) {
    // If duplicate key error (11000), the record was already saved — still send email
    if (dbErr.code !== 11000) {
      console.error('MongoDB save error:', dbErr);
      // Don't block the user — payment is confirmed, DB save failed
      // Alert via log — set up Vercel log drain or check dashboard
    }
  }

  // ── Step 4: Send confirmation email ───────────────────────────────────
  // Fire-and-forget — email failure must NOT block payment confirmation
  sendConfirmationEmail({ firstName, lastName, email, plan, amount, domain, duration })
    .catch(err => console.error('Email send error (non-blocking):', err));

  return res.status(200).json({ success: true, message: 'Payment verified and application saved.' });
}

async function sendConfirmationEmail({ firstName, lastName, email, plan, amount, domain, duration }) {
  const planName = PLAN_NAMES[plan];
  await resend.emails.send({
    from:    process.env.FROM_EMAIL,
    to:      email,
    subject: `Your Internship Application is Confirmed — ${planName} | Astra Forge`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:40px;border-radius:12px;border:1px solid #ffffff1a">
        <div style="margin-bottom:32px">
          <span style="background:#00ff1e;color:#000;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Confirmed</span>
        </div>
        <h1 style="font-size:28px;font-weight:900;margin-bottom:8px;letter-spacing:-1px">We've got you, ${firstName}! 🎉</h1>
        <p style="color:#ffffffb3;font-size:15px;line-height:1.7;margin-bottom:24px">
          Your internship application has been successfully registered and your payment is confirmed.
          Our team will review your details and share all resources as per your <strong style="color:#00ff1e">${planName}</strong> within <strong>24 hours</strong>.
        </p>

        <div style="background:#ffffff08;border:1px solid #ffffff1a;border-radius:8px;padding:20px;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#ffffff66;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">Plan</td><td style="font-weight:600;text-align:right;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">${planName}</td></tr>
            <tr><td style="color:#ffffff66;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">Domain</td><td style="font-weight:600;text-align:right;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">${domain}</td></tr>
            <tr><td style="color:#ffffff66;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">Duration</td><td style="font-weight:600;text-align:right;padding:8px 0;border-bottom:1px solid #ffffff1a;font-size:13px">${duration}</td></tr>
            <tr><td style="color:#ffffff66;padding:8px 0;font-size:13px">Amount Paid</td><td style="font-weight:700;text-align:right;padding:8px 0;color:#00ff1e;font-size:15px">₹${amount.toLocaleString('en-IN')}</td></tr>
          </table>
        </div>

        <p style="color:#ffffffb3;font-size:14px;line-height:1.6;margin-bottom:24px">
          Need help? Reply to this email or reach us on WhatsApp at
          <a href="https://wa.me/${process.env.WHATSAPP_NUMBER}" style="color:#00ff1e">wa.me/${process.env.WHATSAPP_NUMBER}</a>
        </p>

        <p style="color:#ffffff55;font-size:12px">
          — Team ${process.env.COMPANY_NAME}
        </p>
      </div>
    `,
  });
}
```

---

### Phase 5 — Frontend Updates (`public/apply.html`)

The existing `apply.html` needs these changes only — the UI stays identical:

#### 5.1 Remove these from `<head>`:
```html
<!-- REMOVE: Razorpay script moved to inline load-on-demand -->
<!-- REMOVE: EmailJS script — email now sent server-side -->
```

#### 5.2 Replace `handlePay()` function:

**Old (insecure):**
```js
function handlePay() {
  // ❌ Amount set client-side
  amount: amt * 100,
  handler: onPayOk,
}
```

**New (secure, 2-step):**
```js
async function handlePay() {
  if (!plan) { document.getElementById('perr').classList.add('show'); return; }

  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Creating order…';

  try {
    // Step 1: Get order_id from server (amount locked server-side)
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });

    if (!orderRes.ok) throw new Error('Could not create order');
    const { orderId, amount: serverAmount } = await orderRes.json();

    // Step 2: Open Razorpay with server-issued order_id
    const opts = {
      key:         'YOUR_RAZORPAY_KEY_ID',  // key_id only (public)
      order_id:    orderId,                 // from server
      amount:      serverAmount * 100,      // paise, from server
      currency:    'INR',
      name:        'Astra Forge',
      description: `Internship Application — ${PLAN_NAMES[plan]}`,
      prefill:     { name: gv('firstName')+' '+gv('lastName'), email: gv('email'), contact: gv('phone') },
      theme:       { color: '#00ff1e' },
      handler: async function(response) {
        // Step 3: Verify payment on server
        await verifyPayment(response, serverAmount);
      },
      modal: {
        ondismiss: function() {
          payBtn.disabled = false;
          payBtn.textContent = '🔒  Pay Securely with Razorpay';
        }
      }
    };

    new Razorpay(opts).open();

  } catch(err) {
    console.error(err);
    alert('Something went wrong. Please try again.');
    payBtn.disabled = false;
    payBtn.textContent = '🔒  Pay Securely with Razorpay';
  }
}

async function verifyPayment(rzpResponse, serverAmount) {
  const payBtn = document.getElementById('payBtn');
  payBtn.textContent = 'Verifying payment…';

  const payload = {
    razorpay_order_id:   rzpResponse.razorpay_order_id,
    razorpay_payment_id: rzpResponse.razorpay_payment_id,
    razorpay_signature:  rzpResponse.razorpay_signature,
    // Form data
    firstName: gv('firstName'), lastName: gv('lastName'),
    email:     gv('email'),     phone:    gv('phone'),
    college:   gv('college'),   domain,   mode,
    city,      stipend,         plan,
    startDate: gv('startDate'), endDate:  gv('endDate'),
    duration:  document.getElementById('durTxt').textContent.replace('Duration: ', ''),
    note:      gv('note'),
  };

  const res = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const { error } = await res.json();
    alert('Payment verified but something went wrong: ' + error + '. Please contact support with your payment ID: ' + rzpResponse.razorpay_payment_id);
    return;
  }

  // Show success modal
  onPaySuccess(rzpResponse, serverAmount);
}

function onPaySuccess(resp, serverAmount) {
  const names = { new:'New Plan', pro:'Pro Plan', hacker:'Hacker Plan' };
  document.getElementById('sName').textContent  = gv('firstName');
  document.getElementById('sPlan').textContent  = names[plan];
  document.getElementById('sEmail').textContent = gv('email');
  document.getElementById('emailLink').href     = 'mailto:' + SUPPORT_EMAIL;
  document.getElementById('waLink').href        = 'https://wa.me/' + WA_NUMBER;
  document.getElementById('sov').classList.add('open');
}
```

---

### Phase 6 — Deployment

#### 6.1 Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# From project root
cd astra-forge-apply
npm install
vercel           # follow prompts — links to your Vercel account

# Set env vars (or do it in Vercel dashboard)
vercel env add RAZORPAY_KEY_ID
vercel env add RAZORPAY_KEY_SECRET
vercel env add MONGODB_URI
vercel env add RESEND_API_KEY
vercel env add FROM_EMAIL
vercel env add SUPPORT_EMAIL
vercel env add WHATSAPP_NUMBER
vercel env add COMPANY_NAME

# Deploy to production
vercel --prod
```

#### 6.2 Connect custom domain (`xyz.com`)

In Vercel Dashboard → Project → Settings → Domains:
- Add `xyz.com` and `www.xyz.com`
- Update DNS at your registrar:
  - `A record: @ → 76.76.21.21`
  - `CNAME: www → cname.vercel-dns.com`
- SSL certificate is auto-provisioned (Let's Encrypt via Vercel)

#### 6.3 Razorpay test → live switch

- Test: `RAZORPAY_KEY_ID=rzp_test_xxx` — no real money charged
- Live: `RAZORPAY_KEY_ID=rzp_live_xxx` — real money, KYC required on Razorpay dashboard
- Update `RAZORPAY_KEY_ID` in `public/apply.html` (the public key only) AND in Vercel env vars

---

## System-Wide Impact

### Interaction Graph

```
User submits form
  └─ handlePay() called
       └─ POST /api/create-order
            └─ Razorpay.orders.create()    [external API call ~200ms]
                 └─ order_id returned
                      └─ Razorpay modal opens in browser
                           └─ User pays
                                └─ Razorpay calls handler(response) in browser
                                     └─ POST /api/verify-payment
                                          ├─ crypto.createHmac() signature check
                                          ├─ MongoClient.insertOne()            [DB write ~50ms]
                                          │    └─ unique index on razorpayOrderId [prevents dup]
                                          └─ resend.emails.send()               [async, non-blocking]
                                               └─ success: 200 returned
                                                    └─ Success modal shown
```

### Error & Failure Propagation

| Failure point | Behavior | Recovery |
|---|---|---|
| `/api/create-order` Razorpay API down | 500 returned → alert shown → button re-enabled | User retries |
| Razorpay modal dismissed | `ondismiss` fires → button re-enabled | User retries |
| Signature mismatch | 400 returned → user directed to support with payment ID | Manual reconciliation |
| MongoDB insert fails (not dup) | Error logged, 200 still returned | Check Vercel logs → manual DB insert |
| MongoDB dup key (11000) | Silently ignored (payment already saved) | No action needed |
| Resend email fails | Error logged, does not block response | Check Vercel logs → manual resend |

### State Lifecycle Risks

- **Double payment:** User pays, closes browser before verify completes → Razorpay shows payment as captured but our DB has no record. **Mitigation:** Set up Razorpay Webhook (see Future Considerations) which retries delivery. Until then, check Razorpay dashboard vs MongoDB for discrepancies daily.
- **Partial save:** MongoDB write fails after signature check passes → 200 returned but no DB record. **Mitigation:** The `razorpayPaymentId` is in the email and Razorpay dashboard. Manual DB insert possible.
- **Replay attack:** Attacker captures a valid `razorpay_payment_id` and submits it again. **Mitigation:** Unique index on `razorpayOrderId` in MongoDB prevents duplicate records.

### API Surface Parity

- Only two API endpoints exposed: `/api/create-order` and `/api/verify-payment`
- No GET endpoints, no data retrieval surface
- `lib/mongodb.js` is internal — not a route

### Integration Test Scenarios

1. **Happy path:** Full form → create-order → Razorpay test payment → verify-payment → MongoDB has document → email received
2. **Tampered signature:** Manually modify `razorpay_signature` in request → server returns 400 → no DB write
3. **Invalid plan:** POST `/api/create-order` with `{ plan: "ultra" }` → server returns 400
4. **Duplicate submission:** Send identical `razorpay_order_id` twice → second insertOne throws 11000 → 200 still returned, no duplicate in DB
5. **MongoDB down:** Simulate by using wrong URI → email still fires (if email is first), 500 logged → user gets success modal (by design — payment is confirmed even if DB fails temporarily)

---

## Acceptance Criteria

### Functional

- [ ] `POST /api/create-order` accepts `{ plan }`, validates against server-side `PLAN_AMOUNTS`, creates Razorpay order, returns `{ orderId, amount, currency }`
- [ ] `POST /api/create-order` returns 400 for invalid/missing plan
- [ ] Razorpay modal opens with `order_id` from server (not client-generated)
- [ ] `POST /api/verify-payment` correctly computes HMAC SHA256 and rejects tampered signatures with 400
- [ ] `POST /api/verify-payment` saves complete application document to MongoDB `astra_forge.applications`
- [ ] Second call with same `razorpayOrderId` does not create a duplicate document
- [ ] Confirmation email sent to applicant's email address within 30 seconds of payment
- [ ] Email failure does not block 200 response to client
- [ ] Success modal displays on frontend after successful verification
- [ ] All 7 plan-amount mappings are locked server-side (New: ₹999, Pro: ₹1,999, Hacker: ₹4,999)
- [ ] `apply.html` served at `/` and `/apply`
- [ ] All secrets in Vercel env vars — zero secrets in committed code

### Non-Functional

- [ ] No `.env` file committed to git (`.gitignore` includes `.env`)
- [ ] API routes respond within 5 seconds (Vercel function timeout: 10s default)
- [ ] MongoDB M0 connection pool ≤ 5 per function instance
- [ ] All user input sanitized (`.trim().slice(0, n)`) before DB insert
- [ ] HTTPS enforced by Vercel (automatic)
- [ ] `razorpayOrderId` unique index created on `applications` collection

### Quality Gates

- [ ] Test in Razorpay test mode with card `4111 1111 1111 1111` before going live
- [ ] Verify MongoDB document in Atlas Data Explorer after test payment
- [ ] Verify confirmation email received with correct details
- [ ] Verify duplicate call returns 200 but creates no second document
- [ ] Switch `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `rzp_live_` prefix before launch
- [ ] Update `key` in `public/apply.html` to live `RAZORPAY_KEY_ID`

---

## Risk Analysis & Mitigation

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| Razorpay payment captured but verify-payment never called (network drop) | High | Low | Razorpay webhooks (Phase 2 future) as safety net |
| MongoDB M0 512MB storage exhausted | Medium | Low (years at this scale) | Each doc ~2KB → 250,000 applications before hitting limit |
| Resend 3k/month limit hit | Low | Low | 100 applications/day would hit limit. Upgrade to paid (₹0 for first 3k) |
| Cold start latency (Vercel serverless) | Low | Medium | MongoDB connection reuse via singleton mitigates majority |
| Razorpay KYC not complete for live mode | High | Medium | Complete KYC at dashboard.razorpay.com before launch |
| User pays in test mode after go-live (wrong key) | High | Low | Checklist item: verify `rzp_live_` prefix before deploy |

---

## Future Considerations (Phase 2)

1. **Razorpay Webhooks** — Set up `payment.captured` webhook at `/api/webhook` as a fallback save mechanism. This handles the case where the browser closes before `verify-payment` fires. Webhook events are signed separately using `razorpay_webhook_secret`.

2. **Admin dashboard** — Simple password-protected page at `/admin` that reads from MongoDB and displays all applications with payment status.

3. **Rate limiting** — Add Vercel Edge Middleware to rate-limit `/api/create-order` to 5 requests/minute per IP (prevents abuse).

4. **Email to yourself** — Add a BCC or second email to `SUPPORT_EMAIL` on every payment so you get notified instantly.

5. **DPDPA compliance** — Add a consent checkbox on the form: *"I consent to Astra Forge storing my data as per the Privacy Policy"*. Required under India's Digital Personal Data Protection Act 2023.

6. **GST invoice** — For B2C transactions > ₹200, consider sending a GST invoice via Razorpay's built-in invoice feature or a separate service.

---

## Dependencies & Prerequisites

| Dependency | Action required | Where |
|---|---|---|
| Razorpay account | Sign up at razorpay.com, complete KYC for live mode | dashboard.razorpay.com |
| MongoDB Atlas account | Sign up, create M0 cluster in Mumbai (ap-south-1) | cloud.mongodb.com |
| Resend account | Sign up, verify your domain for custom `from` email | resend.com |
| Vercel account | Sign up (free Hobby plan) | vercel.com |
| Custom domain (`xyz.com`) | Already owned — update DNS after Vercel deploy | Your registrar |
| Node.js 20.x | Install locally for development | nodejs.org |

---

## Implementation File Reference

| File | Purpose | New / Modified |
|---|---|---|
| `public/apply.html` | Frontend form | Modified (handlePay, verifyPayment, remove EmailJS) |
| `api/create-order.js` | Serverless: create Razorpay order | New |
| `api/verify-payment.js` | Serverless: verify + save + email | New |
| `lib/mongodb.js` | Shared DB connection singleton | New |
| `package.json` | Dependencies (razorpay, mongodb, resend) | New |
| `vercel.json` | Routing config | New |
| `.env.example` | Env var template (committed) | New |
| `.gitignore` | Excludes `.env`, `node_modules` | New |

---

## Sources & References

### Internal
- Current form: `public/apply.html` (form logic, state variables, plan amounts)
- Brand: `Astra Forge – Framer SaaS Template.html` (colors, typography)

### External
- Razorpay Node.js SDK: https://razorpay.com/docs/payments/server-integration/nodejs/
- Razorpay signature verification: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#14-verify-the-signature
- MongoDB Atlas free tier: https://www.mongodb.com/pricing
- MongoDB serverless connection best practices: https://www.mongodb.com/developer/products/atlas/serverless-functions-best-practices/
- Resend Node.js SDK: https://resend.com/docs/send-with-nodejs
- Vercel Serverless Functions: https://vercel.com/docs/functions
- India DPDPA 2023: https://www.meity.gov.in/data-protection-framework
- Razorpay test cards: https://razorpay.com/docs/payments/payment-gateway/test-integration/cards/
