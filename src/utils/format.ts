import { format, isValid, parseISO } from 'date-fns';

export function formatINR(amount: number, compact = false): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (compact) {
    if (abs >= 10000000) {
      return `${sign}₹${(abs / 10000000).toFixed(2)} crore`;
    }
    if (abs >= 100000) {
      return `${sign}₹${(abs / 100000).toFixed(2)} lakh`;
    }
  }

  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

export function formatINRCompactShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(0)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

export function formatReadableDate(isoDate: string | null | undefined, pattern = 'MMM dd, yyyy'): string {
  if (!isoDate) return 'Not specified';
  const parsed = parseISO(isoDate);
  if (!isValid(parsed)) return isoDate;
  return format(parsed, pattern);
}

export function formatShortDate(isoDate: string | null | undefined): string {
  return formatReadableDate(isoDate, 'MMM dd');
}
