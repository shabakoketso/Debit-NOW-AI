# 🚀 DebitNow AI System

**AI-powered collections agent** that monitors overdue accounts, decides optimal debit timing, and executes instant collections via Stitch + WhatsApp with USSD/OTP support.

## 👤 Creator & Support

**Isaac Koketso Shaba**  
Founder & CEO  
**KWHILCH GROUP PTY LTD**

📞 **Phone:** 0680467440  
📧 **Email:** kwhilchgroup@gmail.com

---

## What It Does

1. **AI Orchestrator** → Operator instructs system who to debit, when, how much, and via which channel
2. **Collections Logic** → Applies your 9-year collections rules (Promise to Pay, DTI, risk scoring)
3. **Debit Engine** → Calls Stitch API to move money in real-time
4. **Multi-Channel Comms** → Sends WhatsApp, USSD, OTP notifications with approval links
5. **Instruction-Based Execution** → System debits ONLY when operator provides explicit instruction

## Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL (Replit has free Postgres)
- Stitch Sandbox account: https://dashboard.stitch.money
- Meta WhatsApp Cloud API account: https://developers.facebook.com/apps
- USSD Gateway account (optional: Clickatell, Twilio)
- OTP Service (optional: AWS SNS, Firebase)

### Setup (3 minutes)

1. **Clone & Install**
   ```bash
   git clone https://github.com/shabakoketso/Debit-NOW-AI.git
   cd Debit-NOW-AI
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Fill in your keys in .env
   ```

3. **Start Server**
   ```bash
   npm start
   ```

4. **View Dashboard**
   - const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// TABLES
pool.query(`CREATE TABLE IF NOT EXISTS consumers (id SERIAL PRIMARY KEY, name TEXT, client_name TEXT, max_debit NUMERIC, total_collected NUMERIC DEFAULT 0, debits_count INT DEFAULT 0);`);
pool.query(`CREATE TABLE IF NOT EXISTS audit_log (id SERIAL PRIMARY KEY, consumer_id INT, date TIMESTAMP DEFAULT NOW(), amount NUMERIC, status TEXT, ai_reason TEXT);`);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// AI LOGIC
function shouldDebit(consumer, amount) {
  const day = new Date().getDate();
  const fakeBalance = day > 25? Math.random() * 5000 + 2000 : Math.random() * 800;
  return fakeBalance > amount * 1.5
  ? { decision: true, reason: `Payday. Balance R${fakeBalance.toFixed(2)}` }
   : { decision: false, reason: `Low balance R${fakeBalance.toFixed(2)}` };
}

