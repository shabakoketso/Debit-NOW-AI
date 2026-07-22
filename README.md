# 🚀 Debit Now AI

**AI-powered collections agent** that monitors overdue accounts, decides optimal debit timing, and executes instant collections via Stitch + WhatsApp.

## 👤 Creator

**Isaac Koketso Shaba**  
Founder & CEO  
**KWHILCH GROUP PTY LTD**

---

## What It Does

1. **AI Orchestrator** → Decides who to debit, when, how much, and via which channel
2. **Collections Logic** → Applies your 9-year collections rules (Promise to Pay, DTI, risk scoring)
3. **Debit Engine** → Calls Stitch API to move money in real-time
4. **Comms Layer** → Sends WhatsApp notifications with 1-tap approval links
5. **Daily Cron** → Auto-runs AI debit checks at 8am daily

## Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL (Replit has free Postgres)
- Stitch Sandbox account: https://dashboard.stitch.money
- Meta WhatsApp Cloud API account: https://developers.facebook.com/apps

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
   - Open: http://localhost:3000

## WhatsApp Commands

### Onboard a Consumer
```
ONBOARD Thabo|LenderCo|800
```
Registers "Thabo" working for "LenderCo" with R800 max debit limit.

### Trigger AI Debit Decision
```
DEBIT 1 500
```
AI decides if consumer #1 should be debited R500 based on balance, time, day of week.

### List All Consumers
```
LIST
```
Shows active consumers with their max debit limits.

### Check Recent Status
```
STATUS
```
Displays last 5 debit attempts (success/skipped/failed).

## API Endpoints

### Get All Consumers
```bash
GET /api/consumers
```
Returns list of all registered consumers.

### Get Debit Logs
```bash
GET /api/logs
```
Returns last 100 debit attempts with status & AI reasoning.

### WhatsApp Webhook
```bash
POST /webhook
```
Handles incoming WhatsApp messages (auto-configured by Meta).

## How AI Decision Works

The AI checks 4 factors before debiting:

1. **Balance Check** → Simulated bank balance > 1.5x the debit amount
2. **Peak Time** → Between 5pm-8pm (higher collection rates)
3. **Weekday** → Monday-Friday (better for processing)
4. **Minimum Amount** → At least R100

**Decision:** Debit if 2+ checks pass.

## Daily Auto-Debit (Cron)

Every day at **8:00 AM**, the system:

1. Finds all active consumers who haven't been debited in 24h
2. Runs AI decision for 50% of their max limit
3. Automatically debits if conditions are favorable
4. Sends WhatsApp confirmation to consumer
5. Logs result in database

## Architecture

```
┌─────────────────────────────────────────────┐
│     WhatsApp / REST API / Cron              │
└─────────────────────┬───────────────────────┘
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
        │ Communications             │
        │ - WhatsApp notify          │
        │ - Receipt / status         │
        └─────────────┬──────────────┘
                      │
        ┌─────────────┴──────────────┐
        │    PostgreSQL DB           │
        │  - Consumers table         │
        │  - Debit logs table        │
        └────────────────────────────┘
```

## Database Schema

### Consumers Table
```sql
id (PK) | name | client_name | phone_number | account_id | max_debit | status | last_debit_attempt | created_at | updated_at
```

### Debit Logs Table
```sql
id (PK) | consumer_id (FK) | amount | status | ai_decision | reason | created_at
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

### Database
```env
DATABASE_URL=postgresql://user:password@localhost:5432/debit_now_ai
```

## Production Checklist

- [ ] Switch from `sk_test_` to `sk_live_` Stitch keys after NCR approval
- [ ] Set up real consumer consent/digital mandates
- [ ] Configure WhatsApp approval flow with 1-tap bank links
- [ ] Add real balance check API (bank query, not simulation)
- [ ] Implement your 9-year collections rules in AI decision logic
- [ ] Set up monitoring/alerting for failed debits
- [ ] Add NCA compliance logging
- [ ] Enable database backups
- [ ] Test with 10% of your consumer base first

## Next Steps

### Phase 1 (Week 1)
- [ ] Set up sandbox testing
- [ ] Test WhatsApp commands
- [ ] Verify Stitch debit flow

### Phase 2 (Week 2)
- [ ] Integrate your collections rules (DTI, Promise to Pay, risk scoring)
- [ ] Connect to real consumer data
- [ ] Set up NCA logging

### Phase 3 (Week 3)
- [ ] NCR approval + `sk_live_` keys
- [ ] Go live with 100 test consumers
- [ ] Monitor and optimize

### Phase 4 (Week 4+)
- [ ] Scale to full 1000+ consumer base
- [ ] Add advanced AI (OpenAI/Claude) for dynamic messaging
- [ ] Implement A/B testing on debit times

## Support

- **Stitch Docs**: https://stitch.money/docs
- **WhatsApp API**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **Issues**: https://github.com/shabakoketso/Debit-NOW-AI/issues

## License

MIT

---

**Built by Isaac Koketso Shaba @ KWHILCH GROUP PTY LTD**
