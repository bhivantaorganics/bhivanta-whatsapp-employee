// Bhivanta Organics — AI WhatsApp Employee (Phase 1)
// Zero paid dependencies: Node.js stdlib + node:sqlite only.
// IMPORTANT SAFETY RULES baked into code:
//  - No price / ingredient / dosage / certification is invented. If the
//    Knowledge Base field is empty, the AI says "unavailable" and routes
//    the conversation to Human Review. It never guesses.
//  - An order is NEVER "Confirmed" by the AI. Only an authorised admin
//    clicking Confirm in the dashboard can move it to Confirmed.
//  - Payment is NEVER marked received by the AI. Only an admin can do that.
//  - Low-confidence replies are never sent. They go to the approval queue.
//  - WhatsApp credentials live ONLY in environment variables, never in
//    frontend code. Default mode is "simulator": messages are stored
//    locally and clearly labelled SIMULATED, they are NOT sent to WhatsApp
//    until Cloud API credentials are configured by the owner.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// ---------- Schema (SQLite; Postgres equivalent in schema.sql) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, price TEXT, mrp TEXT, pack_sizes TEXT, ingredients TEXT, benefits TEXT, usage TEXT, target_plants TEXT, precautions TEXT, stock TEXT, shipping_policy TEXT, return_policy TEXT, approved_claims TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kb_items(id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, answer TEXT NOT NULL, category TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE NOT NULL, city TEXT, pincode TEXT, type TEXT DEFAULT 'customer', opt_out INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, status TEXT DEFAULT 'open', takeover INTEGER DEFAULT 0, last_message_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, whatsapp_id TEXT UNIQUE, direction TEXT NOT NULL, body TEXT NOT NULL, sender TEXT, status TEXT DEFAULT 'received', simulated INTEGER DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts(id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, body TEXT NOT NULL, intent TEXT, confidence REAL, reason TEXT, status TEXT DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL, customer_id INTEGER, product_id INTEGER, product_name TEXT, quantity INTEGER DEFAULT 1, address TEXT, pincode TEXT, notes TEXT, stage TEXT DEFAULT 'New Enquiry', amount_text TEXT, payment_status TEXT DEFAULT 'Not verified', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, score TEXT DEFAULT 'cold', signals TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, conversation_id INTEGER, customer_id INTEGER, due_at TEXT, done INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage(id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, cost_inr REAL DEFAULT 0, month TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automation_rules(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, enabled INTEGER DEFAULT 1, config TEXT);
`);
const now = () => new Date().toISOString();
const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const audit = (action, detail = '') => db.prepare('INSERT INTO audit_log(action,detail,created_at) VALUES(?,?,?)').run(action, detail, now());
function hashPass(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }

// ---------- Seed (verified facts only; everything unconfirmed = TBD) ----------
if (!getSetting('seeded')) {
  const salt = crypto.randomBytes(16).toString('hex');
  const adminPw = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users(username,pass_hash,pass_salt,role,created_at) VALUES(?,?,?,?,?)')
    .run('owner', hashPass(adminPw, salt), salt, 'owner', now());
  db.prepare(`INSERT INTO products(name,category,price,mrp,pack_sizes,ingredients,benefits,usage,target_plants,precautions,stock,shipping_policy,return_policy,approved_claims,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('Organic Plant Growth Promoter', 'Plant growth promoter (granules)', null, null,
      '2 sizes shown on pack — exact weight TBD (owner to fill)',
      null, // ingredients: NOT on transcribed record — do not invent
      'Better flowers, leaves, fruits, soil quality (wording from live site bhivantaorganics.com)',
      null, // usage/dosage: pack back has instructions but text not transcribed — TBD
      'Urban gardeners: terrace/balcony garden, indoor plants, kitchen garden, flowering/vegetable plants (pack use-case icons)',
      null, 'TBD — owner to fill', 'Rolling out through partner nurseries. Online delivery NOT live as of 26 Oct 2026 audit — owner to confirm before promising delivery.',
      'TBD — owner to fill', 'Organic Plant Growth Promoter for home gardeners. Via nurseries. Better Care. Happier Plants.', now());
  const kb = [
    ['What does Bhivanta Organic Plant Growth Promoter do?', 'It is an Organic Plant Growth Promoter (granules) for home gardeners. As per the approved site wording, it supports better flowers, leaves, fruits and soil quality.', 'product'],
    ['What is the price?', 'PRICE_ON_WHATSAPP', 'price'],
    ['How do I order?', 'Share your name, delivery address and PIN code here. We will save it as an enquiry first. An order is confirmed only after the owner confirms it — sending a message here does not by itself confirm an order or payment.', 'order'],
    ['Where can I buy it?', 'Rolling out through partner nurseries. Online delivery is not live as of the last audit — please ask here and we will confirm availability for your city/PIN.', 'availability'],
  ];
  for (const [q, a, c] of kb) db.prepare('INSERT INTO kb_items(question,answer,category,updated_at) VALUES(?,?,?,?)').run(q, a, c, now());
  for (const [n, cfg] of [['welcome', '{}'], ['business_hours', '{"hours":"TBD — owner to set"}'], ['price_request', '{}'], ['order_collection', '{}'], ['complaint', '{}'], ['follow_up', '{}']])
    db.prepare('INSERT OR IGNORE INTO automation_rules(name,enabled,config) VALUES(?,?,?)').run(n, 1, cfg);
  setSetting('seeded', '1'); setSetting('whatsapp_mode', process.env.WHATSAPP_PHONE_NUMBER_ID ? 'cloud_api' : 'simulator');
  setSetting('automation_paused', '0'); setSetting('emergency_stop', '0'); setSetting('approval_mode', '1');
  setSetting('monthly_ai_limit_inr', process.env.MONTHLY_AI_LIMIT_INR || '0');
  audit('seed', 'Seeded with verified facts only; price/ingredients/usage left TBD');
  console.log('[seed] owner login: owner / ' + (process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : 'admin123 — CHANGE THIS before any public deployment'));
}

