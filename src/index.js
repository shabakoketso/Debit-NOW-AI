// DEBIT NOW AI - MVP
// Combines: Stitch Sandbox + Meta WhatsApp + USSD + OTP + SMS Notifications + Arrears Detection

const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
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
        arrears_amount NUMERIC DEFAULT 0,
        is_in_arrears BOOLEAN DEFAULT FALSE,
        arrears_days INTEGER DEFAULT 0,
        call_attempts INTEGER DEFAULT 0,
        last_contact_attempt TIMESTAMP,
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_notifications (
        id SERIAL PRIMARY KEY,
        consumer_id INTEGER REFERENCES consumers(id),
        message TEXT NOT NULL,
        notification_type TEXT,
        status TEXT DEFAULT 'pending',
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        consumer_id INTEGER REFERENCES consumers(id),
        call_status TEXT,
        call_duration INTEGER,
        notes TEXT,
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
const SMS_API_KEY = process.env.SMS_API_KEY || 'test_key';
const SMS_GATEWAY = process.env.SMS_GATEWAY || 'clickatell'; // clickatell, twilio, etc

const KWHILCH_PHONE = '0680467440';
const KWHILCH_EMAIL = 'kwhilchgroup@gmail.com';

// ============================================
// 3. ARREARS DETECTION LOGIC
// ============================================
function calculateArrearsStatus(consumer) {
  // Simulates checking if consumer has arrears
  // In production: Connect to your accounting/ERP system
  
  const isInArrears = Math.random() > 0.7; // 30% chance
  const arrearsAmount = isInArrears ? Math.floor(Math.random() * 5000) + 500 : 0;
  const arrearsdays = isInArrears ? Math.floor(Math.random() * 120) + 1 : 0;

  return {
    isInArrears,
    arrearsAmount,
    arrearsdays,
    reason: isInArrears 
      ? `Account in arrears for ${arrearsdays} days. Amount due: R${arrearsAmount}` 
      : 'Account in good standing'
  };
}

// ============================================
// 4. INSTRUCTION VALIDATION
// ============================================
function validateDebitInstruction(consumer, amount, instruction) {
  const checks = {
    instructionExists: !!instruction,
    instructionPending: instruction?.instruction_status === 'pending',
    amountMatches: instruction?.amount === amount,
    amountWithinLimit: amount <= consumer.max_debit,
    isPositiveAmount: amount > 0,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const decision = passed >= 4;

  return {
    decision,
    reason: `Operator instruction validation: ${Object.values(checks).filter(Boolean).length}/5 checks passed`,
    checks,
  };
}

// ============================================
// 5. AI DECISION ENGINE
// ============================================
function shouldDebit(consumer, amount) {
  const today = new Date().getDay();
  const hour = new Date().getHours();
  const fakeBalance = Math.random() * 3000;

  const checks = {
    hasBalance: fakeBalance > amount * 1.5,
    isPeakTime: hour >= 17 && hour <= 20,
    isWeekday: today >= 1 && today <= 5,
    isAboveMin: amount >= 100,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const decision = passed >= 2;

  return {
    decision,
    reason: `Balance R${fakeBalance.toFixed(2)}, Checks passed: ${passed}/4`,
    checks,
    simulatedBalance: fakeBalance,
  };
}

// ============================================
// 6. SMS/NOTIFICATION FUNCTIONS
// ============================================
async function sendSMS(phone_number, message) {
  try {
    logger.info(`[SMS] Sending to ${phone_number}: ${message}`);
    
    // Real SMS gateway call (uncomment when live)
    /*
    if (SMS_GATEWAY === 'clickatell') {
      await axios.post(`https://api.clickatell.com/rest/message`, {
        apiKey: SMS_API_KEY,
        to: phone_number,
        content: message
      });
    } else if (SMS_GATEWAY === 'twilio') {
      await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        From: TWILIO_PHONE_NUMBER,
        To: phone_number,
        Body: message
      }, {
        auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN }
      });
    }
    */

    // MVP: Log SMS
    await pool.query(
      'INSERT INTO sms_notifications(consumer_id, message, notification_type, status, sent_at) VALUES($1,$2,$3,$4, NOW())',
      [null, message, 'ARREARS_NOTIFICATION', 'sent']
    );

    logger.info(`SMS sent successfully to ${phone_number}`);
    return { success: true };
  } catch (err) {
    logger.error(`SMS send failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

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

async function sendUSSD(phone_number, message) {
  try {
    logger.info(`[USSD] Sending to ${phone_number}: ${message}`);
    
    // Real USSD gateway call (uncomment when live)
    /*
    if (SMS_GATEWAY === 'clickatell') {
      await axios.post(`https://api.clickatell.com/rest/ussd`, {
        apiKey: SMS_API_KEY,
        to: phone_number,
        content: message
      });
    }
    */

    logger.info(`USSD sent successfully to ${phone_number}`);
    return { success: true };
  } catch (err) {
    logger.error(`USSD send failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ============================================
// 7. STITCH INTEGRATION
// ============================================
async function debitViaStitch(consumer, amount) {
  logger.info(`[SANDBOX] Debit R${amount} from consumer ${consumer.id}`);
  return {
    success: true,
    transaction_id: `txn_sandbox_${Date.now()}`,
  };
}

// ============================================
// 8. ROUTES - WEBHOOK VERIFICATION
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
// 9. ROUTES - WHATSAPP INCOMING MESSAGES
// ============================================
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
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

      const instructionResult = await pool.query(
        'INSERT INTO debit_instructions(consumer_id, amount, reason, operator_id, instruction_status) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [consumer.id, numAmount, reason, operator.id, 'pending']
      );
      const instruction = instructionResult.rows[0];

      await sendWhatsApp(from, `📋 Debit instruction created\nID: ${instruction.id}\nConsumer: ${consumer.name}\nAmount: R${numAmount}\nReason: ${reason}\n\nWill execute when conditions are optimal.`);
      logger.info(`Instruction ${instruction.id} created by operator ${operator.id}`);
    }

    // COMMAND 3: EXECUTE instruction_id
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

      const validation = validateDebitInstruction(consumer, instruction.amount, instruction);
      if (!validation.decision) {
        await sendWhatsApp(from, `❌ Instruction validation failed: ${validation.reason}`);
        return res.sendStatus(200);
      }

      const ai = shouldDebit(consumer, instruction.amount);
      if (!ai.decision) {
        await sendWhatsApp(from, `⏭️ AI conditions not optimal for ${consumer.name}. Reason: ${ai.reason}`);
        return res.sendStatus(200);
      }

      const stitch = await debitViaStitch(consumer, instruction.amount);

      if (stitch.success) {
        await pool.query(
          'UPDATE debit_instructions SET instruction_status = $1, executed_at = NOW(), executed_by_system = $2 WHERE id = $3',
          ['executed', operator.id, instruction.id]
        );

        await pool.query(
          'INSERT INTO debit_logs(consumer_id, instruction_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5,$6)',
          [consumer.id, instruction.id, instruction.amount, 'success', 'OPERATOR_INSTRUCTION', instruction.reason]
        );

        await pool.query('UPDATE consumers SET last_debit_attempt = NOW() WHERE id = $1', [consumer.id]);

        await sendWhatsApp(from, `✅ DEBIT EXECUTED\nAmount: R${instruction.amount}\nFrom: ${consumer.name}\nClient: ${consumer.client_name}\nReason: ${instruction.reason}\nTxn: ${stitch.transaction_id}`);
        logger.info(`Instruction ${instruction.id} executed successfully by operator ${operator.id}`);
      } else {
        await sendWhatsApp(from, `❌ Debit execution failed: ${stitch.error}`);
      }
    }

    // COMMAND 4: LIST
    if (text === 'LIST') {
      const result = await pool.query('SELECT * FROM consumers WHERE status = $1 ORDER BY id DESC', ['active']);
      const list = result.rows
        .map((c) => `${c.id}. ${c.name} (${c.client_name}) - R${c.max_debit}/mo - ${c.is_in_arrears ? '⚠️ ARREARS' : '✅ OK'}`)
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

    // COMMAND 6: ARREARS
    if (text === 'ARREARS') {
      const result = await pool.query(
        'SELECT * FROM consumers WHERE is_in_arrears = $1 ORDER BY arrears_days DESC',
        [true]
      );
      const arrears = result.rows
        .map((c) => `${c.id}. ${c.name} - R${c.arrears_amount} (${c.arrears_days} days)`)
        .join('\n');
      await sendWhatsApp(from, `⚠️ Accounts in Arrears:\n${arrears || 'None'}`);
    }

    // COMMAND 7: STATUS
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
// 10. ROUTES - REST API
// ============================================

app.get('/api/consumers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM consumers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching consumers', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/consumers/arrears', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM consumers WHERE is_in_arrears = $1 ORDER BY arrears_days DESC',
      [true]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching arrears consumers', err);
    res.status(500).json({ error: err.message });
  }
});

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

app.get('/api/logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching logs', err);
    res.status(500).json({ error: err.message });
  }
});

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
    const arrears = await pool.query('SELECT COUNT(*) as total FROM consumers WHERE is_in_arrears = $1', [true]);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DebitNow AI System - Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
          h1 { color: #333; }
          .header { border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-bottom: 20px; }
          .contact { font-size: 0.9em; color: #666; }
          .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; margin: 20px 0; }
          .stat { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .stat.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
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
          <div class="header">
            <h1>🚀 DebitNow AI System - Dashboard</h1>
            <p>Operator-instruction driven collections agent with Stitch + WhatsApp + USSD/OTP + SMS</p>
            <div class="contact">
              <strong>📞 KWHILCH GROUP PTY LTD</strong><br>
              Phone: 0680467440 | Email: kwhilchgroup@gmail.com
            </div>
          </div>
          
          <div class="stats">
            <div class="stat">
              <h3>${consumers.rows[0].total}</h3>
              <p>Active Consumers</p>
            </div>
            <div class="stat warning">
              <h3>${arrears.rows[0].total}</h3>
              <p>⚠️ In Arrears</p>
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
            <div class="command"><code>LIST</code> - Show all active consumers (with arrears status)</div>
            <div class="command"><code>ARREARS</code> - Show all accounts in arrears</div>
            <div class="command"><code>PENDING</code> - Show pending instructions</div>
            <div class="command"><code>STATUS</code> - Show last 5 debit attempts</div>
          </div>

          <div class="commands">
            <h2>🔗 API Endpoints</h2>
            <div class="command"><code>GET /api/consumers</code> - List all consumers</div>
            <div class="command"><code>GET /api/consumers/arrears</code> - List consumers in arrears</div>
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
// 11. DAILY CRON - Detect arrears & send SMS notifications
// ============================================
cron.schedule('0 7 * * *', async () => {
  logger.info('Starting daily arrears detection and SMS notification job');

  try {
    const result = await pool.query('SELECT * FROM consumers WHERE status = $1', ['active']);

    for (const consumer of result.rows) {
      // Check arrears status
      const arrearsStatus = calculateArrearsStatus(consumer);

      if (arrearsStatus.isInArrears) {
        // Update consumer with arrears info
        await pool.query(
          `UPDATE consumers SET is_in_arrears = $1, arrears_amount = $2, arrears_days = $3, updated_at = NOW() 
           WHERE id = $4`,
          [true, arrearsStatus.arrearsAmount, arrearsStatus.arrearsdays, consumer.id]
        );

        // Send SMS notification to consumer who is not answering calls
        const smsMessage = `⚠️ ARREARS NOTICE\n\nDear ${consumer.name}, your account is in arrears for R${arrearsStatus.arrearsAmount}.\n\nPlease contact KWHILCH GROUP PTY LTD immediately:\n📞 ${KWHILCH_PHONE}\n📧 ${KWHILCH_EMAIL}\n\nAction required to avoid legal proceedings.`;

        const smsSent = await sendSMS(consumer.phone_number, smsMessage);

        if (smsSent.success) {
          await pool.query(
            'INSERT INTO sms_notifications(consumer_id, message, notification_type, status, sent_at) VALUES($1,$2,$3,$4, NOW())',
            [consumer.id, smsMessage, 'ARREARS_ALERT', 'sent']
          );
          logger.info(`Arrears SMS sent to consumer ${consumer.id}`);
        }

        // Also send USSD notification as backup
        const ussdMessage = `*134*ARREARS*${consumer.id}*${arrearsStatus.arrearsAmount}#`;
        await sendUSSD(consumer.phone_number, ussdMessage);

        logger.info(`Arrears detected for consumer ${consumer.id}: R${arrearsStatus.arrearsAmount} (${arrearsStatus.arrearsdays} days)`);
      } else {
        // Update to not in arrears
        await pool.query(
          'UPDATE consumers SET is_in_arrears = $1, arrears_amount = $2, arrears_days = $3, updated_at = NOW() WHERE id = $4',
          [false, 0, 0, consumer.id]
        );
      }
    }
  } catch (err) {
    logger.error('Daily arrears detection error', err);
  }
});

// ============================================
// 12. SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 DebitNow AI System running on port ${PORT}`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  logger.info(`📞 Support: ${KWHILCH_PHONE} | ${KWHILCH_EMAIL}`);
});

module.exports = app;
