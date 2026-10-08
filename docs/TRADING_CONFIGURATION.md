# Trading Configuration Reference

Complete reference for all environment variables in `.env`.

---

## Trading Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `TRADING_MODE` | `dry-run` | `dry-run` or `live`. In dry-run: real data, real decisions, simulated orders. |
| `ALLOW_LIVE_TRADING` | `false` | **Must be `true` for live trading**. Dual gate with `TRADING_MODE=live`. |
| `MT5_SYMBOL` | `XAUUSD` | Exact MT5 symbol name (check Market Watch). Fail-fast if not found. |

---

## MT5 Bridge

| Variable | Default | Description |
|----------|---------|-------------|
| `MT5_BRIDGE_URL` | `http://127.0.0.1:8765` | Bridge REST API endpoint. |
| `MT5_BRIDGE_TOKEN` | *(empty)* | Bearer token for bridge auth. **Set a strong random value.** |

> Bridge config (in `mt5_bridge/.env`):
> - `MT5_LOGIN` — MT5 account number
> - `MT5_PASSWORD` — MT5 password
> - `MT5_SERVER` — XM server (e.g., `XMGlobal-MT5-2`)
> - `MT5_TERMINAL_PATH` — Path to `terminal64.exe`
> - `MT5_SYMBOL` — Symbol for bridge to watch

---

## Risk Management

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_POSITION_SIZE` | `1.0` | Maximum total position size in lots (both sides combined). |
| `MAX_LOSS_PER_TRADE` | `100` | Max loss per trade in account currency (USD). Not yet enforced per-trade. |
| `MAX_DAILY_LOSS` | `500` | Max daily realized P&L loss. Trading halts if exceeded. |
| `MAX_TOTAL_EXPOSURE` | `2.0` | Max gross exposure (long + short) in lots. |
| `MAX_SPREAD_BPS` | `50` | Max spread in basis points. Skip trade if exceeded. |
| `MAX_SLIPPAGE_POINTS` | `10` | Max slippage in points for market orders. |

---

## Strategy

| Variable | Default | Description |
|----------|---------|-------------|
| `TIMEFRAME` | `M1` | Reference timeframe (informational). |
| `DECISION_INTERVAL_MS` | `1000` | Minimum milliseconds between AI decisions. |
| `MIN_CONFIDENCE` | `0.55` | Minimum model confidence (max of buy/sell prob) to trade. |

---

## Stop Loss / Take Profit

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_STOP_LOSS` | `false` | Enable automatic SL on new positions. |
| `STOP_LOSS_POINTS` | `500` | SL distance in **points** (not pips). 1 point = 0.01 for XAUUSD (5 digits). |
| `ENABLE_TAKE_PROFIT` | `false` | Enable automatic TP on new positions. |
| `TAKE_PROFIT_POINTS` | `1000` | TP distance in **points**. |

> **Point vs Pip for XAUUSD**: Most brokers quote XAUUSD with 2 decimals (e.g., 2650.50) or 3 (2650.500).
> - 1 point = 0.01 (2 decimals) or 0.001 (3 decimals)
> - 1 pip = 10 points (traditional definition)
> - The bridge uses MT5's `symbol_info.point` for exact conversion.

---

