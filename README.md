# VENTURE — Day 1 Live Web App

Real-time quiz + leaderboard + CEO draft for the VENTURE program's Day 1.
Self-hosted Node.js + WebSocket server + SQLite. No external dependencies at runtime.

## Requirements
- Node.js 18 or newer (any laptop with Node works)
- Same Wi-Fi network for all 60 students + the host laptop

## Setup (one time, ~5 minutes)

```bash
# 1. Install dependencies (only needed once)
npm install

# 2. Start the server
npm start
```

The server prints something like:

```
✅ VENTURE Day 1 running
   Admin URL:   http://192.168.1.42:3000/admin
   Student URL: http://192.168.1.42:3000
```

## How students join

1. Every student connects to the **venue Wi-Fi**
2. Opens the **Student URL** printed by the server on their phone/laptop
3. Types their **full name only** and clicks Enter
4. Login is remembered — closing the tab and re-opening keeps them logged in

## How the admin controls the program

1. Open the **Admin URL** on the facilitator laptop / projector
2. Login: `admin` / `venture2026` (change in `server.js` line ~30)
3. From the Admin Control Panel you can:
   - Start Round 1, 2, 3 (all connected students see the round begin instantly)
   - View the live leaderboard (project this on the main screen)
   - See silent activity monitoring (who left the site, who opened AI, who copied text, etc.)
   - Reveal Top 12 CEOs
   - Open the live CEO Draft
   - Assign teams to IGCF Pillars
   - Export all scores as CSV

## Data persistence

All data lives in `venture.db` (SQLite file in the same folder). Deleting this file resets the entire program. Back it up during breaks.

## Ports

Default HTTP port: `3000`. Change with `PORT=8080 npm start`.
