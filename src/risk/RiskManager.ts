import { config } from "../config";
import type { MarketSnapshot } from "../market/MarketData";
import type { SymbolInfo, Position } from "../broker/TradingBroker";

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  maxVolume?: number;
}

export interface RiskMetrics {
  currentExposure: number;
  freeMargin: number;
  marginLevel: number;
  dailyPnL: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  spreadBps: number;
  maxSpreadBps: number;
}

export class RiskManager {
  private dailyPnL = 0;
  private dailyPnLResetTime = Date.now();
  private consecutiveLosses = 0;
  private lastTradeResult: "win" | "loss" | null = null;
  private tradesToday = 0;

  constructor() {
    this.resetDailyIfNeeded();
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - this.dailyPnLResetTime > dayMs) {
      this.dailyPnL = 0;
      this.tradesToday = 0;
      this.dailyPnLResetTime = now;
    }
  }

  checkPreTrade(
    snapshot: MarketSnapshot,
    symbolInfo: SymbolInfo,
    action: "BUY" | "SELL",
    requestedVolume: number
  ): RiskCheckResult {
    this.resetDailyIfNeeded();

    if (!config.allowLiveTrading || config.tradingMode !== "live") {
      return { allowed: false, reason: "Live trading not enabled" };
    }

    if (snapshot.positionSide !== "FLAT") {
      const hasOppositePosition =
        (action === "BUY" && snapshot.positionSide === "SHORT") ||
        (action === "SELL" && snapshot.positionSide === "LONG");

      if (hasOppositePosition && !config.reverseOnOppositeSignal) {
        return { allowed: false, reason: `Opposite position exists (${snapshot.positionSide})` };
      }

      if (!hasOppositePosition && !config.allowPyramiding) {
        return { allowed: false, reason: `Position already exists (${snapshot.positionSide}), pyramiding disabled` };
      }
    }

    if (snapshot.spreadBps > config.maxSpreadBps) {
      return { allowed: false, reason: `Spread too high: ${snapshot.spreadBps.toFixed(1)} bps > ${config.maxSpreadBps}` };
    }

    if (this.dailyPnL <= -config.maxDailyLoss) {
      return { allowed: false, reason: `Daily loss limit reached: ${this.dailyPnL.toFixed(2)} <= -${config.maxDailyLoss}` };
    }

    if (this.consecutiveLosses >= 5) {
      return { allowed: false, reason: `Too many consecutive losses: ${this.consecutiveLosses}` };
    }

    const maxVolumeByExposure = Math.max(0, config.maxTotalExposure - snapshot.positionSize);
    if (requestedVolume > maxVolumeByExposure) {
      return {
        allowed: false,
        reason: `Exposure limit: requested ${requestedVolume} > available ${maxVolumeByExposure.toFixed(2)}`,
        maxVolume: maxVolumeByExposure,
      };
    }

    const estimatedMargin = this.estimateMargin(symbolInfo, snapshot, requestedVolume, action);
    const freeMarginAfter = snapshot.freeMargin - estimatedMargin;
    if (freeMarginAfter < 0) {
      return { allowed: false, reason: `Insufficient margin: need ~${estimatedMargin.toFixed(2)}, have ${snapshot.freeMargin.toFixed(2)}` };
    }

    const maxVolumeByMargin = Math.floor(snapshot.freeMargin / (estimatedMargin / requestedVolume));
    const maxVolume = Math.min(maxVolumeByExposure, maxVolumeByMargin, symbolInfo.volumeMax);
    const normalizedVolume = this.normalizeVolume(requestedVolume, symbolInfo);

    if (normalizedVolume < symbolInfo.volumeMin) {
      return { allowed: false, reason: `Volume below minimum: ${normalizedVolume} < ${symbolInfo.volumeMin}` };
    }

    if (normalizedVolume > maxVolume) {
      return { allowed: false, reason: `Volume exceeds limits`, maxVolume };
    }

    return { allowed: true, maxVolume: normalizedVolume };
  }

  private estimateMargin(
    symbolInfo: SymbolInfo,
    snapshot: MarketSnapshot,
    volume: number,
    action: "BUY" | "SELL"
  ): number {
    const price = action === "BUY" ? snapshot.ask : snapshot.bid;
    const contractSize = symbolInfo.tradeTickValue / symbolInfo.tradeTickSize;
    const marginRate = symbolInfo.marginInitial > 0 ? symbolInfo.marginInitial : 1;
    return volume * price * contractSize * marginRate;
  }

  private normalizeVolume(volume: number, symbolInfo: SymbolInfo): number {
    const step = symbolInfo.volumeStep;
    const minVol = symbolInfo.volumeMin;
    const maxVol = symbolInfo.volumeMax;
    let normalized = Math.round(volume / step) * step;
    if (normalized < minVol) normalized = minVol;
    if (normalized > maxVol) normalized = maxVol;
    return normalized;
  }

  calculateStopLossPrice(
    symbolInfo: SymbolInfo,
    snapshot: MarketSnapshot,
    action: "BUY" | "SELL",
    entryPrice: number
  ): number | null {
    if (!config.enableStopLoss) return null;
    const points = config.stopLossPoints;
    const point = symbolInfo.point;
    const price = action === "BUY" ? entryPrice - points * point : entryPrice + points * point;
    return Math.round(price / point) * point;
  }

  calculateTakeProfitPrice(
    symbolInfo: SymbolInfo,
    snapshot: MarketSnapshot,
    action: "BUY" | "SELL",
    entryPrice: number
  ): number | null {
    if (!config.enableTakeProfit) return null;
    const points = config.takeProfitPoints;
    const point = symbolInfo.point;
    const price = action === "BUY" ? entryPrice + points * point : entryPrice - points * point;
    return Math.round(price / point) * point;
  }

  recordTradeResult(pnl: number): void {
    this.dailyPnL += pnl;
    this.tradesToday++;
    if (pnl >= 0) {
      this.consecutiveLosses = 0;
      this.lastTradeResult = "win";
    } else {
      this.consecutiveLosses++;
      this.lastTradeResult = "loss";
    }
  }

  recordFill(realizedPnL: number): void {
    this.recordTradeResult(realizedPnL);
  }

  getMetrics(snapshot: MarketSnapshot): RiskMetrics {
    return {
      currentExposure: snapshot.positionSize,
      freeMargin: snapshot.freeMargin,
      marginLevel: snapshot.equity > 0 ? (snapshot.equity / (snapshot.equity - snapshot.freeMargin)) * 100 : 0,
      dailyPnL: this.dailyPnL,
      maxPositionSize: config.maxPositionSize,
      maxDailyLoss: config.maxDailyLoss,
      spreadBps: snapshot.spreadBps,
      maxSpreadBps: config.maxSpreadBps,
    };
  }

  getDailyPnL(): number {
    return this.dailyPnL;
  }

  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  getTradesToday(): number {
    return this.tradesToday;
  }

  canTrade(): boolean {
    this.resetDailyIfNeeded();
    return this.dailyPnL > -config.maxDailyLoss && this.consecutiveLosses < 5;
  }
}