// ---------- PATCH 2026-10-27: mode + admin password re-derived on EVERY startup ----------
// Why: SnapDeploy required all env vars to be filled, so dummy WhatsApp values
// present at first start locked mode to cloud_api, and the owner password hashed
// into data.db at first start could not be changed by changing the env var alone.
// Now: mode = cloud_api ONLY if the phone ID is all digits AND the access token
// is present AND neither looks like a placeholder (dummy/placeholder/not_set/
// test/example/xxxx, or very short). Otherwise simulator, even if dummy vars exist.
// And if ADMIN_PASSWORD env is set and does not match the stored owner hash,
// the stored hash is updated to it on startup (host env is the owner-controlled
// source of truth for this pilot app; anyone who can set host env already
// controls the deployment). This makes "overwrite ADMIN_PASSWORD in host env
// + restart" actually work.
function isPlaceholderValue(v) { return !v || /dummy|placeholder|not_set|not-set|example|xxxx|test_|changeme/i.test(v) || v.length < 8; }
function isRealWhatsappConfig() { const id = process.env.WHATSAPP_PHONE_NUMBER_ID || ''; const tok = process.env.WHATSAPP_ACCESS_TOKEN || ''; return /^\d+$/.test(id) && tok.length >= 20 && !isPlaceholderValue(id) && !isPlaceholderValue(tok); }
setSetting('whatsapp_mode', isRealWhatsappConfig() ? 'cloud_api' : 'simulator');
if (process.env.ADMIN_PASSWORD) {
  const owner = db.prepare('SELECT * FROM users WHERE username=?').get('owner');
  if (owner && hashPass(process.env.ADMIN_PASSWORD, owner.pass_salt) !== owner.pass_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET pass_hash=?, pass_salt=? WHERE id=?').run(hashPass(process.env.ADMIN_PASSWORD, salt), salt, owner.id);
    audit('admin_password_synced_from_env', 'owner password updated from ADMIN_PASSWORD env on startup');
  }
}

