# VENTURE Day 1 — Deploy to a Public URL

This app is ready for one-click deployment on Railway, Render, or Fly.io.

## Fastest path: Railway (5 minutes)

1. Go to https://railway.app and sign up (free).
2. **New Project → Deploy from GitHub repo**.
3. Push these files to a fresh GitHub repo, or use Railway's "Empty Project" → drag-and-drop.
4. Railway auto-detects Node.js. Wait ~90 seconds.
5. Click **Settings → Networking → Generate Domain**.
6. You get a live public URL — share the base URL with students, `/admin` with facilitators.

## Render.com (10 minutes)

1. Sign up at https://render.com (free).
2. **New + → Web Service → Connect GitHub repo** with these files.
3. Values: Env = Node · Build = `npm install` · Start = `npm start` · Plan = Free.
4. Deploy. URL appears at the top: `https://<yourname>.onrender.com`.

## Fly.io (production-grade, 15 minutes)

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
flyctl launch      # answers: region = bom (Mumbai — closest to UAE)
flyctl deploy
```

You get `https://<app>.fly.dev`.

## After deployment

- **Student URL:** `https://<your-app-url>/`
- **Admin URL:** `https://<your-app-url>/admin` — login `admin` / `venture2026`
- **Big Screen:** `https://<your-app-url>/leaderboard`

Change admin password: edit `server.js` line 22.

## Persistence note
- On Railway & Fly.io the SQLite `venture.db` persists across restarts.
- On Render free tier, add a persistent disk in `render.yaml` (already configured).
