# Data Storage and Security Documentation

## 📊 Data Storage Overview

### 1. **PERSISTENT DATABASE (SQLite - `server/data/fireinterviewcoach.db`)**

**What's Stored:**
- ✅ **User Accounts**: Email, hashed password, name, credits balance, created_at
- ✅ **Credit Transactions**: Purchase history, amounts, Stripe payment IDs
- ✅ **Credit Ledger**: All credit additions/deductions with reasons

**Security:**
- ✅ Passwords are **hashed with bcrypt** (never stored in plain text)
- ✅ Database file is local to server (not exposed to web)
- ✅ Foreign key constraints ensure data integrity

**Location:** `server/data/fireinterviewcoach.db` (SQLite database file)

---

### 2. **IN-MEMORY SESSION DATA (Lost on Server Restart)**

**What's Stored in Memory (Temporary):**
- 📄 **Resume text** (full resume content)
- 📊 **Resume analysis** (AI-parsed resume data)
- 💬 **Conversation history** (questions asked, answers given)
- 📝 **Answer analyses** (AI feedback on responses)
- 🏙️ **City research data** (department information)
- 🎯 **User preferences** (name, location, department, job type, voice preference)

**⚠️ IMPORTANT:**
- This data is stored in a JavaScript `Map` object in server memory
- **Data is LOST when server restarts** (not persistent)
- Each user session gets a unique `sessionId` (not tied to account until they sign up)
- For anonymous/trial users, data exists only in memory during their session

**Location:** `server/index.js` - `const userProfiles = new Map()`

---

### 3. **BROWSER LOCALSTORAGE (Client-Side)**

**What's Stored:**
- 🆓 **Trial credits remaining** (`trial_credits_remaining`: 0-3)
- ✅ **Terms acceptance** (termsAccepted, privacyAccepted)
- 📋 **Onboarding data** (JSON string with user preferences)

**Location:** User's browser `localStorage`

---

## 🔒 Data Confidentiality & Security

### ✅ **SECURE (Protected Data):**

1. **User Passwords**
   - ✅ Hashed with bcrypt (industry standard)
   - ✅ Never stored in plain text
   - ✅ Cannot be reverse-engineered

2. **Payment Information**
   - ✅ Handled entirely by Stripe (not stored by you)
   - ✅ Only transaction IDs and amounts stored
   - ✅ No credit card numbers or payment details saved

3. **Authentication**
   - ✅ JWT tokens in HttpOnly cookies
   - ✅ Tokens expire after 30 days
   - ✅ Secure cookie flags in production

### ⚠️ **CURRENT LIMITATIONS (Privacy Concerns):**

1. **Resume & Interview Data**
   - ⚠️ Stored in **server memory only** (not in database)
   - ⚠️ Lost on server restart (not persistent)
   - ⚠️ **Not encrypted at rest** (stored in plain text in memory)
   - ⚠️ Accessible to anyone with server access
   - ⚠️ No automatic deletion policy

2. **Session Data**
   - ⚠️ Anonymous users' data exists in memory during session
   - ⚠️ Session data not tied to account until user signs up
   - ⚠️ Multiple sessions possible with same sessionId if server restarts

### 🔐 **SECURITY MEASURES IN PLACE:**

1. ✅ **HTTPS Required** (in production via Render)
2. ✅ **Password Hashing** (bcrypt)
3. ✅ **JWT Authentication** (HttpOnly cookies)
4. ✅ **CORS Protection** (configured for frontend domain only)
5. ✅ **Input Validation** (server-side checks)
6. ✅ **SQL Injection Protection** (parameterized queries)

### 📋 **RECOMMENDED IMPROVEMENTS:**

For better privacy and data protection:

1. **Persist Resume/Interview Data** (if you want to save user history):
   ```sql
   CREATE TABLE user_sessions (
     id INTEGER PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     session_id TEXT,
     resume_text TEXT,
     resume_analysis TEXT,
     conversation_history TEXT, -- JSON
     answer_analyses TEXT, -- JSON
     created_at TEXT,
     expires_at TEXT
   );
   ```

2. **Encryption at Rest**:
   - Encrypt sensitive fields before storing
   - Use environment variables for encryption keys

3. **Data Retention Policy**:
   - Auto-delete old session data after X days
   - Allow users to delete their data

4. **GDPR Compliance** (if serving EU users):
   - Add "Delete My Data" functionality
   - Export user data capability
   - Clear privacy policy updates

---

## 💳 Stripe Configuration in Render

### **Environment Variables to Set in Render:**

1. **STRIPE_SECRET_KEY**
   - Value: Your Stripe Secret Key (starts with `sk_live_` for production or `sk_test_` for testing)
   - Where to find: [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys)
   - Example: `sk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890`

2. **STRIPE_WEBHOOK_SECRET**
   - Value: Your Stripe Webhook Secret (starts with `whsec_`)
   - Where to find: [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
   - Steps:
     1. Create a webhook endpoint: `https://your-app.onrender.com/api/credits/webhook`
     2. Select event: `checkout.session.completed`
     3. Copy the "Signing secret" (starts with `whsec_`)
   - Example: `whsec_1234567890abcdefghijklmnopqrstuvwxyz`

### **How to Set in Render:**

1. Go to your Render Dashboard
2. Select your backend service
3. Click **"Environment"** tab
4. Click **"Add Environment Variable"**
5. Add each variable:
   - Key: `STRIPE_SECRET_KEY`
   - Value: `sk_test_...` or `sk_live_...`
6. Repeat for `STRIPE_WEBHOOK_SECRET`
7. Click **"Save Changes"**
8. Render will automatically restart your service

### **Testing vs Production:**

- **Testing**: Use `sk_test_...` keys (Stripe test mode)
- **Production**: Use `sk_live_...` keys (real payments)

### **Webhook Setup:**

1. In Stripe Dashboard → Webhooks
2. Click **"Add endpoint"**
3. Endpoint URL: `https://your-backend-url.onrender.com/api/credits/webhook`
4. Select events: `checkout.session.completed`
5. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET` in Render

---

## 📝 Summary

**What's Stored Permanently:**
- ✅ User accounts (email, hashed password, name, credits)
- ✅ Payment transactions (amounts, IDs - no card numbers)
- ✅ Credit ledger (audit trail)

**What's Stored Temporarily (Lost on Restart):**
- 📄 Resumes and resume analyses
- 💬 Conversation history
- 📝 Interview answers and feedback

**Security Status:**
- ✅ Passwords are secure (hashed)
- ✅ Payments are secure (handled by Stripe)
- ⚠️ Resume/interview data is NOT encrypted or persistent
- ⚠️ Consider adding database persistence if you want to save user history

---

## 🔗 Quick Links

- **Stripe Dashboard**: https://dashboard.stripe.com
- **Stripe API Keys**: https://dashboard.stripe.com/apikeys
- **Stripe Webhooks**: https://dashboard.stripe.com/webhooks
- **Render Environment Variables**: Your Render Dashboard → Service → Environment tab
