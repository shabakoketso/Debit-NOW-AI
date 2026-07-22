// DEBIT NOW AI - MVP
// Combines: Stitch Sandbox + Meta WhatsApp + AI Decision Logic + Operator Instructions

const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================
// 1. DATABASE SETUP
// ============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => logger.error('Pool error', err));

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consumers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        client_name TEXT NOT NULL,
        phone_number TEXT,
        account_id TEXT,
        max_debit NUMERIC NOT NULL,
        status TEXT DEFAULT 'active',
        last_debit_attempt TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS debit_instructions (
        id SERIAL PRIMARY KEY,
        consumer_id INTEGER REFERENCES consumers(id),
        amount NUMERIC NOT NULL,
        reason TEXT,
        instruction_status TEXT DEFAULT 'pending',
        operator_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        executed_at TIMESTAMP,
        executed_by_system TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS debit_logs (
        id SERIAL PRIMARY KEY,
        consumer_id INTEGER REFERENCES consumers(id),
        instruction_id INTEGER REFERENCES debit_instructions(id),
        amount NUMERIC,
        status TEXT,
        ai_decision TEXT,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS operators (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone_number TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    logger.info('Database initialized successfully');
  } catch (err) {
    logger.error('Database initialization error', err);
  }
}

initDatabase();

// ============================================
// 2. CONFIGURATION
// ============================================
const STITCH_CLIENT_ID = process.env.STITCH_CLIENT_ID || 'sk_test_123';
const STITCH_BASE_URL = process.env.STITCH_BASE_URL || 'https://api.stitch.money/v2';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'debitnow123';

// ============================================
// 3. AI DECISION ENGINE - Validates operator instructions
// ============================================
function validateDebitInstruction(consumer, amount, instruction) {
  // Validates that an operator instruction exists and is pending execution
  
  const checks = {
    instructionExists: !!instruction,
    instructionPending: instruction?.instruction_status === 'pending',
    amountMatches: instruction?.amount === amount,
    amountWithinLimit: amount <= consumer.max_debit,
    isPositiveAmount: amount > 0,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const decision = passed >= 4; // Need 4+ checks to pass

  return {
    decision,
    reason: `Operator instruction validation: ${Object.values(checks).filter(Boolean).length}/5 checks passed`,
    checks,
  };
}

function shouldDebit(consumer, amount) {
  // Fake AI logic for MVP - balance & timing checks
  // In production: Connect to LLM (OpenAI/Claude) + your collections DB
  
  const today = new Date().getDay();
  const hour = new Date().getHours();
  const fakeBalance = Math.random() * 3000; // Simulate bank balance check

  const checks = {
    hasBalance: fakeBalance > amount * 1.5,
    isPeakTime: hour >= 17 && hour <= 20, // 5pm-8pm is better for collections
    isWeekday: today >= 1 && today <= 5,
    isAboveMin: amount >= 100,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const decision = passed >= 2; // Need 2+ checks to pass

  return {
    decision,
    reason: `Balance R${fakeBalance.toFixed(2)}, Checks passed: ${passed}/4`,
    checks,
    simulatedBalance: fakeBalance,
  };
}

// ============================================
// 4. WHATSAPP FUNCTIONS
// ============================================
async function sendWhatsApp(to, message) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    logger.warn('WhatsApp credentials not configured');
    return;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: message },
      },
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      }
    );
    logger.info(`WhatsApp sent to ${to}`);
  } catch (err) {
    logger.error(`WhatsApp send failed: ${err.message}`);
  }
}

// ============================================
// 5. STITCH INTEGRATION
// ============================================
async function debitViaStitch(consumer, amount) {
  // Real Stitch API call (uncomment when live)
  /*
  try {
    const response = await axios.post(
      `${STITCH_BASE_URL}/account_payment`,
      {
        account_id: consumer.account_id,
        amount: amount * 100, // in cents
        currency: 'ZAR',
        description: `Collection from ${consumer.name} for ${consumer.client_name}`,
      },
      {
        headers: { Authorization: `Bearer ${STITCH_CLIENT_ID}` },
      }
    );
    return { success: true, transaction_id: response.data.id };
  } catch (err) {
    logger.error(`Stitch debit failed: ${err.message}`);
    return { success: false, error: err.message };
  }
  */

  // MVP: Simulate successful debit
  logger.info(`[SANDBOX] Debit R${amount} from consumer ${consumer.id}`);
  return {
    success: true,
    transaction_id: `txn_sandbox_${Date.now()}`,
  };
}

