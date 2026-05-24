# NUKIA v2.0 — Complete Deployment Guide
# Retail + Wholesale + Hybrid Architecture
# Platform: Render.com (free tier)
# ═══════════════════════════════════════════════════════════

## WHAT YOU HAVE INSTALLED
✅ Node.js
✅ Git
✅ GitHub account (Dr-Emily18)
✅ Render account (connected to GitHub)

## ═══════════════════════════════════════════════════════
## STEP 1 — PUSH CODE TO GITHUB
## ═══════════════════════════════════════════════════════

Open PowerShell as Administrator on your laptop.
Press Windows key + X → Terminal (Admin) → Yes

Run these commands ONE BY ONE.
Wait for each to finish before doing the next.

### 1A — Set your Git identity (do once)
```
git config --global user.email "dremily18@gmail.com"
git config --global user.name "Dr-Emily18"
```

### 1B — Go into the nukia folder
First extract the ZIP file from Downloads, then:
```
cd Downloads\nukia2
```
If that doesn't work try:
```
cd Downloads\nukia-v2\nukia2
```

### 1C — Initialize Git and connect to GitHub
```
git init
git branch -M main
git remote add origin https://github.com/Dr-Emily18/nukia-project.git
```

### 1D — Upload all code to GitHub
```
git add .
git commit -m "NUKIA v2.0 - Retail + Wholesale + Hybrid"
git push -u origin main
```

When it asks for username: Dr-Emily18
When it asks for password: use your Personal Access Token (see Step 1E)

### 1E — Create Personal Access Token (GitHub password replacement)
1. Go to github.com → click your profile photo (top right)
2. Click Settings
3. Scroll down → click "Developer settings" (bottom left)
4. Click "Personal access tokens" → "Tokens (classic)"
5. Click "Generate new token (classic)"
6. Note: type "NUKIA deploy"
7. Expiration: 90 days
8. Check the box: "repo"
9. Click "Generate token"
10. COPY THE TOKEN — you only see it once
11. Save it in a safe place (Notes app, Google Drive)
Use this token as your password when Git asks.

## ═══════════════════════════════════════════════════════
## STEP 2 — CREATE FREE DATABASE ON RENDER
## ═══════════════════════════════════════════════════════

1. Go to dashboard.render.com
2. Click "New +" → "PostgreSQL"
3. Fill in:
   - Name: nukia-db
   - Database: nukia
   - User: nukia
   - Region: Oregon (US West) — leave default
   - Plan: FREE
4. Click "Create Database"
5. Wait 2 minutes for it to create
6. When ready, scroll down to "Connections"
7. Copy the "Internal Database URL" — it looks like:
   postgresql://nukia:password@host/nukia
8. SAVE THIS URL — you need it in Step 3

## ═══════════════════════════════════════════════════════
## STEP 3 — SET ENVIRONMENT VARIABLES ON RENDER
## ═══════════════════════════════════════════════════════

1. Go to your nukia web service on Render
2. Click "Environment" in the left menu
3. Click "Add Environment Variable" for each one below

Add these variables:

KEY                     | VALUE
------------------------|------------------------------------------
NODE_ENV                | production
DATABASE_URL            | [paste the URL from Step 2]
FORMULA_ENCRYPTION_KEY  | [generate — see below]
ADMIN_SECRET            | [choose a strong password you will remember]
BRIDGE_API_KEY          | [choose another password]
MPESA_BUSINESS_NUMBER   | +255XXXXXXXXX [your real M-Pesa number]
AT_USERNAME             | sandbox
AT_API_KEY              | placeholder
AT_SENDER_ID            | NUKIA
TWILIO_ACCOUNT_SID      | placeholder
TWILIO_AUTH_TOKEN       | placeholder
TWILIO_WHATSAPP_NUMBER  | whatsapp:+14155238886

### Generate FORMULA_ENCRYPTION_KEY:
Open PowerShell and run:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the 64-character result. Use it as the value.
⚠️ WRITE THIS DOWN AND SAVE IT SAFELY.
If you lose it, all stored formulas become unreadable.

4. After adding all variables, click "Save Changes"
5. Click "Manual Deploy" → "Deploy latest commit"

## ═══════════════════════════════════════════════════════
## STEP 4 — SET UP THE DATABASE TABLES
## ═══════════════════════════════════════════════════════

After deployment succeeds:
1. In Render → your nukia web service → click "Shell"
2. Type this and press Enter:
```
node server/db/index.js setup
```
3. You should see: ✅ Database schema created

If there is no Shell tab, use the Render PostgreSQL dashboard:
1. Go to your nukia-db service
2. Click "Connect" → "External Connection"
3. Use any PostgreSQL client to run the schema.sql file

## ═══════════════════════════════════════════════════════
## STEP 5 — VERIFY SERVER IS RUNNING
## ═══════════════════════════════════════════════════════

Open your browser and go to:
https://nukia.onrender.com/webhook/health

You should see:
{"status":"ok","version":"2.0.0"}

If you see this — your server is live. ✅

Also check:
https://nukia.onrender.com/
You should see NUKIA server info.

## ═══════════════════════════════════════════════════════
## STEP 6 — SET UP TWILIO WHATSAPP
## ═══════════════════════════════════════════════════════

1. Go to twilio.com → Sign up free
2. Verify your phone number
3. Go to Console → Messaging → Try WhatsApp
4. Follow sandbox setup instructions
5. From Account Info page, copy:
   - Account SID → replace "placeholder" in TWILIO_ACCOUNT_SID
   - Auth Token → replace "placeholder" in TWILIO_AUTH_TOKEN
6. Go to Messaging → Settings → WhatsApp Sandbox
7. Set webhook URL to:
   https://nukia.onrender.com/webhook/whatsapp
