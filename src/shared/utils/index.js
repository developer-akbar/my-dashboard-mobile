import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export function formatInr(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY');
}

export function formatDateTime(value) {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY, h:mm A');
}

export function fromNow(value) {
  if (!value) return '—';
  return dayjs(value).fromNow();
}

export function getDueTone(dueDate, isPaid) {
  if (isPaid) return 'success';
  if (!dueDate) return 'neutral';
  const diff = dayjs(dueDate).diff(dayjs(), 'day');
  if (diff < 0) return 'danger';
  if (diff <= 3) return 'warning';
  return 'info';
}

export function getDueCopy(dueDate, isPaid) {
  if (isPaid) return 'Paid';
  if (!dueDate) return null;
  const diff = dayjs(dueDate).diff(dayjs(), 'day');
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

export function isValidServiceNumber(value) {
  return /^\d{13}$/.test(String(value || '').trim());
}
