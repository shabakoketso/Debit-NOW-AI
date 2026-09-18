// DEBIT NOW AI - agent-initiated, client-approved collection MVP
// Built by Isaac Koketso Shaba | KWHILCH GROUP PTY LTD

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');
const logger = require('./src/utils/logger');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (error) => logger.error(`Pool error: ${error.message}`));

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'debitnow123';
const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_GATEWAY = process.env.SMS_GATEWAY || 'mock';
const SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL;
const OTP_VALID_MINUTES = Number(process.env.OTP_VALID_MINUTES || 5);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);
const KWHILCH_PHONE = process.env.KWHILCH_PHONE || '0680467440';
const KWHILCH_EMAIL = process.env.KWHILCH_EMAIL || 'kwhilchgroup@gmail.com';

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, client_name TEXT NOT NULL,
      phone_number TEXT, account_id TEXT, max_debit NUMERIC NOT NULL,
      status TEXT DEFAULT 'active', last_debit_attempt TIMESTAMP,
      arrears_amount NUMERIC DEFAULT 0, is_in_arrears BOOLEAN DEFAULT FALSE,
      arrears_days INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS operators (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT UNIQUE,
      status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS debit_instructions (
      id SERIAL PRIMARY KEY, consumer_id INTEGER REFERENCES consumers(id),
      amount NUMERIC NOT NULL, reason TEXT, instruction_status TEXT DEFAULT 'pending',
      operator_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), executed_at TIMESTAMP,
      executed_by_system TEXT
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
      id SERIAL PRIMARY KEY, instruction_id INTEGER UNIQUE REFERENCES debit_instructions(id),
      consumer_id INTEGER REFERENCES consumers(id), operator_id TEXT NOT NULL, amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ZAR', channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'authorization_pending',
      otp_hash TEXT NOT NULL, otp_expires_at TIMESTAMP NOT NULL, otp_attempts INTEGER NOT NULL DEFAULT 0,
      max_otp_attempts INTEGER NOT NULL DEFAULT 3, provider_message_id TEXT, approved_at TIMESTAMP,
      declined_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS communication_messages (
      id SERIAL PRIMARY KEY, authorization_request_id INTEGER REFERENCES authorization_requests(id),
      consumer_id INTEGER REFERENCES consumers(id), channel TEXT NOT NULL, provider TEXT NOT NULL,
      destination_masked TEXT, message_type TEXT NOT NULL, provider_message_id TEXT, status TEXT NOT NULL,
      failure_code TEXT, created_at TIMESTAMP DEFAULT NOW(), delivered_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS authorization_events (
      id SERIAL PRIMARY KEY, authorization_request_id INTEGER REFERENCES authorization_requests(id),
      event_type TEXT NOT NULL, channel TEXT, metadata JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_auth_phone ON consumers(phone_number);
    CREATE INDEX IF NOT EXISTS idx_auth_status ON authorization_requests(status);
  `);
  logger.info('Database initialized successfully');
}

const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');
const maskPhone = (value) => {
  const phone = normalizePhone(value);
  return phone.length < 4 ? '****' : `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
};
const generateOtp = () => crypto.randomInt(100000, 1000000).toString();
const hashOtp = (otp) => crypto.createHash('sha256').update(`${otp}:${process.env.OTP_PEPPER || 'debit-now-dev-pepper'}`).digest('hex');
const safeAmount = (value) => Number(value).toFixed(2);

async function logMessage(auth, channel, provider, messageType, status, providerMessageId, failureCode) {
  await pool.query(`INSERT INTO communication_messages
    (authorization_request_id, consumer_id, channel, provider, destination_masked, message_type, provider_message_id, status, failure_code)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [auth.id, auth.consumer_id, channel, provider, maskPhone(auth.phone_number), messageType, providerMessageId || null, status, failureCode || null]);
}

async function sendWhatsApp(to, message) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return { success: false, unavailable: true, error: 'WhatsApp is not configured' };
  try {
    const response = await axios.post(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to: normalizePhone(to), type: 'text', text: { body: message } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 });
    return { success: true, providerMessageId: response.data?.messages?.[0]?.id };
  } catch (error) {
    logger.error(`WhatsApp send failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function sendSMS(to, message) {
  // Mock mode records the message without sending it, which is safe for tests.
  if (SMS_GATEWAY === 'mock' || !SMS_API_KEY || !SMS_GATEWAY_URL) {
    logger.info(`[SMS MOCK] ${maskPhone(to)}: ${message}`);
    return { success: true, providerMessageId: `sms_mock_${Date.now()}`, mocked: true };
  }
  try {
    const response = await axios.post(SMS_GATEWAY_URL,
      { to: normalizePhone(to), text: message, message },
      { headers: { Authorization: `Bearer ${SMS_API_KEY}`, 'X-API-Key': SMS_API_KEY }, timeout: 10000 });
    return { success: true, providerMessageId: response.data?.id || response.data?.message_id };
  } catch (error) {
    logger.error(`SMS send failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function sendApproval(auth) {
  const message = `KWHILCH GROUP PTY LTD\n\nDebit NOW approval request\nAmount: R${safeAmount(auth.amount)}\nReference: ${auth.instruction_id}\n\nReply APPROVE ${auth.otp} to approve, or DECLINE to reject. Code expires in ${OTP_VALID_MINUTES} minutes.`;
  // OTP is deliberately never logged or returned by production APIs.
  const wa = auth.channel === 'whatsapp' ? await sendWhatsApp(auth.phone_number, message) : { success: false, unavailable: true };
  if (wa.success) {
    await logMessage(auth, 'whatsapp', 'meta', 'debit_approval', 'sent', wa.providerMessageId);
    return { channel: 'whatsapp', ...wa };
  }
  const sms = await sendSMS(auth.phone_number, message);
  await logMessage(auth, 'sms', SMS_GATEWAY, 'debit_approval', sms.success ? 'sent' : 'failed', sms.providerMessageId, sms.error);
  return { channel: 'sms', ...sms };
}

async function debitViaStitch(consumer, amount) {
  // Provider adapter boundary. Replace this sandbox result only after provider/compliance approval.
  logger.info(`[SANDBOX] Debit R${amount} from consumer ${consumer.id}`);
  return { success: true, transaction_id: `txn_sandbox_${Date.now()}` };
}

async function recordEvent(authId, eventType, channel, metadata = {}) {
  await pool.query('INSERT INTO authorization_events(authorization_request_id,event_type,channel,metadata) VALUES($1,$2,$3,$4)', [authId, eventType, channel, metadata]);
}

async function approveAuthorization(auth, suppliedOtp, channel) {
  if (!auth || !['otp_sent', 'authorization_pending'].includes(auth.status)) return { ok: false, status: 409, error: 'Authorization is no longer pending' };
  if (new Date(auth.otp_expires_at) <= new Date()) return { ok: false, status: 410, error: 'OTP has expired' };
  if (auth.otp_attempts >= auth.max_otp_attempts) return { ok: false, status: 429, error: 'OTP is locked' };
  if (hashOtp(String(suppliedOtp || '').trim()) !== auth.otp_hash) {
    await pool.query('UPDATE authorization_requests SET otp_attempts = otp_attempts + 1, updated_at = NOW() WHERE id = $1', [auth.id]);
    await recordEvent(auth.id, 'otp_failed', channel);
    return { ok: false, status: 401, error: 'Invalid OTP' };
  }
  const claimed = await pool.query(`UPDATE authorization_requests SET status='client_approved', approved_at=NOW(), updated_at=NOW()
    WHERE id=$1 AND status IN ('otp_sent','authorization_pending') AND otp_expires_at > NOW() RETURNING *`, [auth.id]);
  if (!claimed.rows[0]) return { ok: false, status: 409, error: 'Authorization was already processed' };
  await recordEvent(auth.id, 'client_approved', channel);
  const instruction = (await pool.query('SELECT * FROM debit_instructions WHERE id=$1', [auth.instruction_id])).rows[0];
  const consumer = (await pool.query('SELECT * FROM consumers WHERE id=$1', [auth.consumer_id])).rows[0];
  const result = await debitViaStitch(consumer, instruction.amount);
  if (!result.success) {
    await pool.query("UPDATE authorization_requests SET status='payment_failed', updated_at=NOW() WHERE id=$1", [auth.id]);
    return { ok: false, status: 502, error: result.error || 'Payment failed' };
  }
  await pool.query("UPDATE authorization_requests SET status='payment_succeeded', updated_at=NOW() WHERE id=$1", [auth.id]);
  await pool.query("UPDATE debit_instructions SET instruction_status='executed', executed_at=NOW(), executed_by_system=$1 WHERE id=$2", [auth.operator_id, instruction.id]);
  await pool.query(`INSERT INTO debit_logs(consumer_id,instruction_id,amount,status,ai_decision,reason) VALUES($1,$2,$3,'success','CLIENT_OTP_APPROVED',$4)`, [consumer.id, instruction.id, instruction.amount, instruction.reason]);
  await pool.query('UPDATE consumers SET last_debit_attempt=NOW(), updated_at=NOW() WHERE id=$1', [consumer.id]);
  return { ok: true, payment: { status: 'succeeded', transaction_id: result.transaction_id, amount: instruction.amount } };
}

// Meta webhook verification.
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  return res.sendStatus(403);
});

// Handles both operator commands and customer APPROVE/DECLINE replies.
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);
    const from = normalizePhone(message.from);
    const text = String(message.text?.body || '').trim();
    const upper = text.toUpperCase();
    const authResult = (await pool.query(`SELECT ar.*, c.phone_number FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id
      WHERE c.phone_number=$1 AND ar.status IN ('otp_sent','authorization_pending') ORDER BY ar.created_at DESC LIMIT 1`, [from])).rows[0];
    if (authResult && (upper === 'DECLINE' || upper.startsWith('APPROVE '))) {
      if (upper === 'DECLINE') {
        await pool.query("UPDATE authorization_requests SET status='client_declined', declined_at=NOW(), updated_at=NOW() WHERE id=$1 AND status IN ('otp_sent','authorization_pending')", [authResult.id]);
        await recordEvent(authResult.id, 'client_declined', 'whatsapp');
        await sendWhatsApp(from, `Debit NOW request ${authResult.instruction_id} declined. No payment was processed.`);
      } else {
        const result = await approveAuthorization(authResult, text.split(/\s+/)[1], 'whatsapp');
        await sendWhatsApp(from, result.ok ? `Payment approved and processed. Reference: ${result.payment.transaction_id}` : `Approval failed: ${result.error}`);
      }
      return res.sendStatus(200);
    }
    const operator = (await pool.query("SELECT * FROM operators WHERE phone_number=$1 AND status='active'", [from])).rows[0];
    if (!operator) return res.sendStatus(200);
    if (upper.startsWith('EXECUTE ')) {
      const instructionId = Number(upper.split(/\s+/)[1]);
      const result = await createAuthorizationRequest(instructionId, String(operator.id), 'whatsapp');
      await sendWhatsApp(from, result.error ? `❌ ${result.error}` : `✅ Approval request ${result.id} sent to the client via ${result.channel}. Payment is waiting for client OTP approval.`);
    }
    return res.sendStatus(200);
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`);
    return res.sendStatus(500);
  }
});

async function createAuthorizationRequest(instructionId, operatorId, requestedChannel = 'whatsapp') {
  const instruction = (await pool.query("SELECT di.*, c.phone_number, c.name FROM debit_instructions di JOIN consumers c ON c.id=di.consumer_id WHERE di.id=$1 AND di.instruction_status='pending'", [instructionId])).rows[0];
  if (!instruction) return { error: 'Instruction not found or already processed' };
  if (!instruction.phone_number) return { error: 'Client has no phone number' };
  if (Number(instruction.amount) <= 0) return { error: 'Amount must be positive' };
  const existing = (await pool.query("SELECT id FROM authorization_requests WHERE instruction_id=$1 AND status IN ('authorization_pending','otp_sent','client_approved')", [instructionId])).rows[0];
  if (existing) return { error: 'An approval request already exists for this instruction' };
  const otp = generateOtp();
  const authRow = (await pool.query(`INSERT INTO authorization_requests(instruction_id,consumer_id,operator_id,amount,channel,otp_hash,otp_expires_at,max_otp_attempts,status)
    VALUES($1,$2,$3,$4,$5,$6,NOW()+($7 || ' minutes')::interval,$8,'authorization_pending') RETURNING *`,
    [instruction.id, instruction.consumer_id, operatorId, instruction.amount, requestedChannel, hashOtp(otp), OTP_VALID_MINUTES, OTP_MAX_ATTEMPTS])).rows[0];
  const auth = { ...authRow, phone_number: instruction.phone_number, otp };
  const delivery = await sendApproval(auth);
  if (!delivery.success) {
    await pool.query("UPDATE authorization_requests SET status='delivery_failed', updated_at=NOW() WHERE id=$1", [auth.id]);
    return { error: 'Could not deliver client approval request' };
  }
  await pool.query("UPDATE authorization_requests SET status='otp_sent', channel=$1, updated_at=NOW() WHERE id=$2", [delivery.channel, auth.id]);
  await recordEvent(auth.id, 'otp_sent', delivery.channel, { provider: delivery.providerMessageId || null });
  return { id: auth.id, channel: delivery.channel };
}

// Agent/UI endpoint: clicking Debit NOW creates an approval request; it never debits directly.
app.post('/api/instructions/:id/debit-now', async (req, res) => {
  try {
    const operatorId = String(req.body.operator_id || req.header('x-operator-id') || '');
    if (!operatorId) return res.status(400).json({ error: 'operator_id is required' });
    const result = await createAuthorizationRequest(Number(req.params.id), operatorId, req.body.channel || 'whatsapp');
    if (result.error) return res.status(400).json(result);
    return res.status(202).json({ message: 'Client approval requested', ...result, status: 'otp_sent' });
  } catch (error) { logger.error(`Debit NOW error: ${error.message}`); return res.status(500).json({ error: 'Unable to create approval request' }); }
});

// Client secure page/API or SMS command can verify the OTP.
app.post('/api/authorizations/:id/verify', async (req, res) => {
  try {
    const auth = (await pool.query('SELECT ar.*, c.phone_number FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id WHERE ar.id=$1', [req.params.id])).rows[0];
    const result = await approveAuthorization(auth, req.body.otp, req.body.channel || 'web');
    return res.status(result.status || (result.ok ? 200 : 400)).json(result.ok ? result.payment : { error: result.error });
  } catch (error) { logger.error(`OTP verification error: ${error.message}`); return res.status(500).json({ error: 'Unable to verify OTP' }); }
});

app.get('/api/authorization-requests', async (_req, res) => {
  const result = await pool.query(`SELECT ar.id, ar.instruction_id, ar.amount, ar.channel, ar.status, ar.otp_expires_at, ar.otp_attempts, ar.created_at, c.name AS consumer_name
    FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id ORDER BY ar.created_at DESC LIMIT 100`);
  res.json(result.rows);
});

app.get('/api/consumers', async (_req, res) => res.json((await pool.query('SELECT * FROM consumers ORDER BY created_at DESC')).rows));
app.get('/api/instructions/pending', async (_req, res) => res.json((await pool.query("SELECT di.*, c.name AS consumer_name, c.client_name FROM debit_instructions di JOIN consumers c ON c.id=di.consumer_id WHERE di.instruction_status='pending' ORDER BY di.created_at DESC")).rows));
app.get('/api/logs', async (_req, res) => res.json((await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 100')).rows));
app.post('/api/operators/register', async (req, res) => {
  const { name, phone_number } = req.body;
  if (!name || !phone_number) return res.status(400).json({ error: 'Name and phone_number required' });
  const result = await pool.query('INSERT INTO operators(name,phone_number) VALUES($1,$2) RETURNING *', [name, normalizePhone(phone_number)]);
  res.status(201).json({ message: 'Operator registered', operator: result.rows[0] });
});

app.get('/', async (_req, res) => {
  const [consumers, pending, approvals, logs] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM consumers WHERE status='active'"),
    pool.query("SELECT COUNT(*)::int AS count FROM debit_instructions WHERE instruction_status='pending'"),
    pool.query("SELECT COUNT(*)::int AS count FROM authorization_requests WHERE status IN ('authorization_pending','otp_sent')"),
    pool.query('SELECT COUNT(*)::int AS count FROM debit_logs'),
  ]);
  res.send(`<h1>Debit NOW AI</h1><p>Agent initiated, client OTP approved collections.</p><p>Active consumers: ${consumers.rows[0].count} | Pending instructions: ${pending.rows[0].count} | Awaiting client OTP: ${approvals.rows[0].count} | Debit attempts: ${logs.rows[0].count}</p><p>KWHILCH GROUP PTY LTD | ${KWHILCH_PHONE} | ${KWHILCH_EMAIL}</p>`);
});

if (require.main === module) {
  initDatabase().then(() => app.listen(PORT, () => logger.info(`Debit NOW running on port ${PORT}`))).catch((error) => { logger.error(error); process.exit(1); });
}

module.exports = { app, pool, initDatabase, createAuthorizationRequest, approveAuthorization };
