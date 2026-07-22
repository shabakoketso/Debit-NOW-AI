# 🚀 DebitNow AI System - Deployment & Quick Start Guide

**Built by Isaac Koketso Shaba @ KWHILCH GROUP PTY LTD**  
📞 0680467440 | 📧 kwhilchgroup@gmail.com

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Quick Start (5 minutes)](#quick-start-5-minutes)
3. [Full Setup](#full-setup)
4. [Testing](#testing)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## System Overview

**DebitNow AI System** is an operator-controlled collections management platform that:

- 🎯 **Detects arrears** automatically (daily at 7 AM)
- 📱 **Sends multi-channel notifications** (SMS, USSD, WhatsApp, OTP)
- 💳 **Executes debits** via Stitch API when operators provide instructions
- 👥 **Manages consumers** with max debit limits and compliance tracking
- 📊 **Provides dashboards** for operator oversight
- 🔐 **Ensures security** with operator authentication & audit trails

---

## Quick Start (5 minutes)

### Step 1: Clone Repository
```bash
git clone https://github.com/shabakoketso/Debit-NOW-AI.git
cd Debit-NOW-AI
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Create Environment File
```bash
cp .env.example .env
```

### Step 4: Configure Database (Local Testing)
For local testing, use Replit's free PostgreSQL or SQLite:

**Option A: Replit Postgres (Recommended for MVP)**
```bash
# Replit auto-fills DATABASE_URL in Secrets
# Just copy it to your .env
```

**Option B: Local PostgreSQL**
```bash
# Create local database
createdb debit_now_ai

# Update .env
DATABASE_URL=postgresql://postgres:password@localhost:5432/debit_now_ai
```

### Step 5: Start Server
```bash
npm start
```

Server runs on: `http://localhost:3000`

### Step 6: Access Dashboard
Open browser: **http://localhost:3000**

---

## Full Setup

### Prerequisites

- **Node.js** 16+ (Download: https://nodejs.org)
- **PostgreSQL** 12+ or Replit Postgres
- **Stitch Sandbox Account** (https://dashboard.stitch.money)
- **Meta WhatsApp Business Account** (https://developers.facebook.com)
- **SMS Gateway Account** (Clickatell/Twilio/AWS SNS)
- **USSD Gateway Account** (Clickatell/Twilio)

### Step 1: Database Setup

#### Using Replit (Easiest for MVP)
1. Create Replit account
2. Create new Node.js Replit
3. Database auto-available in `Secrets` tab
4. Copy `DATABASE_URL` to `.env`

#### Using Local PostgreSQL
```bash
# Install PostgreSQL
brew install postgresql  # macOS
# or apt-get install postgresql  # Linux

# Create database
psql -U postgres
CREATE DATABASE debit_now_ai;
\q

# Update .env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/debit_now_ai
```

### Step 2: Stitch Sandbox Setup

1. Go to https://dashboard.stitch.money
2. Sign up for sandbox account
3. Navigate to API Keys
4. Copy test key: `sk_test_...`
5. Add to `.env`:
   ```
   STITCH_CLIENT_ID=sk_test_your_key_here
   ```

### Step 3: Meta WhatsApp Setup

1. Go to https://developers.facebook.com/apps
2. Create new app → Business
3. Add WhatsApp product
4. Navigate to WhatsApp > Configuration
5. Get your:
   - `Access Token` → `WHATSAPP_TOKEN`
   - `Phone ID` → `WHATSAPP_PHONE_ID`
   - `Verify Token` (create any word) → `VERIFY_TOKEN`

6. Add webhook endpoint:
   - Callback URL: `https://your-domain.com/webhook`
   - Verify Token: `debitnow123`

7. Add your phone number for testing

### Step 4: SMS Gateway Setup (Optional for MVP)

**Using Clickatell (Recommended)**
1. Go to https://clickatell.com
2. Create account
3. Get API Key
4. Add to `.env`:
   ```
   SMS_GATEWAY=clickatell
   SMS_API_KEY=your_clickatell_key
   ```

**Using Twilio**
1. Go to https://twilio.com
2. Create account
3. Get credentials
4. Add to `.env`:
   ```
   SMS_GATEWAY=twilio
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

### Step 5: Start Application
```bash
npm start
```

### Step 6: Register Operator (First Time)

**Via REST API:**
```bash
curl -X POST http://localhost:3000/api/operators/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Collector",
    "phone_number": "27812345678"
  }'
```

**Expected Response:**
```json
{
  "message": "Operator registered",
  "operator": {
    "id": 1,
    "name": "John Collector",
    "phone_number": "27812345678",
    "status": "active"
  }
}
```

---

## Testing

### Test 1: Onboard Consumer (WhatsApp)

1. Send WhatsApp message from registered operator number:
   ```
   ONBOARD Thabo|LenderCo|800
   ```

2. Expect response:
   ```
   ✅ Onboarded Thabo for LenderCo. Max debit R800. Consumer ready for debit instructions.
   ```

3. Verify via API:
   ```bash
   curl http://localhost:3000/api/consumers
   ```

### Test 2: Create Debit Instruction

1. Send WhatsApp:
   ```
   INSTRUCTION 1 500 Payment collection
   ```

2. Expect:
   ```
   📋 Debit instruction created
   ID: 1
   Consumer: Thabo
   Amount: R500
   Reason: Payment collection
   ```

### Test 3: Execute Debit

1. Send WhatsApp:
   ```
   EXECUTE 1
   ```

2. Expect:
   ```
   ✅ DEBIT EXECUTED
   Amount: R500
   From: Thabo
   Client: LenderCo
   Txn: txn_sandbox_1234567890
   ```

### Test 4: View Arrears

1. Send WhatsApp:
   ```
   ARREARS
   ```

2. System detects accounts in arrears (daily 7 AM)

### Test 5: Dashboard Check

1. Open http://localhost:3000
2. View stats:
   - Active Consumers
   - ⚠️ In Arrears
   - Pending Instructions
   - Total Debits
   - Successful Debits

---

## Production Deployment

### Option 1: Replit (Recommended for MVP)

1. Create Replit
2. Connect GitHub repo
3. Set Secrets (Stitch keys, WhatsApp tokens, SMS keys)
4. Click "Run"
5. Get public URL
6. Update Meta webhook: `https://your-replit.repl.co/webhook`

### Option 2: Heroku

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create app
heroku create debit-now-ai

# Add Postgres
heroku addons:create heroku-postgresql:standard-0

# Set environment variables
heroku config:set STITCH_CLIENT_ID=sk_test_...
heroku config:set WHATSAPP_TOKEN=...
heroku config:set SMS_API_KEY=...

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Option 3: AWS/DigitalOcean/VPS

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repo
git clone https://github.com/shabakoketso/Debit-NOW-AI.git
cd Debit-NOW-AI

# Install dependencies
npm install

# Create .env
nano .env
# Add your production keys

# Install PM2 (process manager)
npm install -g pm2

# Start app
pm2 start src/index.js --name "debit-now-ai"
pm2 startup
pm2 save

# Setup Nginx reverse proxy
sudo nano /etc/nginx/sites-available/debit-now-ai
```

### Production Checklist

- [ ] Switch to `sk_live_` Stitch keys (after NCR approval)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL certificate
- [ ] Set up database backups (daily)
- [ ] Configure logging & monitoring
- [ ] Set up error alerts (email/Slack)
- [ ] Enable rate limiting
- [ ] Set up payment confirmation flow
- [ ] Add audit logging
- [ ] Test with 10% consumer base first
- [ ] Get compliance approval (NCA/NCR)

---

## Troubleshooting

### Problem: Database Connection Failed

**Solution:**
```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL

# If using Replit, regenerate Secrets
# Go to Secrets → Regenerate DATABASE_URL
```

### Problem: WhatsApp Messages Not Received

**Solution:**
1. Verify webhook URL registered in Meta
2. Check webhook logs: `heroku logs --tail` or Replit logs
3. Ensure VERIFY_TOKEN matches
4. Check operator phone number is registered

### Problem: SMS Not Sending

**Solution:**
1. Verify SMS_API_KEY is correct
2. Check SMS gateway account balance
3. Verify phone numbers are international format (27810123456)
4. Test SMS directly via gateway dashboard

### Problem: No Consumers in Arrears

**Solution:**
- Arrears detection runs daily at 7 AM
- In MVP, arrears are simulated (30% probability)
- For testing, modify arrears_amount directly:
  ```bash
  psql $DATABASE_URL
  UPDATE consumers SET is_in_arrears = true, arrears_amount = 500, arrears_days = 15 WHERE id = 1;
  ```

### Problem: Port 3000 Already in Use

**Solution:**
```bash
# Change port in .env
PORT=3001

# Or kill process on port 3000
lsof -i :3000
kill -9 <PID>
```

---

## API Reference

### Consumers
```
GET /api/consumers          - List all consumers
GET /api/consumers/arrears  - List arrears accounts
```

### Instructions
```
GET /api/instructions/pending - List pending instructions
```

### Logs
```
GET /api/logs - List debit logs (last 100)
```

### Operators
```
POST /api/operators/register
Body: { "name": "John", "phone_number": "27810123456" }
```

### WhatsApp Commands
```
ONBOARD Name|Client|MaxAmount
INSTRUCTION consumer_id amount [reason]
EXECUTE instruction_id
LIST
ARREARS
PENDING
STATUS
```

---

## Support & Contact

**For issues, questions, or implementation support:**

📞 **KWHILCH GROUP PTY LTD**  
- **Phone:** 0680467440
- **Email:** kwhilchgroup@gmail.com
- **GitHub Issues:** https://github.com/shabakoketso/Debit-NOW-AI/issues

**Documentation:**
- **Stitch Docs:** https://stitch.money/docs
- **WhatsApp API:** https://developers.facebook.com/docs/whatsapp/cloud-api
- **Clickatell SMS:** https://clickatell.com/developers
- **Node.js Docs:** https://nodejs.org/docs

---

## Next Steps

### Week 1: MVP Testing
- [ ] Set up sandbox environment
- [ ] Register test operators
- [ ] Onboard test consumers
- [ ] Execute test debits
- [ ] Verify SMS/WhatsApp flow

### Week 2: Integration
- [ ] Connect to your accounting system (arrears data)
- [ ] Implement your collections rules
- [ ] Set up NCA compliance logging
- [ ] Test with 10% consumer base

### Week 3: Go Live Prep
- [ ] Get NCR approval
- [ ] Switch to live Stitch keys
- [ ] Full SMS/USSD integration
- [ ] Set up monitoring

### Week 4+: Scale & Optimize
- [ ] Scale to full consumer base
- [ ] Analyze debit success rates
- [ ] Optimize timing/messaging
- [ ] Add advanced AI features

---

## License

MIT

---

**Built with ❤️ by Isaac Koketso Shaba @ KWHILCH GROUP PTY LTD**
