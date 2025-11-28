const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(path.join(dataDir, 'fireinterviewcoach.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT,
    credits_balance INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

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
`);

// User operations
const userQueries = {
  create: db.prepare(`
    INSERT INTO users (email, password_hash, name, credits_balance)
    VALUES (?, ?, ?, ?)
  `),
  findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  updateCredits: db.prepare('UPDATE users SET credits_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  updateProfile: db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
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

// User model
const User = {
  async create(email, password, name = null) {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = userQueries.create.run(email, passwordHash, name, 0);
    return this.findById(result.lastInsertRowid);
  },

  findByEmail(email) {
    return userQueries.findByEmail.get(email);
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
  }
};

module.exports = {
  db,
  User,
  Transaction,
  CreditLedger
};
