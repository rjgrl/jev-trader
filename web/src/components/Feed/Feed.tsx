"use client";

import type { TraderEvent } from "@/lib/types";
import { fmtPrice, fmtSigned } from "@/lib/format";
import styles from "./Feed.module.css";

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export interface FeedProps {
  events: TraderEvent[];
}

export default function Feed({ events }: FeedProps) {
  const items = [...events].reverse().slice(0, 50);

  return (
    <div className={styles.feed}>
      <div className={styles.header}>EVENT FEED</div>
      {items.length === 0 ? (
        <div className={styles.empty}>waiting for events…</div>
      ) : (
        <div className={styles.list}>
          {items.map((e, i) => (
            <div key={i} className={`${styles.item} ${styles[e.type]}`}>
              <span className={styles.time}>{fmtTime(e.data.timestamp)}</span>
              <span className={styles.type}>{e.type.toUpperCase()}</span>
              <span className={styles.detail}>{renderDetail(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderDetail(e: TraderEvent): string {
  const d = e.data;
  switch (e.type) {
    case "tick":
      return `${d.snapshot.symbol} bid=${d.snapshot.bid.toFixed(2)} ask=${d.snapshot.ask.toFixed(2)} spread=${d.snapshot.spreadBps.toFixed(1)}bps pos=${d.snapshot.positionSide} ${d.snapshot.positionSize.toFixed(2)}`;
    case "decision":
      return `${d.decision.action.toUpperCase()} buy=${(d.decision.probabilities.buy * 100).toFixed(0)}% sell=${(d.decision.probabilities.sell * 100).toFixed(0)}% lat=${d.decision.latencyMs}ms`;
    case "order":
      return `${d.action} ${d.volume} @ ${d.price.toFixed(2)}${d.sl ? ` SL=${d.sl.toFixed(2)}` : ""}${d.tp ? ` TP=${d.tp.toFixed(2)}` : ""} ${d.error ? `ERR: ${d.error}` : d.result?.retcodeStr ?? ""}`;
    case "fill":
      return `FILL ${d.type} ${d.volume} @ ${d.price.toFixed(2)} pnl=$${d.profit.toFixed(2)}`;
    case "position":
      return `${d.positions.length} position(s)`;
    case "pnl":
      return `bal=$${d.balance.toFixed(2)} eq=$${d.equity.toFixed(2)} free=$${d.freeMargin.toFixed(2)} float=$${d.floatingPnL.toFixed(2)} realized=$${d.realizedPnL.toFixed(2)} daily=$${d.dailyPnL.toFixed(2)}`;
    case "risk":
      return d.allowed ? "OK" : `BLOCKED: ${d.reason}`;
    case "error":
      return `${d.message} (${d.context})`;
    case "connection":
      return d.connected ? "CONNECTED" : `DISCONNECTED${d.reason ? `: ${d.reason}` : ""}`;
    default:
      return "";
  }
}