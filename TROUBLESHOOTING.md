# Troubleshooting
- **App won't start**: need Node 24+ (`node --version`) for built-in SQLite.
  Older Node will fail on `node:sqlite`.
- **Login fails**: default demo is owner/admin123 only if ADMIN_PASSWORD was
  not set at first start. If a `data.db` already exists, the first-start
  password is the one already stored — delete `data.db` to re-seed (this
  deletes local data, so back it up first).
- **"SIMULATED" on messages**: expected. Real WhatsApp needs Cloud API env
  vars + HTTPS webhook — see WHATSAPP_SETUP.md. Simulator messages never
  reach real customers.
- **Price question goes to Approvals**: expected and correct. Fill Price in
  Products with an owner-confirmed price, then price drafts will stop
  needing human review for that reason.
- **Webhook verify fails**: WHATSAPP_VERIFY_TOKEN must match exactly, and the
  callback URL must be `https://YOUR-DOMAIN/webhook/whatsapp`.
- **Duplicate messages**: the app dedupes by WhatsApp message ID. If Meta
  retries a webhook, the second copy is ignored and logged as duplicate.
- **AI spend**: rule-based engine costs ₹0. If you later add a paid LLM,
  set MONTHLY_AI_LIMIT_INR; paid calls must stop at the limit (Phase 3
  enforcement is in the provider wrapper — do not raise the limit silently).
- **Database backup**: stop the app, copy `data.db` (and `data.db-wal` if
  present), restart. There is no automatic backup yet.
