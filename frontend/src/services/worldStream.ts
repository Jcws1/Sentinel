export interface StreamSocket {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close(): void;
}
export type SocketFactory = (url: string) => StreamSocket;

export function streamUrl(
  base: string,
  missionId: string,
  pageUrl: string,
): string {
  const url = new URL(
    `${base}/missions/${encodeURIComponent(missionId)}/stream`,
    pageUrl,
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
export const createBrowserSocket: SocketFactory = (url) => {
  const browser = new WebSocket(url);
  const socket: StreamSocket = {
    onmessage: null,
    onerror: null,
    onclose: null,
    close: () => browser.close(),
  };
  browser.onmessage = (event) => socket.onmessage?.({ data: event.data });
  browser.onerror = () => socket.onerror?.();
  browser.onclose = () => socket.onclose?.();
  return socket;
};
