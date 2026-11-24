const CP1251_SPECIAL = new Map(Object.entries({
  'Ђ': 0x80, 'Ѓ': 0x81, '‚': 0x82, 'ѓ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  '€': 0x88, '‰': 0x89, 'Љ': 0x8a, '‹': 0x8b, 'Њ': 0x8c, 'Ќ': 0x8d, 'Ћ': 0x8e, 'Џ': 0x8f,
  'ђ': 0x90, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '™': 0x99, 'љ': 0x9a, '›': 0x9b, 'њ': 0x9c, 'ќ': 0x9d, 'ћ': 0x9e, 'џ': 0x9f,
  'Ў': 0xa1, 'ў': 0xa2, 'Ј': 0xa3, '¤': 0xa4, 'Ґ': 0xa5, '¦': 0xa6, '§': 0xa7, 'Ё': 0xa8,
  '©': 0xa9, 'Є': 0xaa, '«': 0xab, '¬': 0xac, '®': 0xae, 'Ї': 0xaf, '°': 0xb0, '±': 0xb1,
  'І': 0xb2, 'і': 0xb3, 'ґ': 0xb4, 'µ': 0xb5, '¶': 0xb6, '·': 0xb7, 'ё': 0xb8, '№': 0xb9,
  'є': 0xba, '»': 0xbb, 'ј': 0xbc, 'Ѕ': 0xbd, 'ѕ': 0xbe, 'ї': 0xbf,
}));

const CP1251_CYRILLIC = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

function charToCp1251(ch) {
  if (CP1251_SPECIAL.has(ch)) return CP1251_SPECIAL.get(ch);
  const code = ch.charCodeAt(0);
  if (code < 0x80 || (code >= 0xc0 && code <= 0xff)) return code;
  const index = CP1251_CYRILLIC.indexOf(ch);
  if (index >= 0) return 0xc0 + index;
  return null;
}

/**
 * Некоторые старые записи попали в БД дважды закодированными.
 * Пробуем прочитать строку как CP1251-байты и декодировать как UTF-8.
 * Корректные строки возвращаются без изменений.
 */
export function repairMojibake(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!/[ÐÑÂРС]/.test(value)) return value;
  const bytes = [];
  for (const ch of value) {
    const byte = charToCp1251(ch);
    if (byte == null) return value;
    bytes.push(byte);
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decoded || value;
  } catch {
    return value;
  }
}
