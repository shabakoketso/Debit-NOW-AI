// DEBIT NOW AI - MVP
// Combines: Stitch Sandbox + Meta WhatsApp + AI Decision Logic + Daily Cron

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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS debit_logs (
        id SERIAL PRIMARY KEY,
        consumer_id INTEGER REFERENCES consumers(id),
        amount NUMERIC,
        status TEXT,
        ai_decision TEXT,
        reason TEXT,
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
// 3. AI DECISION ENGINE
// ============================================
function shouldDebit(consumer, amount) {
  // Fake AI logic for MVP
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

      await sendWhatsApp(from, `✅ Onboarded ${name} for ${client}. Max debit R${max_debit}. I will monitor daily and debit when conditions are optimal.`);
    }

    // COMMAND 2: DEBIT 1 500
    if (text.startsWith('DEBIT')) {
      const [, id, amount] = text.split(' ');
      if (!id || !amount) {
        await sendWhatsApp(from, '❌ Format: DEBIT consumer_id amount\nExample: DEBIT 1 500');
        return res.sendStatus(200);
      }

      const result = await pool.query('SELECT * FROM consumers WHERE id = $1', [parseInt(id)]);
      const consumer = result.rows[0];

      if (!consumer) {
        await sendWhatsApp(from, `❌ Consumer ID ${id} not found`);
        return res.sendStatus(200);
      }

      const ai = shouldDebit(consumer, parseFloat(amount));
      const numAmount = parseFloat(amount);

      if (!ai.decision) {
        await pool.query(
          'INSERT INTO debit_logs(consumer_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5)',
          [consumer.id, numAmount, 'skipped', 'AI_REJECTED', ai.reason]
        );
        await sendWhatsApp(from, `⏭️ Debit skipped for ${consumer.name}. Reason: ${ai.reason}`);
        return res.sendStatus(200);
      }

      // Execute debit
      const stitch = await debitViaStitch(consumer, numAmount);

      if (stitch.success) {
        await pool.query(
          'INSERT INTO debit_logs(consumer_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5)',
          [consumer.id, numAmount, 'success', 'AI_APPROVED', ai.reason]
        );
        await pool.query('UPDATE consumers SET last_debit_attempt = NOW() WHERE id = $1', [consumer.id]);

        await sendWhatsApp(from, `✅ DEBIT SUCCESS\nAmount: R${numAmount}\nFrom: ${consumer.name}\nClient: ${consumer.client_name}\nReason: ${ai.reason}\nTxn: ${stitch.transaction_id}`);
      } else {
        await pool.query(
          'INSERT INTO debit_logs(consumer_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5)',
          [consumer.id, numAmount, 'failed', 'STITCH_ERROR', stitch.error]
        );
        await sendWhatsApp(from, `❌ Debit failed: ${stitch.error}`);
      }
    }

    // COMMAND 3: LIST
    if (text === 'LIST') {
      const result = await pool.query('SELECT * FROM consumers WHERE status = \'active\'');
      const list = result.rows
        .map((c) => `${c.id}. ${c.name} (${c.client_name}) - R${c.max_debit}/mo`)
        .join('\n');
      await sendWhatsApp(from, `📋 Active Consumers:\n${list || 'None'}`);
    }

    // COMMAND 4: STATUS
    if (text.startsWith('STATUS')) {
      const result = await pool.query('SELECT * FROM debit_logs ORDER BY created_at DESC LIMIT 5');
      const status = result.rows
        .map((log) => `ID ${log.consumer_id}: R${log.amount} - ${log.status}`)
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

// Dashboard
app.get('/', async (req, res) => {
  try {
    const consumers = await pool.query('SELECT COUNT(*) as total FROM consumers WHERE status = \'active\'');
    const logs = await pool.query('SELECT COUNT(*) as total FROM debit_logs');
    const success = await pool.query('SELECT COUNT(*) as total FROM debit_logs WHERE status = \'success\'');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Debit Now AI - Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
          h1 { color: #333; }
          .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
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
          <h1>🚀 Debit Now AI - Dashboard</h1>
          <p>AI-powered collections agent with Stitch + WhatsApp integration</p>
          
          <div class="stats">
            <div class="stat">
              <h3>${consumers.rows[0].total}</h3>
              <p>Active Consumers</p>
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
            <h2>📱 WhatsApp Commands</h2>
            <div class="command"><code>ONBOARD Name|Client|MaxAmount</code> - Register a new consumer</div>
            <div class="command"><code>DEBIT id amount</code> - Trigger AI debit decision</div>
            <div class="command"><code>LIST</code> - Show all active consumers</div>
            <div class="command"><code>STATUS</code> - Show last 5 debit attempts</div>
          </div>

          <div class="commands">
            <h2>🔗 API Endpoints</h2>
            <div class="command"><code>GET /api/consumers</code> - List all consumers</div>
            <div class="command"><code>GET /api/logs</code> - List debit logs</div>
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
// 9. DAILY AI CRON - Auto-check all consumers
// ============================================
cron.schedule('0 8 * * *', async () => {
  logger.info('Starting daily AI debit check');

  try {
    const result = await pool.query(
      'SELECT * FROM consumers WHERE status = \'active\' AND (last_debit_attempt IS NULL OR last_debit_attempt < NOW() - INTERVAL \'1 day\')'
    );

    for (const consumer of result.rows) {
      const ai = shouldDebit(consumer, consumer.max_debit * 0.5); // Try 50% of max

      if (ai.decision) {
        const stitch = await debitViaStitch(consumer, consumer.max_debit * 0.5);

        if (stitch.success) {
          await pool.query(
            'INSERT INTO debit_logs(consumer_id, amount, status, ai_decision, reason) VALUES($1,$2,$3,$4,$5)',
            [consumer.id, consumer.max_debit * 0.5, 'success', 'CRON_APPROVED', ai.reason]
          );
          await pool.query('UPDATE consumers SET last_debit_attempt = NOW() WHERE id = $1', [consumer.id]);

          if (consumer.phone_number) {
            await sendWhatsApp(
              consumer.phone_number,
              `✅ AI Auto-Debit Successful\nAmount: R${(consumer.max_debit * 0.5).toFixed(2)}\nReason: ${ai.reason}`
            );
          }
          logger.info(`Auto-debit successful for consumer ${consumer.id}`);
        }
      }
    }
  } catch (err) {
    logger.error('Daily AI cron error', err);
  }
});

// ============================================
// 10. SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Debit Now AI running on port ${PORT}`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}`);
  logger.info(`🔗 Webhook: http://localhost:${PORT}/webhook`);
});

module.exports = app;
