# 🚀 DebitNow AI System - Deployment Checklist

**Last Updated:** August 2, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅

---

## 📋 Pre-Deployment Checklist

### Local Development Setup
- [ ] Clone repository: `git clone https://github.com/shabakoketso/Debit-NOW-AI.git`
- [ ] Enter directory: `cd Debit-NOW-AI`
- [ ] Install dependencies: `npm install`
- [ ] Run test script: `./test-system.sh` (should pass all tests)
- [ ] Application starts without errors: `npm start`
- [ ] Dashboard loads at http://localhost:3000

### Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Configure `DATABASE_URL`
- [ ] Configure `STITCH_CLIENT_ID`
- [ ] Configure `WHATSAPP_TOKEN` (optional for MVP)
- [ ] Configure `WHATSAPP_PHONE_ID` (optional for MVP)
- [ ] Set unique `VERIFY_TOKEN`
- [ ] Configure `SMS_API_KEY` (optional for MVP)
- [ ] Configure `SMS_GATEWAY` (optional for MVP)
- [ ] Set `PORT` (default 3000)

### Database
- [ ] PostgreSQL database created
- [ ] Connection string tested
- [ ] Tables created successfully
- [ ] Initial data migration complete
- [ ] Backups configured

### API Integration
- [ ] Stitch API credentials tested
- [ ] WhatsApp webhook verified
- [ ] SMS gateway tested (optional)
- [ ] All endpoints responding correctly

### Security
- [ ] Environment variables not committed to git
- [ ] `.env` file added to `.gitignore`
- [ ] Verify token configured
- [ ] SSL/TLS certificate installed (for production)
- [ ] Database credentials secured

### Testing
- [ ] All API endpoints tested
- [ ] WhatsApp commands simulated
- [ ] Operator registration flow tested
- [ ] Consumer onboarding tested
- [ ] Debit instruction execution tested
- [ ] Arrears detection tested
- [ ] SMS notifications logged
- [ ] Dashboard displays correctly

---

## 🚀 Deployment Options

### Option 1: Replit (Easiest for MVP) ⭐

**Time: 5 minutes | Cost: FREE**

1. **Create Replit Account**
   - Go to https://replit.com
   - Sign up with GitHub

2. **Import Repository**
   - Click "Create" → "Import from GitHub"
   - Enter: `shabakoketso/Debit-NOW-AI`
   - Wait for import to complete

3. **Setup Database**
   - Click "Secrets" (lock icon)
   - Add all required secrets from `.env.example`
   - Replit includes free PostgreSQL

4. **Configure Environment**
   ```bash
   # In Replit console
   npm install
   cp .env.example .env
   ```

5. **Add Secrets to .env**
   - DATABASE_URL (Replit provides automatically)
   - STITCH_CLIENT_ID
   - WHATSAPP_TOKEN (optional)
   - VERIFY_TOKEN

6. **Deploy**
   - Click "Run"
   - System starts automatically
   - Get public URL: `https://your-replit.replit.dev`

7. **Webhook Configuration**
   - Add to Meta WhatsApp: `https://your-replit.replit.dev/webhook`
   - Verify token: your `VERIFY_TOKEN`

---

### Option 2: Heroku (Traditional Hosting)

**Time: 15 minutes | Cost: $7/month (cheapest dyno)**

1. **Create Heroku Account**
   - Go to https://heroku.com
   - Sign up

2. **Install Heroku CLI**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # Linux
   curl https://cli-assets.heroku.com/install.sh | sh
   ```

3. **Login to Heroku**
   ```bash
   heroku login
   ```

4. **Create Heroku App**
   ```bash
   cd Debit-NOW-AI
   heroku create debit-now-ai
   ```

5. **Setup PostgreSQL Add-on**
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

6. **Configure Environment Variables**
   ```bash
   heroku config:set STITCH_CLIENT_ID=sk_test_your_key
   heroku config:set WHATSAPP_TOKEN=your_token
   heroku config:set WHATSAPP_PHONE_ID=your_phone_id
   heroku config:set VERIFY_TOKEN=debitnow123
   heroku config:set NODE_ENV=production
   heroku config:set LOG_LEVEL=info
   ```

7. **Deploy**
   ```bash
   git push heroku main
   ```

8. **View Logs**
   ```bash
   heroku logs --tail
   ```

9. **Webhook Configuration**
   ```bash
   # Your URL
   https://debit-now-ai.herokuapp.com/webhook
   ```

10. **Restart App**
    ```bash
    heroku restart
    ```

---

### Option 3: AWS (Production Scale)

**Time: 30 minutes | Cost: $5-20/month (EC2 + RDS)**

1. **Create AWS Account**
   - Go to https://aws.amazon.com
   - Create Free Tier account

2. **Setup RDS PostgreSQL**
   - Navigate to RDS
   - Create PostgreSQL database
   - Save connection string

3. **Launch EC2 Instance**
   - Select Ubuntu 22.04 LTS
   - t3.micro (Free Tier eligible)
   - Configure security groups:
     - Allow port 80 (HTTP)
     - Allow port 443 (HTTPS)
     - Allow port 3000 (Node.js)

4. **SSH into Instance**
   ```bash
   ssh -i your-key.pem ubuntu@your-instance-ip
   ```

5. **Install Node.js**
   ```bash
   curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs npm
   ```

6. **Clone Repository**
   ```bash
   git clone https://github.com/shabakoketso/Debit-NOW-AI.git
   cd Debit-NOW-AI
   npm install
   ```

7. **Setup Environment**
   ```bash
   cp .env.example .env
   nano .env
   # Add all configuration
   ```

8. **Install PM2 (Process Manager)**
   ```bash
   sudo npm install -g pm2
   pm2 start index.js --name "debit-now-ai"
   pm2 startup
   pm2 save
   ```

9. **Setup Nginx Reverse Proxy**
   ```bash
   sudo apt-get install -y nginx
   
   # Create config
   sudo nano /etc/nginx/sites-available/debit-now-ai
   ```
   
   Add:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

10. **Enable Site & Restart Nginx**
    ```bash
    sudo ln -s /etc/nginx/sites-available/debit-now-ai /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

