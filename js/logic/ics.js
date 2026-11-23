// js/logic/ics.js - PURE: build an iCalendar (.ics) file from calendar items, importable into Google/Outlook/Apple Calendar.
// Timed items use "floating" local time (no timezone), all-day items use DATE values.
// Lines are CRLF-terminated and folded at 75 characters as RFC 5545 requires.

import { addDays, timeToMinutes } from '../utils.js';

const stamp = (date, time) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
const esc = (t) => String(t ?? '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');

function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
  return parts.join('\r\n');
}

function plusMinutes(time, minutes) {
  const total = Math.min(timeToMinutes(time) + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** items: {date, time, endTime?, title, sub, category}. `now` is injectable so tests are deterministic. */
export function buildICS(items, { calName = 'StudentOS', now = new Date() } = {}) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudentOS//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  items.forEach((it, i) => {
    lines.push('BEGIN:VEVENT', `UID:${i}-${it.date}-${it.category}@studentos`, `DTSTAMP:${dtstamp}`);
    if (it.time) {
      const end = it.endTime && it.endTime > it.time ? it.endTime : plusMinutes(it.time, 60);
      lines.push(`DTSTART:${stamp(it.date, it.time)}`, `DTEND:${stamp(it.date, end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${it.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${addDays(it.date, 1).replaceAll('-', '')}`);
    }
    lines.push(`SUMMARY:${esc(it.title)}`, `DESCRIPTION:${esc(it.sub || it.category)}`, `CATEGORIES:${esc(it.category)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
