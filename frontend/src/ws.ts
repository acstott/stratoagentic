import type { Snapshot } from "./types";

function buildWSUrl(): string {
  const WS_BASE_URL =
    (typeof (globalThis as any).WS_BASE_URL === "string" &&
      (globalThis as any).WS_BASE_URL) ||
    "";

  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";

  if (WS_BASE_URL) {
    const base = WS_BASE_URL
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:");

    return `${base.replace(/\/$/, "")}/stream`;
  }

  return `${wsProtocol}//${host}/stream`;
}

export function connectSnapshotStream(
  onSnapshot: (s: Snapshot) => void
): WebSocket {
  const wsUrl = buildWSUrl();
  let ws = new WebSocket(wsUrl);

  let manuallyClosed = false;
  let reconnectTimer: number | null = null;
  let reconnectAttempts = 0;

  const maxReconnectDelayMs = 10000;

  const connect = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reconnectAttempts = 0;
      console.log("WS connected:", wsUrl);
    };

    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as Snapshot;
        onSnapshot(payload);
      } catch (e) {
        console.error("bad ws payload", e, ev.data);
      }
    };

    ws.onclose = (ev) => {
      console.warn("WS closed:", {
        code: ev.code,
        reason: ev.reason || "(no reason)",
        url: wsUrl,
      });

      if (manuallyClosed) return;

      const delay = Math.min(1000 * 2 ** reconnectAttempts, maxReconnectDelayMs);
      reconnectAttempts += 1;

      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
      }

      reconnectTimer = window.setTimeout(() => {
        console.log(`WS reconnecting in ${delay}ms:`, wsUrl);
        connect();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
    };
  };

  connect();

  const originalClose = ws.close.bind(ws);
  ws.close = ((code?: number, reason?: string) => {
    manuallyClosed = true;

    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    originalClose(code, reason);
  }) as typeof ws.close;

  return ws;
}