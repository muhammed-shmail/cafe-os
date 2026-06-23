# Cafe OS — Deployment Guide

## 1. Database: Neon (PostgreSQL)

1. Go to [neon.tech](https://neon.tech) and sign up.
2. Create a new project:
   - **Region:** AWS ap-southeast-1 (Singapore)
   - **Database name:** `cafeos`
3. Copy the two connection strings from the project dashboard:
   - **Pooled connection string** → `DATABASE_URL` (for app queries)
   - **Direct connection string** → `DIRECT_URL` (for migrations)
4. Run migrations against Neon (from `platform/` directory):
   ```bash
   DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:push
   npm run db:seed
   ```
5. Keep these strings safe — you'll paste them into Railway next.

---

## 2. App: Railway

1. Go to [railway.app](https://railway.app) and log in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select your Cafe OS repo.
3. Configure:
   - **Root directory:** `platform`
   - **Environment:** Railway auto-detects Next.js and runs:
     - Build: `npm run db:generate && npm run build`
     - Start: `npm run -w @cafeos/web start`
   - **Region:** Singapore (or closest to your users)
4. Add environment variables in the Railway dashboard:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Neon pooled connection string |
   | `DIRECT_URL` | Neon direct connection string |
   | `DEV_TENANT_SUBDOMAIN` | Seeded tenant subdomain (e.g. `kahwa`) — **required for a single-tenant deploy** whose Railway URL has no tenant subdomain, so the customer PWA + PIN login resolve a tenant |
   | `JWT_SECRET` | Long random string (e.g., `openssl rand -base64 48`) |
   | `GEMINI_API_KEY` | Your API key (from Google AI Studio) |
   | `RAZORPAY_KEY_ID` | Test or live key (when ready) |
   | `RAZORPAY_KEY_SECRET` | Test or live secret |
   | `RAZORPAY_WEBHOOK_SECRET` | Webhook secret |

5. **Deploy** — Railway will build and start your app. First build takes 2–3 minutes.
6. Once deployed, you'll get a public URL. Test it:
   - Open `/login` → should see login page
   - Orders → KDS realtime should work (same process, multiple KDS tabs)

---

## 3. After deployment: the update loop

**Push code → Railway auto-rebuilds → live in 2–3 minutes.**

```bash
# Make changes locally
git add .
git commit -m "description"
git push origin main
# Watch the build on Railway dashboard → done
```

**Schema changes (Prisma)?** Run against Neon first:
```bash
npm run db:push
# (or if you have migrations: npm run db:migrate && npm run db:deploy)
```
Then push the code. Railway will regenerate types automatically.

---

## 4. Monitoring & logs

In Railway dashboard:
- **Logs** → real-time stdout/stderr from your app
- **Metrics** → CPU, memory, request count
- **Deployments** → see each push and rollback if needed

---

## 5. Custom domain (optional)

Railway → **Settings** → **Domains** → add your cafe's domain. Enable HTTPS auto (free Let's Encrypt).

---

## Troubleshooting

**Build fails:** Check the build log. Most common: missing env var → add it to Railway dashboard.

**Customer PWA shows "This table link isn't set up yet":** `/api/customer/context` returned 404 — the
table couldn't be resolved. Two causes: (1) the Neon DB was never seeded (run §1 step 4 against Neon
so tables with QR tokens exist), and/or (2) the request host doesn't map to a tenant — set
`DEV_TENANT_SUBDOMAIN` to the seeded tenant's subdomain (see the env table above). Always generate the
QR/link from the **deployed** admin (Settings → Floor & QR), not a local one — local tokens don't exist
in Neon.

**Realtime not working (KDS silent):** Verify `DATABASE_URL` is the pooled string (has `-pooler` in it). Direct URL breaks the connection pool.

**Database migration errors:** Use Neon branching to test migrations safely before running against prod. See neon.tech/docs/manage/branches.

---

## Scaling: when you need Redis

Once you add multiple Railway instances or go serverless, the in-process EventEmitter won't work across instances. That's when you:

1. Sign up at [upstash.com](https://upstash.com) (Redis).
2. Swap one function in `platform/apps/web/lib/realtime.ts`:
   ```ts
   // Replace the EventEmitter block with Upstash client
   import { Redis } from '@upstash/redis';
   const redis = new Redis({ url: process.env.REDIS_URL });
   export function publish(outletId, event) {
     redis.publish(`outlet:${outletId}`, JSON.stringify(event));
   }
   export function subscribe(outletId, handler) {
     // ... Upstash subscriber pattern
   }
   ```
3. Add `REDIS_URL` to Railway env vars.
4. Deploy. No other code changes.

---

**That's it. Questions?** Check Railway docs at https://docs.railway.app.
