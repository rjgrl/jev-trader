# jev-trader

AI-powered trading bot for **XAUUSD (GOLD)** via **XM Global MT5**.

A TypeSafe Jev model watches live MT5 market data and produces BUY/SELL/HOLD decisions at a configurable interval. Orders execute via a local Python bridge connected to MetaTrader 5. A Bun/TypeScript backend streams every tick, decision, order, and fill to a Next.js dashboard over SSE.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  jev-trader (Bun/TypeScript)                                        │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ MT5 Market   │──▶│  Trader    │──▶│ Risk       │──▶│ MT5 Broker │  │
│  │ Data         │   │  (loop)    │   │ Manager    │   │ (HTTP)     │  │
│  └──────────────┘   └────────────┘   └────────────┘   └─────┬──────┘  │
│        │                │                │                   │         │
│        ▼                ▼                ▼                   ▼         │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Model (Jev)  │  │ Event Bus  │  │ Config     │  │ MT5 Bridge │──┼──▶ MT5 Terminal ──▶ XM Global
│  │              │  │ (SSE)      │  │            │  │ (Python)   │  │
│  └──────────────┘  └────────────┘  └────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Next.js Dash │
                       └──────────────┘
```

---

## Quick Start

### 1. Prerequisites
- **Windows** with MetaTrader 5 installed and logged into XM Global
- **Python 3.10+** (for the MT5 bridge)
- **Bun** (for the TypeScript backend)

### 2. Set up the MT5 Bridge
```bash
cd mt5_bridge
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# Create mt5_bridge/.env with your MT5 credentials
cp .env.example .env  # edit with your login, password, server, terminal path
python main.py
```

### 3. Configure jev-trader
```bash
cd ..
cp .env.example .env
# Edit .env: set MT5_BRIDGE_TOKEN to match bridge, verify MT5_SYMBOL
bun install
```

### 4. Run (Dry Run First)
```bash
bun run start
# Dashboard: http://localhost:3000
```

### 5. Verify Dry Run
- Dashboard shows **DRY RUN** badge (green)
- XAUUSD bid/ask/prices updating
- AI decisions appearing (BUY/SELL/HOLD)
- No real orders sent to MT5

### 6. Go Live (Carefully)
```env
# In .env - BOTH required
TRADING_MODE=live
ALLOW_LIVE_TRADING=true
```
Restart jev-trader. Dashboard shows **LIVE** badge (red).

---

## Configuration

### Key Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `TRADING_MODE` | `dry-run` | `dry-run` or `live` |
| `ALLOW_LIVE_TRADING` | `false` | Must be `true` for live |
| `MT5_SYMBOL` | `XAUUSD` | Exact MT5 symbol name |
| `MT5_BRIDGE_URL` | `http://127.0.0.1:8765` | Bridge endpoint |
| `MT5_BRIDGE_TOKEN` | *(required)* | Shared secret |
| `MAX_POSITION_SIZE` | `1.0` | Max lots per position |
| `MAX_DAILY_LOSS` | `500` | Daily loss limit (USD) |
| `MAX_SPREAD_BPS` | `50` | Max spread to trade |
| `DECISION_INTERVAL_MS` | `1000` | Min ms between decisions |
| `MIN_CONFIDENCE` | `0.55` | Min model confidence |
| `ENABLE_STOP_LOSS` | `false` | Auto SL on entry |
| `STOP_LOSS_POINTS` | `500` | SL distance in points |
| `ENABLE_TAKE_PROFIT` | `false` | Auto TP on entry |
| `TAKE_PROFIT_POINTS` | `1000` | TP distance in points |
| `MODEL` | `mock` | `mock` or `jev` |

See [docs/TRADING_CONFIGURATION.md](docs/TRADING_CONFIGURATION.md) for full reference.

---

## MT5 Bridge Setup

See [docs/MT5_SETUP.md](docs/MT5_SETUP.md) for detailed instructions:
1. Install MT5, log into XM Global
2. Verify XAUUSD symbol name
3. Enable automated trading in MT5
4. Configure bridge `.env`
5. Start bridge, test `/health` and `/snapshot`
6. Configure jev-trader `.env`
7. Run dry-run, then live

