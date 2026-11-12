/**
 * Production-сервер для Layero Runtime (node_web).
 *
 * Зачем: браузеры из РФ не всегда могут достучаться до *.supabase.co
 * (Cloudflare), поэтому все запросы к Supabase идут через наш домен,
 * а сервер уже сам проксирует их в Supabase.
 *
 *   /auth/*      → Supabase Auth
 *   /rest/*      → PostgREST
 *   /storage/*   → Storage
 *   /realtime/*  → Realtime (WebSocket)
 *   остальное    → статика из dist/
 */
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import httpProxy from 'http-proxy';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const UPSTREAM = (process.env.SUPABASE_UPSTREAM || 'https://theybeeteusxwxboczhe.supabase.co').replace(/\/+$/, '');
const UPSTREAM_HOST = new URL(UPSTREAM).host;
const PORT = Number(process.env.PORT) || 3000;

const PROXY_PATH = /^\/(auth|rest|storage|realtime)(\/|$)/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
};

const proxy = httpProxy.createProxyServer({
  target: UPSTREAM,
  changeOrigin: true,
  secure: true,
  ws: true,
  xfwd: true,
  proxyTimeout: 60_000,
  timeout: 60_000,
});

proxy.on('error', (error, req, res) => {
  const message = error?.code || error?.message || 'proxy_error';
  console.error(`[proxy] ${req?.method} ${req?.url}: ${message}`);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'supabase_unreachable', message }));
  } else if (res && typeof res.end === 'function') {
    res.end();
  }
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function resolveStatic(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(ROOT, safe);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) return null;
  return filePath;
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  let filePath = resolveStatic(urlPath);

  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat = null;
  try {
    stat = statSync(filePath);
  } catch {
    stat = null;
  }

  if (!stat || stat.isDirectory()) {
    // У отсутствующих ассетов не должно быть SPA-fallback: иначе браузер
    // получит HTML вместо JS и сломается с непонятной ошибкой.
    if (urlPath.startsWith('/assets/')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    filePath = join(ROOT, 'index.html');
    try {
      stat = statSync(filePath);
    } catch {
      res.writeHead(500);
      res.end('dist/index.html not found — build did not run');
      return;
    }
  }

  const ext = extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${sep}assets${sep}`) || /-[A-Za-z0-9_]{8}\./.test(filePath);
  const cacheControl = immutable ? 'public, max-age=31536000, immutable' : 'no-cache';

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/health') {
    sendJson(res, 200, {
      ok: true,
      upstream: UPSTREAM_HOST,
      root: ROOT,
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  if (PROXY_PATH.test(urlPath)) {
    req.headers.host = UPSTREAM_HOST;
    proxy.web(req, res, { target: UPSTREAM });
    return;
  }

  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (!PROXY_PATH.test(urlPath)) {
    socket.destroy();
    return;
  }
  req.headers.host = UPSTREAM_HOST;
  proxy.ws(req, socket, head, { target: UPSTREAM });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`kanban runtime on :${PORT}, upstream ${UPSTREAM_HOST}, dist ${ROOT}`);
});

function shutdown(signal) {
  console.log(`[shutdown] ${signal}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