11. **Setup SSL (Let's Encrypt)**
    ```bash
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d your-domain.com
    ```

12. **Update Webhook URL**
    - Point Meta WhatsApp to: `https://your-domain.com/webhook`

---

### Option 4: DigitalOcean (Best Value)

**Time: 20 minutes | Cost: $4-6/month (Droplet + Spaces)**

1. **Create DigitalOcean Account**
   - Go to https://digitalocean.com
   - Sign up

2. **Create Droplet**
   - Choose Ubuntu 22.04
   - Basic $4/month droplet
   - Select region closest to your users

3. **Create Managed PostgreSQL**
   - Navigate to Databases
   - Create PostgreSQL 14 cluster
   - Save connection string

4. **SSH into Droplet**
   ```bash
   ssh root@your-droplet-ip
   ```

5. **Install Node.js**
   ```bash
   curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   apt-get install -y nodejs npm git
   ```

6. **Clone & Setup**
   ```bash
   git clone https://github.com/shabakoketso/Debit-NOW-AI.git
   cd Debit-NOW-AI
   npm install
   cp .env.example .env
   # Configure .env with RDS connection string
   ```

7. **Install PM2 & Nginx**
   ```bash
   npm install -g pm2
   apt-get install -y nginx
   pm2 start index.js --name "debit-now-ai"
   pm2 startup
   pm2 save
   ```

8. **Configure Nginx** (same as AWS option above)

9. **Setup SSL with Certbot**
   ```bash
   apt-get install -y certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com
   ```

---

## ✅ Post-Deployment Verification

After deploying to any platform, verify:

### 1. Health Check
```bash
curl https://your-deployed-url/
```
Should return HTML dashboard

### 2. API Test
```bash
curl https://your-deployed-url/api/consumers
```
Should return empty array `[]`

### 3. Register Operator
```bash
curl -X POST https://your-deployed-url/api/operators/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Op","phone_number":"27800000000"}'
```

### 4. Webhook Verification
```bash
curl "https://your-deployed-url/webhook?hub.mode=subscribe&hub.verify_token=debitnow123&hub.challenge=test"
```
Should return `test`

### 5. Database Connection
- Check that tables are created
- Verify operator was inserted

### 6. Logs
```bash
# Replit: View in console
# Heroku: heroku logs --tail
# AWS/DO: ssh in and check /var/log or pm2 logs
```

---

## 🔒 Security Best Practices

### Environment Variables
- ✅ Never commit `.env` file
- ✅ Use platform secrets (Replit, Heroku, AWS Secrets Manager)
- ✅ Rotate API keys quarterly

### Database
- ✅ Use strong passwords
- ✅ Enable SSL connections
- ✅ Regular backups (daily)
- ✅ Restrict network access

### API Security
- ✅ Use HTTPS only
- ✅ Verify webhook tokens
- ✅ Rate limit endpoints
- ✅ Validate all inputs

### Logging
- ✅ Don't log sensitive data
- ✅ Rotate log files
- ✅ Monitor error patterns
- ✅ Archive logs

---

## 📊 Monitoring Setup

### Replit
- Built-in monitoring available

### Heroku
```bash
# View real-time logs
heroku logs --tail

# Metrics
heroku metrics
```

### AWS CloudWatch
```bash
# Install CloudWatch agent
# Monitor CPU, memory, disk
```

### PM2 (Local/VPS)
```bash
# View processes
pm2 list

# Monitor in real-time
pm2 monit

# View logs
pm2 logs debit-now-ai
```

---

## 🆘 Troubleshooting Deployment

| Issue | Solution |
|-------|----------|
| Port already in use | Change PORT in .env or kill process: `lsof -i :3000` |
| Database connection failed | Verify DATABASE_URL, ensure DB is running |
| WhatsApp webhook not working | Check VERIFY_TOKEN, ensure HTTPS enabled |
| App keeps crashing | Check logs: `npm start` or `heroku logs --tail` |
| Out of memory | Upgrade instance or optimize queries |
| SSL certificate errors | Renew cert: `certbot renew` |

---

## 📞 Support

**KWHILCH GROUP PTY LTD**
- 📞 Phone: **0680467440**
- 📧 Email: **kwhilchgroup@gmail.com**
- 🐙 GitHub: https://github.com/shabakoketso/Debit-NOW-AI

---

## 🎉 Deployment Complete!

Your DebitNow AI System is now live!

**Next Steps:**
1. ✅ Register operators via API
2. ✅ Onboard consumers via WhatsApp
3. ✅ Create & execute debit instructions
4. ✅ Monitor arrears detection
5. ✅ Track all transactions

**Share Your Success:**
- Star the repo ⭐
- Follow on GitHub
- Share feedback

---

**Production Deployment Date:** _________________  
**Deployed URL:** _________________________________  
**Contact Person:** ________________________________  
**Notes:** ________________________________________

