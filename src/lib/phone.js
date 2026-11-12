/**
 * Телефоны в профиле: храним и показываем в формате +7 (999) 123-45-67.
 * Принимаем любой ввод: 8…, +7…, 999…, с пробелами и скобками.
 */

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** 10 цифр без кода страны; ведущая 8 или 7 отбрасывается */
function nationalDigits(value) {
  let digits = phoneDigits(value);
  if (!digits) return '';
  if (digits[0] === '8') digits = `7${digits.slice(1)}`;
  if (digits[0] === '7') digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function formatPhone(value) {
  const digits = nationalDigits(value);
  if (!digits) return '';

  let out = '+7';
  out += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) out += ')';
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`;
  return out;
}

/** Ссылка tel: для клика по номеру */
export function phoneHref(value) {
  const digits = nationalDigits(value);
  return digits ? `tel:+7${digits}` : null;
}
