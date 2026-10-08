import os
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Header, status
from fastapi.middleware.cors import CORSMiddleware
import MetaTrader5 as mt5
from dotenv import load_dotenv

load_dotenv()

BRIDGE_HOST = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.getenv("MT5_BRIDGE_PORT", "8765"))
BRIDGE_TOKEN = os.getenv("MT5_BRIDGE_TOKEN", "")

MT5_LOGIN = int(os.getenv("MT5_LOGIN", "0"))
MT5_PASSWORD = os.getenv("MT5_PASSWORD", "")
MT5_SERVER = os.getenv("MT5_SERVER", "")
MT5_TERMINAL_PATH = os.getenv("MT5_TERMINAL_PATH", "")
MT5_SYMBOL = os.getenv("MT5_SYMBOL", "XAUUSD")

_mt5_initialized = False
_mt5_connected = False
_mt5_lock = asyncio.Lock()
_symbol_info_cache: Optional[Dict[str, Any]] = None


def require_auth(authorization: str = Header(None)):
    if BRIDGE_TOKEN and authorization != f"Bearer {BRIDGE_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _mt5_initialized, _mt5_connected
    await init_mt5()
    yield
    shutdown_mt5()


app = FastAPI(title="MT5 Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_sync(func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, lambda: func(*args, **kwargs))


async def init_mt5() -> bool:
    global _mt5_initialized, _mt5_connected
    async with _mt5_lock:
        if _mt5_initialized:
            return _mt5_connected
        try:
            init_kwargs = {}
            if MT5_TERMINAL_PATH:
                init_kwargs["path"] = MT5_TERMINAL_PATH
            if not mt5.initialize(**init_kwargs):
                raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
            _mt5_initialized = True

            if MT5_LOGIN and MT5_PASSWORD and MT5_SERVER:
                if not mt5.login(MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER):
                    raise RuntimeError(f"MT5 login failed: {mt5.last_error()}")
                _mt5_connected = True
                print(f"[MT5] Connected: login={MT5_LOGIN}, server={MT5_SERVER}")
            else:
                print("[MT5] Initialized (no login credentials provided)")
            return _mt5_connected
        except Exception as e:
            print(f"[MT5] Init error: {e}")
            _mt5_initialized = True
            _mt5_connected = False
            return False


def shutdown_mt5():
    global _mt5_initialized, _mt5_connected
    if _mt5_initialized:
        mt5.shutdown()
        _mt5_initialized = False
        _mt5_connected = False
        print("[MT5] Shutdown")


def _ensure_mt5():
    if not _mt5_initialized or not _mt5_connected:
        raise HTTPException(status_code=503, detail="MT5 not connected")


def _get_symbol_name() -> str:
    global _symbol_info_cache
    symbol = MT5_SYMBOL
    info = mt5.symbol_info(symbol)
    if info is None:
        all_symbols = mt5.symbols_get()
        if all_symbols:
            matches = [s.name for s in all_symbols if "XAU" in s.name.upper() or "GOLD" in s.name.upper()]
        else:
            matches = []
        raise HTTPException(
            status_code=404,
            detail=f"Symbol '{symbol}' not found. Available XAU/GOLD symbols: {matches if matches else 'none'}"
        )
    if not info.visible:
        if not mt5.symbol_select(symbol, True):
            raise HTTPException(status_code=500, detail=f"Failed to select symbol {symbol}")
    _symbol_info_cache = {
        "name": info.name,
        "digits": info.digits,
        "point": info.point,
        "trade_tick_size": info.trade_tick_size,
        "trade_tick_value": info.trade_tick_value,
        "volume_min": info.volume_min,
        "volume_max": info.volume_max,
        "volume_step": info.volume_step,
        "spread": info.spread,
        "spread_float": info.spread_float,
        "stops_level": info.stops_level,
        "freeze_level": info.freeze_level,
        "trade_mode": info.trade_mode,
        "filling_mode": info.filling_mode,
        "margin_initial": info.margin_initial,
        "margin_maintenance": info.margin_maintenance,
        "currency_base": info.currency_base,
        "currency_profit": info.currency_profit,
        "currency_margin": info.currency_margin,
    }
    return symbol


def _normalize_volume(volume: float, symbol_info: Dict) -> float:
    step = symbol_info["volume_step"]
    min_vol = symbol_info["volume_min"]
    max_vol = symbol_info["volume_max"]
    if volume < min_vol:
        raise ValueError(f"Volume {volume} below minimum {min_vol}")
    if volume > max_vol:
        raise ValueError(f"Volume {volume} above maximum {max_vol}")
    normalized = round(volume / step) * step
    if normalized < min_vol:
        normalized = min_vol
    if normalized > max_vol:
        normalized = max_vol
    return normalized


def _position_type_str(pos_type: int) -> str:
    return {mt5.POSITION_TYPE_BUY: "LONG", mt5.POSITION_TYPE_SELL: "SHORT"}.get(pos_type, "UNKNOWN")


def _order_type_str(order_type: int) -> str:
    return {
        mt5.ORDER_TYPE_BUY: "BUY",
        mt5.ORDER_TYPE_SELL: "SELL",
        mt5.ORDER_TYPE_BUY_LIMIT: "BUY_LIMIT",
        mt5.ORDER_TYPE_SELL_LIMIT: "SELL_LIMIT",
        mt5.ORDER_TYPE_BUY_STOP: "BUY_STOP",
        mt5.ORDER_TYPE_SELL_STOP: "SELL_STOP",
    }.get(order_type, "UNKNOWN")


def _account_to_dict(info) -> dict:
    return {
        "login": info.login,
        "server": info.server,
        "name": info.name,
        "company": info.company,
        "currency": info.currency,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "free_margin": info.free_margin,
        "margin_level": info.margin_level,
        "leverage": info.leverage,
        "trade_allowed": info.trade_allowed,
        "trade_expert": info.trade_expert,
    }


def _symbol_to_dict(info) -> dict:
    return {
        "name": info.name,
        "digits": info.digits,
        "point": info.point,
        "trade_tick_size": info.trade_tick_size,
        "trade_tick_value": info.trade_tick_value,
        "volume_min": info.volume_min,
        "volume_max": info.volume_max,
        "volume_step": info.volume_step,
        "spread": info.spread,
        "stops_level": info.stops_level,
        "freeze_level": info.freeze_level,
        "trade_mode": info.trade_mode,
        "filling_mode": info.filling_mode,
    }


def _position_to_dict(p) -> dict:
    return {
        "ticket": p.ticket,
        "symbol": p.symbol,
        "type": p.type,
        "type_str": _position_type_str(p.type),
        "volume": p.volume,
        "price_open": p.price_open,
        "sl": p.sl,
        "tp": p.tp,
        "price_current": p.price_current,
        "swap": p.swap,
        "profit": p.profit,
        "commission": p.commission,
        "magic": p.magic,
        "comment": p.comment,
        "time_open": int(p.time),
        "time_update": int(p.time_update),
    }


def _order_to_dict(o) -> dict:
    return {
        "ticket": o.ticket,
        "symbol": o.symbol,
        "type": o.type,
        "type_str": _order_type_str(o.type),
        "volume": o.volume_initial,
        "volume_current": o.volume_current,
        "price_open": o.price_open,
        "sl": o.sl,
        "tp": o.tp,
        "price_current": o.price_current,
        "magic": o.magic,
        "comment": o.comment,
        "time_setup": int(o.time_setup),
        "time_expiration": int(o.time_expiration),
        "state": o.state,
    }


def _deal_to_dict(d) -> dict:
    return {
        "ticket": d.ticket,
        "order": d.order,
        "time": int(d.time),
        "time_msc": int(d.time_msc),
        "symbol": d.symbol,
        "type": d.type,
        "entry": d.entry,
        "volume": d.volume,
        "price": d.price,
        "commission": d.commission,
        "swap": d.swap,
        "profit": d.profit,
        "fee": d.fee,
        "magic": d.magic,
        "comment": d.comment,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "mt5_connected": _mt5_connected, "mt5_initialized": _mt5_initialized}


@app.get("/account", dependencies=[Depends(require_auth)])
async def get_account():
    _ensure_mt5()
    info = mt5.account_info()
    if info is None:
        raise HTTPException(status_code=500, detail=f"Failed to get account info: {mt5.last_error()}")
    return _account_to_dict(info)


@app.get("/symbols/{symbol}", dependencies=[Depends(require_auth)])
async def get_symbol_info(symbol: str):
    _ensure_mt5()
    info = mt5.symbol_info(symbol)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
    return _symbol_to_dict(info)


@app.get("/symbols", dependencies=[Depends(require_auth)])
async def get_symbols():
    _ensure_mt5()
    symbols = mt5.symbols_get()
    if symbols is None:
        return []
    return [s.name for s in symbols]


@app.get("/quote/{symbol}", dependencies=[Depends(require_auth)])
async def get_quote(symbol: str):
    _ensure_mt5()
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=404, detail=f"No quote for {symbol}")
    spread = tick.ask - tick.bid
    mid = (tick.bid + tick.ask) / 2
    spread_bps = (spread / mid) * 10000 if mid > 0 else 0
    return {
        "symbol": symbol,
        "bid": tick.bid,
        "ask": tick.ask,
        "mid": mid,
        "spread": spread,
        "spread_bps": spread_bps,
        "timestamp": int(tick.time * 1000),
        "volume": tick.volume,
    }


