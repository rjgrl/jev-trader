import { config } from "../config";
import { MT5Broker } from "../broker/MT5Broker";
import type { MarketData, MarketSnapshot } from "./MarketData";

export class MT5MarketData implements MarketData {
  private broker: MT5Broker;
  private connected = false;
  private polling = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private snapshotCallback: ((snapshot: MarketSnapshot) => void) | null = null;
  private lastSnapshot: MarketSnapshot | null = null;
  private lastTickTime = 0;

  constructor(broker: MT5Broker) {
    this.broker = broker;
  }

  async connect(): Promise<void> {
    await this.broker.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await this.broker.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.broker.isConnected();
  }

  getSymbol(): string {
    return this.broker.getSymbol();
  }

  async getSnapshot(): Promise<MarketSnapshot> {
    const snap = await this.broker.getSnapshot();
    this.lastSnapshot = {
      ...snap,
      positionSide: snap.positionSide as "LONG" | "SHORT" | "FLAT" | "HEDGED",
    };
    return this.lastSnapshot;
  }

  onSnapshot(callback: (snapshot: MarketSnapshot) => void): () => void {
    this.snapshotCallback = callback;
    return () => {
      this.snapshotCallback = null;
    };
  }

  startPolling(intervalMs: number = config.decisionIntervalMs): void {
    if (this.polling) return;
    this.polling = true;
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
  }

  stopPolling(): void {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.connected || !this.broker.isConnected()) {
      return;
    }
    try {
      const snapshot = await this.getSnapshot();
      const now = Date.now();
      if (snapshot.timestamp > this.lastTickTime) {
        this.lastTickTime = snapshot.timestamp;
        if (this.snapshotCallback) {
          this.snapshotCallback(snapshot);
        }
      }
    } catch (e) {
      console.error("[MarketData] Poll error:", (e as Error).message);
    }
  }

  getLastSnapshot(): MarketSnapshot | null {
    return this.lastSnapshot;
  }

  getStalenessMs(): number {
    if (!this.lastSnapshot) return Infinity;
    return Date.now() - this.lastSnapshot.timestamp;
  }
}