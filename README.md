# Bhivanta Organics — AI WhatsApp Employee (Phase 1, working)

A mobile-first employee dashboard for Bhivanta Organics Pvt. Ltd. that manages
WhatsApp conversations, leads, orders, products/knowledge base, tasks and reports.
Built with **zero paid dependencies**: Node.js 24 stdlib + built-in SQLite.
No `npm install` needed for Phase 1.

## What genuinely works today (tested locally, see below)
- Owner login (hashed password, session token), Dashboard with real counts
- Inbox + simulated incoming messages, manual owner replies
- AI draft engine (Hindi/English/Hinglish, rule-based, ₹0): intent detection,
  approved-benefits answers, price/usage **held for human review when unapproved**
- Approval queue: low-confidence and sensitive drafts are NEVER auto-sent
  while approval mode is ON (the safe default)
- Human Takeover per conversation, Pause / Resume / Emergency Stop
- Customers, lead scoring (hot/warm/cold), Orders with all 10 stages —
  AI-created orders start at **New Enquiry only**; Confirmed only by admin click
- Product Knowledge Base editable in the UI — empty fields mean "AI says
  unavailable", never a guessed price/ingredient/dosage/certification
- Tasks/follow-ups, daily/weekly/monthly reports (estimated vs verified sales
  kept separate; verified revenue is ₹0 until a payment is admin-verified)
- Webhook endpoint with signature verification + duplicate-message protection
- Audit log, spending-limit setting, Postgres schema in `schema.sql`

## What does NOT work yet / needs your credentials and manual steps
- **Real WhatsApp sending/receiving**: needs Cloud API setup (Phase 2).
  Until then the app runs in **simulator mode** and every outbound message is
  labelled SIMULATED. It does not send to real WhatsApp, and it does not use
  any unofficial WhatsApp Web automation library in production.
- **Paid LLM replies**: rule-based engine is the default. An LLM provider is
  pluggable via env vars, but no key is assumed and no unlimited free API is
  claimed. Local open-source models need real hardware (see below).
- **Payment verification**: no payment integration is connected, so no payment
  is ever marked received automatically.

## Run locally (2 minutes)
```bash
cd bhivanta-whatsapp-employee
ADMIN_PASSWORD=apna-strong-password node server.js
# open http://localhost:3000  — login: owner / <ADMIN_PASSWORD>
# (without ADMIN_PASSWORD the demo password is admin123 — change it)
```
Test the flow: Inbox → simulate a message like "price kya hai?" → it goes to
Approvals (price is TBD) → approve/edit → it appears as the reply.
Try "mere phool ke liye fayda kya hai?" → approved-benefits draft.
Try "order karna hai, Delhi 110001" → an order appears as New Enquiry.

## Tests
```bash
node --test tests/engine.test.js
```

## Deploy (free tiers, honest limits)
- **Render free / Railway trial / a small VPS**: Node app + SQLite file.
  SQLite is fine for pilot scale (tens of customers). Move to Postgres
  (`schema.sql`, Supabase/Neon free tier) before hundreds of daily chats.
- Backups: copy `data.db` regularly; the app has no automatic cloud backup yet.
- HTTPS is mandatory for the Meta webhook. Do not expose the app without
  changing ADMIN_PASSWORD and setting a strong session setup (Phase 5 adds
  rate-limiting, CSRF and role hardening — see TODO in WHATSAPP_SETUP.md).

## Local LLM — resource warning (do not skip)
A locally hosted open-source model is only practical on a machine with
enough RAM/VRAM (typically 16GB+ RAM for a small 7–8B model, more for larger
ones, and it will be slow on a normal laptop). For Bhivanta's pilot volume,
the free rule-based engine + human approval is cheaper and more reliable
than a weak local model. Use an LLM only if you have that hardware or you
accept a low-cost API with a hard monthly cap (`MONTHLY_AI_LIMIT_INR`).

## Safety rules enforced in code
1. No invented price, ingredient, dosage, certification, medical claim,
   guaranteed result, or delivery date.
2. Enquiry ≠ confirmed order. Payment ≠ received unless admin-verified.
3. No bulk promo without opt-in; no follow-up after opt-out.
4. Secrets only in env vars, never in frontend code or example files.
