import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";
import { config } from "./config";
import type { MarketSnapshot } from "./market/MarketData";

export type Action = "buy" | "sell" | "hold";
export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface ModelDecision {
  action: TradeAction;
  buyProbability: number;
  sellProbability: number;
  confidence: number;
  reasoning?: string;
}

export interface TradeState {
  market: "XAUUSD";
  timestamp: number;
  horizonMs: number;
  mid: number;
  spread: number;
  spreadBps: number;
  bid: number;
  ask: number;
  positionSize: number;
  positionSide: "LONG" | "SHORT" | "FLAT" | "HEDGED";
  balance: number;
  equity: number;
  freeMargin: number;
  dailyPnL: number;
  recentMids: number[];
  recentReturns: { last1: number; last5: number; last20: number; last100: number };
  allowed: { buy: boolean; sell: boolean };
}

export interface Decision {
  action: Action;
  probabilities: Record<Action, number>;
  upIn10: number;
  latencyMs: number;
  inputTokens: number;
}

export interface Model {
  readonly name: string;
  decide(state: TradeState): Promise<Decision>;
}

const QUESTIONS = {
  direction: {
    type: "choice",
    instructions: {
      question: "Will XAUUSD be higher or lower than the current mid after the horizon period?",
      goal: "Trade XAUUSD (GOLD) on MT5. Decisions are made at a configurable interval. The trade crosses the spread, so the move must beat that cost.",
      timing: "The order executes as a market order via MT5.",
      inputs: "Recent price action (returns), current spread, position state, account equity/margin. If allowed.buy is false the trade will be a sell regardless, and vice versa.",
    },
    criteria: {
      buy: "Buy XAUUSD now: mid more likely to be higher after horizon, by more than the spread.",
      sell: "Sell XAUUSD now: mid more likely to be lower after horizon, by more than the spread.",
    },
  },
} as const;

export class JevModel implements Model {
  readonly name = config.jevModelId;
  private model = typeSafeAi.evaluationModel(config.jevModelId);

  async decide(state: TradeState): Promise<Decision> {
    const t0 = performance.now();
    const r = await experimental_evaluate({ model: this.model, state: state as any, questions: QUESTIONS, maxRetries: 0 });
    const a = r.answers.direction;
    const p = a.probabilities ?? { buy: 0, sell: 0, [a.choice]: 1 };
    const buy = p.buy ?? 0, sell = p.sell ?? 0;
    return {
      action: a.choice as Action,
      probabilities: { buy, sell, hold: 0 },
      upIn10: buy,
      latencyMs: performance.now() - t0,
      inputTokens: r.usage?.inputTokens ?? 0,
    };
  }
}

export class MockModel implements Model {
  readonly name = "mock";

  async decide(state: TradeState): Promise<Decision> {
    const t0 = performance.now();
    const flow = state.recentReturns.last20 / 8 + (Math.random() - 0.5) * 2;
    const signal = state.recentReturns.last20 / 8 + flow * 2 + this.noise(Date.now());
    const buy = 1 / (1 + Math.exp(-signal));
    const probabilities = { buy, sell: 1 - buy, hold: 0 };
    const action: Action = buy >= 0.5 ? "buy" : "sell";
    await Bun.sleep(80);
    return {
      action, probabilities,
      upIn10: buy,
      latencyMs: performance.now() - t0,
      inputTokens: Math.round(JSON.stringify(state).length / 4),
    };
  }

  private noise(seed: number) {
    let h = seed * 2654435761 >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
    return ((h % 1000) / 1000 - 0.5) * 3;
  }
}

export const createModel = (): Model => (config.model === "jev" ? new JevModel() : new MockModel());