@app.get("/positions", dependencies=[Depends(require_auth)])
async def get_positions(symbol: Optional[str] = None):
    _ensure_mt5()
    positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    if positions is None:
        return []
    return [_position_to_dict(p) for p in positions]


@app.get("/orders", dependencies=[Depends(require_auth)])
async def get_orders(symbol: Optional[str] = None):
    _ensure_mt5()
    orders = mt5.orders_get(symbol=symbol) if symbol else mt5.orders_get()
    if orders is None:
        return []
    return [_order_to_dict(o) for o in orders]


@app.post("/order", dependencies=[Depends(require_auth)])
async def place_order(request: dict):
    _ensure_mt5()
    symbol = _get_symbol_name()
    if request.get("symbol") != symbol:
        raise HTTPException(status_code=400, detail=f"Symbol mismatch: expected {symbol}, got {request.get('symbol')}")

    symbol_info = _symbol_info_cache or {}
    if not symbol_info:
        info = mt5.symbol_info(symbol)
        if info:
            symbol_info = {"volume_step": info.volume_step, "volume_min": info.volume_min, "volume_max": info.volume_max}

    volume = request.get("volume", 0.01)
    normalized_volume = _normalize_volume(volume, symbol_info)

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail="No quote available")

    order_type = request.get("type", mt5.ORDER_TYPE_BUY)
    price = request.get("price")
    if price is None:
        price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid

    mt5_request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "type": order_type,
        "volume": normalized_volume,
        "price": price,
        "sl": request.get("sl", 0.0) or 0.0,
        "tp": request.get("tp", 0.0) or 0.0,
        "deviation": request.get("deviation", 20),
        "magic": request.get("magic", 123456),
        "comment": request.get("comment", "jev-trader"),
        "type_filling": request.get("type_filling", mt5.ORDER_FILLING_IOC),
        "type_time": mt5.ORDER_TIME_GTC,
    }

    result = mt5.order_send(mt5_request)
    if result is None:
        raise HTTPException(status_code=500, detail=f"Order send failed: {mt5.last_error()}")

    return {
        "retcode": result.retcode,
        "retcode_str": mt5.TRADE_RETCODE_DESC.get(result.retcode, "UNKNOWN"),
        "deal": result.deal,
        "order": result.order,
        "volume": result.volume,
        "price": result.price,
        "comment": result.comment,
        "request_id": result.request_id,
    }


