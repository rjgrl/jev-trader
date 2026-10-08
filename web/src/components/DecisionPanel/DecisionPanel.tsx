"use client";

import type { TraderEvent, Decision } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import styles from "./DecisionPanel.module.css";

export interface DecisionPanelProps {
  latest: TraderEvent | null;
}

type Chosen = "buy" | "sell" | null;

interface BarRowProps {
  label: string;
  labelColor: string;
  active: boolean;
  value: number;
  fill: string;
  pct: string;
}

function BarRow({ label, labelColor, active, value, fill, pct }: BarRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.label} style={{ color: labelColor, opacity: active ? 1 : 0.38 }}>
        {label}
      </span>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: fill }} />
      </div>
      <span className={styles.pct}>{pct}</span>
    </div>
  );
}

export default function DecisionPanel({ latest }: DecisionPanelProps) {
  const decisionEvent = latest?.type === "decision" ? latest : null;
  const decision = decisionEvent?.data.decision ?? null;
  const snapshot = decisionEvent?.data.snapshot ?? null;

  const probs = decision?.probabilities ?? { buy: 0, sell: 0, hold: 0 };
  const chosen: Chosen = decision && decision.action !== "hold" ? decision.action : null;

  const decided = decision !== null && chosen !== null;
  const pctOf = (p: number) => (decided ? fmtPct(p) : "-");

  const headline = chosen ? (chosen === "buy" ? "BUY" : "SELL") : "HOLD";
  const headlineColor = chosen
    ? chosen === "buy"
      ? "var(--buy-ink)"
      : "var(--sell-ink)"
    : "var(--muted)";
  const headlinePct = chosen ? fmtPct(probs[chosen]) : "";

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <div className={styles.sectionLabel}>STANDING ORDER</div>
        <div className={styles.order}>
          {"> market order on XAUUSD via MT5. every tick. no abstaining."}
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.sectionLabel} ${styles.sectionLabelGap}`}>
          WHICH SIDE THIS TICK?
        </div>

        <div className={styles.headline} style={{ color: headlineColor }}>
          <span className={styles.headlineWord}>{headline}</span>
          {headlinePct ? <span className={styles.headlinePct}>{headlinePct}</span> : null}
        </div>

        <BarRow
          label="buy"
          labelColor="var(--buy-ink)"
          active={chosen === "buy"}
          value={probs.buy}
          fill={chosen === "buy" ? "var(--buy-bar)" : "var(--buy-bar-dim)"}
          pct={pctOf(probs.buy)}
        />
        <BarRow
          label="sell"
          labelColor="var(--sell-ink)"
          active={chosen === "sell"}
          value={probs.sell}
          fill={chosen === "sell" ? "var(--sell-bar)" : "var(--sell-bar-dim)"}
          pct={pctOf(probs.sell)}
        />
      </section>

      {snapshot && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>MARKET</div>
          <div className={styles.market}>
            <div>Bid: {snapshot.bid.toFixed(2)}</div>
            <div>Ask: {snapshot.ask.toFixed(2)}</div>
            <div>Spread: {snapshot.spreadBps.toFixed(1)} bps</div>
            <div>Pos: {snapshot.positionSide} {snapshot.positionSize.toFixed(2)}</div>
          </div>
        </section>
      )}
    </div>
  );
}