// ---------- Helpers ----------
function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }
function authUser(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return null;
  const s = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(t);
  return s ? db.prepare('SELECT id,username,role FROM users WHERE id=?').get(s.user_id) : null;
}
function getOrCreateCustomer(phone, name) {
  let c = db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
  if (!c) { const r = db.prepare('INSERT INTO customers(name,phone,created_at) VALUES(?,?,?)').run(name || null, phone, now()); c = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid); }
  else if (name && !c.name) db.prepare('UPDATE customers SET name=? WHERE id=?').run(name, c.id);
  return c;
}
function getOrCreateConversation(customerId) {
  let cv = db.prepare('SELECT * FROM conversations WHERE customer_id=? ORDER BY id DESC LIMIT 1').get(customerId);
  if (!cv) { const r = db.prepare('INSERT INTO conversations(customer_id,status,created_at) VALUES(?,?,?)').run(customerId, 'open', now()); cv = db.prepare('SELECT * FROM conversations WHERE id=?').get(r.lastInsertRowid); }
  return cv;
}
function scoreLead(customerId, signals) {
  const s = signals.join(' ').toLowerCase();
  let score = 'cold';
  if (/(price|order|address|pincode|buy|chahiye|mangwana)/.test(s)) score = 'hot';
  else if (/(benefit|fayda|usage|kaise|flower|plant)/.test(s)) score = 'warm';
  const ex = db.prepare('SELECT * FROM leads WHERE customer_id=?').get(customerId);
  if (ex) db.prepare('UPDATE leads SET score=?,signals=?,updated_at=? WHERE id=?').run(score, signals.join(', '), now(), ex.id);
  else db.prepare('INSERT INTO leads(customer_id,score,signals,created_at,updated_at) VALUES(?,?,?,?,?)').run(customerId, score, signals.join(', '), now(), now());
  return score;
}

