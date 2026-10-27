# Setup WITHOUT a number — install now, add number at the last moment

This is the version you asked for on 27 Oct 2026: **no mobile number is
attached now**. The app is fully set up and runs in simulator mode.
When you start operations in future, you add the number at the last moment
— no reinstall, no code change.

## What "no number" means in this build
- WhatsApp mode on the dashboard shows `simulator`.
- No Cloud API token, phone number ID, or business number is stored in code.
- Inbox test messages, drafts, orders and reports all work locally, but
  nothing goes to real WhatsApp customers.
- Your current WhatsApp Business app / Web operator on +91 9761831317 is
  untouched by this build. Nothing has been migrated.

## Install / deploy now (pick one)
### A. On your computer (2 minutes, for testing)
```bash
unzip bhivanta-whatsapp-employee.zip
cd bhivanta-whatsapp-employee
ADMIN_PASSWORD=apna-strong-password node server.js
# open http://localhost:3000 — login: owner
```
Needs Node 24+ only. No npm install needed.

### B. Public link on Render free (for a shareable link)
1. Put this folder in a GitHub repo (or use Render's file upload / Blueprint).
2. Create a Web Service, start command `node server.js`, or import `render.yaml`.
3. Set ONLY `ADMIN_PASSWORD` for now. Leave all WHATSAPP_* vars blank.
4. Render gives you a public URL, e.g. `https://bhivanta-whatsapp-employee.onrender.com`.
   That URL is your install/share link. Health check: add `/api/health` — it
   should return `{"ok":true,"mode":"simulator"}`.
5. Free-tier honesty: Render free spins down when idle (first load is slow)
   and its disk is not permanent — `data.db` can be lost on redeploy.
   For real operations, move to Postgres (`schema.sql`) or a paid persistent
   disk BEFORE you go live with customers. Do not treat free-tier SQLite as
   your permanent order record.

### C. VPS / Docker (later, for operations)
```bash
docker build -t bhivanta-employee .
docker run -p 3000:3000 -v bhivanta-data:/app/data -e ADMIN_PASSWORD=xxx bhivanta-employee
```

## Last-moment steps — when operations start (only these, in this order)
1. On your host, set these env vars (in the host dashboard, NEVER in chat):
   `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.
   Then restart the app. Dashboard mode should flip from `simulator` to `cloud_api`.
2. In Meta Developers → WhatsApp → Configuration, set Callback URL to
   `https://YOUR-DOMAIN/webhook/whatsapp` and the same Verify Token.
   Subscribe to `messages`.
3. Send ONE test message to the API number from your personal phone.
   Check it in Inbox, approve its draft, confirm the reply arrives.
4. Only then tell customers / switch the live flow. Keep Approval Mode ON
   until price, pack sizes, usage, stock and shipping are filled in Products
   with owner-confirmed facts.
5. If you migrate +91 9761831317 (your earlier decision), remember:
   the Business app / Web operator for that number stops, and going back
   needs deregister + re-register (see PHASE2_CHECKLIST.md). If you use a
   different number for API, the main number stays untouched.

## Files in the package
server.js, public/ (dashboard), tests/, schema.sql, package.json, render.yaml,
Procfile, Dockerfile, README.md, WHATSAPP_SETUP.md, PHASE2_CHECKLIST.md,
TROUBLESHOOTING.md, .env.example, this file. No real tokens, no data.db.
