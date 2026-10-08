"use client";

import { useEffect, useState } from "react";
import type { TraderEvent, Meta } from "@/lib/types";
import { fmtInt, uptime } from "@/lib/format";
import styles from "./StatsRow.module.css";

const DASH = "-";

export default function StatsRow({
  latest,
  avgLatencyMs,
  meta,
}: {
  latest: TraderEvent | null;
  avgLatencyMs: number;
  meta: Meta | null;
}) {
  const startedAt = meta?.startedAt ?? null;
  const [up, setUp] = useState<string | null>(null);

  useEffect(() => {
    if (startedAt == null) {
      setUp(null);
      return;
    }
    const tick = () => setUp(uptime(startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const decisionEvent = latest?.type === "decision" ? latest : null;
  const decision = decisionEvent?.data.decision ?? null;
  const last = decision ? `${decision.latencyMs} ms` : `${DASH} ms`;
  const avg = Number.isFinite(avgLatencyMs) && avgLatencyMs > 0 ? `${Math.round(avgLatencyMs)}ms` : DASH;

  const pnlEvent = latest?.type === "pnl" ? latest : null;
  const pnl = pnlEvent?.data;

  const fillsEvent = Array.from({ length: 100 }, (_, i) => latest).filter((e) => e?.type === "fill");
  const fills = fillsEvent.length;

  return (
    <div className={styles.stats}>
      <span>last {last}</span>
      <span>avg {avg}</span>
      <span className={styles.nowrap}>{decisionEvent ? "1" : DASH} calls</span>
      <span className={styles.nowrap}>{fills} fills</span>
      <span className={styles.spacer} />
      {pnl && (
        <>
          <span>eq $${pnl.equity.toFixed(2)}</span>
          <span>free $${pnl.freeMargin.toFixed(2)}</span>
          <span style={{ color: pnl.floatingPnL >= 0 ? "var(--pnl-pos)" : "var(--pnl-neg)" }}>
            float $${pnl.floatingPnL.toFixed(2)}
          </span>
          <span style={{ color: pnl.dailyPnL >= 0 ? "var(--pnl-pos)" : "var(--pnl-neg)" }}>
            daily $${pnl.dailyPnL.toFixed(2)}
          </span>
        </>
      )}
      <span className={styles.spacer} />
      <span>uptime {up ?? "00:00:00"}</span>
    </div>
  );
}