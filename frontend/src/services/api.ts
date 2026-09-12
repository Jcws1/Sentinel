import { decodeCatalog, validateFrame } from '../contracts/decode';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function request(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetcher(url, init);
  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status})`);
  }
  return response.json();
}

export function createApi(base: string, fetcher: Fetcher) {
  return {
    async listMissions(signal: AbortSignal) {
      return decodeCatalog(
        await request(fetcher, `${base}/missions`, { signal }),
      );
    },
    async advanceFixture(
      missionId: string,
      expectedSequence: number,
      signal: AbortSignal,
    ) {
      // Validation covers the ACK, but only the subscription may publish a frame.
      return validateFrame(
        await request(
          fetcher,
          `${base}/fixtures/${encodeURIComponent(missionId)}/advance`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedSequence }),
            signal,
          },
        ),
      );
    },
  };
}