// ---------- AI reply engine: rule-based first (free, no API key needed) ----------
// Returns {body, intent, confidence, needsHuman, reason}. Never invents.
// Pluggable: if AI_PROVIDER=openai-compatible and key set and spend limit
// not reached, the server would call it — but rule-based answers from the
// KB take precedence for price/claims, and any AI draft still goes through
// the approval queue when approval_mode=1.
function aiDraft(text, customer) {
  const t = ' ' + text.toLowerCase() + ' ';
  const hasDev = /[\u0900-\u097F]/.test(text);
  const lang = hasDev ? 'hi' : 'hinglish/en';
  const product = db.prepare('SELECT * FROM products ORDER BY id LIMIT 1').get();
  const has = (re) => re.test(t);
  // Sensitive intents win over order/price wording: a complaint that also
  // mentions "order" must still go to human review, never auto-handled.
  if (has(/(complaint|kharab|problem|galat|refund|shikayat)/)) return { body: 'Aapki shikayat ke liye khed hai. Maine ye owner ko human review ke liye bhej di hai — kripya apna order reference (agar ho) aur detail bhej dein, owner jald jawab denge. Refund ya koi financial vaada bina owner approval ke nahi diya ja sakta.', intent: 'complaint', confidence: 0.9, needsHuman: true, reason: 'sensitive_complaint', lang: hasDev ? 'hi' : 'hinglish/en' };
  let intent = 'general', confidence = 0.35, body = '', needsHuman = true, reason = 'low_confidence';
  if (has(/(^|\s)(hi|hello|hey|namaste|namaskar|hii|assalam)/)) {
    intent = 'greeting'; confidence = 0.9; needsHuman = false; reason = 'rule_greeting';
    body = hasDev ? 'Namaste! Bhivanta Organics me swagat hai. 🌱 Organic Plant Growth Promoter ke baare me pooch sakte hain — price, fayde, ya order ke liye batayein, main madad kar dunga.'
      : 'Hello! Welcome to Bhivanta Organics. 🌱 Ask me about the Organic Plant Growth Promoter — price, benefits, or ordering — and I will help.';
  } else if (has(/(price|kimat|daam|mrp|rate|kitne ka|kitna hai|cost)/)) {
    intent = 'price_request'; confidence = 0.9;
    if (product.price || product.mrp) { body = `Organic Plant Growth Promoter ki price: ${product.price || product.mrp}. Pack size ke liye batayein kaunsa pack chahiye.`; needsHuman = false; reason = 'kb_price'; }
    else { body = 'Price ke liye dhanyavaad — is waqt price WhatsApp par confirm ki ja rahi hai, isliye main andaze se price nahi bata raha. Hamari team jald price confirm karke batayegi. Aap apna sheher/PIN bata dein to hum availability bhi check kar lenge.'; needsHuman = true; reason = 'price_not_approved'; }
  } else if (has(/(kaise use|use kaise|dosage|kitna dal|how to use|usage|dalna|instruction)/)) {
    intent = 'usage'; confidence = 0.85;
    if (product.usage) { body = product.usage; needsHuman = false; reason = 'kb_usage'; }
    else { body = 'Usage ki sahi jaankari pack par di gayi hai, aur main bina confirmed instructions ke dosage nahi bata raha. Hamari team aapko confirmed usage instructions bhej degi — aap kis plant ke liye pooch rahe hain, ye bata dein.'; needsHuman = true; reason = 'usage_not_approved'; }
  } else if (has(/(fayda|benefit|flower|phool|fruit|phal|soil|mitti|growth|badhega)/)) {
    intent = 'benefits'; confidence = 0.85; needsHuman = false; reason = 'kb_benefits';
    body = 'Organic Plant Growth Promoter home gardeners ke liye hai — approved wording ke hisaab se ye better flowers, leaves, fruits aur soil quality me madad karta hai. Terrace/balcony garden, indoor plants, kitchen garden, flowering aur vegetable plants ke liye banaya gaya hai. Koi guaranteed result ka vaada hum nahi karte.';
  } else if (has(/(order|mangwana|chahiye|lena hai|buy|book|address|pincode|deliver)/)) {
    intent = 'order_intent'; confidence = 0.85; needsHuman = false; reason = 'rule_order';
    body = 'Zaroor! Order enquiry ke liye mujhe ye chahiye: 1) aapka naam, 2) delivery address, 3) PIN code, 4) kitne pack chahiye. Ye bhejte hi main aapki enquiry save kar dunga. Dhyaan rahe — enquiry bhejna hi order confirm hona nahi hai; confirmation owner ke confirm karne par hi hogi, aur payment tabhi jab owner verify kare.';
  } else if (has(/(nursery|partner|retailer|shop|dukaan|join|distributor|bechna)/)) {
    intent = 'partner'; confidence = 0.85; needsHuman = false; reason = 'rule_partner';
    body = 'Nursery Partner / Team join karne ke liye dhanyavaad! Aap apna naam, WhatsApp number, sheher/PIN, aur (nursery ke liye) business ka naam + address, ya (team ke liye) vehicle + coverage area bhej dein. Margin/earning ka koi vaada bina owner approval ke nahi diya ja sakta — terms owner confirm karenge.';
  } else if (has(/(complaint|kharab|problem|galat|nahi aaya|late|refund|shikayat)/)) {
    intent = 'complaint'; confidence = 0.9; needsHuman = true; reason = 'sensitive_complaint';
    body = 'Aapki shikayat ke liye khed hai. Maine ye owner ko human review ke liye bhej di hai — kripya apna order reference (agar ho) aur detail bhej dein, owner jald jawab denge. Refund ya koi financial vaada bina owner approval ke nahi diya ja sakta.';
  } else if (has(/(human|call|baat|owner|phone|number pe baat)/)) {
    intent = 'human_request'; confidence = 0.9; needsHuman = true; reason = 'human_requested';
    body = 'Zaroor, maine ye conversation owner ko de di hai. Owner jald aapse yahin WhatsApp par jawab denge. Tab tak aap apna sawaal detail me likh sakte hain.';
  } else if (has(/(delivery|kab milega|kab aayega|shipping|kab pahunchega)/)) {
    intent = 'delivery'; confidence = 0.8; needsHuman = true; reason = 'delivery_not_confirmed';
    body = 'Delivery ke baare me main bina confirmed policy ke date ka vaada nahi kar sakta. Abhi product partner nurseries se roll out ho raha hai aur online delivery live nahi hai (last audit ke hisaab se). Aap apna sheher/PIN bhejein, owner availability confirm karke batayenge.';
  } else {
    body = 'Dhanyavaad! Aapka message mil gaya hai. Is sawaal ka confirmed jawab mere paas abhi nahi hai, isliye maine ise owner ko human review ke liye bhej diya hai — andaze se jawab nahi dunga. Owner jald jawab denge.';
  }
  return { body, intent, confidence, needsHuman, reason, lang };
}
function monthSpend() { const m = now().slice(0, 7); const r = db.prepare('SELECT COALESCE(SUM(cost_inr),0) s FROM ai_usage WHERE month=?').get(m); return r.s; }

