export const DEFAULT_TIMES = Object.freeze({
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '18:30',
  sleep: '22:30',
});

const IDS = Object.keys(DEFAULT_TIMES);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function assertDate(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError('A valid Date is required.');
  }
}

export function dayKey(now) {
  assertDate(now);
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validateTimes(times) {
  return !!times && typeof times === 'object' && !Array.isArray(times)
    && IDS.every(id => typeof times[id] === 'string' && TIME_PATTERN.test(times[id]));
}

function assertTimes(times) {
  if (!validateTimes(times)) throw new RangeError('All four reminder times must use HH:mm.');
}

export function eventDate(day, time) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
      || typeof time !== 'string' || !TIME_PATTERN.test(time)) {
    throw new RangeError('A valid YYYY-MM-DD date and HH:mm time are required.');
  }
  const at = new Date(`${day}T${time}:00+08:00`);
  if (!Number.isFinite(at.getTime()) || dayKey(at) !== day) {
    throw new RangeError('The calendar date does not exist.');
  }
  return at;
}

function nextDay(day) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
}

function schedule(day, times) {
  return IDS.map(id => ({ id, at: eventDate(day, times[id]) }))
    .sort((a, b) => a.at - b.at);
}

export function nextReminder(now, times = DEFAULT_TIMES, done = []) {
  assertDate(now);
  assertTimes(times);
  const today = dayKey(now);
  const next = schedule(today, times).find(item => item.at >= now && !done.includes(item.id));
  if (next) return { ...next, tomorrow: false };
  return { ...schedule(nextDay(today), times)[0], tomorrow: true };
}

export function dueReminders(now, times = DEFAULT_TIMES, done = [], notified = []) {
  assertDate(now);
  assertTimes(times);
  return schedule(dayKey(now), times)
    .filter(({ id, at }) => {
      const elapsed = now - at;
      return elapsed >= 0 && elapsed < 10 * 60 * 1000
        && !done.includes(id) && !notified.includes(`${id}:${times[id]}`);
    })
    .map(item => item.id);
}

function calendarEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// iCalendar folds by UTF-8 bytes, without splitting a Chinese character.
function foldLine(line) {
  const encoder = new TextEncoder();
  const lines = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (size + width > 75) {
      lines.push(current);
      current = ' ';
      size = 1;
    }
    current += char;
    size += width;
  }
  lines.push(current);
  return lines.join('\r\n');
}

export function calendarText(times = DEFAULT_TIMES, now = new Date()) {
  assertDate(now);
  assertTimes(times);
  const today = dayKey(now);
  const copy = {
    breakfast: ['曾靳雯，吃早餐啦', '新的一天，从一顿早餐开始。'],
    lunch: ['曾靳雯，吃午饭啦', '先把事情放一放，好好吃顿午饭。'],
    dinner: ['曾靳雯，吃晚饭啦', '给今天留一顿热乎乎的晚餐。'],
    sleep: ['曾靳雯，早点睡觉', '今天就到这里吧，剩下的交给明天。'],
  };
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jinwen Little Day//Daily Reminders//ZH',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:给靳雯的小小提醒',
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];
  for (const id of IDS) {
    let start = eventDate(today, times[id]);
    if (start < now) start = eventDate(nextDay(today), times[id]);
    const [title, description] = copy[id];
    lines.push(
      'BEGIN:VEVENT', `UID:${id}@jinwen-little-day`, `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${utcStamp(start)}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
      `SUMMARY:${calendarEscape(title)}`, `DESCRIPTION:${calendarEscape(description)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M',
      `DESCRIPTION:${calendarEscape(title)}`, 'END:VALARM', 'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
