const express = require('express');
const path = require('path');
const { initDatabase, pool, createAuthorizationRequest } = require('../index');

const app = express();
const port = process.env.CONTROL_DASHBOARD_PORT || 3200;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/consumers', async (_req, res) => {
  try { res.json((await pool.query('SELECT * FROM consumers ORDER BY created_at DESC')).rows); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/consumers', async (req, res) => {
  const { name, client_name, phone_number, max_debit } = req.body;
  const amount = Number(max_debit);
  if (!name || !client_name || !phone_number || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'name, client_name, phone_number and positive max_debit are required' });
  }
  try {
    const result = await pool.query(`INSERT INTO consumers(name, client_name, phone_number, account_id, max_debit)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [name.trim(), client_name.trim(), phone_number.trim(), `acc_local_${Date.now()}`, amount]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/instructions', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT di.*, c.name AS consumer_name, c.client_name
      FROM debit_instructions di JOIN consumers c ON c.id=di.consumer_id ORDER BY di.created_at DESC`);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/instructions', async (req, res) => {
  const { consumer_id, amount, reason, operator_id = 'dashboard-agent' } = req.body;
  const numericAmount = Number(amount);
  if (!Number.isInteger(Number(consumer_id)) || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'consumer_id and positive amount are required' });
  }
  try {
    const consumer = (await pool.query('SELECT * FROM consumers WHERE id=$1', [consumer_id])).rows[0];
    if (!consumer) return res.status(404).json({ error: 'Consumer not found' });
    if (numericAmount > Number(consumer.max_debit)) return res.status(400).json({ error: 'Amount exceeds consumer max_debit' });
    const result = await pool.query(`INSERT INTO debit_instructions(consumer_id, amount, reason, operator_id)
      VALUES($1,$2,$3,$4) RETURNING *`, [consumer_id, numericAmount, reason || 'Dashboard collection', String(operator_id)]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/instructions/:id/debit-now', async (req, res) => {
  try {
    const result = await createAuthorizationRequest(Number(req.params.id), String(req.body.operator_id || 'dashboard-agent'), req.body.channel || 'whatsapp');
    if (result.error) return res.status(400).json(result);
    res.status(202).json({ message: 'Approval request sent. Read the OTP from the mock SMS log in development.', ...result });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/authorization-requests', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT ar.id, ar.instruction_id, ar.amount, ar.channel, ar.status,
      ar.otp_expires_at, ar.otp_attempts, ar.created_at, c.name AS consumer_name
      FROM authorization_requests ar JOIN consumers c ON c.id=ar.consumer_id ORDER BY ar.created_at DESC LIMIT 50`);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/authorizations/:id/verify', async (req, res) => {
  try {
    const auth = (await pool.query(`SELECT ar.*, c.phone_number FROM authorization_requests ar
      JOIN consumers c ON c.id=ar.consumer_id WHERE ar.id=$1`, [req.params.id])).rows[0];
    if (!auth) return res.status(404).json({ error: 'Authorization request not found' });
    const otp = String(req.body.otp || '').trim();
    // The main service owns OTP verification and payment execution.
    const crypto = require('crypto');
    const pepper = process.env.OTP_PEPPER || 'debit-now-dev-pepper';
    const hash = crypto.createHash('sha256').update(`${otp}:${pepper}`).digest('hex');
    if (auth.otp_hash !== hash) {
      await pool.query('UPDATE authorization_requests SET otp_attempts=otp_attempts+1, updated_at=NOW() WHERE id=$1', [auth.id]);
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    if (new Date(auth.otp_expires_at) <= new Date()) return res.status(410).json({ error: 'OTP expired' });
    const claim = await pool.query(`UPDATE authorization_requests SET status='payment_succeeded', approved_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND status IN ('otp_sent','authorization_pending') RETURNING *`, [auth.id]);
    if (!claim.rows[0]) return res.status(409).json({ error: 'Request already processed' });
    const instruction = (await pool.query('SELECT * FROM debit_instructions WHERE id=$1', [auth.instruction_id])).rows[0];
    const consumer = (await pool.query('SELECT * FROM consumers WHERE id=$1', [auth.consumer_id])).rows[0];
    const transactionId = `txn_dashboard_sandbox_${Date.now()}`;
    await pool.query("UPDATE debit_instructions SET instruction_status='executed', executed_at=NOW(), executed_by_system='dashboard-agent' WHERE id=$1", [instruction.id]);
    await pool.query(`INSERT INTO debit_logs(consumer_id,instruction_id,amount,status,ai_decision,reason)
      VALUES($1,$2,$3,'success','CLIENT_OTP_APPROVED',$4)`, [consumer.id, instruction.id, instruction.amount, instruction.reason]);
    res.json({ status: 'succeeded', transaction_id: transactionId, amount: instruction.amount });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) initDatabase().then(() => app.listen(port, () => console.log(`Control dashboard: http://localhost:${port}`)));
module.exports = app;
