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
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_kKouck2JRHJt04F0cMHk8g_alzlnidd';

const PROXY_PATH = /^\/(auth|rest|storage|realtime)(\/|$)/;

/** Последний ответ Яндекса на запрос userinfo — только статус и текст ошибки */
let lastYandex = { status: null, at: null, error: null };
/** Последний обмен кода на токен — без самих токенов */
let lastYandexToken = { status: null, at: null, error: null };
/** Последняя ошибка OAuth, которую прислал браузер после возврата */
let lastClientOauth = { at: null, code: null, description: null, href: null };

function readJsonBody(req, limit = 4096) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** Прокси обмена кода Яндекс-токена: нужен, чтобы видеть ошибку обмена */
async function proxyYandexToken(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;

  try {
    const upstream = await fetch('https://oauth.yandex.ru/token', { method: 'POST', headers, body });
    const text = await upstream.text();

    lastYandexToken = {
      status: upstream.status,
      at: new Date().toISOString(),
      error: upstream.ok ? null : text.slice(0, 300),
    };

    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  } catch (error) {
    console.error(`[yandex-token] ${error?.message || error}`);
    sendJson(res, 502, { error: 'yandex_unreachable' });
  }
}

/**
 * Яндекс принимает токен только как `Authorization: OAuth <token>`,
 * а Supabase (oauth2-клиент) шлёт `Bearer`. Этот эндпоинт принимает
 * Bearer от Supabase, меняет схему на OAuth и проксирует ответ Яндекса.
 */
async function proxyYandexUserinfo(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    res.end();
    return;
  }

  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) {
    sendJson(res, 401, { error: 'missing_token' });
    return;
  }

  try {
    const upstream = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${token}`, Accept: 'application/json' },
    });
    const raw = await upstream.text();

    let body = raw;
    let idType = null;

    if (upstream.ok) {
      try {
        const data = JSON.parse(raw);
        idType = typeof data.id;
        // GoTrue ждёт provider_id строкой; Яндекс может вернуть число.
        if (data.id !== undefined) data.id = String(data.id);
        if (data.default_email !== undefined) data.default_email = String(data.default_email);
        body = JSON.stringify(data);
      } catch {
        // не JSON — отдадим как есть
      }
    }

    lastYandex = {
      status: upstream.status,
      at: new Date().toISOString(),
      idType,
      error: upstream.ok ? null : raw.slice(0, 300),
    };

    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  } catch (error) {
    console.error(`[yandex-userinfo] ${error?.message || error}`);
    sendJson(res, 502, { error: 'yandex_unreachable' });
  }
}

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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Вызов PostgREST RPC от имени anon; доступ проверяет сам API-токен внутри функции. */
async function callRpc(name, params) {
  const response = await fetch(`${UPSTREAM}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params || {}),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      text ||
      `RPC ${name} failed`;
    const error = new Error(String(message));
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
}

function apiToken(req) {
  const header = String(req.headers.authorization || '');
  return header.replace(/^Bearer\s+/i, '').trim() || String(req.headers['x-api-key'] || '').trim();
}

function apiErrorStatus(error) {
  const message = String(error?.message || '');
  if (/invalid_token/i.test(message)) return 401;
  if (/forbidden/i.test(message)) return 403;
  if (/not_found/i.test(message)) return 404;
  if (/external_id_required|invalid_source|token_name_required|invalid input/i.test(message)) return 400;
  return error?.status && error.status < 500 ? error.status : 500;
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/v1/health') {
    sendJson(res, 200, { ok: true, api: 'v1', time: new Date().toISOString() });
    return;
  }

  const token = apiToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'missing_token', message: 'Передайте Authorization: Bearer <token>.' });
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/columns') {
      const data = await callRpc('api_v1_columns', { p_token: token });
      sendJson(res, 200, { data });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/tasks') {
      const since = url.searchParams.get('since');
      const limit = Number(url.searchParams.get('limit')) || 200;
      if (since && Number.isNaN(Date.parse(since))) {
        sendJson(res, 400, { error: 'invalid_since', message: 'since должен быть ISO-8601.' });
        return;
      }
      const data = await callRpc('api_v1_tasks', {
        p_token: token,
        p_since: since || null,
        p_limit: limit,
      });
      sendJson(res, 200, { data });
      return;
    }

    const taskMatch = url.pathname.match(/^\/api\/v1\/tasks\/([0-9a-fA-F-]{36})$/);
    if (req.method === 'GET' && taskMatch) {
      const data = await callRpc('api_v1_task', { p_token: token, p_id: taskMatch[1] });
      sendJson(res, 200, { data });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
      const body = await readJsonBody(req, 512 * 1024);
      if (!body) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      const externalId = body.external_id;
      const source = body.source || body.external_source || 'igor';
      const payload = { ...body };
      delete payload.external_id;
      delete payload.source;
      delete payload.external_source;
      if (!externalId) {
        sendJson(res, 400, { error: 'external_id_required' });
        return;
      }
      const data = await callRpc('api_v1_upsert_task', {
        p_token: token,
        p_source: source,
        p_external_id: String(externalId),
        p_payload: payload,
      });
      sendJson(res, 200, { data: data?.task, created: data?.created, skipped: data?.skipped });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/tasks/archive') {
      const body = await readJsonBody(req, 16 * 1024);
      if (!body?.external_id) {
        sendJson(res, 400, { error: 'external_id_required' });
        return;
      }
      const data = await callRpc('api_v1_archive_task', {
        p_token: token,
        p_source: body.source || 'igor',
        p_external_id: String(body.external_id),
      });
      sendJson(res, 200, { data });
      return;
    }

    sendJson(res, 404, { error: 'not_found', message: 'Неизвестный метод API.' });
  } catch (error) {
    console.error(`[api] ${req.method} ${url.pathname}: ${error?.message || error}`);
    sendJson(res, apiErrorStatus(error), {
      error: 'api_error',
      message: error?.message || 'Ошибка API',
    });
  }
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
    // файла нет — ниже отдадим index.html (SPA-fallback)
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

  if (urlPath === '/api/v1' || urlPath.startsWith('/api/v1/')) {
    handleApi(req, res, new URL(req.url || '/', 'http://localhost'));
    return;
  }

  if (urlPath === '/health') {
    sendJson(res, 200, {
      ok: true,
      upstream: UPSTREAM_HOST,
      root: ROOT,
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  if (urlPath === '/yandex-userinfo') {
    proxyYandexUserinfo(req, res);
    return;
  }

  if (urlPath === '/yandex-last') {
    sendJson(res, 200, lastYandex);
    return;
  }

  if (urlPath === '/yandex-token') {
    proxyYandexToken(req, res);
    return;
  }

  if (urlPath === '/yandex-token-last') {
    sendJson(res, 200, lastYandexToken);
    return;
  }

  if (urlPath === '/client-oauth-error' && req.method === 'POST') {
    readJsonBody(req).then((payload) => {
      if (payload) {
        lastClientOauth = {
          at: new Date().toISOString(),
          code: String(payload.code || '').slice(0, 200),
          description: String(payload.description || '').slice(0, 1000),
          href: String(payload.href || '').slice(0, 1000),
        };
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if (urlPath === '/client-oauth-last') {
    sendJson(res, 200, lastClientOauth);
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
