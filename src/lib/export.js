/**
 * Выгрузка плана в файл: CSV (Excel), MS Project XML (MSPDI), печать в PDF.
 */
import { getTaskSchedule, durationDays, formatRange } from './gantt';
import { getPriority } from './priority';
import { formatDueLong, parseDateValue } from './format';

const pad = (n) => String(n).padStart(2, '0');

function fmtDateTime(date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Строки плана для таблицы и выгрузки */
export function buildScheduleRows({ tasks = [], columns = [], authorById, numberById }) {
  const columnTitle = new Map(columns.map((column) => [column.id, column.title]));

  return tasks
    .map((task) => {
      const schedule = getTaskSchedule(task);
      if (!schedule) return null;
      const author = authorById?.get(task.created_by);
      const assignee = task.assignee_id ? authorById?.get(task.assignee_id) : null;

      return {
        task,
        number: numberById?.get(task.id) ?? '',
        title: task.title || 'Без названия',
        column: columnTitle.get(task.column_id) || '',
        author: author?.full_name || '',
        assignee: assignee?.full_name || '',
        start: schedule.start,
        finish: schedule.finish,
        days: durationDays(schedule),
        priority: getPriority(task.priority).label,
        personal: task.is_private === true,
        notes: String(task.description || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** CSV с BOM и «;» — открывается в Excel без мастера импорта */
export function buildCsv(rows, meta = {}) {
  const header = [
    '№',
    'Задача',
    'Колонка',
    'Постановщик',
    'Исполнитель',
    'Начало',
    'Срок',
    'Длительность, дн',
    'Приоритет',
    'Тип',
  ];

  const lines = [
    [`План: ${meta.name || 'Мой Канбан'}`],
    [`Период: ${meta.period || ''}`],
    [`Сформировано: ${fmtDateTime(new Date())}`],
    [],
    header,
    ...rows.map((row) => [
      row.number,
      row.title,
      row.column,
      row.author,
      row.assignee,
      fmtDateTime(row.start),
      fmtDateTime(row.finish),
      row.days,
      row.priority,
      row.personal ? 'Личная' : 'Командная',
    ]),
  ];

  return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}`;
}

/**
 * MS Project XML (MSPDI) — файл открывается в MS Project
 * через «Файл → Открыть» и сохраняет структуру задач и даты.
 */
export function buildMsProjectXml(rows, meta = {}) {
  const now = new Date();
  const startDate = rows.length ? rows[0].start : now;
  const finishDate = rows.length
    ? rows.reduce((acc, row) => (row.finish > acc ? row.finish : acc), rows[0].finish)
    : now;

  const priorityCode = { 'Высокий': 800, 'Средний': 500, 'Низкий': 300, 'Без приоритета': 500 };

  const tasksXml = rows
    .map((row, index) => {
      const uid = index + 1;
      const hours = Math.max(8, row.days * 8);
      const notes = [
        row.notes,
        row.assignee ? `Исполнитель: ${row.assignee}` : '',
        row.column ? `Колонка: ${row.column}` : '',
        row.personal ? 'Личная задача' : '',
      ]
        .filter(Boolean)
        .join('\n');

      return [
        '    <Task>',
        `      <UID>${uid}</UID>`,
        `      <ID>${uid}</ID>`,
        `      <Name>${xmlEscape(row.number ? `№${row.number} ${row.title}` : row.title)}</Name>`,
        '      <Type>1</Type>',
        '      <IsNull>0</IsNull>',
        `      <CreateDate>${isoLocal(now)}</CreateDate>`,
        `      <WBS>${uid}</WBS>`,
        `      <OutlineNumber>${uid}</OutlineNumber>`,
        '      <OutlineLevel>1</OutlineLevel>',
        `      <Priority>${priorityCode[row.priority] ?? 500}</Priority>`,
        `      <Start>${isoLocal(row.start)}</Start>`,
        `      <Finish>${isoLocal(row.finish)}</Finish>`,
        `      <Duration>PT${hours}H0M0S</Duration>`,
        '      <DurationFormat>7</DurationFormat>',
        `      <Work>PT${hours}H0M0S</Work>`,
        '      <ResumeValid>0</ResumeValid>',
        '      <EffortDriven>0</EffortDriven>',
        '      <Recurring>0</Recurring>',
        '      <OverAllocated>0</OverAllocated>',
        '      <Estimated>0</Estimated>',
        '      <Milestone>0</Milestone>',
        '      <Summary>0</Summary>',
        '      <Critical>0</Critical>',
        '      <IsSubproject>0</IsSubproject>',
        '      <ExternalTask>0</ExternalTask>',
        '      <PercentComplete>0</PercentComplete>',
        '      <PercentWorkComplete>0</PercentWorkComplete>',
        `      <Contact>${xmlEscape(row.author)}</Contact>`,
        `      <Notes>${xmlEscape(notes)}</Notes>`,
        '    </Task>',
      ].join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${xmlEscape(meta.name || 'Мой Канбан')}</Name>
  <Title>${xmlEscape(meta.name || 'План задач')}</Title>
  <Company>${xmlEscape(meta.company || '')}</Company>
  <Author>${xmlEscape(meta.author || '')}</Author>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${isoLocal(startDate)}</StartDate>
  <FinishDate>${isoLocal(finishDate)}</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>09:00:00</DefaultStartTime>
  <DefaultFinishTime>18:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>1</DefaultTaskType>
  <Tasks>
${tasksXml}
  </Tasks>
</Project>
`;
}

/** Имя файла с датой */
export function scheduleFileName(extension) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `kanban-plan-${stamp}.${extension}`;
}

/** Скачивание текста как файла */
export function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function describePeriod(rows) {
  if (!rows.length) return 'нет задач со сроком';
  return formatRange(rows[0].start, rows.reduce((acc, row) => (row.finish > acc ? row.finish : acc), rows[0].finish));
}

export { fmtDateTime, isoLocal, formatDueLong, parseDateValue };
