/**
 * Returns the next future UTC Date when a recurring slot (day-of-week + local time) fires.
 * Handles DST correctly via the Intl API — no external deps.
 */
export function nextSlotDateTime(
  dayOfWeek: number,   // 0=Sun … 6=Sat
  timeLocal: string,   // "HH:MM"
  timezone: string,    // IANA, e.g. "America/Chicago"
): Date | null {
  const [hours, minutes] = timeLocal.split(':').map(Number);
  const now = new Date();

  for (let daysAhead = 0; daysAhead <= 8; daysAhead++) {
    const probe = new Date(now.getTime() + daysAhead * 86_400_000);

    if (getLocalDow(probe, timezone) !== dayOfWeek) continue;

    const { year, month, day } = getLocalDateParts(probe, timezone);
    const slotUtc = localToUtc(year, month, day, hours, minutes, timezone);

    if (slotUtc > now) return slotUtc;
  }

  return null;
}

function getLocalDow(utc: Date, tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(utc);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

function getLocalDateParts(utc: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(utc);
  return {
    year:  parseInt(parts.find(p => p.type === 'year')!.value),
    month: parseInt(parts.find(p => p.type === 'month')!.value) - 1,
    day:   parseInt(parts.find(p => p.type === 'day')!.value),
  };
}

function localToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number,
  tz: string,
): Date {
  const approxMs = Date.UTC(year, month, day, hour, minute, 0);

  const readLocal = (ms: number): number => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const g = (t: string) => parseInt(p.find(x => x.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  };

  const offset = approxMs - readLocal(approxMs);
  const candidate = approxMs + offset;

  // Verify — covers the ambiguous DST hour
  const verify = readLocal(candidate);
  const target = Date.UTC(year, month, day, hour, minute, 0);
  if (Math.abs(verify - target) < 60_000) return new Date(candidate);

  return new Date(candidate + (target - verify));
}
