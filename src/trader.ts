import { appendFileSync, mkdirSync } from "node:fs";
import { config } from "./config";
import { MT5Broker } from "./broker/MT5Broker";
import { MT5MarketData } from "./market/MT5MarketData";
import { RiskManager } from "./risk/RiskManager";
import type { Model, Decision, TradeState } from "./model";
import type { MarketSnapshot } from "./market/MarketData";
import type { SymbolInfo, Position, OrderResult } from "./broker/TradingBroker";

export type Action = "buy" | "sell" | "hold";
export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface TickEvent {
  timestamp: number;
  snapshot: MarketSnapshot;
}

export interface DecisionEvent {
  timestamp: number;
  decision: Decision;
  snapshot: MarketSnapshot;
  allowed: { buy: boolean; sell: boolean };
}

export interface OrderEvent {
  timestamp: number;
  action: TradeAction;
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  result: OrderResult | null;
  error?: string;
}

export interface FillEvent {
  timestamp: number;
  ticket: number;
  symbol: string;
  type: "BUY" | "SELL";
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
}

export interface PositionEvent {
  timestamp: number;
  positions: Position[];
}

export interface PnLEvent {
  timestamp: number;
  balance: number;
  equity: number;
  freeMargin: number;
  floatingPnL: number;
  realizedPnL: number;
  dailyPnL: number;
}

export interface RiskEvent {
  timestamp: number;
  allowed: boolean;
  reason?: string;
  metrics: any;
}

export interface ConnectionEvent {
  timestamp: number;
  connected: boolean;
  reason?: string;
}

export interface ErrorEvent {
  timestamp: number;
  message: string;
  context?: string;
}

export type TraderEvent =
  | { type: "tick"; data: TickEvent }
  | { type: "decision"; data: DecisionEvent }
  | { type: "order"; data: OrderEvent }
  | { type: "fill"; data: FillEvent }
  | { type: "position"; data: PositionEvent }
  | { type: "pnl"; data: PnLEvent }
  | { type: "risk"; data: RiskEvent }
  | { type: "connection"; data: ConnectionEvent }
  | { type: "error"; data: ErrorEvent }
  | { type: "ping"; data: { timestamp: number } };

export interface Timing {
  readMs: number;
  decideMs: number;
  executeMs: number;
  loopMs: number;
}

export interface Totals {
  ticks: number;
  decisions: number;
  orders: number;
  fills: number;
  errors: number;
  jevUsd: number;
  realizedUsd: number;
  pnlUsd: number;
  pnlPct: number;
}

interface PendingOrder {
  action: TradeAction;
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  timestamp: number;
}

export class Trader {
  readonly history: TraderEvent[] = [];
  private broker: MT5Broker;
  private marketData: MT5MarketData;
  private riskManager: RiskManager;
  private model: Model;
  private onEvent: (e: TraderEvent) => void;
  private running = false;
  private busy = false;
  private lastSnapshot: MarketSnapshot | null = null;
  private pendingOrder: PendingOrder | null = null;
  private positionCache: Position[] = [];
  private realizedPnL = 0;
  private totals: Totals = {
    ticks: 0,
    decisions: 0,
    orders: 0,
    fills: 0,
    errors: 0,
    jevUsd: 0,
    realizedUsd: 0,
    pnlUsd: 0,
    pnlPct: 0,
  };
  private recentMids: number[] = [];
  private maxRecentMids = 200;
  private decisionInterval: ReturnType<typeof setInterval> | null = null;
  private symbolInfo: SymbolInfo | null = null;

  constructor(
    broker: MT5Broker,
    marketData: MT5MarketData,
    riskManager: RiskManager,
    model: Model,
    onEvent: (e: TraderEvent) => void
  ) {
    this.broker = broker;
    this.marketData = marketData;
    this.riskManager = riskManager;
    this.model = model;
    this.onEvent = onEvent;
    mkdirSync("data", { recursive: true });
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.broker.connect();
    this.symbolInfo = await this.broker.getSymbolInfo(this.broker.getSymbol());

    this.marketData.onSnapshot((snapshot) => this.onSnapshot(snapshot));
    this.marketData.startPolling(config.decisionIntervalMs);

    this.running = true;
    this.emit({ type: "connection", data: { timestamp: Date.now(), connected: true } });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = null;
    }

