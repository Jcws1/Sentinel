import { unitGlyphs } from '../../renderers/unitGlyphs';
import { affiliationSymbols } from '../../renderers/symbology';
import type { UnitPlacement } from '../../contracts/generated';

export function AffiliationMark({
  category,
}: {
  category: UnitPlacement['category'];
}) {
  const symbol = affiliationSymbols[category];
  return (
    <svg
      className="affiliation-mark"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      style={{ color: symbol.color }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      {symbol.shape === 'rectangle' ? (
        <rect x="3" y="5" width="18" height="14" />
      ) : symbol.shape === 'diamond' ? (
        <path d="M12 2 22 12 12 22 2 12Z" />
      ) : (
        <circle cx="12" cy="12" r="8" />
      )}
    </svg>
  );
}
export function UnitSilhouette({
  profileId,
}: {
  profileId?: UnitPlacement['profileId'];
}) {
  const path = profileId && unitGlyphs[profileId];
  return path ? (
    <svg
      className="unit-silhouette"
      data-profile={profileId}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={path} fill="currentColor" fillRule="evenodd" />
    </svg>
  ) : (
    <span
      className="unit-silhouette-fallback"
      title="No vehicle silhouette assigned"
      aria-label="No vehicle silhouette assigned"
    >
      ?
    </span>
  );
}
