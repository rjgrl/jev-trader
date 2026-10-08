"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TraderEvent, MarketSnapshot } from "@/lib/types";
import { fmtConf, fmtMon, fmtPrice, fmtSigned, fmtSignedMon } from "@/lib/format";
import { smoothPath } from "./smooth";
import styles from "./FlowChart.module.css";

const STEP = 10;
const ANCHOR_GAP = 88;
const PAD_TOP = 84;
const PAD_BOTTOM = 72;
const EASE = 0.1;
const MIN_RANGE_PCT = 0.002;
const CELL_W = 6;
const CELL_H = 18;
const TAG_W = 58;

function cellFill(e: TraderEvent): string {
  if (e.type === "decision" && e.data.decision.action === "hold") return "var(--late-cell)";
  if (e.type === "order") return e.data.action === "BUY" ? "var(--buy-bar)" : "var(--sell-bar)";
  if (e.type === "fill") return e.data.type === "BUY" ? "var(--buy-bar)" : "var(--sell-bar)";
  return "var(--hold-cell)";
}

export default function FlowChart({
  events,
  latest,
}: {
  events: TraderEvent[];
  latest: TraderEvent | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const originRef = useRef<number | null>(null);
  const scaleRef = useRef<{ lo: number; hi: number; tick: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize((s) =>
        Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5
          ? s
          : { w: Math.round(r.width), h: Math.round(r.height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;

  const model = useMemo(() => {
    const plotH = h - PAD_TOP - PAD_BOTTOM;
    if (w < 160 || plotH < 60) return null;

    const relevantEvents = events.filter((e) => e.type === "tick" || e.type === "decision" || e.type === "order" || e.type === "fill");
    const n = Math.max(2, Math.ceil((w - ANCHOR_GAP) / STEP) + 2);
    let series = relevantEvents.slice(-n);
    const tail = series[series.length - 1];
    if (latest && (!tail || latest.data.timestamp > tail.data.timestamp)) series = [...series, latest].slice(-n);
    else if (latest && tail && latest.data.timestamp === tail.data.timestamp) series[series.length - 1] = latest;
    const last = series[series.length - 1];
    if (!last) return null;

    if (originRef.current === null) originRef.current = series[0].data.timestamp;
    const origin = originRef.current;
    const fx = (ts: number) => (ts - origin) / (config.decisionIntervalMs || 1000) * STEP;

    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let count = 0;
    for (const e of series) {
      if (e.type === "tick") {
        const mid = e.data.snapshot.mid;
        if (mid < lo) lo = mid;
        if (mid > hi) hi = mid;
        sum += mid;
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    const floor = Math.max(mean * MIN_RANGE_PCT, 1e-9);
    if (hi - lo < floor) {
      lo = mean - floor / 2;
      hi = mean + floor / 2;
    }
    const prev = scaleRef.current;
    if (prev) {
      if (prev.tick === last.data.timestamp) {
        lo = prev.lo;
        hi = prev.hi;
      } else {
        lo = prev.lo + (lo - prev.lo) * EASE;
        hi = prev.hi + (hi - prev.hi) * EASE;
      }
      for (const e of series) {
        if (e.type === "tick") {
          const mid = e.data.snapshot.mid;
          if (mid < lo) lo = mid;
          if (mid > hi) hi = mid;
        }
      }
      if (hi - lo < floor) {
        const c = (hi + lo) / 2;
        lo = c - floor / 2;
        hi = c + floor / 2;
      }
    }
    scaleRef.current = { lo, hi, tick: last.data.timestamp };

    const range = hi - lo || 1;
    const fy = (p: number) => PAD_TOP + (1 - (p - lo) / range) * plotH;

    const ticks = series.filter((e) => e.type === "tick");
    const pts = ticks.map((e) => [fx(e.data.timestamp), fy(e.data.snapshot.mid)] as const);
    const line = smoothPath(pts);
    const base = h - PAD_BOTTOM;
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`;

    const cells = series.map((e, i) => ({
      key: `${e.type}-${e.data.timestamp}`,
      x: fx(e.data.timestamp) - CELL_W / 2,
      fill: cellFill(e),
      opacity: i === series.length - 1 ? 1 : e.type === "order" && e.data.result?.retcodeStr === "sent" ? 0.6 : 0.82,
    }));

    const beads = series
      .filter((e) => e.type === "fill")
      .map((e) => ({
        key: `${e.type}-${e.data.timestamp}`,
        x: fx(e.data.timestamp),
        y: fy(e.data.price),
        fill: e.data.type === "BUY" ? "var(--buy)" : "var(--sell)",
      }));

    const tickLabels = [0.25, 0.5, 0.75].map((f) => ({
      y: PAD_TOP + plotH * f,
      label: fmtPrice(lo + (1 - f) * range),
    }));

    const byTick = new Map(series.map((e) => [e.data.timestamp, e]));

    return {
      line,
      area,
      cells,
      beads,
      hot: beads.length ? beads[beads.length - 1] : null,
      hotCell: cells[cells.length - 1],
      ticks: tickLabels,
      byTick,
      fx,
      fy,
      last,
      base,
      shift: w - ANCHOR_GAP - fx(last.data.timestamp),
      endY: last.type === "tick" ? fy(last.data.snapshot.mid) : fy(last.data.price ?? last.data.snapshot?.mid ?? 0),
    };
  }, [events, latest, w, h]);

  const hv = useMemo(() => {
    if (!model || hover === null) return null;
    const e = model.byTick.get(hover);
    if (!e) return null;
    const x = model.fx(e.data.timestamp);
    const flip = x + model.shift > w - 168;
    const ty = Math.min(Math.max(model.fy(e.type === "tick" ? e.data.snapshot.mid : e.data.price) - 92, PAD_TOP - 46), model.base - 82);
    const side = e.type === "fill" ? (e.data.type === "BUY" ? "BUY" : "SELL") : e.type === "order" ? e.data.action : null;
    const q = e.type === "order" ? e.data : null;
    const detail = q ? `${q.action} ${q.volume} @ ${fmtPrice(q.price)}` : side ? `FILL ${side} ${fmtMon(e.data.volume, 2)}` : "tick";
    return {
      x,
      y: e.type === "tick" ? model.fy(e.data.snapshot.mid) : model.fy(e.data.price),
      tx: flip ? x - 146 : x + 14,
      ty,
      time: new Date(e.data.timestamp).toLocaleTimeString(),
      price: e.type === "tick" ? fmtPrice(e.data.snapshot.mid) : fmtPrice(e.data.price),
      trade: detail,
      tint: e.type === "fill" ? (e.data.type === "BUY" ? "var(--buy-ink)" : "var(--sell-ink)") : "var(--muted)",
      lat: e.type === "decision" ? `${Math.round(e.data.decision.latencyMs)} ms` : "—",
    };
  }, [model, hover, w]);

  const shown = latest ?? events[events.length - 1] ?? null;
  const snapshot = shown?.type === "tick" ? shown.data.snapshot : shown?.type === "decision" ? shown.data.snapshot : null;
  const decision = shown?.type === "decision" ? shown.data.decision : null;
  const late = false;
  const act = decision?.action ?? "hold";
  const word =
    act === "buy" ? "Buying" : act === "sell" ? "Selling" : "Holding";
  const wordColor =
    act === "buy"
      ? "var(--buy-ink)"
      : act === "sell"
        ? "var(--sell-ink)"
        : "var(--ink)";
  const conf = decision ? Math.max(decision.probabilities.buy, decision.probabilities.sell, decision.probabilities.hold) : 0;
  const pos = snapshot?.positionSide ?? "FLAT";
  const posSize = snapshot?.positionSize ?? 0;
  const stance = pos === "FLAT" ? "flat" : `${pos} ${posSize.toFixed(2)}`;
  const pnlMon = 0;
  const pnlPct = 0;

  return (
    <div className={styles.wrap}>
      <div
        ref={panelRef}
        className={styles.panel}
        onPointerMove={(ev) => {
          if (ev.pointerType !== "mouse" || !model || originRef.current === null) return;
          const r = ev.currentTarget.getBoundingClientRect();
          const ts = Math.round((ev.clientX - r.left - model.shift) / STEP * (config.decisionIntervalMs || 1000)) + originRef.current;
          const tick = Array.from(model.byTick.keys()).find((k) => Math.abs(k - ts) < (config.decisionIntervalMs || 1000) / 2);
          setHover(tick ?? null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {!model || !shown ? (
          <div className={styles.empty}>waiting for ticks…</div>
        ) : (
          <>
            <svg className={styles.svg} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
              <defs>
                <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(10,10,10,0.07)" />
                  <stop offset="100%" stopColor="rgba(10,10,10,0)" />
                </linearGradient>
              </defs>

              {model.ticks.map((t) => (
                <line key={t.y} className={styles.grid} x1="0" x2={w} y1={t.y} y2={t.y} />
              ))}

              <g className={styles.slide} style={{ transform: `translateX(${model.shift.toFixed(1)}px)` }}>
                <path d={model.area} fill={`url(#g${gid})`} />
                <path className={styles.line} d={model.line} />
                {model.beads.map((b) => (
                  <circle
                    key={b.key}
                    className={b.key === model.hot?.key ? styles.beadPop : undefined}
                    cx={b.x}
                    cy={b.y}
                    r="3"
                    fill={b.fill}
                    opacity="0.7"
                  />
                ))}
                {model.hot ? (
                  <g key={model.hot.key}>
                    <line
                      className={styles.riser}
                      x1={model.hot.x}
                      x2={model.hot.x}
                      y1={h - 40}
                      y2={model.hot.y}
                      stroke={model.hot.fill}
                    />
                    <circle
                      className={styles.ripple}
                      cx={model.hot.x}
                      cy={model.hot.y}
                      r="3"
                      fill="none"
                      stroke={model.hot.fill}
                      strokeWidth="2"
                    />
                  </g>
                ) : null}
                <rect
                  key={`glow${model.hotCell.key}`}
                  className={styles.cellGlow}
                  x={model.hotCell.x}
                  y={h - 40}
                  width={CELL_W}
                  height={CELL_H}
                  rx="3"
                  fill={model.hotCell.fill}
                />
                {model.cells.map((c, i) => (
                  <rect
                    key={c.key}
                    className={i === model.cells.length - 1 ? styles.cellPop : undefined}
                    x={c.x}
                    y={h - 40}
                    width={CELL_W}
                    height={CELL_H}
                    rx="3"
                    fill={c.fill}
                    opacity={c.opacity}
                  />
                ))}
                {hv ? (
                  <g>
                    <line className={styles.cross} x1={hv.x} x2={hv.x} y1={PAD_TOP - 12} y2={model.base + 10} />
                    <circle className={styles.crossDot} cx={hv.x} cy={hv.y} r="4.5" />
                    <g transform={`translate(${hv.tx.toFixed(1)},${hv.ty.toFixed(1)})`}>
                      <rect className={styles.tip} width="132" height="78" rx="10" />
                      <text className={styles.tipBlock} x="12" y="21">{hv.time}</text>
                      <text className={styles.tipPrice} x="12" y="41">{hv.price}</text>
                      <text className={styles.tipSide} x="12" y="58" fill={hv.tint}>{hv.trade}</text>
                      <text className={styles.tipMeta} x="12" y="71">{hv.lat}</text>
                    </g>
                  </g>
                ) : null}
              </g>

              {model.ticks.map((t) => (
                <text key={`l${t.y}`} className={styles.tick} x={w - 8} y={t.y - 5} textAnchor="end">
                  {t.label}
                </text>
              ))}

              <g className={styles.tag} style={{ transform: `translateY(${model.endY.toFixed(1)}px)` }}>
                <line className={styles.guide} x1={w - ANCHOR_GAP + 8} x2={w - TAG_W - 6} y1="0" y2="0" />
                <circle className={styles.halo} cx={w - ANCHOR_GAP} cy="0" r="4" fill="var(--ink)" />
                <circle cx={w - ANCHOR_GAP} cy="0" r="4" fill="var(--ink)" />
                <rect x={w - TAG_W - 4} y="-10" width={TAG_W} height="20" rx="999" fill="var(--ink)" />
                <text className={styles.tagText} x={w - 4 - TAG_W / 2} y="4" textAnchor="middle">
                  {fmtPrice(model.last.type === "tick" ? model.last.data.snapshot.mid : model.last.data.price ?? 0)}
                </text>
              </g>
            </svg>

            <div className={styles.fade} />

            <div className={styles.tl}>
              <div className={styles.price} key={snapshot?.mid}>
                {fmtPrice(snapshot?.mid ?? 0)}
              </div>
              <div className={styles.sub}>
                <span>XAUUSD</span>
                <span>MT5</span>
                <span>{stance}</span>
                <span style={{ color: pnlMon >= 0 ? "var(--pnl-pos)" : "var(--pnl-neg)" }}>
                  p&l {fmtSignedMon(pnlMon, 3)} ({fmtSigned(pnlPct, 2)}%)
                </span>
              </div>
            </div>

            <div className={styles.tr}>
              <div
                className={`${styles.word} ${styles.wordPop}`}
                style={{ color: wordColor }}
              >
                {word}
              </div>
              <div className={styles.sub}>
                <span>{decision ? `${Math.round(decision.latencyMs)} ms` : "—"}</span>
                <span>conf {fmtConf(conf)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const config = { decisionIntervalMs: 1000 };