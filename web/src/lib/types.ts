export type Action = "buy" | "sell" | "hold";
export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface MarketSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadBps: number;
  timestamp: number;
  positionSize: number;
  positionSide: "LONG" | "SHORT" | "FLAT" | "HEDGED";
  balance: number;
  equity: number;
  freeMargin: number;
}

export interface Decision {
  action: Action;
  probabilities: { buy: number; sell: number; hold: number };
  upIn10: number;
  latencyMs: number;
  inputTokens: number;
}

export interface OrderResult {
  retcode: number;
  retcodeStr: string;
  deal: number;
  order: number;
  volume: number;
  price: number;
  comment: string;
  requestId: number;
}

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

export interface Position {
  ticket: number;
  symbol: string;
  type: number;
  typeStr: string;
  volume: number;
  priceOpen: number;
  sl: number;
  tp: number;
  priceCurrent: number;
  swap: number;
  profit: number;
  commission: number;
  magic: number;
  comment: string;
  timeOpen: number;
  timeUpdate: number;
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

export interface Meta {
  model: string;
  dryRun: boolean;
  tradingMode: string;
  symbol: string;
  startedAt: number;
}

export type ConnectionState = "connecting" | "live" | "reconnecting";

export interface FeedState {
  meta: Meta | null;
  events: TraderEvent[];
  latest: TraderEvent | null;
  connection: ConnectionState;
  avgLatencyMs: number;
}