// ============================================
// 6. ROUTES - WEBHOOK VERIFICATION
// ============================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('Invalid webhook verification attempt');
    res.sendStatus(403);
  }
});

// ============================================
// 7. ROUTES - WHATSAPP INCOMING MESSAGES
// ============================================
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from; // WhatsApp phone number
    const text = message.text?.body?.toUpperCase() || '';

    logger.info(`WhatsApp message from ${from}: ${text}`);

    // Check if operator exists
    const operatorCheck = await pool.query('SELECT * FROM operators WHERE phone_number = $1', [from]);
    if (operatorCheck.rows.length === 0) {
      await sendWhatsApp(from, '❌ You are not registered as an operator. Contact admin.');
      return res.sendStatus(200);
    }
    const operator = operatorCheck.rows[0];

    // COMMAND 1: ONBOARD Name|Client|800
    if (text.startsWith('ONBOARD')) {
      const parts = text.split(' ').slice(1).join(' ').split('|');
      const [name, client, max_debit] = parts;

      if (!name || !client || !max_debit) {
        await sendWhatsApp(from, '❌ Format: ONBOARD Name|Client|MaxDebit\nExample: ONBOARD Thabo|LenderCo|800');
        return res.sendStatus(200);
      }

      const fake_account_id = `acc_sandbox_${Math.random().toString(36).substring(7)}`;
      await pool.query(
        'INSERT INTO consumers(name, client_name, phone_number, account_id, max_debit) VALUES($1,$2,$3,$4,$5)',
        [name, client, from, fake_account_id, parseFloat(max_debit)]
      );

      await sendWhatsApp(from, `✅ Onboarded ${name} for ${client}. Max debit R${max_debit}. Consumer ready for debit instructions.`);
    }

    // COMMAND 2: INSTRUCTION consumer_id amount [reason]
    // Operator creates a debit instruction
    if (text.startsWith('INSTRUCTION')) {
      const parts = text.split(' ');
      const [, consumer_id, amount, ...reasonParts] = parts;
      const reason = reasonParts.join(' ') || 'Operator instruction';

      if (!consumer_id || !amount) {
        await sendWhatsApp(from, '❌ Format: INSTRUCTION consumer_id amount [reason]\nExample: INSTRUCTION 1 500 Payment collection');
        return res.sendStatus(200);
      }

      const result = await pool.query('SELECT * FROM consumers WHERE id = $1', [parseInt(consumer_id)]);
      const consumer = result.rows[0];

      if (!consumer) {
        await sendWhatsApp(from, `❌ Consumer ID ${consumer_id} not found`);
        return res.sendStatus(200);
      }

      const numAmount = parseFloat(amount);
      if (numAmount > consumer.max_debit) {
        await sendWhatsApp(from, `❌ Amount R${numAmount} exceeds max debit R${consumer.max_debit}`);
        return res.sendStatus(200);
      }

      // Create instruction
      const instructionResult = await pool.query(
        'INSERT INTO debit_instructions(consumer_id, amount, reason, operator_id, instruction_status) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [consumer.id, numAmount, reason, operator.id, 'pending']
      );
      const instruction = instructionResult.rows[0];

      await sendWhatsApp(from, `📋 Debit instruction created\nID: ${instruction.id}\nConsumer: ${consumer.name}\nAmount: R${numAmount}\nReason: ${reason}\n\nWill execute when conditions are optimal.`);
      logger.info(`Instruction ${instruction.id} created by operator ${operator.id}`);
    }

    // COMMAND 3: EXECUTE instruction_id
    // Operator manually triggers execution of a specific instruction
    if (text.startsWith('EXECUTE')) {
      const [, instruction_id] = text.split(' ');

      if (!instruction_id) {
        await sendWhatsApp(from, '❌ Format: EXECUTE instruction_id\nExample: EXECUTE 5');
        return res.sendStatus(200);
      }

      const instrResult = await pool.query(
        'SELECT * FROM debit_instructions WHERE id = $1 AND instruction_status = $2',
        [parseInt(instruction_id), 'pending']
      );

      if (instrResult.rows.length === 0) {
        await sendWhatsApp(from, `❌ Instruction ${instruction_id} not found or already executed`);
        return res.sendStatus(200);
      }

      const instruction = instrResult.rows[0];
      const consumerResult = await pool.query('SELECT * FROM consumers WHERE id = $1', [instruction.consumer_id]);
      const consumer = consumerResult.rows[0];

      // Validate instruction
      const validation = validateDebitInstruction(consumer, instruction.amount, instruction);

      if (!validation.decision) {
        await sendWhatsApp(from, `❌ Instruction validation failed: ${validation.reason}`);
        return res.sendStatus(200);
      }

      // Check AI conditions (balance, time, etc)
      const ai = shouldDebit(consumer, instruction.amount);

      if (!ai.decision) {
        await sendWhatsApp(from, `⏭️ AI conditions not optimal for ${consumer.name}. Reason: ${ai.reason}`);
        return res.sendStatus(200);
      }

      // Execute debit
      const stitch = await debitViaStitch(consumer, instruction.amount);

      if (stitch.success) {
        // Update instruction to executed
        await pool.query(
          'UPDATE debit_instructions SET instruction_status = $1, executed_at = NOW(), executed_by_system = $2 WHERE id = $3',
          ['executed', operator.id, instruction.id]
        );

        // Log debit
        await pool.query(
          'INSERT INTO debit_logs(consumer_id, instruction_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5,$6)',
          [consumer.id, instruction.id, instruction.amount, 'success', 'OPERATOR_INSTRUCTION', instruction.reason]
        );

        await pool.query('UPDATE consumers SET last_debit_attempt = NOW() WHERE id = $1', [consumer.id]);

        await sendWhatsApp(from, `✅ DEBIT EXECUTED\nAmount: R${instruction.amount}\nFrom: ${consumer.name}\nClient: ${consumer.client_name}\nReason: ${instruction.reason}\nTxn: ${stitch.transaction_id}`);
        logger.info(`Instruction ${instruction.id} executed successfully by operator ${operator.id}`);
      } else {
        await sendWhatsApp(from, `❌ Debit execution failed: ${stitch.error}`);
        logger.error(`Instruction ${instruction.id} execution failed: ${stitch.error}`);
      }
    }

    // COMMAND 4: LIST
    if (text === 'LIST') {
      const result = await pool.query('SELECT * FROM consumers WHERE status = $1 ORDER BY id DESC', ['active']);
      const list = result.rows
        .map((c) => `${c.id}. ${c.name} (${c.client_name}) - R${c.max_debit}/mo`)
        .join('\n');
      await sendWhatsApp(from, `📋 Active Consumers:\n${list || 'None'}`);
    }

    // COMMAND 5: PENDING
    if (text === 'PENDING') {
      const result = await pool.query(
        `SELECT di.*, c.name, c.client_name FROM debit_instructions di 
         JOIN consumers c ON di.consumer_id = c.id 
         WHERE di.instruction_status = $1 ORDER BY di.created_at DESC LIMIT 10`,
        ['pending']
      );
      const pending = result.rows
        .map((p) => `ID ${p.id}: ${p.name} - R${p.amount} (${p.reason})`)
        .join('\n');
      await sendWhatsApp(from, `⏳ Pending Instructions:\n${pending || 'None'}`);
    }

    // COMMAND 6: STATUS
    if (text.startsWith('STATUS')) {
      const result = await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 5');
      const status = result.rows
        .map((log) => `ID ${log.id}: Consumer ${log.consumer_id} - R${log.amount} - ${log.status}`)
        .join('\n');
      await sendWhatsApp(from, `📊 Last 5 Debits:\n${status || 'None'}`);
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error('Webhook processing error', err);
    res.sendStatus(500);
  }
});

