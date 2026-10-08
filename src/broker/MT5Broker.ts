import { config } from "../config";
import type {
  TradingBroker,
  AccountInfo,
  SymbolInfo,
  Quote,
  Position,
  OrderRequest,
  OrderResult,
  Deal,
  MarketSnapshot,
} from "./TradingBroker";

const ORDER_TYPE_BUY = 0;
const ORDER_TYPE_SELL = 1;
const ORDER_FILLING_IOC = 1;

export class MT5Broker implements TradingBroker {
  private baseUrl: string;
  private token: string;
  private connected = false;
  private symbol: string;

  constructor() {
    this.baseUrl = config.mt5BridgeUrl.replace(/\/$/, "");
    this.token = config.mt5BridgeToken;
    this.symbol = config.mt5Symbol;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MT5 Bridge ${path}: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data as T;
  }

  async connect(): Promise<void> {
    const health = await this.request<{ mt5_connected: boolean }>("/health");
    if (!health.mt5_connected) {
      throw new Error("MT5 bridge reports MT5 not connected");
    }
    await this.getAccount();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAccount(): Promise<AccountInfo> {
    const data = await this.request<any>("/account");
    return {
      login: data.login,
      server: data.server,
      name: data.name,
      company: data.company,
      currency: data.currency,
      balance: data.balance,
      equity: data.equity,
      margin: data.margin,
      freeMargin: data.free_margin,
      marginLevel: data.margin_level,
      leverage: data.leverage,
      tradeAllowed: data.trade_allowed,
      tradeExpert: data.trade_expert,
    };
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const data = await this.request<any>(`/symbols/${symbol}`);
    return {
      name: data.name,
      digits: data.digits,
      point: data.point,
      tradeTickSize: data.trade_tick_size,
      tradeTickValue: data.trade_tick_value,
      volumeMin: data.volume_min,
      volumeMax: data.volume_max,
      volumeStep: data.volume_step,
      spread: data.spread,
      stopsLevel: data.stops_level,
      freezeLevel: data.freeze_level,
      tradeMode: data.trade_mode,
      fillingMode: data.filling_mode,
      marginInitial: 0,
      marginMaintenance: 0,
      currencyBase: "",
      currencyProfit: "",
      currencyMargin: "",
    };
  }

  async getSymbols(): Promise<string[]> {
    return this.request<string[]>("/symbols");
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request<any>(`/quote/${symbol}`);
    return {
      symbol: data.symbol,
      bid: data.bid,
      ask: data.ask,
      mid: data.mid,
      spread: data.spread,
      spreadBps: data.spread_bps,
      timestamp: data.timestamp,
      volume: data.volume,
    };
  }

  async getPositions(symbol?: string): Promise<Position[]> {
    const path = symbol ? `/positions?symbol=${encodeURIComponent(symbol)}` : "/positions";
    const data = await this.request<any[]>(path);
    return data.map((p) => ({
      ticket: p.ticket,
      symbol: p.symbol,
      type: p.type,
      typeStr: p.type_str,
      volume: p.volume,
      priceOpen: p.price_open,
      sl: p.sl,
      tp: p.tp,
      priceCurrent: p.price_current,
      swap: p.swap,
      profit: p.profit,
      commission: p.commission,
      magic: p.magic,
      comment: p.comment,
      timeOpen: p.time_open,
      timeUpdate: p.time_update,
    }));
  }

  async getOrders(symbol?: string): Promise<any[]> {
    const path = symbol ? `/orders?symbol=${encodeURIComponent(symbol)}` : "/orders";
    return this.request<any[]>(path);
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const data = await this.request<any>("/order", {
      method: "POST",
      body: JSON.stringify({
        symbol: request.symbol,
        type: request.type,
        volume: request.volume,
        price: request.price,
        sl: request.sl,
        tp: request.tp,
        deviation: request.deviation ?? 20,
        magic: request.magic ?? 123456,
        comment: request.comment ?? "jev-trader",
        type_filling: request.typeFilling ?? ORDER_FILLING_IOC,
      }),
    });
    return {
      retcode: data.retcode,
      retcodeStr: data.retcode_str,
      deal: data.deal,
      order: data.order,
      volume: data.volume,
      price: data.price,
      comment: data.comment,
      requestId: data.request_id,
    };
  }

  async modifyOrder(ticket: number, request: Partial<OrderRequest>): Promise<OrderResult> {
    const data = await this.request<any>(`/order/${ticket}/modify`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    return {
      retcode: data.retcode,
      retcodeStr: data.retcode_str,
      deal: data.deal,
      order: data.order,
      volume: data.volume,
      price: data.price,
      comment: data.comment,
      requestId: data.request_id,
    };
  }

  async cancelOrder(ticket: number): Promise<OrderResult> {
    const data = await this.request<any>(`/order/${ticket}/cancel`, {
      method: "POST",
    });
    return {
      retcode: data.retcode,
      retcodeStr: data.retcode_str,
      deal: data.deal,
      order: data.order,
      volume: data.volume,
      price: data.price,
      comment: data.comment,
      requestId: data.request_id,
    };
  }

  async closePosition(ticket: number, volume?: number): Promise<OrderResult> {
    const params = new URLSearchParams();
    if (volume !== undefined) params.set("volume", String(volume));
    const data = await this.request<any>(`/order/close?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ ticket }),
    });
    return {
      retcode: data.retcode,
      retcodeStr: data.retcode_str,
      deal: data.deal,
      order: data.order,
      volume: data.volume,
      price: data.price,
      comment: data.comment,
      requestId: data.request_id,
    };
  }

  async getDeals(fromDate?: string, toDate?: string, symbol?: string): Promise<Deal[]> {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (symbol) params.set("symbol", symbol);
    const path = `/deals?${params.toString()}`;
    const data = await this.request<any[]>(path);
    return data.map((d) => ({
      ticket: d.ticket,
      order: d.order,
      time: d.time,
      timeMsc: d.time_msc,
      symbol: d.symbol,
      type: d.type,
      entry: d.entry,
      volume: d.volume,
      price: d.price,
      commission: d.commission,
      swap: d.swap,
      profit: d.profit,
      fee: d.fee,
      magic: d.magic,
      comment: d.comment,
    }));
  }

  async getSnapshot(): Promise<MarketSnapshot> {
    const data = await this.request<any>("/snapshot");
    return {
      symbol: data.symbol,
      bid: data.bid,
      ask: data.ask,
      mid: data.mid,
      spread: data.spread,
      spreadBps: data.spread_bps,
      timestamp: data.timestamp,
      positionSize: data.position_size,
      positionSide: data.position_side,
      balance: data.balance,
      equity: data.equity,
      freeMargin: data.free_margin,
    };
  }

  getSymbol(): string {
    return this.symbol;
  }

  getOrderTypeBuy(): number {
    return ORDER_TYPE_BUY;
  }

  getOrderTypeSell(): number {
    return ORDER_TYPE_SELL;
  }
}