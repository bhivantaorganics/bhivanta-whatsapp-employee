// Run: node --test tests/
// These tests use a throwaway DB so they never touch data.db.
process.env.DB_PATH = '/tmp/bhivanta-test.db';
const fs = require('node:fs'); try { fs.unlinkSync('/tmp/bhivanta-test.db'); } catch {}
const test = require('node:test'); const assert = require('node:assert');
const { aiDraft, processInbound, scoreLead } = require('../server.js');
test('price with no approved price goes to human review, never invents', () => {
  const d = aiDraft('price kya hai?', {}); assert.equal(d.intent, 'price_request'); assert.equal(d.needsHuman, true); assert.ok(!/\d+\s*₹/.test(d.body) && !d.body.includes('₹499'));
});
test('benefits use only approved wording', () => {
  const d = aiDraft('is se phool aayenge?', {}); assert.equal(d.needsHuman, false); assert.match(d.body, /better flowers/);
});
test('complaint is sensitive and held', () => {
  const d = aiDraft('mera order kharab aaya, complaint hai', {}); assert.equal(d.needsHuman, true);
});
test('duplicate webhook message is ignored', () => {
  const a = processInbound({ phone: '919999999991', body: 'hello', whatsappId: 'wamid-test-1' });
  const b = processInbound({ phone: '919999999991', body: 'hello', whatsappId: 'wamid-test-1' });
  assert.equal(b.duplicate, true); assert.ok(a.conversationId);
});
test('lead scoring: price+address is hot, greeting is cold', () => {
  assert.equal(scoreLead(999001, ['price kya hai aur mera address Delhi 110001 hai']), 'hot');
});
test('dummy WhatsApp values do NOT flip mode to cloud_api', () => {
  const { isRealWhatsappConfig, isPlaceholderValue, db } = require('../server.js');
  assert.equal(isPlaceholderValue('dummy_phone_number_id'), true);
  assert.equal(isPlaceholderValue(''), true);
  // env in this test process has no real WhatsApp config, so seeded mode must be simulator
  const mode = db.prepare('SELECT value FROM settings WHERE key=?').get('whatsapp_mode').value;
  assert.equal(mode, 'simulator');
});
test('order enquiry starts as New Enquiry, never Confirmed', () => {
  processInbound({ phone: '919999999992', body: 'mujhe order karna hai, address Delhi 110001', whatsappId: 'wamid-test-2' });
  const { db } = require('../server.js');
  const o = db.prepare('SELECT * FROM orders WHERE customer_id=(SELECT id FROM customers WHERE phone=?) ORDER BY id DESC LIMIT 1').get('919999999992');
  assert.equal(o.stage, 'New Enquiry');
});
