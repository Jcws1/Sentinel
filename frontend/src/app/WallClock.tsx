import { useEffect, useState } from 'react';
import { formatSgt } from '../world/time';

/** Wall time only. This never advances operational or replay time. */
export function WallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="wall-clock" role="group" aria-label="Wall time, Singapore">
      <time dateTime={now.toISOString()} title={formatSgt(now, { date: true })}>
        {formatSgt(now).replace(' SGT', '')}
      </time>
      <span>SGT</span>
    </div>
  );
}
