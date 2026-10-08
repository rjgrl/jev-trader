import { config } from "./config";
import { MT5Broker } from "./broker/MT5Broker";
import { MT5MarketData } from "./market/MT5MarketData";
import { RiskManager } from "./risk/RiskManager";
import { createModel } from "./model";
import { Trader, type TraderEvent } from "./trader";
import { startServer } from "./server";

const broker = new MT5Broker();
const marketData = new MT5MarketData(broker);
const riskManager = new RiskManager();
const model = createModel();

const server = startServer(
  { model: model.name, dryRun: config.tradingMode === "dry-run", tradingMode: config.tradingMode, symbol: config.mt5Symbol, startedAt: Date.now() },
  () => trader.history,
);

const trader = new Trader(
  broker,
  marketData,
  riskManager,
  model,
  (e) => {
    server.broadcastEvent(e);
    logEvent(e);
  },
);

async function logEvent(e: TraderEvent) {
  if (e.type === "tick") {
    const s = e.data.snapshot;
    console.log(`[TICK] ${s.symbol} bid=${s.bid.toFixed(2)} ask=${s.ask.toFixed(2)} spread=${s.spreadBps.toFixed(1)}bps pos=${s.positionSide} ${s.positionSize} eq=$${s.equity.toFixed(2)}`);
  } else if (e.type === "decision") {
    const d = e.data.decision;
    const p = d.probabilities;
    const action = d.action.toUpperCase();
    console.log(`[AI] ${action} buy=${(p.buy*100).toFixed(0)}% sell=${(p.sell*100).toFixed(0)}% conf=${(d.upIn10*100).toFixed(0)}% latency=${d.latencyMs}ms`);
  } else if (e.type === "order") {
    const o = e.data;
    const status = o.error ? `ERROR: ${o.error}` : o.result?.retcodeStr ?? "OK";
    console.log(`[ORDER] ${o.action} ${o.volume} @ ${o.price.toFixed(2)} ${o.sl ? `SL=${o.sl.toFixed(2)}` : ""} ${o.tp ? `TP=${o.tp.toFixed(2)}` : ""} → ${status}`);
  } else if (e.type === "fill") {
    const f = e.data;
    console.log(`[FILL] ${f.type} ${f.volume} @ ${f.price.toFixed(2)} profit=$${f.profit.toFixed(2)}`);
  } else if (e.type === "pnl") {
    const p = e.data;
    console.log(`[PNL] bal=$${p.balance.toFixed(2)} eq=$${p.equity.toFixed(2)} free=$${p.freeMargin.toFixed(2)} float=$${p.floatingPnL.toFixed(2)} realized=$${p.realizedPnL.toFixed(2)} daily=$${p.dailyPnL.toFixed(2)}`);
  } else if (e.type === "risk") {
    const r = e.data;
    if (!r.allowed) console.log(`[RISK] BLOCKED: ${r.reason}`);
  } else if (e.type === "error") {
    console.error(`[ERROR] ${e.data.message} (${e.data.context})`);
  } else if (e.type === "connection") {
    console.log(`[CONN] ${e.data.connected ? "CONNECTED" : "DISCONNECTED"}${e.data.reason ? ` (${e.data.reason})` : ""}`);
  }
}

await trader.start();

console.log(`jev-trader · model=${model.name} · ${config.tradingMode.toUpperCase()} · symbol=${config.mt5Symbol} · interval=${config.decisionIntervalMs}ms · minConf=${config.minConfidence} · :${config.port}`);

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await trader.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await trader.stop();
  process.exit(0);
});