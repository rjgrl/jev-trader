"use client";

import { useEffect, useReducer } from "react";
import type { TraderEvent, ConnectionState, FeedState, Meta } from "./types";

export { useUptime } from "./useUptime";

const CAP = 1000;
const BACKOFF_MIN = 1000;
const BACKOFF_MAX = 10_000;
const STALE_MS = 45_000;

interface State extends FeedState {
  latSum: number;
  latCount: number;
}

type Action =
  | { type: "snapshot"; meta: Meta | null; history: TraderEvent[] }
  | { type: "event"; event: TraderEvent }
  | { type: "connection"; connection: ConnectionState };

const initialState: State = {
  meta: null,
  events: [],
  latest: null,
  connection: "connecting",
  avgLatencyMs: 0,
  latSum: 0,
  latCount: 0,
};

function latencyOf(e: TraderEvent): number | null {
  if (e.type !== "decision") return null;
  const d = e.data.decision;
  if (!d || typeof d.latencyMs !== "number" || !Number.isFinite(d.latencyMs)) return null;
  return d.latencyMs;
}

function avg(latSum: number, latCount: number): number {
  return latCount > 0 ? Math.round(latSum / latCount) : 0;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "connection":
      return state.connection === action.connection ? state : { ...state, connection: action.connection };

    case "snapshot": {
      const history = Array.isArray(action.history) ? action.history : [];
      const events = history.length > CAP ? history.slice(history.length - CAP) : history;
      let latSum = 0;
      let latCount = 0;
      for (const e of events) {
        const l = latencyOf(e);
        if (l !== null) {
          latSum += l;
          latCount++;
        }
      }
      return {
        meta: action.meta ?? state.meta,
        events,
        latest: events.length ? events[events.length - 1] : null,
        connection: "live",
        avgLatencyMs: avg(latSum, latCount),
        latSum,
        latCount,
      };
    }

    case "event": {
      const ev = action.event;
      if (!ev) return state;
      const prev = state.events;
      const last = prev.length ? prev[prev.length - 1] : null;

      if (last && ev.timestamp <= (last.data.timestamp ?? 0)) {
        return state;
      }

      let latSum = state.latSum;
      let latCount = state.latCount;
      const n = latencyOf(ev);
      if (n !== null) {
        latSum += n;
        latCount++;
      }
      let events = prev.concat(ev);
      if (events.length > CAP) {
        const drop = events.length - CAP;
        for (let i = 0; i < drop; i++) {
          const l = latencyOf(events[i]);
          if (l !== null) {
            latSum -= l;
            latCount--;
          }
        }
        events = events.slice(drop);
      }
      return {
        ...state,
        events,
        latest: ev,
        avgLatencyMs: avg(latSum, latCount),
        latSum,
        latCount,
      };
    }

    default:
      return state;
  }
}

function parseMeta(raw: Record<string, unknown> | null): Meta | null {
  if (!raw) return null;
  return {
    model: typeof raw.model === "string" ? raw.model : "",
    dryRun: Boolean(raw.dryRun),
    tradingMode: typeof raw.tradingMode === "string" ? raw.tradingMode : "dry-run",
    symbol: typeof raw.symbol === "string" ? raw.symbol : "XAUUSD",
    startedAt: typeof raw.startedAt === "number" ? raw.startedAt : Date.now(),
  };
}

export function useFeed(apiUrl: string): FeedState {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const base = (apiUrl || "").replace(/\/+$/, "");

    let closed = false;
    let attempt = 0;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;

    const armStaleTimer = () => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        if (!closed) scheduleReconnect();
      }, STALE_MS);
    };

    const teardown = () => {
      if (es) {
        es.onopen = null;
        es.onerror = null;
        es.close();
        es = null;
      }
      if (staleTimer) clearTimeout(staleTimer);
    };

    const scheduleReconnect = () => {
      if (closed) return;
      teardown();
      dispatch({ type: "connection", connection: "reconnecting" });
      const delay = Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** attempt);
      attempt++;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, delay);
    };

    const handle = (type: string, fn: (data: unknown) => void) => {
      es?.addEventListener(type, (raw: Event) => {
        armStaleTimer();
        const payload = (raw as MessageEvent).data;
        if (typeof payload !== "string" || !payload) return;
        let data: unknown;
        try {
          data = JSON.parse(payload);
        } catch {
          return;
        }
        fn(data);
      });
    };

    function connect() {
      if (closed) return;
      dispatch({ type: "connection", connection: attempt === 0 ? "connecting" : "reconnecting" });
      es = new EventSource(`${base}/events`);

      es.onopen = () => {
        attempt = 0;
        dispatch({ type: "connection", connection: "live" });
        armStaleTimer();
      };
      es.onerror = () => {
        if (!closed) scheduleReconnect();
      };

      handle("snapshot", (data) => {
        const d = (data ?? {}) as Record<string, unknown>;
        const history = Array.isArray(d.history) ? (d.history as TraderEvent[]) : [];
        dispatch({ type: "snapshot", meta: parseMeta(d), history });
      });

      ["tick", "decision", "order", "fill", "position", "pnl", "risk", "error", "connection"].forEach((type) => {
        handle(type, (data) => {
          dispatch({ type: "event", event: { type: type as TraderEvent["type"], data } });
        });
      });

      handle("ping", () => {
        dispatch({ type: "connection", connection: "live" });
      });
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      teardown();
    };
  }, [apiUrl]);

  return state;
}

export default useFeed;