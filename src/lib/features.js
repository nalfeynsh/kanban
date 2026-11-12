/**
 * Временные флаги функций.
 *
 * YANDEX_LOGIN_ENABLED = false — вход и привязка Яндекс ID временно скрыты:
 * Яндекс отдаёт токен и профиль, но Supabase падает на создании identity.
 * Подробности и план возврата — AGENTS.md, §8 п.12.
 */
export const YANDEX_LOGIN_ENABLED = false;
