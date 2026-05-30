import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import updateLocale from 'dayjs/plugin/updateLocale';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(updateLocale);

// Shorten relative time strings
dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s ago',
    s: 's',
    m: '1m',
    mm: '%dm',
    h: '1h',
    hh: '%dh',
    d: '1d',
    dd: '%dd',
    M: '1mo',
    MM: '%dmo',
    y: '1y',
    yy: '%dy'
  }
});

export function formatInr(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.format('DD MMM YYYY');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.format('DD MMM YYYY, h:mm A');
}

export function fromNow(value) {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.fromNow();
}

export function getDueTone(dueDate, isPaid) {
  if (isPaid) return 'success';
  if (!dueDate) return 'neutral';
  const d = dayjs(dueDate);
  if (!d.isValid()) return 'neutral';
  const diff = d.diff(dayjs(), 'day');
  if (diff < 0) return 'danger';
  if (diff <= 3) return 'warning';
  return 'info';
}

export function getDueCopy(dueDate, isPaid) {
  if (isPaid) return 'Paid';
  if (!dueDate) return null;
  const d = dayjs(dueDate);
  if (!d.isValid()) return null;
  const diff = d.diff(dayjs(), 'day');
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

export function isValidServiceNumber(value) {
  return /^\d{13}$/.test(String(value || '').trim());
}