// Process an inbound message: dedupe, store, lead-score, draft/route.
function processInbound({ phone, name, body, whatsappId }) {
  if (whatsappId && db.prepare('SELECT id FROM messages WHERE whatsapp_id=?').get(whatsappId)) return { duplicate: true };
  const cust = getOrCreateCustomer(phone, name);
  const conv = getOrCreateConversation(cust.id);
  db.prepare('INSERT INTO messages(conversation_id,whatsapp_id,direction,body,sender,created_at) VALUES(?,?,?,?,?,?)').run(conv.id, whatsappId || null, 'in', body, 'customer', now());
  db.prepare('UPDATE conversations SET last_message_at=? WHERE id=?').run(now(), conv.id);
  const score = scoreLead(cust.id, [body]);
  const d = aiDraft(body, cust);
  const paused = getSetting('automation_paused') === '1' || getSetting('emergency_stop') === '1';
  const approvalMode = getSetting('approval_mode') === '1';
  if (conv.takeover || paused) {
    db.prepare('INSERT INTO drafts(conversation_id,body,intent,confidence,reason,status,created_at) VALUES(?,?,?,?,?,?,?)').run(conv.id, d.body, d.intent, d.confidence, conv.takeover ? 'human_takeover' : 'automation_paused', 'held', now());
    audit('inbound_held', `conv ${conv.id} intent=${d.intent} reason=${conv.takeover ? 'takeover' : 'paused'}`);
    return { conversationId: conv.id, draft: d, held: true };
  }
  db.prepare('INSERT INTO drafts(conversation_id,body,intent,confidence,reason,status,created_at) VALUES(?,?,?,?,?,?,?)').run(conv.id, d.body, d.intent, d.confidence, d.reason, 'pending', now());
  const draftId = db.prepare('SELECT id FROM drafts ORDER BY id DESC LIMIT 1').get().id;
  // Order enquiry capture: if message looks like it contains address/pin, save enquiry (stage stays New Enquiry)
  if (d.intent === 'order_intent' || /\b\d{6}\b/.test(body)) {
    const ref = 'BHV-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const pin = (body.match(/\b\d{6}\b/) || [])[0] || null;
    db.prepare('INSERT INTO orders(ref,customer_id,product_name,quantity,address,pincode,notes,stage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(ref, cust.id, 'Organic Plant Growth Promoter', 1, body, pin, body, 'New Enquiry', now(), now());
    audit('order_enquiry_created', ref);
  }
  if (!d.needsHuman && !approvalMode && d.confidence >= 0.8) {
    // Auto-send only when approval mode is OFF and confidence is high.
    sendOutbound(conv.id, d.body, false);
    db.prepare('UPDATE drafts SET status=? WHERE id=?').run('sent', draftId);
    audit('auto_reply_sent', `conv ${conv.id} intent=${d.intent}`);
    return { conversationId: conv.id, draft: d, sent: true };
  }
  audit('draft_queued', `conv ${conv.id} intent=${d.intent} confidence=${d.confidence} needsHuman=${d.needsHuman}`);
  return { conversationId: conv.id, draft: d, queued: true };
}
function sendOutbound(conversationId, body, manual) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversationId);
  const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(conv.customer_id);
  const mode = getSetting('whatsapp_mode');
  let simulated = 1;
  if (mode === 'cloud_api' && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && !cust.opt_out) {
    // Real send is attempted by the caller via async fetch; here we record
    // optimistically only if the caller confirmed success. This function is
    // used for simulator/manual paths; cloud send goes through sendViaCloud().
    simulated = 1;
  }
  db.prepare('INSERT INTO messages(conversation_id,direction,body,sender,status,simulated,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(conversationId, 'out', body, manual ? 'owner' : 'ai', 'sent', simulated, now());
  db.prepare('UPDATE conversations SET last_message_at=? WHERE id=?').run(now(), conversationId);
  return { simulated: simulated === 1 };
}
async function sendViaCloud(to, body) {
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('WhatsApp API error: ' + JSON.stringify(j));
  return j;
}

