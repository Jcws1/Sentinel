import { useEffect, useState } from 'react';

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Wall time only. This never advances operational or replay time. */
export function WallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      className="wall-clock"
      role="group"
      aria-label="Current time, UTC plus 8"
    >
      <time dateTime={now.toISOString()}>{clockFormat.format(now)}</time>
      <span>UTC+8</span>
    </div>
  );
}
