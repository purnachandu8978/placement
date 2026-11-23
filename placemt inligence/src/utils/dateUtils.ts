/**
 * Real-world synchronized date & time utilities.
 * Handles UTC ISO strings with or without 'Z', MongoDB timestamps,
 * and formats properly in student's local real-world time.
 */

export function parseServerDate(dateInput?: string | number | Date | null): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'number') return new Date(dateInput);

  let str = String(dateInput).trim();
  if (!str) return new Date();

  // If ISO string without timezone indicator (e.g. 2026-11-22T17:50:00 or with microseconds),
  // PyMongo stores in UTC so append 'Z' to avoid browser parsing as local time
  if (str.includes('T') && !str.endsWith('Z') && !/[+-]\d{2}(?::?\d{2})?$/.test(str)) {
    str += 'Z';
  } else if (!str.includes('T') && str.includes(' ') && !str.endsWith('Z')) {
    // e.g. "2026-11-22 17:50:00"
    str = str.replace(' ', 'T') + 'Z';
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function formatRelativeTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const date = parseServerDate(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45 && diffSec >= -15) {
    return 'Just now';
  }
  if (diffSec < 90 && diffSec >= 45) {
    return '1m ago';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60 && diffMin > 0) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24 && diffHours > 0) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7 && diffDays > 1) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatRealTimeClock(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const date = parseServerDate(dateInput);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRealDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const date = parseServerDate(dateInput);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimerSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
