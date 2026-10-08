# MT5 Bridge Setup Guide

This guide explains how to set up the MT5 Python bridge for jev-trader to trade XAUUSD (GOLD) via XM Global.

## Prerequisites

1. **Windows** (MT5 terminal runs natively on Windows)
2. **Python 3.10+** installed
3. **MetaTrader 5** installed and logged into your XM Global account
4. **XM Global MT5 account** with XAUUSD available

---

## Step 1: Install MetaTrader 5

1. Download MT5 from [MetaQuotes](https://www.metatrader5.com/en/download) or your XM Global client portal
2. Install MT5 to a known location (default: `C:\Program Files\MetaTrader 5\terminal64.exe`)
3. Launch MT5 and log in with your XM Global credentials:
   - **Login**: Your MT5 account number
   - **Password**: Your MT5 password
   - **Server**: XMGlobal-XXX (e.g., `XMGlobal-MT5-2`, `XMGlobal-MT5-3`)

---

## Step 2: Verify XAUUSD Symbol

1. In MT5, open **Market Watch** (Ctrl+M)
2. Right-click → **Show All**
3. Search for **XAUUSD** or **GOLD**
4. Verify the exact symbol name (may be `XAUUSD`, `XAUUSD.pro`, `GOLD`, etc.)
5. Right-click the symbol → **Specification** to confirm:
   - **Contract size**: 100 oz (standard for XAUUSD)
   - **Margin currency**: USD
   - **Trade mode**: Full access

---

## Step 3: Enable Required MT5 Settings

1. **Tools** → **Options** → **Expert Advisors** tab
2. Check:
   - ✅ **Allow automated trading**
   - ✅ **Allow DLL imports** (if needed)
   - ✅ **Allow WebRequest for listed URL** (add `http://127.0.0.1:8765`)
3. **Tools** → **Options** → **Charts** tab
   - ✅ **Allow automated trading** (global)

---

## Step 4: Configure the Python Bridge

1. Navigate to the bridge directory:
   ```bash
   cd mt5_bridge
   ```

2. Create a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create `.env` file in `mt5_bridge/`:
   ```env
   MT5_BRIDGE_HOST=127.0.0.1
   MT5_BRIDGE_PORT=8765
   MT5_BRIDGE_TOKEN=your-secure-random-token

   MT5_LOGIN=12345678
   MT5_PASSWORD=your-mt5-password
   MT5_SERVER=XMGlobal-MT5-2
   MT5_TERMINAL_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
   MT5_SYMBOL=XAUUSD
   ```

   **Generate a secure token:**
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

---

## Step 5: Start the Bridge

```bash
# Terminal 1: Start the MT5 bridge
cd mt5_bridge
.venv\Scripts\activate
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8765 (Press CTRL+C to quit)
[MT5] Connected: login=12345678, server=XMGlobal-MT5-2
[MT5] Symbol: XAUUSD
```

Test the bridge:
```bash
# Terminal 2: Test endpoints
curl http://127.0.0.1:8765/health
curl -H "Authorization: Bearer your-token" http://127.0.0.1:8765/account
curl -H "Authorization: Bearer your-token" http://127.0.0.1:8765/snapshot
```

---

## Step 6: Configure jev-trader

1. Copy `.env.example` to `.env` in project root:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   ```env
   TRADING_MODE=dry-run
   ALLOW_LIVE_TRADING=false
   MT5_SYMBOL=XAUUSD

   MT5_BRIDGE_URL=http://127.0.0.1:8765
   MT5_BRIDGE_TOKEN=your-secure-random-token

   # Risk settings
   MAX_POSITION_SIZE=1.0
   MAX_DAILY_LOSS=500
   MAX_SPREAD_BPS=50
   DECISION_INTERVAL_MS=1000
   MIN_CONFIDENCE=0.55
   ```

---

## Step 7: Run jev-trader (Dry Run)

```bash
# Terminal 3: Start jev-trader
bun install
bun run start
```

Verify:
- Dashboard shows `DRY RUN` badge
- XAUUSD bid/ask prices appear
- AI decisions (BUY/SELL/HOLD) appear
- No real orders sent to MT5

---

## Step 8: Enable Live Trading (CAREFULLY)

**Only after verifying dry-run works correctly:**

1. Update `.env`:
   ```env
   TRADING_MODE=live
   ALLOW_LIVE_TRADING=true
   ```

2. Restart jev-trader:
   ```bash
   bun run start
   ```

3. Dashboard shows `LIVE` badge (red)
4. Monitor first trades closely

---

## Troubleshooting

### "MT5 not connected"
- Check MT5 terminal is running and logged in
- Verify `MT5_TERMINAL_PATH` is correct
- Check `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` match exactly

### "Symbol 'XAUUSD' not found"
- In MT5 Market Watch, verify exact symbol name
- Update `MT5_SYMBOL` in `.env` to match (e.g., `XAUUSD.pro`, `GOLD`)
- Restart bridge

### "Login failed"
- Verify credentials in XM Global client portal
- Check server name matches exactly (case-sensitive)
- Ensure account is not archived/demo expired

### "Order failed: RETCODE_MARKET_CLOSED"
- XAUUSD trades 24/5 (closed weekends)
- Check MT5 Market Watch for session times

### "Insufficient margin"
- Reduce `MAX_POSITION_SIZE`
- Deposit more funds
- Check leverage in MT5 (Account → Leverage)

### "Spread too high"
- Increase `MAX_SPREAD_BPS` or trade during liquid hours
- London/NY overlap: 13:00-17:00 UTC

### Bridge won't start (port in use)
- Change `MT5_BRIDGE_PORT` in both bridge `.env` and jev-trader `.env`
- Kill existing process: `netstat -ano | findstr :8765` then `taskkill /PID <pid> /F`

---

## Security Notes

- **Never commit `.env` files** (already in `.gitignore`)
- **Bridge token**: Use a strong random token, keep it secret
- **Bridge binds to 127.0.0.1 only** — not exposed to network
- **MT5 credentials**: Only in bridge `.env`, not in jev-trader
- **Firewall**: Block port 8765 from external access

---

## Architecture

```
jev-trader (Bun)          MT5 Bridge (Python)          MT5 Terminal
     │                          │                           │
     ├── GET /snapshot ────────▶│                           │
     │◀──── MarketSnapshot ─────│                           │
     │                          │                           │
     ├── POST /order ──────────▶│                           │
     │                          ├── OrderSend() ───────────▶│
     │                          │◀──── OrderResult ─────────│
     │◀──── OrderResult ────────│                           │
     │                          │                           │
     └── SSE /events ──────────▶│ (for dashboard)           │
```

The bridge is a thin wrapper — all trading logic stays in jev-trader (TypeScript).