// ---------- HTTP server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/health') return sendJson(res, 200, { ok: true, mode: getSetting('whatsapp_mode'), time: now() });
    if (p === '/api/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      const u = db.prepare('SELECT * FROM users WHERE username=?').get(b.username);
      if (!u || hashPass(b.password || '', u.pass_salt) !== u.pass_hash) return sendJson(res, 401, { error: 'Invalid login' });
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').run(token, u.id, now());
      audit('login', u.username); return sendJson(res, 200, { token, username: u.username, role: u.role });
    }
    // WhatsApp webhook (public, signature-verified when secret is set)
    if (p === '/webhook/whatsapp') {
      if (req.method === 'GET') {
        if (url.searchParams.get('hub.verify_token') === (process.env.WHATSAPP_VERIFY_TOKEN || '') && process.env.WHATSAPP_VERIFY_TOKEN) return res.end(url.searchParams.get('hub.challenge') || '');
        return sendJson(res, 403, { error: 'verify token mismatch or not configured' });
      }
      if (req.method === 'POST') {
        const raw = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
        if (process.env.WHATSAPP_APP_SECRET) {
          const sig = req.headers['x-hub-signature-256'] || '';
          const exp = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(raw).digest('hex');
          // timingSafeEqual throws on length mismatch — check length first.
          if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return sendJson(res, 403, { error: 'bad signature' });
        }
        let payload = {}; try { payload = JSON.parse(raw); } catch {}
        let count = 0;
        for (const entry of payload.entry || []) for (const change of entry.changes || []) {
          for (const m of change.value.messages || []) {
            if (m.type !== 'text') continue;
            const out = processInbound({ phone: m.from, body: m.text.body, whatsappId: m.id });
            if (!out.duplicate) count++;
          }
        }
        return sendJson(res, 200, { received: count });
      }
    }
    if (p.startsWith('/api/')) {
      const user = authUser(req);
      if (!user) return sendJson(res, 401, { error: 'Login required' });
      const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
      // Dashboard
      if (p === '/api/dashboard') {
        const today = now().slice(0, 10);
        const q = (sql, ...a) => db.prepare(sql).get(...a);
        const orders = db.prepare('SELECT stage, COUNT(*) c FROM orders GROUP BY stage').all();
        const byStage = {}; orders.forEach(o => byStage[o.stage] = o.c);
        return sendJson(res, 200, {
          whatsappMode: getSetting('whatsapp_mode'), automationPaused: getSetting('automation_paused') === '1',
          emergencyStop: getSetting('emergency_stop') === '1', approvalMode: getSetting('approval_mode') === '1',
          todayConversations: q('SELECT COUNT(*) c FROM messages WHERE substr(created_at,1,10)=? AND direction=?', today, 'in').c,
          pendingReplies: q('SELECT COUNT(*) c FROM drafts WHERE status=?', 'pending').c,
          newLeads: q('SELECT COUNT(*) c FROM leads WHERE substr(created_at,1,10)=?', today).c,
          followUpsDue: q('SELECT COUNT(*) c FROM tasks WHERE done=0').c,
          completedTasks: q('SELECT COUNT(*) c FROM tasks WHERE done=1').c,
          ordersByStage: byStage, totalOrders: q('SELECT COUNT(*) c FROM orders').c,
          confirmedOrders: byStage['Confirmed'] || 0,
          estimatedSalesText: 'TBD — price not approved in Knowledge Base, so no estimated sales figure is invented',
          actualSalesText: '₹0 verified — no payment has been verified through an integration or admin confirmation yet',
          aiSpendThisMonthInr: monthSpend(), aiLimitInr: Number(getSetting('monthly_ai_limit_inr') || 0),
          recentActivity: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 20').all(),
        });
      }
      if (p === '/api/inbox' && req.method === 'GET') {
        const convs = db.prepare(`SELECT c.*, cu.name, cu.phone FROM conversations c JOIN customers cu ON cu.id=c.customer_id ORDER BY COALESCE(c.last_message_at,c.created_at) DESC LIMIT 100`).all();
        return sendJson(res, 200, convs.map(cv => ({ ...cv, messages: db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id ASC LIMIT 200').all(cv.id) })));
      }
      if (p === '/api/simulate' && req.method === 'POST') { // local test inbox: simulates a customer message
        const out = processInbound({ phone: body.phone || '919999999999', name: body.name, body: body.text || '', whatsappId: 'sim-' + crypto.randomBytes(6).toString('hex') });
        return sendJson(res, 200, out);
      }
      const convSend = p.match(/^\/api\/inbox\/(\d+)\/send$/);
      if (convSend && req.method === 'POST') {
        const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(convSend[1]);
        const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(conv.customer_id);
        if (getSetting('whatsapp_mode') === 'cloud_api' && process.env.WHATSAPP_ACCESS_TOKEN) {
          try { await sendViaCloud(cust.phone, body.text); sendOutbound(conv.id, body.text, true); db.prepare('UPDATE messages SET simulated=0 WHERE conversation_id=? ORDER BY id DESC LIMIT 1').run(conv.id); }
          catch (e) { audit('whatsapp_send_failed', e.message); return sendJson(res, 502, { error: e.message }); }
        } else sendOutbound(conv.id, body.text, true);
        audit('manual_send', `conv ${conv.id}`); return sendJson(res, 200, { ok: true, simulated: getSetting('whatsapp_mode') !== 'cloud_api' });
      }
      const takeover = p.match(/^\/api\/inbox\/(\d+)\/takeover$/);
      if (takeover && req.method === 'POST') { db.prepare('UPDATE conversations SET takeover=? WHERE id=?').run(body.takeover ? 1 : 0, takeover[1]); audit('takeover', `conv ${takeover[1]} = ${body.takeover}`); return sendJson(res, 200, { ok: true }); }
      if (p === '/api/drafts' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT d.*, cu.phone FROM drafts d JOIN conversations c ON c.id=d.conversation_id JOIN customers cu ON cu.id=c.customer_id WHERE d.status=? ORDER BY d.id DESC').all('pending'));
      const approve = p.match(/^\/api\/drafts\/(\d+)\/approve$/);
      if (approve && req.method === 'POST') {
        const d = db.prepare('SELECT * FROM drafts WHERE id=?').get(approve[1]);
        sendOutbound(d.conversation_id, body.text || d.body, true);
        db.prepare('UPDATE drafts SET status=? WHERE id=?').run('sent', d.id); audit('draft_approved', `draft ${d.id}`);
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/customers' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT * FROM customers ORDER BY id DESC').all());
      if (p === '/api/leads' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT l.*, cu.name, cu.phone FROM leads l JOIN customers cu ON cu.id=l.customer_id ORDER BY l.updated_at DESC').all());
      if (p === '/api/orders' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT o.*, cu.name, cu.phone FROM orders o LEFT JOIN customers cu ON cu.id=o.customer_id ORDER BY o.id DESC').all());
      if (p === '/api/orders' && req.method === 'POST') {
        const cust = getOrCreateCustomer(body.phone || '910000000000', body.name);
        const ref = 'BHV-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const r = db.prepare('INSERT INTO orders(ref,customer_id,product_name,quantity,address,pincode,notes,stage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(ref, cust.id, body.product_name || 'Organic Plant Growth Promoter', body.quantity || 1, body.address || '', body.pincode || '', body.notes || '', 'New Enquiry', now(), now());
        audit('order_created_manual', ref); return sendJson(res, 200, { id: r.lastInsertRowid, ref });
      }
      const orderStage = p.match(/^\/api\/orders\/(\d+)\/stage$/);
      if (orderStage && req.method === 'POST') {
        const valid = ['New Enquiry', 'Interested Lead', 'Awaiting Confirmation', 'Awaiting Payment', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Human Review'];
        if (!valid.includes(body.stage)) return sendJson(res, 400, { error: 'Invalid stage' });
        if (body.stage === 'Confirmed') audit('order_confirmed_by_admin', `order ${orderStage[1]} — admin action, not AI`);
        db.prepare('UPDATE orders SET stage=?, updated_at=? WHERE id=?').run(body.stage, now(), orderStage[1]);
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/products' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT * FROM products ORDER BY id').all());
      if (p === '/api/products' && req.method === 'POST') {
        const pr = db.prepare('SELECT * FROM products WHERE id=?').get(body.id);
        db.prepare('UPDATE products SET price=?,mrp=?,pack_sizes=?,ingredients=?,benefits=?,usage=?,precautions=?,stock=?,shipping_policy=?,return_policy=?,updated_at=? WHERE id=?')
          .run(body.price || null, body.mrp || null, body.pack_sizes || null, body.ingredients || null, body.benefits || null, body.usage || null, body.precautions || null, body.stock || null, body.shipping_policy || null, body.return_policy || null, now(), body.id);
        audit('kb_updated', `product ${body.id} by owner`); return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/kb' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT * FROM kb_items ORDER BY id DESC').all());
      if (p === '/api/tasks' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT t.*, cu.phone FROM tasks t LEFT JOIN customers cu ON cu.id=t.customer_id ORDER BY t.done ASC, t.id DESC').all());
      if (p === '/api/tasks' && req.method === 'POST') { db.prepare('INSERT INTO tasks(title,conversation_id,customer_id,due_at,created_at) VALUES(?,?,?,?,?)').run(body.title, body.conversation_id || null, body.customer_id || null, body.due_at || null, now()); return sendJson(res, 200, { ok: true }); }
      const taskDone = p.match(/^\/api\/tasks\/(\d+)\/done$/);
      if (taskDone && req.method === 'POST') { db.prepare('UPDATE tasks SET done=1 WHERE id=?').run(taskDone[1]); return sendJson(res, 200, { ok: true }); }
      if (p === '/api/reports') {
        const range = url.searchParams.get('range') || 'daily';
        const days = range === 'monthly' ? 30 : range === 'weekly' ? 7 : 1;
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const q = (sql, ...a) => db.prepare(sql).get(...a);
        return sendJson(res, 200, { range, incoming: q('SELECT COUNT(*) c FROM messages WHERE direction=? AND created_at>=?', 'in', since).c, leads: q('SELECT COUNT(*) c FROM leads WHERE created_at>=?', since).c, orders: q('SELECT COUNT(*) c FROM orders WHERE created_at>=?', since).c, confirmed: q('SELECT COUNT(*) c FROM orders WHERE stage=? AND created_at>=?', 'Confirmed', since).c, cancelled: q('SELECT COUNT(*) c FROM orders WHERE stage=? AND created_at>=?', 'Cancelled', since).c, complaints: q('SELECT COUNT(*) c FROM drafts WHERE intent=? AND created_at>=?', 'complaint', since).c, followUpsDone: q('SELECT COUNT(*) c FROM tasks WHERE done=1 AND created_at>=?', since).c, revenueVerifiedText: '₹0 verified — see dashboard note' });
      }
      if (p === '/api/settings' && req.method === 'GET') return sendJson(res, 200, { whatsappMode: getSetting('whatsapp_mode'), automationPaused: getSetting('automation_paused') === '1', emergencyStop: getSetting('emergency_stop') === '1', approvalMode: getSetting('approval_mode') === '1', aiProvider: process.env.AI_PROVIDER || 'rule-based (free)', aiLimitInr: getSetting('monthly_ai_limit_inr'), cloudConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) });
      if (p === '/api/settings' && req.method === 'POST') {
        for (const k of ['automation_paused', 'emergency_stop', 'approval_mode', 'monthly_ai_limit_inr']) if (body[k] !== undefined) setSetting(k, body[k]);
        audit('settings_changed', JSON.stringify(body)); return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/rules' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT * FROM automation_rules').all());
      if (p === '/api/audit' && req.method === 'GET') return sendJson(res, 200, db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all());
      return sendJson(res, 404, { error: 'Not found: ' + p });
    }
    // Static frontend
    let file = p === '/' ? '/index.html' : p;
    const fp = path.join(__dirname, 'public', file);
    if (!fp.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { console.error(e); sendJson(res, 500, { error: e.message }); }
});
if (require.main === module) server.listen(PORT, () => console.log(`Bhivanta WhatsApp Employee running on http://localhost:${PORT} — login: owner`));
module.exports = { server, aiDraft, processInbound, scoreLead, db, isRealWhatsappConfig, isPlaceholderValue };
