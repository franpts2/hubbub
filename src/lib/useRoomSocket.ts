import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CLOSE_REFUSED,
  FATAL_ERRORS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type ClientMessage,
  type ErrorCode,
  type Identity,
  type Role,
  type RoomState,
  type ServerMessage,
} from "../../shared/protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface ConnectOptions {
  code: string;
  role: Role;
  name?: string;
  playerId?: string | null;
  hostToken?: string | null;
}

export interface RoomConnection {
  status: ConnectionStatus;
  state: RoomState | null;
  you: Identity | null;
  error: { code: ErrorCode; message: string } | null;
  send: (message: ClientMessage) => void;
}

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 8_000;

/** Exponential backoff with jitter, so a dropped room does not reconnect in lockstep. */
function backoff(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1));
  return base * (0.7 + Math.random() * 0.6);
}

function socketUrl(options: ConnectOptions): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${location.host}/api/rooms/${options.code}/ws`);
  url.searchParams.set("role", options.role);
  if (options.name) url.searchParams.set("name", options.name);
  if (options.playerId) url.searchParams.set("playerId", options.playerId);
  if (options.hostToken) url.searchParams.set("hostToken", options.hostToken);
  return url.toString();
}

/**
 * Keeps a WebSocket to one room alive.
 *
 * Phones are a hostile environment for long-lived sockets: screens lock, tabs
 * get backgrounded, wifi hands off to cellular. This hook assumes the socket
 * *will* drop and reconnects automatically, resuming the same seat via
 * `playerId`. It only gives up on errors that reconnecting cannot fix.
 *
 * Pass `null` to stay disconnected (for example, before a player picks a name).
 */
export function useRoomSocket(options: ConnectOptions | null): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<Identity | null>(null);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const outboxRef = useRef<ClientMessage[]>([]);

  // Reconnect only when the connection parameters actually change, not on
  // every render of the parent.
  const key = options === null ? null : JSON.stringify(options);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const settings = useMemo(() => options, [key]);

  useEffect(() => {
    if (settings === null) {
      setStatus("closed");
      return;
    }

    let disposed = false;
    let giveUp = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      const ws = new WebSocket(socketUrl(settings));
      socketRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setStatus("open");
        setError(null);

        heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(HEARTBEAT_PING);
        }, HEARTBEAT_MS);

        // Flush anything the player tried to send while offline.
        for (const queued of outboxRef.current.splice(0)) {
          ws.send(JSON.stringify(queued));
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        if (event.data === HEARTBEAT_PONG) return;

        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }

        switch (message.t) {
          case "welcome":
            setYou(message.you);
            setState(message.state);
            break;
          case "state":
            setState(message.state);
            break;
          case "error":
            setError({ code: message.code, message: message.message });
            if (message.fatal) giveUp = true;
            break;
        }
      };

      ws.onclose = (event) => {
        clearInterval(heartbeat);
        if (disposed) return;

        // The server refused us and told us why in the close reason. Retrying
        // would just get refused again.
        if (event.code === CLOSE_REFUSED) {
          giveUp = true;
          const code = event.reason as ErrorCode;
          if (FATAL_ERRORS.has(code)) {
            setError((current) => current ?? { code, message: "Could not join." });
          }
        }

        if (giveUp) {
          setStatus("closed");
          return;
        }

        attempt += 1;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, backoff(attempt));
      };

      // `onerror` is always followed by `onclose`, so reconnection is handled
      // there. Swallow it to avoid an unhandled error in the console.
      ws.onerror = () => {};
    };

    /**
     * Say goodbye explicitly before the page goes away.
     *
     * Tearing down a page drops the TCP connection without sending a
     * WebSocket close frame, and the server does not notice: the socket keeps
     * reporting as OPEN, so the player lingers in the room holding their name
     * and stalling the round. Effect cleanup does not help, because it does
     * not run on navigation or tab close.
     *
     * `pagehide` is the one teardown event that is reliable on mobile
     * Safari, and unlike `unload` it does not disqualify the page from the
     * back/forward cache.
     */
    const onPageHide = () => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Leaving");
      }
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
    };

    /**
     * Restored from the back/forward cache, where we closed the socket on the
     * way out. Timers were frozen too, so reconnect immediately rather than
     * waiting on a backoff that may never fire.
     */
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || disposed || giveUp) return;
      const ws = socketRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        attempt = 0;
        connect();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      const ws = socketRef.current;
      socketRef.current = null;
      if (!ws) return;

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Leaving");
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // Aborting mid-handshake leaves the server holding a connection it
        // never sees closed, so the player lingers in the room as "connected"
        // until the socket times out. Let the handshake finish, then close
        // properly. (This path is hit on every StrictMode double-mount.)
        ws.addEventListener("open", () => ws.close(1000, "Leaving"), { once: true });
      }
    };
  }, [settings]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      // Hold it until we reconnect rather than silently dropping a submission.
      outboxRef.current.push(message);
    }
  }, []);

  return { status, state, you, error, send };
}