async function sendWhatsApp(to, message) {
  if(!WHATSAPP_TOKEN) return console.log("WhatsApp:", message);
  await axios.post(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
    { messaging_product: "whatsapp", to: to, text: { body: message } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// WHATSAPP WEBHOOKS - SAME AS BEFORE
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return res.sendStatus(200);
  const from = msg.from; const text = msg.text.body.toUpperCase();

  if (text.startsWith("ONBOARD")) {
    const [name, client, max] = text.split(" ")[1].split("|");
    await pool.query("INSERT INTO consumers(name, client_name, max_debit) VALUES($1,$2,$3)", [name, client, max]);
    await sendWhatsApp(from, `✅ Onboarded ${name}. Max R${max}`);
  }
  if (text.startsWith("DEBIT")) {
    const [, id, amount] = text.split(" ");
    const c = (await pool.query("SELECT * FROM consumers WHERE id = $1", [id])).rows[0];
    if (!c) return sendWhatsApp(from, "❌ Not found");
    const ai = shouldDebit(c, amount);
    await pool.query("INSERT INTO audit_log(consumer_id, amount, status, ai_reason) VALUES($1,$2,$3,$4)", [id, ai.decision? amount : 0, ai.decision? 'SUCCESS' : 'SKIPPED', ai.reason]);
    if (ai.decision) {
      await pool.query("UPDATE consumers SET total_collected=total_collected+$1, debits_count=debits_count+1 WHERE id=$2", [amount, id]);
    }
    await sendWhatsApp(from, `${ai.decision? '✅' : '⏭️'} ${c.name}: ${ai.reason}`);
  }
  res.sendStatus(200);
});

// SIMULATION
app.post("/simulate", async (req, res) => {
  const consumers = await pool.query("SELECT * FROM consumers");
  for(let day=1; day<=30; day++){
    for(const c of consumers.rows) {
      const ai = shouldDebit(c, c.max_debit);
      await pool.query("INSERT INTO audit_log(consumer_id, amount, status, ai_reason) VALUES($1,$2,$3,$4)", [c.id, ai.decision? c.max_debit : 0, ai.decision? 'SUCCESS' : 'SKIPPED', `Day ${day}: ${ai.reason}`]);
      if(ai.decision) await pool.query("UPDATE consumers SET total_collected=total_collected+$1, debits_count=debits_count+1 WHERE id=$2", [c.max_debit, c.id]);
    }
  }
  res.json({message: "30 day simulation done"});
});

// NEW: MOBILE DASHBOARD
app.get("/dashboard", async (req, res) => {
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_consumers,
      SUM(total_collected) as total_revenue,
      SUM(debits_count) as total_debits
    FROM consumers
  `);
  const logs = await pool.query("SELECT a.*, c.name FROM audit_log a JOIN consumers c ON a.consumer_id = c.id ORDER BY date DESC LIMIT 50");
  const s = stats.rows[0];

  const successRate = s.total_debits > 0? ((await pool.query("SELECT COUNT(*) FROM audit_log WHERE status='SUCCESS'")).rows[0].count / s.total_debits * 100).toFixed(1) : 0;

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Debit NOW AI Dashboard</title>
    <style>
      body { font-family: Arial; padding: 15px; background: #0f172a; color: white; }
     .card { background: #1e293b; padding: 15px; border-radius: 12px; margin-bottom: 12px; }
     .stat { font-size: 24px; font-weight: bold; color: #38bdf8; }
      table { width: 100%; font-size: 12px; border-collapse: collapse; }
      td, th { padding: 8px; text-align: left; border-bottom: 1px solid #334155; }
     .success { color: #4ade80; }.skipped { color: #f87171; }
      button { background: #38bdf8; color: black; border: none; padding: 10px; border-radius: 8px; width: 100%; margin-top: 10px; font-weight: bold; }
    </style>
  </head>
  <body>
    <h2>📊 Debit NOW AI Dashboard</h2>

    <div class="card">
      <div>Total Revenue</div>
      <div class="stat">R${Number(s.total_revenue || 0).toFixed(2)}</div>
    </div>

    <div class="card">
      <div>Total Consumers</div>
      <div class="stat">${s.total_consumers}</div>
    </div>

    <div class="card">
      <div>AI Success Rate</div>
      <div class="stat">${successRate}%</div>
    </div>

    <div class="card">
      <h3>Last 50 AI Decisions</h3>
      <table>
        <tr><th>Consumer</th><th>Status</th><th>Amount</th><th>Reason</th></tr>
        ${logs.rows.map(l => `
          <tr>
            <td>${l.name}</td>
            <td class="${l.status.toLowerCase()}">${l.status}</td>
            <td>R${l.amount}</td>
            <td>${l.ai_reason}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <form action="/simulate" method="post">
      <button type="submit">▶️ Run 30 Day Simulation</button>
    </form>
  </body>
  </html>
  `);
});

app.get("/", (req, res) => res.send(`<a href="/dashboard">Open Dashboard</a>`));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard Live on ${PORT}`));

## WhatsApp Commands (Operators Only)

### Onboard a Consumer
```
ONBOARD Thabo|LenderCo|800
```
Registers "Thabo" working for "LenderCo" with R800 max debit limit.

### Create Debit Instruction
```
INSTRUCTION 1 500 Payment collection
```
Creates a pending instruction for consumer #1, R500, with reason "Payment collection".

### Execute Pending Instruction
```
EXECUTE 5
```
Executes instruction #5 (system validates, applies AI checks, then debits).

### List All Active Consumers
```
LIST
```
Shows all active consumers with their max debit limits.

### View Pending Instructions
```
PENDING
```
Displays all pending instructions waiting for execution.

### Check Recent Debit Status
```
STATUS
```
Shows last 5 debit attempts (success/skipped/failed).

## API Endpoints

### Get All Consumers
```bash
GET /api/consumers
```
Returns list of all registered consumers.

### Get Pending Instructions
```bash
GET /api/instructions/pending
```
Returns all pending debit instructions.

### Get Debit Logs
```bash
GET /api/logs
```
Returns last 100 debit attempts with status & AI reasoning.

### Register Operator
```bash
POST /api/operators/register
Body: { "name": "John Doe", "phone_number": "27810123456" }
```
Registers a new authorized operator to use the system.

### WhatsApp Webhook
```bash
POST /webhook
```
Handles incoming WhatsApp messages (auto-configured by Meta).

## Communication Channels

### 📱 WhatsApp Integration
- Operator commands & system responses
- Consumer notifications & approval links
- Transaction receipts & confirmations

### 📞 USSD (Unstructured Supplementary Service Data)
- Consumer push notifications for payment requests
- Works on all phone networks (no data required)
- Can trigger payment approval flow
- Fallback when WhatsApp unavailable

**USSD Format:**
```
USSD: *134*DEBIT_NOW*[CONSUMER_ID]*[AMOUNT]#
Response: "Debit R[AMOUNT] approved? Reply 1 for YES, 0 for NO"
```

### 🔐 OTP (One-Time Password)
- Additional security layer for high-value debits (>R5000)
- SMS-based verification code
- Consumer confirms transaction before debit executes
- Audit trail of OTP sent/verified

**OTP Flow:**
```
System sends: "Your DebitNow debit code is: 423891. Valid for 5 minutes."
Consumer replies: "OTP 423891"
System verifies and executes debit
```

## How AI Decision Works

The system checks multiple factors before debiting:

1. **Instruction Validation** → Operator instruction exists and is pending
2. **Balance Check** → Simulated bank balance > 1.5x debit amount
3. **Peak Time** → Between 5pm-8pm (higher collection rates)
4. **Weekday** → Monday-Friday (better for processing)
5. **Amount Check** → Within consumer's max debit limit

**Decision:** Debit if 4+ checks pass for instruction validation + 2+ AI checks.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Operator Commands (WhatsApp / REST API)    │
└─────────────────────┬───────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │ Instruction Validator      │
        │ - Operator auth check      │
        │ - Instruction exists       │
        │ - Amount within limit      │
        └─────────────┬──────────────┘
                      │
        ┌─────────────┴──────────────┐
        │ AI Decision Engine         │
        │ - Balance check            │
        │ - Time/Day check           │
        │ - Risk scoring             │
        └─────────────┬──────────────┘
                      │
        ┌─────────────┴──────────────┐
        │ Debit Executor             │
        │ - Stitch API call          │
        │ - Transaction log          │
        └─────────────┬──────────────┘
                      │
        ┌─────────────┴──────────────┐
        │ Multi-Channel Comms        │
        │ - WhatsApp notify          │
        │ - USSD push notification   │
        │ - OTP verification         │
        │ - Receipt / status         │
        └─────────────┬──────────────┘
                      │
        ┌─────────────┴──────────────┐
        │    PostgreSQL DB           │
        │  - Consumers table         │
        │  - Instructions table      │
        │  - Debit logs table        │
        │  - Operators table         │
        └────────────────────────────┘
```

## Database Schema

### Consumers Table
```sql
id (PK) | name | client_name | phone_number | account_id | max_debit | status | last_debit_attempt | created_at | updated_at
```

### Debit Instructions Table
```sql
id (PK) | consumer_id (FK) | amount | reason | instruction_status | operator_id | created_at | executed_at | executed_by_system
```

### Debit Logs Table
```sql
id (PK) | consumer_id (FK) | instruction_id (FK) | amount | status | ai_decision | reason | created_at
```

### Operators Table
```sql
id (PK) | name | phone_number (UNIQUE) | status | created_at
```

## Configuration

### Stitch API
```env
STITCH_CLIENT_ID=sk_test_your_key
STITCH_BASE_URL=https://api.stitch.money/v2
```

### Meta WhatsApp
```env
WHATSAPP_TOKEN=your_access_token
WHATSAPP_PHONE_ID=your_phone_id
VERIFY_TOKEN=your_verify_token
```

### USSD Gateway (Optional)
```env
USSD_GATEWAY=clickatell|twilio|custom
USSD_API_KEY=your_ussd_gateway_key
USSD_SHORTCODE=*134
```

### OTP Service (Optional)
```env
OTP_SERVICE=aws_sns|firebase|twilio
OTP_API_KEY=your_otp_service_key
OTP_VALID_MINUTES=5
```

### Database
```env
DATABASE_URL=postgresql://user:password@localhost:5432/debit_now_ai
```

## Production Checklist

- [ ] Switch from `sk_test_` to `sk_live_` Stitch keys after NCR approval
- [ ] Set up real consumer consent/digital mandates
- [ ] Configure WhatsApp approval flow with 1-tap bank links
- [ ] Integrate USSD gateway (Clickatell or Twilio)
- [ ] Set up OTP service (AWS SNS or Firebase)
- [ ] Add real balance check API (bank query, not simulation)
- [ ] Implement your 9-year collections rules in AI decision logic
- [ ] Set up monitoring/alerting for failed debits
- [ ] Add NCA compliance logging
- [ ] Enable database backups
- [ ] Test with 10% of your consumer base first

## Next Steps

### Phase 1 (Week 1)
- [ ] Set up sandbox testing
- [ ] Test WhatsApp operator commands
- [ ] Test USSD/OTP flow in sandbox
- [ ] Verify Stitch debit flow

### Phase 2 (Week 2)
- [ ] Integrate your collections rules (DTI, Promise to Pay, risk scoring)
- [ ] Connect to real consumer data
- [ ] Set up real USSD gateway
- [ ] Set up real OTP service
- [ ] Set up NCA logging

### Phase 3 (Week 3)
- [ ] NCR approval + `sk_live_` keys
- [ ] Go live with 100 test consumers
- [ ] Monitor and optimize USSD/OTP delivery rates

### Phase 4 (Week 4+)
- [ ] Scale to full 1000+ consumer base
- [ ] Add advanced AI (OpenAI/Claude) for dynamic messaging
- [ ] Implement A/B testing on debit times & channels
- [ ] Analyze USSD vs WhatsApp vs OTP conversion rates

## Support & Contact

**For issues, questions, or implementation support:**

📞 **KWHILCH GROUP PTY LTD**  
Phone: **0680467440**  
Email: **kwhilchgroup@gmail.com**

**Documentation:**
- **Stitch Docs**: https://stitch.money/docs
- **WhatsApp API**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **GitHub Issues**: https://github.com/shabakoketso/Debit-NOW-AI/issues

## License

MIT

---

**Built by Isaac Koketso Shaba @ KWHILCH GROUP PTY LTD**  
📧 kwhilchgroup@gmail.com | 📞 0680467440
- **Create Dashboard for Debit NOW AI System that has the Functionality to show accounts, contact information, Products,Partnerships, Newsletter, Company Information and others**