## Position Management

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_PYRAMIDING` | `false` | Allow adding to existing position in same direction. |
| `REVERSE_ON_OPPOSITE_SIGNAL` | `false` | Close and reverse when opposite signal arrives. |

**Behavior matrix:**

| Current Pos | Signal | `ALLOW_PYRAMIDING` | `REVERSE_ON_OPPOSITE` | Action |
|-------------|--------|-------------------|----------------------|--------|
| FLAT | BUY | - | - | Open long |
| FLAT | SELL | - | - | Open short |
| LONG | BUY | true | - | Add to long |
| LONG | BUY | false | - | Ignore (hold) |
| LONG | SELL | - | true | Close long, open short |
| LONG | SELL | - | false | Ignore (hold) |
| SHORT | SELL | true | - | Add to short |
| SHORT | SELL | false | - | Ignore (hold) |
| SHORT | BUY | - | true | Close short, open long |
| SHORT | BUY | - | false | Ignore (hold) |

---

## Model

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | `mock` | `mock` or `jev`. |
| `TYPESAFE_AI_API_KEY` | *(empty)* | Required for `MODEL=jev`. |
| `JEV_MODEL_ID` | `jev-latest` | Model identifier for TypeSafe AI. |
| `JEV_USD_PER_MTOK` | `0.042` | Cost tracking (internal). |

---

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/SSE server port. |
| `HISTORY_SIZE` | `1000` | Max events kept in memory/SSE history. |
| `BANKROLL_USD` | `10000` | Reference bankroll for P&L% calculation. |

---

## Example Configurations

### Conservative (Low Risk)
```env
TRADING_MODE=dry-run
ALLOW_LIVE_TRADING=false
MAX_POSITION_SIZE=0.1
MAX_DAILY_LOSS=100
MAX_TOTAL_EXPOSURE=0.2
MAX_SPREAD_BPS=30
DECISION_INTERVAL_MS=2000
MIN_CONFIDENCE=0.65
ENABLE_STOP_LOSS=true
STOP_LOSS_POINTS=300
ENABLE_TAKE_PROFIT=true
TAKE_PROFIT_POINTS=600
```

### Moderate
```env
TRADING_MODE=dry-run
ALLOW_LIVE_TRADING=false
MAX_POSITION_SIZE=0.5
MAX_DAILY_LOSS=300
MAX_TOTAL_EXPOSURE=1.0
MAX_SPREAD_BPS=50
DECISION_INTERVAL_MS=1000
MIN_CONFIDENCE=0.55
ENABLE_STOP_LOSS=true
STOP_LOSS_POINTS=500
ENABLE_TAKE_PROFIT=true
TAKE_PROFIT_POINTS=1000
```

### Aggressive (Not Recommended for Live)
```env
TRADING_MODE=live
ALLOW_LIVE_TRADING=true
MAX_POSITION_SIZE=2.0
MAX_DAILY_LOSS=1000
MAX_TOTAL_EXPOSURE=3.0
MAX_SPREAD_BPS=80
DECISION_INTERVAL_MS=500
MIN_CONFIDENCE=0.52
ENABLE_STOP_LOSS=true
STOP_LOSS_POINTS=1000
ENABLE_TAKE_PROFIT=true
TAKE_PROFIT_POINTS=2000
ALLOW_PYRAMIDING=true
REVERSE_ON_OPPOSITE_SIGNAL=true
```

---

## Risk Calculation Details

### Margin Estimation
```
margin = volume × price × contract_size × margin_rate
```
- `contract_size` = 100 oz for XAUUSD (from MT5 `trade_tick_value / trade_tick_size`)
- `margin_rate` = `margin_initial` from symbol info (typically 0.02-0.05 for 1:20-1:50 leverage)

### Spread in Basis Points
```
spread_bps = (ask - bid) / mid × 10000
```

### Position Sizing
1. Start with `MAX_POSITION_SIZE`
2. Reduce by `MAX_TOTAL_EXPOSURE - current_exposure`
3. Reduce by available free margin
4. Normalize to broker's `volume_step`
5. Clamp to `[volume_min, volume_max]`

---

## Monitoring Checklist

Before enabling live trading, verify in dry-run:
- [ ] MT5 bridge connects and stays connected
- [ ] XAUUSD symbol resolves correctly
- [ ] Bid/ask/spread look reasonable
- [ ] AI produces decisions at expected interval
- [ ] Confidence filtering works (`MIN_CONFIDENCE`)
- [ ] Risk checks block trades when expected
- [ ] Dry-run orders don't hit MT5
- [ ] Dashboard shows DRY RUN clearly
- [ ] P&L tracking matches expectations
- [ ] No errors in logs for 30+ minutes

---

## Emergency Stop

If something goes wrong in live mode:
1. Set `TRADING_MODE=dry-run` in `.env`
2. Restart jev-trader (or send SIGINT)
3. Manually close any open positions in MT5
4. Review logs: `data/events.jsonl`