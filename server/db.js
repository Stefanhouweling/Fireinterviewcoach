const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// CRITICAL: On Render, use persistent disk storage
// Render provides /opt/render/project/src/server/data for persistent storage
// For local development, use __dirname/data
let dataDir;
if (process.env.RENDER) {
  // Render persistent disk path
  dataDir = '/opt/render/project/src/server/data';
} else if (process.env.NODE_ENV === 'production' && process.platform !== 'win32') {
  // Production (but not Render) - use /tmp or a persistent location
  dataDir = path.join(process.env.HOME || '/tmp', '.fireinterviewcoach', 'data');
} else {
  // Local development
  dataDir = path.join(__dirname, 'data');
}

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

const dbPath = path.join(dataDir, 'fireinterviewcoach.db');
console.log(`Database path: ${dbPath}`);
console.log(`Database exists: ${fs.existsSync(dbPath)}`);

// Initialize database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT,
    provider TEXT DEFAULT 'email',
    provider_id TEXT,
    credits_balance INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    change INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pack_id TEXT NOT NULL,
    credits_purchased INTEGER NOT NULL,
    amount_paid_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT DEFAULT 'pending',
    stripe_payment_intent_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

  CREATE TABLE IF NOT EXISTS analytics_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER,
    ip_hash TEXT,
    city TEXT,
    state_province TEXT,
    country TEXT,
    department_name TEXT,
    job_type TEXT,
    questions_answered INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 1,
    first_visit_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_visit_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_visits(session_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_visits(user_id);
  CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics_visits(country);
  CREATE INDEX IF NOT EXISTS idx_analytics_department ON analytics_visits(department_name);
  CREATE INDEX IF NOT EXISTS idx_analytics_first_visit ON analytics_visits(first_visit_at);

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL,
    referred_user_id INTEGER,
    referral_code TEXT UNIQUE NOT NULL,
    credits_granted INTEGER DEFAULT 0,
    referrer_credited INTEGER DEFAULT 0,
    used_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
  CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
  CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
`);

// Migration: Add visit_count column if it doesn't exist
try {
  db.prepare('SELECT visit_count FROM analytics_visits LIMIT 1').get();
} catch (e) {
  // Column doesn't exist, add it
  console.log('Adding visit_count column to analytics_visits table...');
  db.exec('ALTER TABLE analytics_visits ADD COLUMN visit_count INTEGER DEFAULT 1');
  // Set existing records to have visit_count = 1
  db.exec('UPDATE analytics_visits SET visit_count = 1 WHERE visit_count IS NULL');
  console.log('Migration complete: visit_count column added');
}

// User operations
const userQueries = {
  create: db.prepare(`
    INSERT INTO users (email, password_hash, name, provider, provider_id, credits_balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  // CRITICAL FIX: Make email lookup case-insensitive to prevent duplicate accounts
  findByEmail: db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)'),
  findByProvider: db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  updateCredits: db.prepare('UPDATE users SET credits_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateProfile: db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
};

// Credit ledger operations
const creditLedgerQueries = {
  create: db.prepare(`
    INSERT INTO credit_ledger (user_id, change, reason)
    VALUES (?, ?, ?)
  `),
  getByUserId: db.prepare('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
};

// Transaction operations
const transactionQueries = {
  create: db.prepare(`
    INSERT INTO transactions (user_id, pack_id, credits_purchased, amount_paid_cents, currency, status, stripe_payment_intent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  findByPaymentIntent: db.prepare('SELECT * FROM transactions WHERE stripe_payment_intent_id = ?'),
  updateStatus: db.prepare('UPDATE transactions SET status = ? WHERE id = ?'),
  getByUserId: db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
};

// Analytics operations
const analyticsQueries = {
  create: db.prepare(`
    INSERT INTO analytics_visits (session_id, user_id, ip_hash, city, state_province, country, department_name, job_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findBySession: db.prepare('SELECT * FROM analytics_visits WHERE session_id = ?'),
  updateQuestions: db.prepare('UPDATE analytics_visits SET questions_answered = ?, last_visit_at = CURRENT_TIMESTAMP WHERE session_id = ?'),
  updateLastVisit: db.prepare('UPDATE analytics_visits SET last_visit_at = CURRENT_TIMESTAMP, visit_count = visit_count + 1 WHERE session_id = ?'),
  getAll: db.prepare('SELECT * FROM analytics_visits ORDER BY first_visit_at DESC LIMIT ?'),
  getStats: db.prepare(`
    SELECT 
      SUM(visit_count) as total_visits,
      COUNT(DISTINCT session_id) as unique_sessions,
      COUNT(DISTINCT user_id) as registered_users,
      SUM(questions_answered) as total_questions,
      COUNT(DISTINCT country) as countries,
      COUNT(DISTINCT department_name) as departments
    FROM analytics_visits
  `),
  getByDepartment: db.prepare('SELECT department_name, COUNT(*) as count FROM analytics_visits WHERE department_name IS NOT NULL GROUP BY department_name ORDER BY count DESC'),
  getByCountry: db.prepare('SELECT country, COUNT(*) as count FROM analytics_visits WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC'),
  getByDate: db.prepare('SELECT DATE(first_visit_at) as date, COUNT(*) as count FROM analytics_visits GROUP BY DATE(first_visit_at) ORDER BY date DESC LIMIT ?')
};

// User model
const User = {
  async create(email, password, name = null, provider = 'email', providerId = null) {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = userQueries.create.run(email, passwordHash, name, provider, providerId, 0);
    return this.findById(result.lastInsertRowid);
  },

  findByEmail(email) {
    return userQueries.findByEmail.get(email);
  },
  
  findByProvider(provider, providerId) {
    return userQueries.findByProvider.get(provider, providerId);
  },

  findById(id) {
    return userQueries.findById.get(id);
  },

  async verifyPassword(user, password) {
    if (!user.password_hash) return false;
    return await bcrypt.compare(password, user.password_hash);
  },

  updateCredits(userId, newBalance) {
    userQueries.updateCredits.run(newBalance, userId);
    return this.findById(userId);
  },

  addCredits(userId, amount, reason) {
    const user = this.findById(userId);
    if (!user) throw new Error('User not found');
    
    const newBalance = user.credits_balance + amount;
    this.updateCredits(userId, newBalance);
    
    // Log in credit ledger
    creditLedgerQueries.create.run(userId, amount, reason);
    
    return this.findById(userId);
  },

  deductCredit(userId, reason) {
    const user = this.findById(userId);
    if (!user) throw new Error('User not found');
    
    if (user.credits_balance <= 0) {
      throw new Error('Insufficient credits');
    }
    
    const newBalance = user.credits_balance - 1;
    this.updateCredits(userId, newBalance);
    
    // Log in credit ledger
    creditLedgerQueries.create.run(userId, -1, reason);
    
    return this.findById(userId);
  },

  updateProfile(userId, name) {
    userQueries.updateProfile.run(name, userId);
    return this.findById(userId);
  }
};

// Transaction model
const Transaction = {
  create(userId, packId, creditsPurchased, amountPaidCents, currency = 'usd', status = 'pending', stripePaymentIntentId = null) {
    const result = transactionQueries.create.run(
      userId,
      packId,
      creditsPurchased,
      amountPaidCents,
      currency,
      status,
      stripePaymentIntentId
    );
    return transactionQueries.findByPaymentIntent.get(stripePaymentIntentId) || { id: result.lastInsertRowid };
  },

  findByPaymentIntent(paymentIntentId) {
    return transactionQueries.findByPaymentIntent.get(paymentIntentId);
  },

  updateStatus(transactionId, status) {
    transactionQueries.updateStatus.run(status, transactionId);
  },

  getByUserId(userId, limit = 50) {
    return transactionQueries.getByUserId.all(userId, limit);
  }
};

// Credit ledger model
const CreditLedger = {
  getByUserId(userId, limit = 50) {
    return creditLedgerQueries.getByUserId.all(userId, limit);
  },

  create(userId, change, reason) {
    creditLedgerQueries.create.run(userId, change, reason);
  }
};

// Referral operations
const referralQueries = {
  create: db.prepare(`
    INSERT INTO referrals (referrer_user_id, referral_code)
    VALUES (?, ?)
  `),
  findByCode: db.prepare('SELECT * FROM referrals WHERE referral_code = ?'),
  findByReferrer: db.prepare('SELECT * FROM referrals WHERE referrer_user_id = ? ORDER BY created_at DESC'),
  updateUsed: db.prepare(`
    UPDATE referrals 
    SET referred_user_id = ?, credits_granted = ?, used_at = CURRENT_TIMESTAMP 
    WHERE referral_code = ? AND referred_user_id IS NULL
  `),
  markReferrerCredited: db.prepare(`
    UPDATE referrals 
    SET referrer_credited = 1 
    WHERE referred_user_id = ? AND referrer_credited = 0
  `),
  getByReferredUser: db.prepare('SELECT * FROM referrals WHERE referred_user_id = ?')
};

// Referral model
const Referral = {
  generateCode(userId) {
    // Generate a unique referral code: first 4 chars of user ID + random string
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userIdPart = userId.toString().padStart(4, '0').substring(0, 4);
    const code = `${userIdPart}${randomPart}`;
    
    // Check if code already exists (very unlikely, but be safe)
    const existing = referralQueries.findByCode.get(code);
    if (existing) {
      // Retry with different random part
      return this.generateCode(userId);
    }
    
    referralQueries.create.run(userId, code);
    return code;
  },

  findByCode(code) {
    return referralQueries.findByCode.get(code);
  },

  useCode(code, referredUserId, creditsToGrant = 0) {
    const referral = this.findByCode(code);
    if (!referral) {
      throw new Error('Invalid referral code');
    }
    if (referral.referred_user_id) {
      throw new Error('Referral code already used');
    }
    if (referral.referrer_user_id === referredUserId) {
      throw new Error('Cannot use your own referral code');
    }
    
    referralQueries.updateUsed.run(referredUserId, code);
    return referralQueries.findByCode.get(code);
  },

  getByReferrer(userId) {
    return referralQueries.findByReferrer.all(userId);
  },

  getByReferredUser(userId) {
    return referralQueries.getByReferredUser.all(userId);
  }
};

// Analytics model
const Analytics = {
  create(sessionId, userId, ipHash, city, stateProvince, country, departmentName, jobType) {
    analyticsQueries.create.run(sessionId, userId || null, ipHash, city || null, stateProvince || null, country || null, departmentName || null, jobType || null);
    return this.findBySession(sessionId);
  },
  
  findBySession(sessionId) {
    return analyticsQueries.findBySession.get(sessionId);
  },
  
  updateQuestions(sessionId, questionsAnswered) {
    analyticsQueries.updateQuestions.run(questionsAnswered, sessionId);
    return this.findBySession(sessionId);
  },
  
  updateLastVisit(sessionId) {
    analyticsQueries.updateLastVisit.run(sessionId);
    return this.findBySession(sessionId);
  },
  
  getAll(limit = 1000) {
    return analyticsQueries.getAll.all(limit);
  },
  
  getStats() {
    return analyticsQueries.getStats.get();
  },
  
  getByDepartment() {
    return analyticsQueries.getByDepartment.all();
  },
  
  getByCountry() {
    return analyticsQueries.getByCountry.all();
  },
  
  getByDate(limit = 30) {
    return analyticsQueries.getByDate.all(limit);
  }
};

module.exports = {
  db,
  User,
  Transaction,
  CreditLedger,
  Analytics,
  Referral,
  userQueries,
  analyticsQueries,
  referralQueries
};
