#!/usr/bin/env node
/**
 * Двусторонняя синхронизация задач между нашим Канбаном и доской Игоря.
 *
 * Требуется, чтобы обе стороны поддерживали API v1 из docs/integration-api.md.
 *
 * Запуск:
 *   KANBAN_API_URL=https://kanban.layero.app/api/v1 \
 *   KANBAN_API_TOKEN=kb_... \
 *   IGOR_API_URL=https://igor.example/api/v1 \
 *   IGOR_API_TOKEN=... \
 *   node tools/igor-sync.mjs
 *
 * Курсоры хранятся в .igor-sync-state.json (можно переопределить SYNC_STATE_FILE).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUR_BASE = (process.env.KANBAN_API_URL || 'https://kanban.layero.app/api/v1').replace(/\/+$/, '');
const OUR_TOKEN = process.env.KANBAN_API_TOKEN || '';
const IGOR_BASE = (process.env.IGOR_API_URL || '').replace(/\/+$/, '');
const IGOR_TOKEN = process.env.IGOR_API_TOKEN || '';
const STATE_FILE = resolve(process.env.SYNC_STATE_FILE || '.igor-sync-state.json');
const PAGE_LIMIT = 500;

function fail(message) {
  console.error(`[sync] ${message}`);
  process.exit(1);
}

if (!OUR_TOKEN) fail('не задан KANBAN_API_TOKEN');
if (!IGOR_BASE || !IGOR_TOKEN) fail('не заданы IGOR_API_URL и IGOR_API_TOKEN');

async function call(base, token, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const error = new Error(
      `${options.method || 'GET'} ${path}: ${response.status} ${
        body && typeof body === 'object' ? body.message || body.error : text
      }`,
    );
    error.status = response.status;
    throw error;
  }

  return body;
}

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    return {
      lastPull: state.lastPull || '1970-01-01T00:00:00.000Z',
      lastPush: state.lastPush || '1970-01-01T00:00:00.000Z',
    };
  } catch {
    return { lastPull: '1970-01-01T00:00:00.000Z', lastPush: '1970-01-01T00:00:00.000Z' };
  }
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function fetchChanged(base, token, since) {
  const query = new URLSearchParams({ since, limit: String(PAGE_LIMIT) });
  const body = await call(base, token, `/tasks?${query.toString()}`);
  const rows = Array.isArray(body?.data) ? body.data : [];
  if (rows.length >= PAGE_LIMIT) {
    console.warn('[sync] получено 500 задач — следующий проход продолжит с последнего updated_at');
  }
  return rows;
}

/** Забираем изменения с доски Игоря и применяем у нас. */
async function pullFromIgor(since) {
  const rows = await fetchChanged(IGOR_BASE, IGOR_TOKEN, since);
  let applied = 0;
  let skipped = 0;

  for (const task of rows) {
    const externalId = String(task.external_id || task.id || '');
    if (!externalId) continue;

    const payload = {
      ...task,
      external_id: externalId,
      external_source: 'igor',
    };
    // id из чужой системы не должен трактоваться как наш локальный id.
    delete payload.id;

    const result = await call(OUR_BASE, OUR_TOKEN, '/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (result?.skipped) skipped += 1;
    else applied += 1;
  }

  return { total: rows.length, applied, skipped };
}

/** Отправляем локальные изменения Игорю и связываем внешний id. */
async function pushToIgor(since) {
  const rows = await fetchChanged(OUR_BASE, OUR_TOKEN, since);
  let pushed = 0;

  for (const task of rows) {
    const externalId = String(task.external_id || task.id || '');
    if (!externalId) continue;

    const payload = {
      ...task,
      external_id: externalId,
      external_source: 'kanban',
    };

    await call(IGOR_BASE, IGOR_TOKEN, '/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Первая публикация локальной задачи: сохраняем external_id у нас,
    // чтобы следующие проходы обновляли ту же запись, а не создавали дубль.
    if (!task.external_id) {
      await call(OUR_BASE, OUR_TOKEN, '/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          id: task.id,
          external_id: externalId,
          updated_at: task.updated_at,
        }),
      });
    }

    pushed += 1;
  }

  return { total: rows.length, pushed };
}

const state = await loadState();
const startedAt = new Date().toISOString();

console.log(`[sync] старт ${startedAt}`);
console.log(`[sync] наши: ${OUR_BASE}`);
console.log(`[sync] Игорь: ${IGOR_BASE}`);

try {
  const pull = await pullFromIgor(state.lastPull);
  console.log(
    `[sync] принято от Игоря: ${pull.total}, применено ${pull.applied}, пропущено ${pull.skipped}`,
  );

  const push = await pushToIgor(state.lastPush);
  console.log(`[sync] отправлено Игорю: ${push.pushed} из ${push.total}`);

  await saveState({ lastPull: startedAt, lastPush: startedAt });
  console.log('[sync] успешно');
} catch (error) {
  console.error(`[sync] ошибка: ${error.message}`);
  process.exitCode = 1;
}
