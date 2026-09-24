import type { Fetcher } from './api';

export interface Finding {
  statement: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceIds: string[];
}
export interface SituationAssessment {
  schemaVersion: '1.0';
  missionId: string;
  frameId: string;
  sequence: number;
  sourceEffectiveAt: string;
  generatedAt: string;
  model: string;
  latencyMs: number;
  summary: string;
  observations: Finding[];
  orientation: Finding[];
  uncertainties: string[];
  attentionItems: string[];
  limitations: string[];
}

export function createObserveOrientClient(base: string, fetcher: Fetcher) {
  return {
    async assess(
      missionId: string,
      frameId: string,
      question: string,
      signal: AbortSignal,
    ): Promise<SituationAssessment> {
      const response = await fetcher(
        `${base}/missions/${encodeURIComponent(missionId)}/observe-orient`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, frameId }),
          signal,
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'detail' in body
            ? String(body.detail)
            : `Observe/Orient request failed (${response.status})`;
        throw new Error(message);
      }
      if (
        !body ||
        typeof body !== 'object' ||
        !('frameId' in body) ||
        body.frameId !== frameId ||
        !('summary' in body) ||
        typeof body.summary !== 'string' ||
        !('observations' in body) ||
        !Array.isArray(body.observations) ||
        !('orientation' in body) ||
        !Array.isArray(body.orientation)
      )
        throw new Error('Observe/Orient response did not match its frame contract.');
      return body as SituationAssessment;
    },
  };
}
