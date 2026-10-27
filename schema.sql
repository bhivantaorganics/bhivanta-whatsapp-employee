-- PostgreSQL equivalent of the SQLite schema in server.js.
-- For free local running, server.js uses SQLite (data.db) with the same
-- tables. When you move to Postgres (e.g. Supabase free tier / Neon free
-- tier), run this file, then point a Postgres-backed build at it.
-- Never put real tokens in this file.
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT, price TEXT, mrp TEXT, pack_sizes TEXT, ingredients TEXT, benefits TEXT, usage TEXT, target_plants TEXT, precautions TEXT, stock TEXT, shipping_policy TEXT, return_policy TEXT, approved_claims TEXT, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS kb_items(id SERIAL PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, category TEXT, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY, name TEXT, phone TEXT UNIQUE NOT NULL, city TEXT, pincode TEXT, type TEXT DEFAULT 'customer', opt_out INT DEFAULT 0, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id), status TEXT DEFAULT 'open', takeover INT DEFAULT 0, last_message_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY, conversation_id INT NOT NULL REFERENCES conversations(id), whatsapp_id TEXT UNIQUE, direction TEXT NOT NULL, body TEXT NOT NULL, sender TEXT, status TEXT DEFAULT 'received', simulated INT DEFAULT 1, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS drafts(id SERIAL PRIMARY KEY, conversation_id INT NOT NULL REFERENCES conversations(id), body TEXT NOT NULL, intent TEXT, confidence REAL, reason TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, ref TEXT UNIQUE NOT NULL, customer_id INT REFERENCES customers(id), product_id INT, product_name TEXT, quantity INT DEFAULT 1, address TEXT, pincode TEXT, notes TEXT, stage TEXT DEFAULT 'New Enquiry', amount_text TEXT, payment_status TEXT DEFAULT 'Not verified', created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS leads(id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id), score TEXT DEFAULT 'cold', signals TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id SERIAL PRIMARY KEY, title TEXT NOT NULL, conversation_id INT, customer_id INT, due_at TIMESTAMPTZ, done INT DEFAULT 0, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id SERIAL PRIMARY KEY, action TEXT NOT NULL, detail TEXT, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage(id SERIAL PRIMARY KEY, provider TEXT NOT NULL, cost_inr REAL DEFAULT 0, month TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS automation_rules(id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, enabled INT DEFAULT 1, config TEXT);
