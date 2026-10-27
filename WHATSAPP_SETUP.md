# WhatsApp Cloud API setup — Phase 2 (owner steps, no code changes needed to start)

## 1. Genuine costs (India, check Meta's rate card again at setup time)
Direct Cloud API access itself has no platform fee. Meta charges per
conversation (a 24-hour window), not per message, and rates differ by type.
Third-party write-ups in Oct 2026 put India roughly at: marketing ~₹0.86 per
conversation, utility/authentication ~₹0.12, and service conversations free
inside the 24-hour customer-service window up to 1,000 service conversations
per month per WhatsApp Business Account, with charges beyond that (sources
disagree on the post-Oct-2026 service rate — verify on Meta's official rate
card before budgeting). BSPs (Wati, Interakt, AiSensy, etc.) add ₹799–₹8,000+/month
platform fees on top — going direct with this app avoids that fee, but you
build/maintain the webhook yourself, which is what this app does.
**Bottom line for pilot scale: if most chats are customer-initiated service
chats under 1,000/month, Meta conversation cost can be ₹0; business-initiated
utility/marketing messages will cost, and you need a payment method on file.**

## 2. Requirements (exact)
- A Meta Business account + a WhatsApp Business Account (WABA).
- Business verification may be required before higher messaging limits and
  before some features unlock; a new unverified number starts at a low
  daily limit (often 250 business-initiated conversations/day).
- A phone number for the WABA. **Important:** a number registered on the
  Cloud API cannot stay on the WhatsApp Business app at the same time.
  If you migrate +91 9761831317, that number leaves the app/Web operator
  flow. Consider a second number for API testing first.
- A publicly reachable HTTPS URL for the webhook (your deployed app).
- Approved message templates for any business-initiated message outside the
  24-hour customer-service window. Inside the window, free-form replies are allowed.

## 3. Wizard steps
1. Deploy this app with HTTPS. Set env: WHATSAPP_VERIFY_TOKEN (random),
   WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
2. In Meta Developers → WhatsApp → Configuration, set Callback URL to
   `https://YOUR-DOMAIN/webhook/whatsapp` and Verify Token to your token.
   Subscribe to `messages`.
3. Send a test message to the API number from your personal phone.
4. In this app's Settings, confirm mode flips from `simulator` to `cloud_api`.
5. Keep Approval Mode ON for the first weeks. Approve drafts until the
   Knowledge Base (price, pack sizes, usage, stock, shipping) is fully filled
   with owner-confirmed facts.

## 4. Legal low-cost alternative if you do NOT want the API yet
Stay on the WhatsApp Business app (free): Greeting message + Away message
only, plus this app's operator workflow — the founder (or Muse as operator
via WhatsApp Web) replies manually using the drafts in this app. That is
free and ban-safe, but not instant/automatic. Do NOT use unofficial
auto-reply apps or WhatsApp Web automation libraries in production: they
violate WhatsApp's terms and risk a ban on the business number.