// ============================================
// 8. ROUTES - REST API
// ============================================

// Get all consumers
app.get('/api/consumers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM consumers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching consumers', err);
    res.status(500).json({ error: err.message });
  }
});

// Get pending instructions
app.get('/api/instructions/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT di.*, c.name as consumer_name, c.client_name FROM debit_instructions di 
       JOIN consumers c ON di.consumer_id = c.id 
       WHERE di.instruction_status = 'pending' ORDER BY di.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching pending instructions', err);
    res.status(500).json({ error: err.message });
  }
});

// Get debit logs
app.get('/api/logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching logs', err);
    res.status(500).json({ error: err.message });
  }
});

// Register operator
app.post('/api/operators/register', async (req, res) => {
  try {
    const { name, phone_number } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone_number required' });
    }

    const result = await pool.query(
      'INSERT INTO operators(name, phone_number) VALUES($1,$2) RETURNING *',
      [name, phone_number]
    );

    res.json({ message: 'Operator registered', operator: result.rows[0] });
  } catch (err) {
    logger.error('Error registering operator', err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard
app.get('/', async (req, res) => {
  try {
    const consumers = await pool.query('SELECT COUNT(*) as total FROM consumers WHERE status = $1', ['active']);
    const logs = await pool.query('SELECT COUNT(*) as total FROM debit_logs');
    const success = await pool.query('SELECT COUNT(*) as total FROM debit_logs WHERE status = $1', ['success']);
    const pending = await pool.query('SELECT COUNT(*) as total FROM debit_instructions WHERE instruction_status = $1', ['pending']);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DebitNow AI System - Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
          h1 { color: #333; }
          .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
          .stat { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .stat h3 { margin: 0; font-size: 32px; }
          .stat p { margin: 5px 0 0 0; }
          .commands { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px; }
          .commands h2 { margin-top: 0; }
          .command { background: white; padding: 10px; margin: 10px 0; border-left: 4px solid #667eea; }
          .command code { background: #eee; padding: 2px 6px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 DebitNow AI System - Dashboard</h1>
          <p>Operator-instruction driven collections agent with Stitch + WhatsApp integration</p>
          
          <div class="stats">
            <div class="stat">
              <h3>${consumers.rows[0].total}</h3>
              <p>Active Consumers</p>
            </div>
            <div class="stat">
              <h3>${pending.rows[0].total}</h3>
              <p>Pending Instructions</p>
            </div>
            <div class="stat">
              <h3>${logs.rows[0].total}</h3>
              <p>Total Debit Attempts</p>
            </div>
            <div class="stat">
              <h3>${success.rows[0].total}</h3>
              <p>Successful Debits</p>
            </div>
          </div>

          <div class="commands">
            <h2>📱 WhatsApp Commands (Operators Only)</h2>
            <div class="command"><code>ONBOARD Name|Client|MaxAmount</code> - Register a new consumer</div>
            <div class="command"><code>INSTRUCTION consumer_id amount [reason]</code> - Create a debit instruction</div>
            <div class="command"><code>EXECUTE instruction_id</code> - Execute a pending instruction</div>
            <div class="command"><code>LIST</code> - Show all active consumers</div>
            <div class="command"><code>PENDING</code> - Show pending instructions</div>
            <div class="command"><code>STATUS</code> - Show last 5 debit attempts</div>
          </div>

          <div class="commands">
            <h2>🔗 API Endpoints</h2>
            <div class="command"><code>GET /api/consumers</code> - List all consumers</div>
            <div class="command"><code>GET /api/instructions/pending</code> - List pending instructions</div>
            <div class="command"><code>GET /api/logs</code> - List debit logs</div>
            <div class="command"><code>POST /api/operators/register</code> - Register operator</div>
            <div class="command"><code>POST /webhook</code> - WhatsApp webhook</div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    logger.error('Dashboard error', err);
    res.status(500).send('Error loading dashboard');
  }
});

// ============================================
// 9. SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 DebitNow AI System running on port ${PORT}`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔗 Webhook: http://localhost:${PORT}/webhook`);
});

module.exports = app;