@app.post("/order/close", dependencies=[Depends(require_auth)])
async def close_position(request: dict):
    _ensure_mt5()
    ticket = request.get("ticket")
    volume = request.get("volume")

    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        raise HTTPException(status_code=404, detail=f"Position {ticket} not found")
    pos = positions[0]

    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail="No quote available")

    close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
    close_price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask

    vol = volume if volume is not None else pos.volume
    symbol_info = mt5.symbol_info(pos.symbol)
    if symbol_info:
        vol = _normalize_volume(vol, {"volume_step": symbol_info.volume_step, "volume_min": symbol_info.volume_min, "volume_max": symbol_info.volume_max})

    mt5_request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": pos.symbol,
        "type": close_type,
        "volume": vol,
        "price": close_price,
        "deviation": 20,
        "magic": pos.magic,
        "comment": "close by jev-trader",
        "type_filling": mt5.ORDER_FILLING_IOC,
        "position": pos.ticket,
    }

    result = mt5.order_send(mt5_request)
    if result is None:
        raise HTTPException(status_code=500, detail=f"Close failed: {mt5.last_error()}")

    return {
        "retcode": result.retcode,
        "retcode_str": mt5.TRADE_RETCODE_DESC.get(result.retcode, "UNKNOWN"),
        "deal": result.deal,
        "order": result.order,
        "volume": result.volume,
        "price": result.price,
        "comment": result.comment,
        "request_id": result.request_id,
    }


@app.get("/deals", dependencies=[Depends(require_auth)])
async def get_deals(from_date: Optional[str] = None, to_date: Optional[str] = None, symbol: Optional[str] = None):
    _ensure_mt5()
    from_dt = datetime.fromisoformat(from_date) if from_date else datetime(1970, 1, 1)
    to_dt = datetime.fromisoformat(to_date) if to_date else datetime.now()
    deals = mt5.history_deals_get(from_dt, to_dt, group=symbol) if symbol else mt5.history_deals_get(from_dt, to_dt)
    if deals is None:
        return []
    return [_deal_to_dict(d) for d in deals]


@app.get("/snapshot", dependencies=[Depends(require_auth)])
async def get_snapshot():
    _ensure_mt5()
    symbol = _get_symbol_name()

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail="No quote available")

    account = mt5.account_info()
    if account is None:
        raise HTTPException(status_code=500, detail="Failed to get account info")

    positions = mt5.positions_get(symbol=symbol) or []
    position_size = 0.0
    position_side = "FLAT"
    for p in positions:
        if p.type == mt5.POSITION_TYPE_BUY:
            position_size += p.volume
            position_side = "LONG" if position_side != "SHORT" else "HEDGED"
        elif p.type == mt5.POSITION_TYPE_SELL:
            position_size += p.volume
            position_side = "SHORT" if position_side != "LONG" else "HEDGED"

    spread = tick.ask - tick.bid
    mid = (tick.bid + tick.ask) / 2
    spread_bps = (spread / mid) * 10000 if mid > 0 else 0

    return {
        "symbol": symbol,
        "bid": tick.bid,
        "ask": tick.ask,
        "mid": mid,
        "spread": spread,
        "spread_bps": spread_bps,
        "timestamp": int(tick.time * 1000),
        "position_size": position_size,
        "position_side": position_side,
        "balance": account.balance,
        "equity": account.equity,
        "free_margin": account.free_margin,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=BRIDGE_HOST, port=BRIDGE_PORT)