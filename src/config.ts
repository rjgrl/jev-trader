const env = (key: string, fallback?: string) => process.env[key] ?? fallback;
const num = (key: string) => (env(key) ? Number(env(key)) : undefined);
const bool = (key: string) => env(key) === "true";

export const config = {
  tradingMode: env("TRADING_MODE", "dry-run") as "dry-run" | "live",
  allowLiveTrading: bool("ALLOW_LIVE_TRADING"),
  mt5Symbol: env("MT5_SYMBOL", "XAUUSD")!,

  mt5BridgeUrl: env("MT5_BRIDGE_URL", "http://127.0.0.1:8765")!,
  mt5BridgeToken: env("MT5_BRIDGE_TOKEN", "")!,

  maxPositionSize: num("MAX_POSITION_SIZE") ?? 1.0,
  maxLossPerTrade: num("MAX_LOSS_PER_TRADE") ?? 100,
  maxDailyLoss: num("MAX_DAILY_LOSS") ?? 500,
  maxTotalExposure: num("MAX_TOTAL_EXPOSURE") ?? 2.0,
  maxSpreadBps: num("MAX_SPREAD_BPS") ?? 50,
  maxSlippagePoints: num("MAX_SLIPPAGE_POINTS") ?? 10,

  timeframe: env("TIMEFRAME", "M1")!,
  decisionIntervalMs: num("DECISION_INTERVAL_MS") ?? 1000,
  minConfidence: num("MIN_CONFIDENCE") ?? 0.55,

  enableStopLoss: bool("ENABLE_STOP_LOSS"),
  stopLossPoints: num("STOP_LOSS_POINTS") ?? 500,
  enableTakeProfit: bool("ENABLE_TAKE_PROFIT"),
  takeProfitPoints: num("TAKE_PROFIT_POINTS") ?? 1000,

  allowPyramiding: bool("ALLOW_PYRAMIDING"),
  reverseOnOppositeSignal: bool("REVERSE_ON_OPPOSITE_SIGNAL"),

  model: env("MODEL", "mock") as "mock" | "jev",
  jevModelId: env("JEV_MODEL_ID", "jev-latest")!,
  jevUsdPerMTok: 0.042,

  port: Number(env("PORT", "3000")),
  historySize: Number(env("HISTORY_SIZE", "1000")),
  bankrollUsd: Number(env("BANKROLL_USD", "10000")),
};