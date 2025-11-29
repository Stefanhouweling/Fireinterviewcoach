const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Initialize PostgreSQL connection
// Uses DATABASE_URL from environment (Render PostgreSQL provides this automatically)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Helper function to execute queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log('Slow query:', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Query error:', { text, error: error.message });
    throw error;
  }
}

// Initialize database schema
async function initializeSchema() {
  try {
    // Create tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT,
        name VARCHAR(255),
        provider VARCHAR(50) DEFAULT 'email',
        provider_id VARCHAR(255),
        credits_balance INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
      CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        change INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pack_id VARCHAR(100) NOT NULL,
        credits_purchased INTEGER NOT NULL,
        amount_paid_cents INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        status VARCHAR(50) DEFAULT 'pending',
        stripe_payment_intent_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS analytics_visits (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_hash VARCHAR(255),
        city VARCHAR(255),
        state_province VARCHAR(255),
        country VARCHAR(255),
        department_name VARCHAR(255),
        job_type VARCHAR(255),
        questions_answered INTEGER DEFAULT 0,
        visit_count INTEGER DEFAULT 1,
        first_visit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_visit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_visits(session_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_visits(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics_visits(country);
      CREATE INDEX IF NOT EXISTS idx_analytics_department ON analytics_visits(department_name);
      CREATE INDEX IF NOT EXISTS idx_analytics_first_visit ON analytics_visits(first_visit_at);
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        referral_code VARCHAR(50) UNIQUE NOT NULL,
        credits_granted INTEGER DEFAULT 0,
        referrer_credited INTEGER DEFAULT 0,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
    `);

    // Migration: Add visit_count column if it doesn't exist
    try {
      await query('SELECT visit_count FROM analytics_visits LIMIT 1');
    } catch (e) {
      console.log('Adding visit_count column to analytics_visits table...');
      await query('ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 1');
      await query('UPDATE analytics_visits SET visit_count = 1 WHERE visit_count IS NULL');
      console.log('Migration complete: visit_count column added');
    }

    // Migration: Add onboarding data columns to users table
    try {
      await query('SELECT city FROM users LIMIT 1');
    } catch (e) {
      console.log('Adding onboarding data columns to users table...');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(255)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS state_province VARCHAR(255)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(255)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS department_name VARCHAR(255)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS job_type VARCHAR(100)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_preference VARCHAR(50)');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_text TEXT');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_analysis JSONB');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS city_research JSONB');
      console.log('Migration complete: onboarding data columns added');
    }

    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Schema initialization error:', error);
    throw error;
  }
}

// Initialize schema on module load
initializeSchema().catch(err => {
  console.error('Failed to initialize database schema:', err);
  process.exit(1);
});

// User model
const User = {
  async create(email, password, name = null, provider = 'email', providerId = null) {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = await query(`
      INSERT INTO users (email, password_hash, name, provider, provider_id, credits_balance)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [email, passwordHash, name, provider, providerId, 0]);
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0] || null;
  },
  
  async findByProvider(provider, providerId) {
    const result = await query(
      'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
      [provider, providerId]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async verifyPassword(user, password) {
    if (!user.password_hash) return false;
    return await bcrypt.compare(password, user.password_hash);
  },

  async updateCredits(userId, newBalance) {
    await query(
      'UPDATE users SET credits_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, userId]
    );
    return this.findById(userId);
  },

  async addCredits(userId, amount, reason) {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');
    
    const newBalance = user.credits_balance + amount;
    await this.updateCredits(userId, newBalance);
    
    // Log in credit ledger
    await CreditLedger.create(userId, amount, reason);
    
    return this.findById(userId);
  },

  async deductCredit(userId, reason) {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');
    
    if (user.credits_balance <= 0) {
      throw new Error('Insufficient credits');
    }
    
    const newBalance = user.credits_balance - 1;
    await this.updateCredits(userId, newBalance);
    
    // Log in credit ledger
    await CreditLedger.create(userId, -1, reason);
    
    return this.findById(userId);
  },

  async updateProfile(userId, name) {
    await query(
      'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [name, userId]
    );
    return this.findById(userId);
  },

  async updateOnboardingData(userId, onboardingData) {
    const {
      city,
      stateProvince,
      country,
      departmentName,
      jobType,
      voicePreference,
      resumeText,
      resumeAnalysis,
      cityResearch
    } = onboardingData;

    await query(
      `UPDATE users SET 
        city = COALESCE($1, city),
        state_province = COALESCE($2, state_province),
        country = COALESCE($3, country),
        department_name = COALESCE($4, department_name),
        job_type = COALESCE($5, job_type),
        voice_preference = COALESCE($6, voice_preference),
        resume_text = COALESCE($7, resume_text),
        resume_analysis = COALESCE($8, resume_analysis),
        city_research = COALESCE($9, city_research),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10`,
      [city, stateProvince, country, departmentName, jobType, voicePreference, resumeText, resumeAnalysis, cityResearch, userId]
    );
    return this.findById(userId);
  },

  async getOnboardingData(userId) {
    const user = await this.findById(userId);
    if (!user) return null;

    return {
      city: user.city,
      stateProvince: user.state_province,
      country: user.country,
      departmentName: user.department_name,
      jobType: user.job_type,
      voicePreference: user.voice_preference,
      resumeText: user.resume_text,
      resumeAnalysis: user.resume_analysis,
      cityResearch: user.city_research
    };
  }
};

// Transaction model
const Transaction = {
  async create(userId, packId, creditsPurchased, amountPaidCents, currency = 'usd', status = 'pending', stripePaymentIntentId = null) {
    const result = await query(`
      INSERT INTO transactions (user_id, pack_id, credits_purchased, amount_paid_cents, currency, status, stripe_payment_intent_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [userId, packId, creditsPurchased, amountPaidCents, currency, status, stripePaymentIntentId]);
    
    if (stripePaymentIntentId) {
      const found = await this.findByPaymentIntent(stripePaymentIntentId);
      if (found) return found;
    }
    return result.rows[0];
  },

  async findByPaymentIntent(paymentIntentId) {
    const result = await query(
      'SELECT * FROM transactions WHERE stripe_payment_intent_id = $1',
      [paymentIntentId]
    );
    return result.rows[0] || null;
  },

  async updateStatus(transactionId, status) {
    await query('UPDATE transactions SET status = $1 WHERE id = $2', [status, transactionId]);
  },

  async getByUserId(userId, limit = 50) {
    const result = await query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows;
  }
};

// Credit ledger model
const CreditLedger = {
  async getByUserId(userId, limit = 50) {
    const result = await query(
      'SELECT * FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows;
  },

  async create(userId, change, reason) {
    await query(
      'INSERT INTO credit_ledger (user_id, change, reason) VALUES ($1, $2, $3)',
      [userId, change, reason]
    );
  }
};

// Referral model
const Referral = {
  async generateCode(userId) {
    // Generate a unique referral code
    let code;
    let exists = true;
    while (exists) {
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const userIdPart = userId.toString().padStart(4, '0').substring(0, 4);
      code = `${userIdPart}${randomPart}`;
      
      const existing = await this.findByCode(code);
      exists = !!existing;
    }
    
    await query(
      'INSERT INTO referrals (referrer_user_id, referral_code) VALUES ($1, $2)',
      [userId, code]
    );
    return code;
  },

  async findByCode(code) {
    const result = await query('SELECT * FROM referrals WHERE referral_code = $1', [code]);
    return result.rows[0] || null;
  },

  async useCode(code, referredUserId, creditsToGrant = 0) {
    const referral = await this.findByCode(code);
    if (!referral) {
      throw new Error('Invalid referral code');
    }
    if (referral.referred_user_id) {
      throw new Error('Referral code already used');
    }
    if (referral.referrer_user_id === referredUserId) {
      throw new Error('Cannot use your own referral code');
    }
    
    // PREVENT ABUSE: Check if this user has already used ANY referral code from this referrer
    // This prevents the same user from using multiple referral codes from the same person
    const existingUsage = await query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 AND referred_user_id = $2',
      [referral.referrer_user_id, referredUserId]
    );
    if (existingUsage.rows.length > 0) {
      throw new Error('You have already used a referral code from this person. Each account can only use one referral code per referrer. Please create a new account to use a different referral code.');
    }
    
    await query(`
      UPDATE referrals 
      SET referred_user_id = $1, used_at = CURRENT_TIMESTAMP 
      WHERE referral_code = $2 AND referred_user_id IS NULL
    `, [referredUserId, code]);
    
    return this.findByCode(code);
  },

  async getByReferrer(userId) {
    const result = await query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },

  async getByReferredUser(userId) {
    const result = await query('SELECT * FROM referrals WHERE referred_user_id = $1', [userId]);
    return result.rows;
  }
};

// Analytics model
const Analytics = {
  async create(sessionId, userId, ipHash, city, stateProvince, country, departmentName, jobType) {
    await query(`
      INSERT INTO analytics_visits (session_id, user_id, ip_hash, city, state_province, country, department_name, job_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [sessionId, userId || null, ipHash, city || null, stateProvince || null, country || null, departmentName || null, jobType || null]);
    return this.findBySession(sessionId);
  },
  
  async findBySession(sessionId) {
    const result = await query('SELECT * FROM analytics_visits WHERE session_id = $1', [sessionId]);
    return result.rows[0] || null;
  },
  
  async updateQuestions(sessionId, questionsAnswered) {
    await query(
      'UPDATE analytics_visits SET questions_answered = $1, last_visit_at = CURRENT_TIMESTAMP WHERE session_id = $2',
      [questionsAnswered, sessionId]
    );
    return this.findBySession(sessionId);
  },
  
  async updateLastVisit(sessionId) {
    await query(
      'UPDATE analytics_visits SET last_visit_at = CURRENT_TIMESTAMP, visit_count = visit_count + 1 WHERE session_id = $1',
      [sessionId]
    );
    return this.findBySession(sessionId);
  },
  
  async getAll(limit = 1000) {
    const result = await query(
      'SELECT * FROM analytics_visits ORDER BY first_visit_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  },
  
  async getStats() {
    // Get analytics stats
    const analyticsResult = await query(`
      SELECT 
        SUM(visit_count) as total_visits,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) as registered_users_with_visits,
        SUM(questions_answered) as total_questions,
        COUNT(DISTINCT country) as countries,
        COUNT(DISTINCT department_name) as departments
      FROM analytics_visits
    `);
    
    // Get total registered users from users table (more accurate)
    const usersResult = await query(`
      SELECT COUNT(*) as total_registered_users
      FROM users
    `);
    
    return {
      ...analyticsResult.rows[0],
      registered_users: parseInt(usersResult.rows[0].total_registered_users) || 0
    };
  },
  
  async getByDepartment() {
    const result = await query(`
      SELECT department_name, COUNT(*) as count 
      FROM analytics_visits 
      WHERE department_name IS NOT NULL 
      GROUP BY department_name 
      ORDER BY count DESC
    `);
    return result.rows;
  },
  
  async getByCountry() {
    const result = await query(`
      SELECT country, COUNT(*) as count 
      FROM analytics_visits 
      WHERE country IS NOT NULL 
      GROUP BY country 
      ORDER BY count DESC
    `);
    return result.rows;
  },
  
  async getByDate(limit = 30) {
    const result = await query(`
      SELECT DATE(first_visit_at) as date, COUNT(*) as count 
      FROM analytics_visits 
      GROUP BY DATE(first_visit_at) 
      ORDER BY date DESC 
      LIMIT $1
    `, [limit]);
    return result.rows;
  }
};

// Export query function for direct use
const db = {
  query,
  pool
};

// Legacy exports for compatibility (will be removed after migration)
const userQueries = {};
const analyticsQueries = {};
const referralQueries = {};

module.exports = {
  db,
  query,
  User,
  Transaction,
  CreditLedger,
  Analytics,
  Referral,
  userQueries,
  analyticsQueries,
  referralQueries
};
