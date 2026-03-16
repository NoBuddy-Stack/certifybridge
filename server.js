/**
 * server.js — Local development server
 * Serves static files from /public and routes /api/* to api/*.js handlers.
 * Usage: node server.js
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

// ── Load .env ─────────────────────────────────────────────────────────────────
const __dir   = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dir, '.env');

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
  console.log('✓ Loaded .env');
}

// ── Pre-load all API handlers once at startup ─────────────────────────────────
const handlers = {};
const apiDir   = path.join(__dir, 'api');

for (const file of fs.readdirSync(apiDir).filter(f => f.endsWith('.js'))) {
  const name    = file.replace('.js', '');
  const fileUrl = pathToFileURL(path.join(apiDir, file)).href;
  try {
    const mod = await import(fileUrl);
    handlers[name] = mod.default;
    console.log(`✓ Loaded api/${file}`);
  } catch (err) {
    console.error(`✗ Failed to load api/${file}:`, err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end',  () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function makeRes(nodeRes) {
  let code = 200;
  const headers = {};
  const shim = {
    status(c)        { code = c; return shim; },
    setHeader(k, v)  { headers[k] = v; return shim; },
    json(obj) {
      nodeRes.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
      nodeRes.end(JSON.stringify(obj));
    },
    end(body) {
      nodeRes.writeHead(code, headers);
      nodeRes.end(body || '');
    },
  };
  return shim;
}

// ── Server ────────────────────────────────────────────────────────────────────
const PORT   = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dir, 'public');

http.createServer(async (req, res) => {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/\/+$/, '') || 'index';
    const fn   = handlers[name];

    if (!fn) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `API handler not found: ${pathname}` }));
    }

    try {
      const body   = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const reqShim = Object.assign(req, { body, query: Object.fromEntries(url.searchParams) });
      await fn(reqShim, makeRes(res));
    } catch (err) {
      console.error(`[api/${name}]`, err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // Static files
  let filePath = (pathname === '/' || pathname === '/apply')
    ? path.join(PUBLIC, 'apply.html')
    : path.join(PUBLIC, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }

}).listen(PORT, () => {
  console.log('');
  console.log('  ● CertifyBridge — Dev Server');
  console.log(`  http://localhost:${PORT}             → apply form`);
  console.log(`  http://localhost:${PORT}/api/health  → health check`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
