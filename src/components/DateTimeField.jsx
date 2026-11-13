import { isDateOnly, parseDateValue, toDateInputValue, fromDateTimeLocalValue } from '../lib/format';

const pad = (value) => String(value).padStart(2, '0');

function splitValue(value) {
  if (!value) return { date: '', time: '' };
  const date = parseDateValue(value);
  if (!date) return { date: '', time: '' };
  return {
    date: toDateInputValue(value),
    time: isDateOnly(value) ? '' : `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function combine(date, time) {
  if (!date) return null;
  if (!time) return date;
  return fromDateTimeLocalValue(`${date}T${time}`);
}

/**
 * Дата + необязательное время.
 *
 * Специально два отдельных поля вместо datetime-local: после выбора даты
 * календарь закрывается, а время — очевидный следующий шаг. Плюс пресеты,
 * чтобы не открывать календарь ради «сегодня/завтра».
 */
export default function DateTimeField({ value, onChange, withTime = true }) {
  const { date, time } = splitValue(value);

  const setDate = (nextDate) => onChange(combine(nextDate, time));
  const setTime = (nextTime) => onChange(combine(date || toDateInputValue(new Date()), nextTime));

  const applyPreset = (offsetDays) => {
    const next = new Date();
    next.setDate(next.getDate() + offsetDays);
    onChange(combine(toDateInputValue(next), time));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="glass-input min-w-0 flex-1 !py-1.5 !text-xs"
          aria-label="Дата"
        />
        {withTime && (
          <input
            type="time"
            value={time}
            step="900"
            onChange={(event) => setTime(event.target.value)}
            className="glass-input w-[7.25rem] shrink-0 !py-1.5 !text-xs"
            aria-label="Время"
            title="Время можно не указывать"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => applyPreset(0)} className="glass-btn !px-2 !py-1 !text-[0.65rem]">
          Сегодня
        </button>
        <button type="button" onClick={() => applyPreset(1)} className="glass-btn !px-2 !py-1 !text-[0.65rem]">
          Завтра
        </button>
        <button type="button" onClick={() => applyPreset(3)} className="glass-btn !px-2 !py-1 !text-[0.65rem]">
          +3 дня
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="glass-btn !px-2 !py-1 !text-[0.65rem] !text-rose-600 dark:!text-rose-300"
          >
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}
