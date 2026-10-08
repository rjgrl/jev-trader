export interface AccountInfo {
  login: number;
  server: string;
  name: string;
  company: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  tradeAllowed: boolean;
  tradeExpert: boolean;
}

export interface SymbolInfo {
  name: string;
  digits: number;
  point: number;
  tradeTickSize: number;
  tradeTickValue: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  spread: number;
  stopsLevel: number;
  freezeLevel: number;
  tradeMode: number;
  fillingMode: number;
  marginInitial: number;
  marginMaintenance: number;
  currencyBase: string;
  currencyProfit: string;
  currencyMargin: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadBps: number;
  timestamp: number;
  volume: number;
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

export interface OrderRequest {
  symbol: string;
  type: number;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  deviation?: number;
  magic?: number;
  comment?: string;
  typeFilling?: number;
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

export interface Deal {
  ticket: number;
  order: number;
  time: number;
  timeMsc: number;
  symbol: string;
  type: number;
  entry: number;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  fee: number;
  magic: number;
  comment: string;
}

export interface MarketSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadBps: number;
  timestamp: number;
  positionSize: number;
  positionSide: string;
  balance: number;
  equity: number;
  freeMargin: number;
}

export interface TradingBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getAccount(): Promise<AccountInfo>;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
  getSymbols(): Promise<string[]>;
  getQuote(symbol: string): Promise<Quote>;

  getPositions(symbol?: string): Promise<Position[]>;
  getOrders(symbol?: string): Promise<any[]>;

  placeOrder(request: OrderRequest): Promise<OrderResult>;
  modifyOrder(ticket: number, request: Partial<OrderRequest>): Promise<OrderResult>;
  cancelOrder(ticket: number): Promise<OrderResult>;

  closePosition(ticket: number, volume?: number): Promise<OrderResult>;

  getDeals(fromDate?: string, toDate?: string, symbol?: string): Promise<Deal[]>;

  getSnapshot(): Promise<MarketSnapshot>;
}