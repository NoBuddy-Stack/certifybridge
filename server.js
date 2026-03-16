/**
 * server.js — Local development server
 * Serves static files from /public and routes /api/* to api/*.js handlers.
 * Usage: npm run dev   (loads .env via --env-file flag, Node 20.6+)
 *    or: node server.js (if .env is already in env)
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Pre-load all API handlers recursively at startup ────────────────────────
const handlers = {};
const apiDir   = path.join(__dir, 'api');

async function loadHandlers(dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await loadHandlers(path.join(dir, entry.name), prefix + entry.name + '/');
    } else if (entry.name.endsWith('.js')) {
      const name    = prefix + entry.name.replace('.js', '');
      const fileUrl = pathToFileURL(path.join(dir, entry.name)).href;
      try {
        const mod = await import(fileUrl);
        handlers[name] = mod.default;
        console.log(`✓ Loaded api/${name}.js`);
      } catch (err) {
        console.error(`✗ Failed to load api/${name}.js:`, err.message);
      }
    }
  }
}
await loadHandlers(apiDir, '');

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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    req.on('end',  () => resolve(Buffer.concat(chunks)));
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

    // Resolve handler: try exact match first, then dynamic [param] segments
    let fn    = handlers[name];
    const dynQuery = {}; // populated by dynamic segment matching

    if (!fn) {
      // Try matching dynamic routes: e.g. "admin/applications/abc123"
      // against handler "admin/applications/[id]"
      const segments = name.split('/');
      for (const handlerName of Object.keys(handlers)) {
        const hSegs = handlerName.split('/');
        if (hSegs.length !== segments.length) continue;
        let match = true;
        for (let i = 0; i < hSegs.length; i++) {
          if (hSegs[i].startsWith('[') && hSegs[i].endsWith(']')) {
            dynQuery[hSegs[i].slice(1, -1)] = segments[i];
          } else if (hSegs[i] !== segments[i]) {
            match = false;
            break;
          }
        }
        if (match) { fn = handlers[handlerName]; break; }
      }
    }

    if (!fn) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `API handler not found: ${pathname}` }));
    }

    try {
      // Check if handler opts out of JSON body parsing (e.g. webhook needs raw bytes for HMAC)
      const bodyParserOff = fn?.config?.api?.bodyParser === false;
      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const raw = await readRawBody(req);
        if (bodyParserOff) {
          body = raw; // pass Buffer directly
        } else if (raw.length > 0) {
          try { body = JSON.parse(raw.toString('utf8')); } catch { body = {}; }
        }
      }
      const query = { ...Object.fromEntries(url.searchParams), ...dynQuery };
      const reqShim = Object.assign(req, { body, query });
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
  let filePath = pathname === '/apply'
    ? path.join(PUBLIC, 'apply.html')
    : pathname === '/admin'
      ? path.join(PUBLIC, 'admin.html')
      : pathname === '/'
        ? path.join(PUBLIC, 'index.html')
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
  console.log(`  http://localhost:${PORT}/admin       → admin dashboard`);
  console.log(`  http://localhost:${PORT}/api/health  → health check`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
