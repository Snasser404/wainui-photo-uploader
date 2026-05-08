# WaiNui Photo Uploader

A senior-friendly photo upload page that quietly saves files to **your** Dropbox. Seniors never see a login — they pick photos, tap one big green button, and done.

**100% free to run.** Hosting on Vercel free tier, storage on Dropbox's free 2 GB tier (or whatever Dropbox plan you have).

```
Senior clicks link → Big upload page → Picks photos → Taps "Upload Now"
                                              ↓
                       Browser asks server for a short-lived Dropbox token
                                              ↓
                       Browser uploads photos directly to YOUR Dropbox
                                              ↓
                                Senior sees "Success!" screen
```

The server only hands out short-lived tokens — photo bytes never pass through it. That's why it fits in a free serverless tier with no file size limit.

---

## Setup (about 5 minutes, one time)

### Step 1 — Create a Dropbox app

1. Go to <https://www.dropbox.com/developers/apps> → **Create app**.
2. Choose API: **Scoped access**.
3. Choose access type: **App folder** (recommended — limits this app to a single folder, safer).
4. Give the app a name (e.g. `WaiNui Photo Uploader`). Click **Create app**.
5. On the **Permissions** tab, tick `files.content.write`. Click **Submit**.
6. On the **Settings** tab:
   - Under **OAuth 2 → Redirect URIs**, add `http://localhost:3000/auth/callback` (and later your Vercel URL).
   - Copy the **App key** and click **Show** next to **App secret** to copy that too.

That's it. No Azure portal, no API permissions tree, nothing else.

### Step 2 — Deploy to Vercel (free)

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com> → **Add New** → **Project** → import the repo. Click **Deploy**.
3. After deploy, **Settings → Environment Variables**, add:
   - `DROPBOX_APP_KEY` = (from step 1)
   - `DROPBOX_APP_SECRET` = (from step 1)
   - `DROPBOX_REDIRECT_URI` = `https://YOUR-PROJECT.vercel.app/auth/callback`
4. Back in Dropbox app **Settings → Redirect URIs**, add `https://YOUR-PROJECT.vercel.app/auth/callback`.
5. **Redeploy** in Vercel so the env vars take effect.

### Step 3 — Get your refresh token (one time)

Visit `https://YOUR-PROJECT.vercel.app/auth/start` in your browser. Sign in with your Dropbox account. The page will display a refresh token.

Copy it, go back to Vercel **Settings → Environment Variables**, add:
- `DROPBOX_REFRESH_TOKEN` = (the token from above)

Click **Redeploy** one more time. **Done.** Send `https://YOUR-PROJECT.vercel.app` to seniors.

---

## Where photos end up

Every upload lands in your Dropbox under:

```
/Apps/WaiNui Photo Uploader/{senior's name or today's date}/
```

If a senior types "Margaret" in the name field, her photos go into a `Margaret` folder. If they leave it blank, the folder name becomes today's date.

---

## Embed in WordPress

Paste this into a Custom HTML block:

```html
<iframe
  src="https://YOUR-PROJECT.vercel.app"
  width="100%"
  height="900"
  style="border:0;max-width:760px"
  allow="camera"
  title="Send Your Photos">
</iframe>
```

The app sets `frame-ancestors *` so embedding works out of the box.

---

## Local development (optional)

```bash
cp .env.example .env
# fill in DROPBOX_APP_KEY and DROPBOX_APP_SECRET
npm start
```

Open <http://localhost:3000>. To get a refresh token locally, visit <http://localhost:3000/auth/start>, paste the resulting token into `.env` as `DROPBOX_REFRESH_TOKEN`, restart.

The local dev server is a tiny zero-dependency Node.js HTTP server.

---

## File map

| Path | What it does |
|---|---|
| [api/dropbox-token.js](api/dropbox-token.js) | Vercel function: hands the browser a 4-hour Dropbox token |
| [api/auth-start.js](api/auth-start.js) | Vercel function: redirects to Dropbox sign-in (one-time setup) |
| [api/auth-callback.js](api/auth-callback.js) | Vercel function: shows the refresh token after sign-in |
| [lib/dropbox.js](lib/dropbox.js) | Dropbox helpers (token refresh, OAuth) |
| [public/index.html](public/index.html) | The senior-friendly page (huge buttons, big text) |
| [public/styles.css](public/styles.css) | Styles — high contrast, 22px+ fonts, large touch targets |
| [public/app.js](public/app.js) | Frontend — direct upload to Dropbox (single + chunked) |
| [server.js](server.js) | Local dev server (mirrors the same routes) |
| [vercel.json](vercel.json) | Vercel config (route rewrites + frame embedding) |

---

## Security note

The browser receives a short-lived (4-hour) Dropbox access token to upload directly. Because the app uses Dropbox's **App folder** scope, even if that token is somehow extracted, it can only read/write the dedicated `/Apps/WaiNui Photo Uploader/` folder — never the rest of your Dropbox. Your refresh token (the long-term credential) stays on the server and is never sent to browsers.

---

## Cost summary

| | Cost |
|---|---|
| Vercel hosting (free tier: 100 GB bandwidth/mo, no sleep) | $0 |
| Dropbox app registration | $0 |
| Dropbox storage (free Basic plan: 2 GB) | $0 |
| Domain (use the free `*.vercel.app` subdomain, or bring your own) | $0 |

Photo bytes flow browser → Dropbox directly, so Vercel bandwidth stays tiny.
