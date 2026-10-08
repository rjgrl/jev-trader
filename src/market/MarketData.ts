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

export interface MarketData {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSnapshot(): Promise<MarketSnapshot>;
  getSymbol(): string;
  onSnapshot(callback: (snapshot: MarketSnapshot) => void): () => void;
}

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  timestamp: number;
  volume: number;
}