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
   - Open: http://localhost:3000

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