8. Method: HTTP POST
9. Save
10. Test: send "HELP" to the Twilio WhatsApp sandbox number

## ═══════════════════════════════════════════════════════
## STEP 7 — SET UP AFRICA'S TALKING (SMS)
## ═══════════════════════════════════════════════════════

1. Go to africastalking.com → Sign up
2. Verify your email
3. Go to Settings → API Key → Generate
4. Copy the key → replace "placeholder" in AT_API_KEY
5. Copy your username → replace "sandbox" in AT_USERNAME
6. Go to SMS → Sender IDs → Request "NUKIA" Sender ID
   (takes 1-3 days for approval)
7. Save all changes in Render environment variables
8. Click "Manual Deploy" to apply new values

## ═══════════════════════════════════════════════════════
## STEP 8 — REGISTER YOUR FIRST SHOP
## ═══════════════════════════════════════════════════════

Use this URL in your browser to register a shop
(replace YOUR_ADMIN_SECRET with your actual ADMIN_SECRET):

For a RETAIL shop:
POST https://nukia.onrender.com/admin/shops
Headers: x-admin-key: YOUR_ADMIN_SECRET
Body:
{
  "name": "Mabibo Scents",
  "phone": "+255712345678",
  "shop_type": "retail"
}

For a WHOLESALE shop:
{
  "name": "Kariakoo Oils Ltd",
  "phone": "+255787654321",
  "shop_type": "wholesale"
}

For a HYBRID shop (does both):
{
  "name": "Amina Perfumes",
  "phone": "+255700000000",
  "shop_type": "hybrid"
}

Use Postman (free at postman.com) to send these requests easily.
Or I can build you a simple web admin panel to do this by clicking.

## ═══════════════════════════════════════════════════════
## STEP 9 — LINK WHOLESALER TO RETAILER
## ═══════════════════════════════════════════════════════

After registering both shops, link them:

POST https://nukia.onrender.com/admin/supply-link
Headers: x-admin-key: YOUR_ADMIN_SECRET
Body:
{
  "wholesaler_id": 1,
  "retailer_id": 2,
  "oils_supplied": ["Oud", "Rose", "Musk"],
  "supply_frequency": "weekly"
}

This activates:
- Stock runout alerts to the wholesaler
- Formula push (PUSH command) from wholesaler to retailer
- Network visibility (NETWORK command)

## ═══════════════════════════════════════════════════════
## STEP 10 — CONFIRM M-PESA TOP-UPS MANUALLY
## ═══════════════════════════════════════════════════════

When a seller sends M-Pesa and forwards you the SMS:

POST https://nukia.onrender.com/admin/topup
Headers: x-admin-key: YOUR_ADMIN_SECRET
Body:
{
  "shop_id": 1,
  "amount_tsh": 10000,
  "mpesa_ref": "QKA1B2C3D4",
  "confirmed_by": "Emily"
}

Seller gets automatic WhatsApp: ✅ 55 credits added!

## ═══════════════════════════════════════════════════════
## STEP 11 — PRINTER BRIDGE (on shop device)
## ═══════════════════════════════════════════════════════

On the device in the shop (Android tablet, laptop, anything):
1. Install Node.js (same as before)
2. Create a folder, put bridge.js inside
3. Create .env file:
```
NUKIA_SERVER_URL=https://nukia.onrender.com
BRIDGE_API_KEY=your_bridge_api_key
SHOP_ID=1
DEFAULT_PRINTER_IP=192.168.1.100
DEFAULT_PRINTER_PORT=9100
```
4. Run:
```
node bridge.js
```
5. Printer connects automatically

Find printer IP: connect printer to Wi-Fi, print a test page,
IP address is printed on the paper.

## ═══════════════════════════════════════════════════════
## DAILY MONITORING (takes 2 minutes)
## ═══════════════════════════════════════════════════════

Check server health:
https://nukia.onrender.com/webhook/health

Check today's stats:
https://nukia.onrender.com/admin/stats?key=YOUR_ADMIN_SECRET

Check pending alerts:
https://nukia.onrender.com/admin/stats?key=YOUR_ADMIN_SECRET
(look at pendingAlerts in the response)

Check Render logs:
dashboard.render.com → nukia service → Logs tab

## ═══════════════════════════════════════════════════════
## TROUBLESHOOTING
## ═══════════════════════════════════════════════════════

Server not starting:
→ Check Render logs for red error text
→ Most common: DATABASE_URL wrong — copy it fresh from Render PostgreSQL

WhatsApp not receiving:
→ Check Twilio webhook URL is exactly: https://nukia.onrender.com/webhook/whatsapp
→ Check TWILIO_ACCOUNT_SID and AUTH_TOKEN are real values not "placeholder"

Formula decryption errors:
→ FORMULA_ENCRYPTION_KEY was changed after formulas were stored
→ Never change this key once shops are using the system

Printer not responding:
→ Printer and device must be on SAME Wi-Fi network
→ Find printer IP by printing a test page
→ Test connection: ping 192.168.1.100 in terminal

Credits not updating:
→ Run the topup admin call manually
→ Check DATABASE_URL is correct

## ═══════════════════════════════════════════════════════
## COST SUMMARY
## ═══════════════════════════════════════════════════════

Render Web Service (free):     0 TSH/month
Render PostgreSQL (free):      0 TSH/month
Twilio WhatsApp (sandbox):     0 TSH/month
Africa's Talking SMS:         ~8 TSH per SMS sent
Total Phase 1:                 ~0-5,000 TSH/month

When ready to upgrade (Month 3-4):
Render paid tier:             ~16,000 TSH/month ($7)
(eliminates 50-second sleep delay)
