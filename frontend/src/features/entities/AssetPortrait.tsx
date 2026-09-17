import { useId } from 'react';

/** Original, decorative quadcopter illustration; not an aircraft drawing or live feed. */
export function AssetPortrait({ drone }: { drone: boolean }) {
  const shellId = useId();
  return (
    <figure
      className="asset-portrait"
      aria-label={
        drone
          ? 'Generic drone illustration, not a live feed'
          : 'Entity image not assigned'
      }
    >
      {drone ? (
        <svg viewBox="0 0 320 132" aria-hidden="true">
          <defs>
            <linearGradient id={shellId} x1="0" y1="0" x2="0.4" y2="1">
              <stop stopColor="#d4d8da" />
              <stop offset="0.45" stopColor="#687078" />
              <stop offset="1" stopColor="#242a30" />
            </linearGradient>
          </defs>
          <g fill="none" strokeLinecap="round">
            <path
              d="m160 63-73-30m73 30 74-30m-74 37-78 28m78-28 78 28"
              stroke="#101519"
              strokeWidth="12"
            />
            <path
              d="m160 59-73-30m73 30 74-30m-74 36-78 29m78-29 78 29"
              stroke="#969fa7"
              strokeWidth="5"
            />
            <path
              d="m160 64-72-30m72 30 74-30m-74 36-78 27m78-27 78 27"
              stroke="#49525a"
              strokeWidth="5"
            />
            {[
              [87, 32],
              [234, 32],
              [82, 96],
              [238, 96],
            ].map(([x, y]) => (
              <g key={x}>
                <ellipse
                  cx={x}
                  cy={y}
                  rx="41"
                  ry="13"
                  stroke="#515b64"
                  strokeWidth="0.6"
                />
                <path
                  d={`M${x - 36} ${y - 4} Q${x} ${y - 10} ${x + 35} ${y + 5} Q${x} ${y + 11} ${x - 36} ${y - 4}`}
                  fill="#b0b7bc"
                  stroke="#e0e4e6"
                  strokeWidth="0.5"
                />
                <circle cx={x} cy={y} r="4" fill="#273139" stroke="#909ba3" />
              </g>
            ))}
          </g>
          <path
            d="m144 39 16-6 18 8 8 36-18 19-23-16-8-22Z"
            fill={`url(#${shellId})`}
            stroke="#929ba3"
            strokeWidth="0.7"
          />
          <path
            d="m144 39 16 17 18-15m-18 15 8 40"
            fill="none"
            stroke="#c0c8cf"
            strokeWidth="0.6"
          />
          <path d="m147 43 12-5 13 5-12 9Z" fill="#171e24" />
          <circle cx="161" cy="76" r="6" fill="#111920" stroke="#596975" />
          <circle cx="161" cy="76" r="2.5" fill="#485864" />
        </svg>
      ) : (
        <span>No image assigned</span>
      )}
      <figcaption>{drone ? 'Illustration' : 'Image'}</figcaption>
    </figure>
  );
}
