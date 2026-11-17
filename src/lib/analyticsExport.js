import { PRIORITIES } from './priority';

function fmtRange(from, to) {
  const format = (value) =>
    value
      ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
  return `${format(from)} — ${format(to)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function priorityLabel(value) {
  return PRIORITIES.find((priority) => priority.value === Number(value))?.label || 'Без приоритета';
}

export function buildAnalyticsReport({ analytics, projectName, filters, members }) {
  const employee =
    filters.employeeId === 'all'
      ? 'Все сотрудники'
      : members.find((member) => member.id === filters.employeeId)?.full_name || 'Сотрудник';

  const summary = [
    ['Проект', projectName],
    ['Период', fmtRange(filters.from, filters.to)],
    ['Сотрудник', employee],
    ['Создано за период', analytics.createdPeriod],
    ['Бэклог', analytics.backlog],
    ['В работе', analytics.inProgress],
    ['Выполнено', analytics.completed],
    ['Просрочено', analytics.overdue],
    ['В срок', analytics.onTimePct === null ? '—' : `${analytics.onTimePct}%`],
    ['Завершено в срок', analytics.onTime],
    ['Завершено с опозданием', analytics.late],
    ['Архив за период', analytics.archivedPeriod],
    ['Без срока', analytics.noDue],
  ];

  const employees = analytics.byEmployee.map((item) => [
    item.name,
    item.total,
    item.backlog,
    item.inProgress,
    item.completed,
    item.overdue,
    item.onTime,
    item.late,
    item.onTimePct === null ? '—' : `${item.onTimePct}%`,
  ]);

  const priorities = analytics.byPriority.map((item) => [priorityLabel(item.priority), item.count]);

  return { summary, employees, priorities, title: `Аналитика: ${projectName}` };
}

function tableHtml(title, rows, headers) {
  return `<h2>${escapeHtml(title)}</h2><table border="1" cellspacing="0" cellpadding="4"><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function reportHtml(report) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title></head><body>
    <h1>${escapeHtml(report.title)}</h1>
    ${tableHtml('Сводка', report.summary, ['Показатель', 'Значение'])}
    ${tableHtml('По сотрудникам', report.employees, [
      'Сотрудник',
      'Всего',
      'Бэклог',
      'В работе',
      'Выполнено',
      'Просрочено',
      'В срок',
      'С опозданием',
      '% в срок',
    ])}
    ${tableHtml('По приоритетам', report.priorities, ['Приоритет', 'Задач'])}
  </body></html>`;
}

export function downloadAnalyticsExcel(report) {
  const html = reportHtml(report);
  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.title.replace(/[\\/:*?"<>|]/g, '-')}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function printAnalyticsPdf(report) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(
    reportHtml(report).replace(
      '</head>',
      `<style>
        body{font-family:Arial,sans-serif;color:#1e293b;margin:28px}
        h1{font-size:20px;margin:0 0 16px} h2{font-size:15px;margin:20px 0 8px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#eef2ff;text-align:left} td,th{padding:5px 6px;border:1px solid #cbd5e1}
        @media print{@page{size:A4 landscape;margin:12mm}}
      </style></head>`,
    ),
  );
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}