    this.marketData.stopPolling();
    await this.marketData.disconnect();
    this.emit({ type: "connection", data: { timestamp: Date.now(), connected: false, reason: "Stopped" } });
  }

  private async onSnapshot(snapshot: MarketSnapshot): Promise<void> {
    this.lastSnapshot = snapshot;
    this.totals.ticks++;
    this.recentMids.push(snapshot.mid);
    if (this.recentMids.length > this.maxRecentMids) this.recentMids.shift();

    this.emit({ type: "tick", data: { timestamp: Date.now(), snapshot } });
    this.emitPnL(snapshot);
    this.emitPosition(await this.broker.getPositions(this.broker.getSymbol()));
    this.checkStaleness(snapshot);
  }

  private checkStaleness(snapshot: MarketSnapshot): void {
    const staleness = Date.now() - snapshot.timestamp;
    if (staleness > config.decisionIntervalMs * 5) {
      this.emit({ type: "error", data: { timestamp: Date.now(), message: `Stale market data: ${staleness}ms`, context: "snapshot" } });
      if (staleness > config.decisionIntervalMs * 10) {
        this.emit({ type: "connection", data: { timestamp: Date.now(), connected: false, reason: "Stale market data" } });
      }
    }
  }

  private async makeDecision(): Promise<void> {
    if (this.busy || !this.lastSnapshot || !this.symbolInfo) return;
    if (!this.riskManager.canTrade()) return;

    this.busy = true;
    const t0 = performance.now();

    try {
      const snapshot = this.lastSnapshot;
      const state = this.buildState(snapshot);
      const decision = await this.model.decide(state);

      this.totals.decisions++;
      this.totals.jevUsd += (decision.inputTokens / 1e6) * config.jevUsdPerMTok;

      const action: TradeAction = decision.action === "sell" ? "SELL" : decision.action === "buy" ? "BUY" : "HOLD";
      const confidence = Math.max(decision.probabilities.buy, decision.probabilities.sell);

      this.emit({ type: "decision", data: { timestamp: Date.now(), decision, snapshot, allowed: state.allowed } });

      if (action !== "HOLD" && confidence >= config.minConfidence) {
        const check = this.riskManager.checkPreTrade(snapshot, this.symbolInfo, action, config.maxPositionSize);
        this.emit({ type: "risk", data: { timestamp: Date.now(), allowed: check.allowed, reason: check.reason, metrics: this.riskManager.getMetrics(snapshot) } });

        if (check.allowed && check.maxVolume && check.maxVolume >= this.symbolInfo.volumeMin) {
          await this.executeOrder(action as "BUY" | "SELL", check.maxVolume, snapshot);
        }
      }
    } catch (e) {
      this.totals.errors++;
      this.emit({ type: "error", data: { timestamp: Date.now(), message: (e as Error).message, context: "decision" } });
    } finally {
      this.busy = false;
    }
  }

  private buildState(snapshot: MarketSnapshot): TradeState {
    const m = this.recentMids;
    const n = m.length;
    const ret = (k: number) => n > k ? ((m[n - 1]! - m[n - 1 - k]!) / m[n - 1 - k]!) * 10000 : 0;

    return {
      market: "XAUUSD",
      timestamp: snapshot.timestamp,
      horizonMs: config.decisionIntervalMs * 10,
      mid: snapshot.mid,
      spread: snapshot.spread,
      spreadBps: snapshot.spreadBps,
      bid: snapshot.bid,
      ask: snapshot.ask,
      positionSize: snapshot.positionSize,
      positionSide: snapshot.positionSide,
      balance: snapshot.balance,
      equity: snapshot.equity,
      freeMargin: snapshot.freeMargin,
      dailyPnL: this.riskManager.getDailyPnL(),
      recentMids: m.slice(-20),
      recentReturns: { last1: ret(1), last5: ret(5), last20: ret(20), last100: ret(100) },
      allowed: { buy: true, sell: true },
    };
  }

  private async executeOrder(action: "BUY" | "SELL", volume: number, snapshot: MarketSnapshot): Promise<void> {
    if (this.pendingOrder) {
      this.emit({ type: "error", data: { timestamp: Date.now(), message: "Pending order exists", context: "execute" } });
      return;
    }

    const executeStart = performance.now();
    const orderType = action === "BUY" ? this.broker.getOrderTypeBuy() : this.broker.getOrderTypeSell();
    const price = action === "BUY" ? snapshot.ask : snapshot.bid;

    const sl = this.riskManager.calculateStopLossPrice(this.symbolInfo!, snapshot, action, price) ?? undefined;
    const tp = this.riskManager.calculateTakeProfitPrice(this.symbolInfo!, snapshot, action, price) ?? undefined;

    this.pendingOrder = { action, volume, price, sl: sl ?? undefined, tp: tp ?? undefined, timestamp: Date.now() };

    try {
      let result: OrderResult | null = null;
      let error: string | undefined;

      if (config.tradingMode === "live" && config.allowLiveTrading) {
        result = await this.broker.placeOrder({
          symbol: this.broker.getSymbol(),
          type: orderType,
          volume,
          price,
          sl,
          tp,
          deviation: config.maxSlippagePoints,
          magic: 123456,
          comment: "jev-trader",
          typeFilling: 1,
        });

        if (result.retcode !== 10009 && result.retcode !== 10008) {
          error = `Order failed: ${result.retcodeStr} (${result.retcode})`;
        }
      } else {
        result = {
          retcode: 10009,
          retcodeStr: "DRY_RUN",
          deal: 0,
          order: 0,
          volume,
          price,
          comment: "dry-run",
          requestId: 0,
        };
      }

      this.totals.orders++;
      this.emit({ type: "order", data: { timestamp: Date.now(), action, volume, price, sl, tp, result, error } });

      if (!error && result && result.retcode === 10009) {
        await this.refreshPositions();
      }
    } catch (e) {
      this.totals.errors++;
      this.emit({ type: "order", data: { timestamp: Date.now(), action, volume, price, sl, tp, result: null, error: (e as Error).message } });
    } finally {
      this.pendingOrder = null;
    }
  }

  private async refreshPositions(): Promise<void> {
    const positions = await this.broker.getPositions(this.broker.getSymbol());
    this.positionCache = positions;
    this.emitPosition(positions);
  }

  private emitPosition(positions: Position[]): void {
    this.emit({ type: "position", data: { timestamp: Date.now(), positions } });
  }

  private emitPnL(snapshot: MarketSnapshot): void {
    const floatingPnL = snapshot.equity - snapshot.balance;
    this.totals.pnlUsd = this.totals.realizedUsd + floatingPnL;
    this.totals.pnlPct = (this.totals.pnlUsd / config.bankrollUsd) * 100;

    this.emit({
      type: "pnl",
      data: {
        timestamp: Date.now(),
        balance: snapshot.balance,
        equity: snapshot.equity,
        freeMargin: snapshot.freeMargin,
        floatingPnL,
        realizedPnL: this.totals.realizedUsd,
        dailyPnL: this.riskManager.getDailyPnL(),
      },
    });
  }

  private emit(event: TraderEvent): void {
    this.history.push(event);
    if (this.history.length > config.historySize) this.history.shift();
    appendFileSync("data/events.jsonl", JSON.stringify(event) + "\n");
    this.onEvent(event);
  }

  getTotals(): Totals {
    return { ...this.totals };
  }

  getHistory(): TraderEvent[] {
    return [...this.history];
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastSnapshot(): MarketSnapshot | null {
    return this.lastSnapshot;
  }

  getPendingOrder(): PendingOrder | null {
    return this.pendingOrder;
  }
}