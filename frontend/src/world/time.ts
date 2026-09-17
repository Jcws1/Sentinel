const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Singapore',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Presentation only: the supplied instant, precision and clock domain stay unchanged. */
export function formatSgt(
  value?: string | Date | null,
  options: { date?: boolean } = {},
) {
  if (!value) return 'Unavailable';
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return 'Unavailable';
  const time = `${clock.format(instant)} SGT`;
  if (!options.date) return time;
  const parts = calendar.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('day')} ${part('month')} ${part('year')} · ${time}`;
}
