import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
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

/** «14.11.26 13:57» — единый читаемый формат даты и времени */
function formatDisplay(value) {
  const date = parseDateValue(value);
  if (!date) return 'Не выбрано';

  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;
  if (isDateOnly(value)) return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Одно поле «дата + время»: показывает итог сразу, а по клику раскрывает
 * простой выбор. После выбора дня календарь закрывается сам, время —
 * следующий очевидный шаг, закрытие — кнопкой «Готово».
 */
export default function DateTimeField({ value, onChange, withTime = true }) {
  const [open, setOpen] = useState(false);
  const { date, time } = splitValue(value);

  const setDate = (nextDate) => onChange(combine(nextDate, time));
  const setTime = (nextTime) => onChange(combine(date || toDateInputValue(new Date()), nextTime));

  const applyPreset = (offsetDays) => {
    const next = new Date();
    next.setDate(next.getDate() + offsetDays);
    onChange(combine(toDateInputValue(next), time));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="glass-input flex w-full items-center justify-between gap-2 !py-1.5 text-left !text-xs"
        aria-expanded={open}
        title="Изменить дату и время"
      >
        <span className={value ? 'font-mono tracking-tight' : 'text-slate-400 dark:text-slate-500'}>
          {formatDisplay(value)}
        </span>
        <CalendarClock size={14} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="mt-1.5 rounded-xl border border-slate-300/70 bg-white/75 p-2.5 shadow-sm dark:border-white/15 dark:bg-white/5">
          <div className="flex gap-1.5">
            <label className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
                Дата
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="glass-input w-full !py-1.5 !text-xs"
              />
            </label>

            {withTime && (
              <label className="w-[7.25rem] shrink-0">
                <span className="mb-0.5 block text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
                  Время
                </span>
                <input
                  type="time"
                  value={time}
                  step="900"
                  onChange={(event) => setTime(event.target.value)}
                  className="glass-input w-full !py-1.5 !text-xs"
                  title="Можно не указывать — задача будет на весь день"
                />
              </label>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
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
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="glass-btn !px-2 !py-1 !text-[0.65rem] !text-rose-600 dark:!text-rose-300"
              >
                Очистить
              </button>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="glass-btn glass-btn-primary !px-2.5 !py-1 !text-[0.65rem]"
            >
              <Check size={12} /> Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
