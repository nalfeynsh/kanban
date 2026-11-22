const CACHE = new Map();
const CACHE_MS = 5 * 60 * 1000;
const MAX_TEXT = 12000;

function cacheGet(text) {
  const item = CACHE.get(text);
  if (!item || Date.now() - item.at > CACHE_MS) return null;
  return item.matches;
}

function cacheSet(text, matches) {
  CACHE.set(text, { at: Date.now(), matches });
  if (CACHE.size > 100) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }
}

/**
 * Проверка орфографии/грамматики через LanguageTool.
 * В production — через same-origin /api/spellcheck (server.js),
 * в dev — напрямую, потому что Vite не обслуживает этот endpoint.
 */
export async function checkSpelling(text, language = 'ru-RU') {
  const value = String(text || '').slice(0, MAX_TEXT);
  if (value.trim().length < 3) return [];
  const cached = cacheGet(value);
  if (cached) return cached;

  const params = new URLSearchParams({ text: value, language, enabledOnly: 'false' });
  const response = import.meta.env.DEV
    ? await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
    : await fetch('/api/spellcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, language }),
      });

  if (!response.ok) return [];
  const result = await response.json();
  const matches = (result.matches || []).slice(0, 80).map((match) => ({
    offset: match.offset,
    length: match.length,
    message: match.message || match.shortMessage || 'Возможная ошибка',
    shortMessage: match.shortMessage || '',
    replacements: (match.replacements || []).slice(0, 8).map((item) => item.value),
    ruleId: match.ruleId || match.rule?.id || '',
    issueType: match.issueType || match.rule?.issueType || '',
  }));
  cacheSet(value, matches);
  return matches;
}
