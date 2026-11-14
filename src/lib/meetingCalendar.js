/**
 * Календарные ссылки и ICS для встреч.
 *
 * Это one-way MVP: событие добавляется в календарь участника по ссылке/файлу.
 * Двусторонняя OAuth-синхронизация Google/Outlook будет отдельным этапом.
 */

function utcStamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function compactDate(value) {
  return utcStamp(value);
}

function escapeIcs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line) {
  // RFC 5545: строки не длиннее 75 октетов; простая символьная свёртка.
  const chunks = String(line).match(/.{1,70}/g) ?? [''];
  return chunks.join('\r\n ');
}

function attendeeLine(attendee) {
  if (!attendee?.email) return null;
  const status =
    attendee.status === 'accepted'
      ? 'ACCEPTED'
      : attendee.status === 'declined'
        ? 'DECLINED'
        : 'NEEDS-ACTION';
  return `ATTENDEE;CN=${escapeIcs(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=${status}:mailto:${attendee.email}`;
}

export function buildMeetingIcs(meeting, { organizer, attendees = [], joinUrl, now = new Date() } = {}) {
  const descriptionParts = [
    meeting.description,
    joinUrl ? `Подключиться: ${joinUrl}` : '',
    attendees.length > 0
      ? `Участники: ${attendees.map((item) => item.name || item.email).filter(Boolean).join(', ')}`
      : '',
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Moy Kanban//VKS//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@kanban.layero.app`,
    `DTSTAMP:${utcStamp(now)}`,
    `LAST-MODIFIED:${utcStamp(now)}`,
    `DTSTART:${compactDate(meeting.start_at)}`,
    `DTEND:${compactDate(meeting.end_at)}`,
    `SUMMARY:${escapeIcs(meeting.title)}`,
    `DESCRIPTION:${escapeIcs(descriptionParts.join('\n'))}`,
    joinUrl ? `LOCATION:${escapeIcs(joinUrl)}` : '',
    joinUrl ? `URL:${joinUrl}` : '',
    `STATUS:${meeting.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(`Встреча через 30 минут: ${meeting.title}`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(`Встреча через 5 минут: ${meeting.title}`)}`,
    'END:VALARM',
  ];

  if (organizer?.email) {
    lines.push(
      `ORGANIZER;CN=${escapeIcs(organizer.name || organizer.email)}:mailto:${organizer.email}`,
    );
  }
  attendees.forEach((attendee) => {
    const line = attendeeLine(attendee);
    if (line) lines.push(line);
  });

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.filter(Boolean).map(foldLine).join('\r\n')}\r\n`;
}

export function googleCalendarUrl(meeting, { joinUrl } = {}) {
  const dates = `${compactDate(meeting.start_at)}/${compactDate(meeting.end_at)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: meeting.title,
    dates,
    details: [meeting.description, joinUrl ? `Подключиться: ${joinUrl}` : ''].filter(Boolean).join('\n'),
    location: joinUrl || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(meeting, { joinUrl } = {}) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: meeting.title,
    startdt: new Date(meeting.start_at).toISOString(),
    enddt: new Date(meeting.end_at).toISOString(),
    body: [meeting.description, joinUrl ? `Подключиться: ${joinUrl}` : ''].filter(Boolean).join('\n'),
    location: joinUrl || '',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function downloadMeetingIcs(meeting, options = {}) {
  const content = buildMeetingIcs(meeting, options);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `meeting-${meeting.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
