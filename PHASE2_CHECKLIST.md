# Phase 2 — Cloud API setup checklist (owner steps in order)

Status on 27 Oct 2026: webhook code TESTED locally (see below). Real WhatsApp
is NOT connected yet — that needs the owner steps below, because Meta
requires the business owner's own sign-in, verification and number choice.
Muse cannot do those taps for you, and must never be sent real tokens in chat.

## Tested locally today (27 Oct 2026)
- GET webhook verify: correct token → returns challenge; wrong token → 403. PASS
- POST with correct HMAC-SHA256 signature → `{"received":1}`, message stored,
  price draft queued for approval (price is still TBD). PASS
- Same WhatsApp message ID sent twice → second time `{"received":0}` (dedupe). PASS
- Bad signature → 403 (bug found in testing: a short bad signature crashed
  the handler; fixed in server.js — length is checked before timingSafeEqual). PASS after fix
- Mode after all tests: still `simulator` until Cloud env vars are set.

## Decision 1 — which number? DECIDED 27 Oct 2026 ~19:21 IST
- OWNER DECISION: migrate the MAIN number +91 9761831317 (not a second number).
- CONSEQUENCE ACCEPTED BY OWNER: once this number is on Cloud API, it cannot
  stay on the WhatsApp Business app / WhatsApp Web operator at the same time.
  The current Muse Web-operator flow for this number stops.
- GOING BACK IS POSSIBLE, BUT NOT ONE-CLICK: deregister the number from
  Cloud API, wait a few minutes, then re-register it in the WhatsApp Business
  app with SMS/call OTP (and two-step PIN if set). Chat history may be lost,
  quality rating resets, and in some cases a number cannot be deleted until
  30 days after its last paid message — so do not assume instant reversal.
  Website wa.me/919761831317 links still open a chat to the same number;
  replies will then come from this app via Cloud API, not from the phone app.
- DO NOT migrate before Step 1 (public HTTPS + webhook ready) is done.
  Migrating first risks messages arriving with nowhere to go.

## Step 1 — Deploy the app to a public HTTPS URL (webhook needs this)
Localhost will NOT work for Meta's webhook. Pick one:
- Render free tier: new Web Service from this folder, start command
  `node server.js`, set the env vars in Step 2 on Render (not in code).
- Or Railway / a small VPS with HTTPS (Caddy/Nginx).
- Temporary test only: `ngrok http 3000` gives a public HTTPS URL, but it
  changes on restart and is not a production home for the app.
You must create/sign in to the hosting account yourself. After deploy, note
your domain, e.g. `https://bhivanta-employee.onrender.com`.

## Step 2 — Env vars to set on the host (never in chat, never in git)
```
ADMIN_PASSWORD=<strong password you choose>
WHATSAPP_VERIFY_TOKEN=<a random string you invent, e.g. 32 random chars>
WHATSAPP_APP_SECRET=<from Meta App dashboard, Step 3>
WHATSAPP_ACCESS_TOKEN=<temporary token first, then permanent token>
WHATSAPP_PHONE_NUMBER_ID=<from Meta WhatsApp dashboard>
WHATSAPP_BUSINESS_ACCOUNT_ID=<from Meta WhatsApp dashboard>
MONTHLY_AI_LIMIT_INR=0
```

## Step 3 — Meta setup (you sign in, Muse guides)
1. Go to developers.facebook.com → create/select an App → add WhatsApp product.
2. In WhatsApp → API Setup: note Phone Number ID + temporary access token.
   For testing, Meta gives a test number first — use that before any real number.
3. In WhatsApp → Configuration: Callback URL =
   `https://YOUR-DOMAIN/webhook/whatsapp`, Verify Token = your token from Step 2.
   Subscribe to the `messages` webhook field. Meta will call the GET verify —
   it must return the challenge (tested above).
4. Send a test message TO the test/API number from your personal phone.
   It should appear in this app's Inbox, and a price question should land in
   Approvals (not auto-sent), because price is still TBD.
5. In this app, approve the draft → it should send back via Cloud API
   (not SIMULATED) if tokens are set.
6. Business verification + permanent token + payment method: needed before
   higher daily limits and production use. A new/unverified setup starts at
   a low daily limit for business-initiated messages.
7. Templates: create and get approval for templates BEFORE sending any
   business-initiated message outside the 24-hour customer-service window
   (e.g. order update, follow-up reminder). Inside the window, free-form
   replies are allowed. No bulk promo without opt-in.

## Step 4 — What Muse will do once you give the domain + number decision
- Check the deployed `/api/health` and webhook verify from outside.
- Walk through one real test message end-to-end with you.
- Keep Approval Mode ON until the Knowledge Base is filled with confirmed
  price/pack/usage/stock/shipping facts.

## What NOT to do
- Do not paste WHATSAPP_ACCESS_TOKEN or APP_SECRET in this chat.
- Do not migrate 9761831317 on day one.
- Do not turn Approval Mode OFF until price and usage are confirmed.
- Do not send bulk marketing messages — templates + opt-in are mandatory.
