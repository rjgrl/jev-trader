"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TraderEvent, ConnectionState, Meta } from "@/lib/types";
import { fmtInt, shortAddr } from "@/lib/format";
import styles from "./Header.module.css";

export interface HeaderProps {
  meta: Meta | null;
  latest: TraderEvent | null;
  connection: ConnectionState;
}

const OFFLINE_LABEL: Partial<Record<ConnectionState, string>> = {
  connecting: "connecting",
  reconnecting: "reconnecting",
};

export default function Header({ meta, latest, connection }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onCopy = useCallback(() => {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  }, []);

  const model = meta?.model ?? null;
  const isJev = (model ?? "").toLowerCase().startsWith("jev");
  const offline = OFFLINE_LABEL[connection] ?? null;
  const tradingMode = meta?.tradingMode ?? "dry-run";
  const isLive = tradingMode === "live" && !meta?.dryRun;

  return (
    <div className={styles.header}>
      <span className={styles.brand}>‖ Jev Trader</span>

      <span className={styles.symbol}>XAUUSD</span>

      <span className={styles.spacer} />

      {offline ? <span className={styles.offline}>{offline}</span> : null}

      <span className={styles.mode} style={{ color: isLive ? "var(--pnl-neg)" : "var(--pnl-pos)" }}>
        {isLive ? "LIVE" : "DRY RUN"}
      </span>

      {model ? (
        <span
          className={styles.badge}
          style={{
            background: isJev ? "var(--badge-jev-bg)" : "var(--badge-standin-bg)",
            color: isJev ? "var(--badge-jev-fg)" : "var(--badge-standin-fg)",
          }}
        >
          {model}
        </span>
      ) : null}

      <span className={styles.block}>tick {latest?.data.timestamp ? fmtInt(latest.data.timestamp) : "-"}</span>
    </div>
  );
}