// Debit NOW AI - unified sandbox service
// Built by Isaac Koketso Shaba | KWHILCH GROUP PTY LTD

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { Pool } = require('pg');
const logger = require('./src/utils/logger');

const app = express();
app.use(express.json({ limit: '1mb' }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (error) => logger.error(`Pool error: ${error.message}`));

const PORT = process.env.PORT || 3000;
const DASHBOARD_DIR = path.join(__dirname, 'control-dashboard', 'public');
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'debitnow123';
const SMS_GATEWAY = process.env.SMS_GATEWAY || 'mock';
const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL;
const OTP_VALID_MINUTES = Number(process.env.OTP_VALID_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);
const OTP_PEPPER = process.env.OTP_PEPPER || 'debit-now-dev-pepper';

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, client_name TEXT NOT NULL,
      phone_number TEXT NOT NULL, account_id TEXT, max_debit NUMERIC NOT NULL,
      status TEXT DEFAULT 'active', last_debit_attempt TIMESTAMP,
      arrears_amount NUMERIC DEFAULT 0, is_in_arrears BOOLEAN DEFAULT FALSE,
      arrears_days INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS operators (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT UNIQUE,
      status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS debit_instructions (
      id SERIAL PRIMARY KEY, consumer_id INTEGER REFERENCES consumers(id), amount NUMERIC NOT NULL,
      reason TEXT, instruction_status TEXT DEFAULT 'pending', operator_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(), executed_at TIMESTAMP, executed_by_system TEXT
    );
    CREATE TABLE IF NOT EXISTS debit_logs (
      id SERIAL PRIMARY KEY, consumer_id INTEGER REFERENCES consumers(id), instruction_id INTEGER REFERENCES debit_instructions(id),
      amount NUMERIC, status TEXT, ai_decision TEXT, reason TEXT, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sms_notifications (
      id SERIAL PRIMARY KEY, consumer_id INTEGER REFERENCES consumers(id), message TEXT NOT NULL,
      notification_type TEXT, status TEXT DEFAULT 'pending', provider_message_id TEXT, sent_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS authorization_requests (
      id SERIAL PRIMARY KEY, instruction_id INTEGER UNIQUE REFERENCES debit_instructions(id), consumer_id INTEGER REFERENCES consumers(id),
      operator_id TEXT NOT NULL, amount NUMERIC NOT NULL, currency TEXT DEFAULT 'ZAR', channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'authorization_pending', otp_hash TEXT NOT NULL, otp_expires_at TIMESTAMP NOT NULL,
      otp_attempts INTEGER DEFAULT 0, max_otp_attempts INTEGER DEFAULT 3, approved_at TIMESTAMP, declined_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS communication_messages (
      id SERIAL PRIMARY KEY, authorization_request_id INTEGER REFERENCES authorization_requests(id), consumer_id INTEGER REFERENCES consumers(id),
      channel TEXT NOT NULL, provider TEXT NOT NULL, destination_masked TEXT, message_type TEXT NOT NULL,
      provider_message_id TEXT, status TEXT NOT NULL, failure_code TEXT, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS authorization_events (
      id SERIAL PRIMARY KEY, authorization_request_id INTEGER REFERENCES authorization_requests(id),
      event_type TEXT NOT NULL, channel TEXT, metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_status ON authorization_requests(status);
    CREATE INDEX IF NOT EXISTS idx_auth_consumer ON authorization_requests(consumer_id);
  `);
  logger.info('Database initialized successfully');
}

const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');
const maskPhone = (value) => { const p = normalizePhone(value); return p.length > 3 ? `${'*'.repeat(p.length - 4)}${p.slice(-4)}` : '****'; };
const makeOtp = () => crypto.randomInt(100000, 1000000).toString();
const otpHash = (otp) => crypto.createHash('sha256').update(`${otp}:${OTP_PEPPER}`).digest('hex');
const amountText = (amount) => Number(amount).toFixed(2);

async function event(authId, type, channel, metadata = {}) {
  await pool.query('INSERT INTO authorization_events(authorization_request_id,event_type,channel,metadata) VALUES($1,$2,$3,$4)', [authId, type, channel, metadata]);
}

async function sendWhatsApp(to, body) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return { success: false, unavailable: true };
  try {
    const response = await axios.post(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to: normalizePhone(to), type: 'text', text: { body } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 });
    return { success: true, providerMessageId: response.data?.messages?.[0]?.id };
  } catch (error) { logger.error(`WhatsApp send failed: ${error.message}`); return { success: false, error: error.message }; }
}

async function sendSMS(to, body) {
  if (SMS_GATEWAY === 'mock' || !SMS_API_KEY || !SMS_GATEWAY_URL) {
    // Safe local testing: the OTP is visible only in the development server terminal.
    logger.info(`[SMS MOCK to ${maskPhone(to)}] ${body}`);
    return { success: true, providerMessageId: `sms_mock_${Date.now()}` };
  }
  try {
    const response = await axios.post(SMS_GATEWAY_URL, { to: normalizePhone(to), text: body },
      { headers: { Authorization: `Bearer ${SMS_API_KEY}`, 'X-API-Key': SMS_API_KEY }, timeout: 10000 });
    return { success: true, providerMessageId: response.data?.id || response.data?.message_id };
  } catch (error) { logger.error(`SMS send failed: ${error.message}`); return { success: false, error: error.message }; }
}

async function sendApproval(auth) {
  const body = `KWHILCH GROUP PTY LTD\nDebit NOW approval request\nAmount: R${amountText(auth.amount)}\nReference: ${auth.instruction_id}\n\nReply APPROVE ${auth.otp} to approve, or DECLINE to reject. Code expires in ${OTP_VALID_MINUTES} minutes.`;
  const whatsapp = await sendWhatsApp(auth.phone_number, body);
  if (whatsapp.success) {
    await pool.query(`INSERT INTO communication_messages(authorization_request_id,consumer_id,channel,provider,destination_masked,message_type,provider_message_id,status) VALUES($1,$2,'whatsapp','meta',$3,'debit_approval',$4,'sent')`, [auth.id, auth.consumer_id, maskPhone(auth.phone_number), whatsapp.providerMessageId || null]);
    return { channel: 'whatsapp', ...whatsapp };
  }
  const sms = await sendSMS(auth.phone_number, body);
  await pool.query(`INSERT INTO communication_messages(authorization_request_id,consumer_id,channel,provider,destination_masked,message_type,provider_message_id,status,failure_code) VALUES($1,$2,'sms',$3,$4,'debit_approval',$5,$6,$7)`, [auth.id, auth.consumer_id, SMS_GATEWAY, maskPhone(auth.phone_number), sms.providerMessageId || null, sms.success ? 'sent' : 'failed', sms.error || null]);
  return { channel: 'sms', ...sms };
}

async function debitViaSandbox(consumer, amount) {
  logger.info(`[SANDBOX] Debit R${amount} from consumer ${consumer.id}`);
  return { success: true, transaction_id: `txn_sandbox_${Date.now()}` };
}

async function createAuthorizationRequest(instructionId, operatorId = 'dashboard-agent', preferredChannel = 'whatsapp') {
  const instruction = (await pool.query(`SELECT di.*, c.phone_number FROM debit_instructions di JOIN consumers c ON c.id=di.consumer_id WHERE di.id=$1 AND di.instruction_status='pending'`, [instructionId])).rows[0];
  if (!instruction) return { error: 'Instruction not found or already processed' };
  const existing = (await pool.query("SELECT id FROM authorization_requests WHERE instruction_id=$1 AND status IN ('authorization_pending','otp_sent','client_approved')", [instructionId])).rows[0];
  if (existing) return { error: 'An approval request already exists for this instruction' };
  const otp = makeOtp();
  const auth = (await pool.query(`INSERT INTO authorization_requests(instruction_id,consumer_id,operator_id,amount,channel,otp_hash,otp_expires_at,max_otp_attempts) VALUES($1,$2,$3,$4,$5,$6,NOW()+($7 || ' minutes')::interval,$8) RETURNING *`, [instruction.id, instruction.consumer_id, String(operatorId), instruction.amount, preferredChannel, otpHash(otp), OTP_VALID_MINUTES, OTP_MAX_ATTEMPTS])).rows[0];
  const delivery = await sendApproval({ ...auth, phone_number: instruction.phone_number, otp });
  if (!delivery.success) { await pool.query("UPDATE authorization_requests SET status='delivery_failed', updated_at=NOW() WHERE id=$1", [auth.id]); return { error: 'Approval message could not be delivered' }; }
  await pool.query("UPDATE authorization_requests SET status='otp_sent', channel=$1, updated_at=NOW() WHERE id=$2", [delivery.channel, auth.id]);
  await event(auth.id, 'otp_sent', delivery.channel);
  return { id: auth.id, channel: delivery.channel, status: 'otp_sent' };
}

async function approveAuthorization(auth, suppliedOtp, channel = 'web') {
  if (!auth) return { ok: false, status: 404, error: 'Authorization request not found' };
  if (!['otp_sent', 'authorization_pending'].includes(auth.status)) return { ok: false, status: 409, error: 'Authorization is no longer pending' };
  if (new Date(auth.otp_expires_at) <= new Date()) return { ok: false, status: 410, error: 'OTP has expired' };
  if (auth.otp_attempts >= auth.max_otp_attempts) return { ok: false, status: 429, error: 'OTP is locked' };
  if (otpHash(String(suppliedOtp || '').trim()) !== auth.otp_hash) {
    await pool.query('UPDATE authorization_requests SET otp_attempts=otp_attempts+1, updated_at=NOW() WHERE id=$1', [auth.id]);
    await event(auth.id, 'otp_failed', channel);
    return { ok: false, status: 401, error: 'Invalid OTP' };
  }
  const claim = await pool.query(`UPDATE authorization_requests SET status='client_approved', approved_at=NOW(), updated_at=NOW() WHERE id=$1 AND status IN ('otp_sent','authorization_pending') RETURNING *`, [auth.id]);
  if (!claim.rows[0]) return { ok: false, status: 409, error: 'Authorization was already processed' };
  await event(auth.id, 'client_approved', channel);
  const instruction = (await pool.query('SELECT * FROM debit_instructions WHERE id=$1', [auth.instruction_id])).rows[0];
  const consumer = (await pool.query('SELECT * FROM consumers WHERE id=$1', [auth.consumer_id])).rows[0];
  const payment = await debitViaSandbox(consumer, instruction.amount);
  if (!payment.success) { await pool.query("UPDATE authorization_requests SET status='payment_failed',updated_at=NOW() WHERE id=$1", [auth.id]); return { ok: false, status: 502, error: 'Sandbox payment failed' }; }
  await pool.query("UPDATE authorization_requests SET status='payment_succeeded',updated_at=NOW() WHERE id=$1", [auth.id]);
  await pool.query("UPDATE debit_instructions SET instruction_status='executed',executed_at=NOW(),executed_by_system=$1 WHERE id=$2", [auth.operator_id, instruction.id]);
  await pool.query("INSERT INTO debit_logs(consumer_id,instruction_id,amount,status,ai_decision,reason) VALUES($1,$2,$3,'success','CLIENT_OTP_APPROVED',$4)", [consumer.id, instruction.id, instruction.amount, instruction.reason]);
  await pool.query('UPDATE consumers SET last_debit_attempt=NOW(),updated_at=NOW() WHERE id=$1', [consumer.id]);
  return { ok: true, payment: { status: 'succeeded', transaction_id: payment.transaction_id, amount: instruction.amount } };
}

// Dashboard is part of the same service at /dashboard.
app.use('/dashboard', express.static(DASHBOARD_DIR));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(DASHBOARD_DIR, 'index.html')));

app.get('/api/consumers', async (_req, res) => { try { res.json((await pool.query('SELECT * FROM consumers ORDER BY created_at DESC')).rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/consumers', async (req, res) => {
  const { name, client_name, phone_number, max_debit } = req.body; const amount = Number(max_debit);
  if (!name || !client_name || !phone_number || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'name, client_name, phone_number and positive max_debit are required' });
  try { const r = await pool.query('INSERT INTO consumers(name,client_name,phone_number,account_id,max_debit) VALUES($1,$2,$3,$4,$5) RETURNING *', [name.trim(), client_name.trim(), normalizePhone(phone_number), `acc_local_${Date.now()}`, amount]); res.status(201).json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/instructions', async (_req, res) => { try { res.json((await pool.query('SELECT di.*,c.name AS consumer_name,c.client_name FROM debit_instructions di JOIN consumers c ON c.id=di.consumer_id ORDER BY di.created_at DESC')).rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/instructions', async (req, res) => {
  const { consumer_id, amount, reason, operator_id = 'dashboard-agent' } = req.body; const value = Number(amount);
  if (!Number.isInteger(Number(consumer_id)) || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'consumer_id and positive amount are required' });
  try { const c = (await pool.query('SELECT * FROM consumers WHERE id=$1', [consumer_id])).rows[0]; if (!c) return res.status(404).json({ error: 'Consumer not found' }); if (value > Number(c.max_debit)) return res.status(400).json({ error: 'Amount exceeds consumer max_debit' }); const r = await pool.query('INSERT INTO debit_instructions(consumer_id,amount,reason,operator_id) VALUES($1,$2,$3,$4) RETURNING *', [consumer_id, value, reason || 'Dashboard collection', String(operator_id)]); res.status(201).json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/instructions/:id/debit-now', async (req, res) => { try { const r = await createAuthorizationRequest(Number(req.params.id), req.body.operator_id || 'dashboard-agent', req.body.channel || 'whatsapp'); if (r.error) return res.status(400).json(r); res.status(202).json({ message: 'Client approval requested', ...r }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/authorization-requests', async (_req, res) => { try { res.json((await pool.query('SELECT ar.id,ar.instruction_id,ar.amount,ar.channel,ar.status,ar.otp_expires_at,ar.otp_attempts,ar.created_at,c.name AS consumer_name FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id ORDER BY ar.created_at DESC LIMIT 100')).rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/authorizations/:id/verify', async (req, res) => { try { const auth = (await pool.query('SELECT ar.*,c.phone_number FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id WHERE ar.id=$1', [req.params.id])).rows[0]; const r = await approveAuthorization(auth, req.body.otp); res.status(r.status || (r.ok ? 200 : 400)).json(r.ok ? r.payment : { error: r.error }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/operators/register', async (req, res) => { const { name, phone_number } = req.body; if (!name || !phone_number) return res.status(400).json({ error: 'Name and phone_number required' }); try { const r = await pool.query('INSERT INTO operators(name,phone_number) VALUES($1,$2) RETURNING *', [name, normalizePhone(phone_number)]); res.status(201).json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/logs', async (_req, res) => { try { res.json((await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 100')).rows); } catch (e) { res.status(500).json({ error: e.message }); } });

// WhatsApp verification and approval commands.
app.get('/webhook', (req, res) => req.query['hub.verify_token'] === VERIFY_TOKEN ? res.status(200).send(req.query['hub.challenge']) : res.sendStatus(403));
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]; if (!message) return res.sendStatus(200);
    const from = normalizePhone(message.from); const text = String(message.text?.body || '').trim(); const upper = text.toUpperCase();
    const auth = (await pool.query("SELECT ar.*,c.phone_number FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id WHERE c.phone_number=$1 AND ar.status IN ('otp_sent','authorization_pending') ORDER BY ar.created_at DESC LIMIT 1", [from])).rows[0];
    if (auth && upper.startsWith('APPROVE ')) { const r = await approveAuthorization(auth, text.split(/\s+/)[1], 'whatsapp'); return res.sendStatus(r.ok ? 200 : 400); }
    if (auth && upper === 'DECLINE') { await pool.query("UPDATE authorization_requests SET status='client_declined',declined_at=NOW(),updated_at=NOW() WHERE id=$1", [auth.id]); await event(auth.id, 'client_declined', 'whatsapp'); return res.sendStatus(200); }
    return res.sendStatus(200);
  } catch (e) { logger.error(`Webhook error: ${e.message}`); return res.sendStatus(500); }
});

app.get('/', (_req, res) => res.redirect('/dashboard'));

if (require.main === module) initDatabase().then(() => app.listen(PORT, () => logger.info(`Debit NOW unified service running at http://localhost:${PORT}/dashboard`))).catch((e) => { logger.error(e); process.exit(1); });
module.exports = { app, pool, initDatabase, createAuthorizationRequest, approveAuthorization };