---

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Snapshot: meta + latest event |
| `GET /history` | Last 1000 events |
| `GET /events` | SSE stream: `tick`, `decision`, `order`, `fill`, `position`, `pnl`, `risk`, `error`, `connection`, `ping` |

### Event Types

```json
// Tick (every poll)
{ "type": "tick", "data": { "timestamp": 123, "snapshot": { "symbol": "XAUUSD", "bid": 2650.25, "ask": 2650.35, "mid": 2650.30, "spread": 0.10, "spreadBps": 3.8, "timestamp": 123, "positionSize": 0.0, "positionSide": "FLAT", "balance": 10000, "equity": 10000, "freeMargin": 10000 } } }

// Decision (AI output)
{ "type": "decision", "data": { "timestamp": 123, "decision": { "action": "buy", "probabilities": { "buy": 0.72, "sell": 0.28, "hold": 0 }, "upIn10": 0.72, "latencyMs": 85, "inputTokens": 1200 }, "snapshot": {...}, "allowed": { "buy": true, "sell": true } } }

// Order (execution)
{ "type": "order", "data": { "timestamp": 123, "action": "BUY", "volume": 0.01, "price": 2650.35, "sl": 2645.35, "tp": 2660.35, "result": { "retcode": 10009, "retcodeStr": "TRADE_RETCODE_DONE", "deal": 12345, "order": 67890, "volume": 0.01, "price": 2650.35, "comment": "jev-trader", "requestId": 1 }, "error": null } }

// PnL (every tick)
{ "type": "pnl", "data": { "timestamp": 123, "balance": 10000, "equity": 10005.25, "freeMargin": 9990, "floatingPnL": 5.25, "realizedPnL": 0, "dailyPnL": 12.50 } }
```

---

## Dashboard

Next.js dashboard at `http://localhost:3000` (or `NEXT_PUBLIC_API_URL`):

- **Header**: Symbol (XAUUSD), mode (LIVE/DRY RUN), model, connection status
- **Stats Row**: Latency, equity, free margin, floating P&L, daily P&L, uptime
- **Flow Chart**: Price chart with decision cells, fill beads, hover tooltips
- **Decision Panel**: BUY/SELL probabilities, current market snapshot, position
- **Feed**: Real-time event log (ticks, decisions, orders, fills, PnL, risk, errors)

---

## Safety Features

- **Dual-gate live trading**: Requires both `TRADING_MODE=live` AND `ALLOW_LIVE_TRADING=true`
- **Default dry-run**: No live orders without explicit config
- **Risk manager**: Daily loss limit, max exposure, spread filter, margin check, consecutive loss circuit breaker
- **Symbol fail-fast**: Startup error if `MT5_SYMBOL` not found, lists available XAU/GOLD symbols
- **Staleness detection**: Halts trading if no fresh tick for 5× interval
- **Volume normalization**: Rounds to broker's `volume_step`, clamps to `[min, max]`
- **SL/TP via MT5 points**: Uses symbol `point` for exact conversion
- **Position logic**: Respects hedging mode, pyramiding/reversal configurable
- **Structured logging**: No credentials in logs, clear event types

---

## Project Structure

```
jev-trader/
├── src/
│   ├── config.ts              # Environment config
│   ├── index.ts               # Entry point
│   ├── server.ts              # Bun HTTP/SSE server
│   ├── model.ts               # JevModel / MockModel
│   ├── trader.ts              # Main trading loop
│   ├── broker/
│   │   ├── TradingBroker.ts   # Broker interface
│   │   └── MT5Broker.ts       # HTTP client to Python bridge
│   ├── market/
│   │   ├── MarketData.ts      # Market data interface
│   │   └── MT5MarketData.ts   # MT5 implementation
│   └── risk/
│       └── RiskManager.ts     # Pre-trade checks, limits
├── mt5_bridge/
│   ├── main.py                # FastAPI + MetaTrader5
│   └── requirements.txt
├── web/                       # Next.js dashboard
├── docs/
│   ├── MT5_SETUP.md
│   └── TRADING_CONFIGURATION.md
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Scripts

```bash
bun run start          # Start jev-trader
bun run dev            # Start with watch mode
bun run bridge:install # Install Python deps
bun run bridge:run     # Run MT5 bridge
bun run bridge:dev     # Run bridge with auto-reload
```

---

## License

MIT