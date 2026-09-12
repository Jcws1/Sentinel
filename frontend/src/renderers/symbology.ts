import type { Entity } from '../contracts/types';

export interface AffiliationSymbol {
  readonly shape: 'rectangle' | 'diamond' | 'square' | 'circle';
  readonly color: string;
  readonly label: string;
  readonly shortLabel: string;
}

/** Sentinel-owned meaning. Rendering engines translate geometry, not affiliation. */
export const affiliationSymbols = Object.freeze({
  friendly: Object.freeze({
    shape: 'rectangle',
    color: '#7bc8ee',
    label: 'Friendly',
    shortLabel: 'FRIENDLY',
  }),
  hostile: Object.freeze({
    shape: 'diamond',
    color: '#f28a85',
    label: 'Hostile',
    shortLabel: 'HOSTILE',
  }),
  neutral: Object.freeze({
    shape: 'square',
    color: '#a7d6a0',
    label: 'Neutral',
    shortLabel: 'NEUTRAL',
  }),
  unknown: Object.freeze({
    shape: 'circle',
    color: '#dbc98c',
    label: 'Unknown',
    shortLabel: 'UNKNOWN',
  }),
} satisfies Record<Entity['affiliation'], AffiliationSymbol>);
