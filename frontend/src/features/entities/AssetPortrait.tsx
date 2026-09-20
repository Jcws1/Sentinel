import { useState } from 'react';
import quadcopter from '../../assets/units/quadcopter.png';
import sting from '../../assets/units/sting-interceptor.png';

/** Static supplied references. Identity never comes from a label or affiliation. */
const portraits = new Map([
  ['hornet-10-v1', { src: quadcopter, name: 'Quadcopter' }],
  ['sting-v1', { src: sting, name: 'STING interceptor' }],
]);

export function AssetPortrait({ profileId }: { profileId?: string }) {
  const portrait = profileId ? portraits.get(profileId) : undefined;
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const available = portrait && !failed.has(portrait.src);
  return (
    <figure className="asset-portrait" aria-label="Static model reference">
      {available ? (
        <img
          src={portrait.src}
          alt={`${portrait.name} — static model reference, not a live feed`}
          draggable={false}
          decoding="async"
          onError={() =>
            setFailed((previous) => new Set([...previous, portrait.src]))
          }
        />
      ) : (
        <span>
          {portrait
            ? 'Reference image unavailable'
            : 'No reference image assigned'}
        </span>
      )}
      {available && <figcaption>Model reference</figcaption>}
    </figure>
  );
}
