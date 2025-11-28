require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
// Use node-fetch for external API calls (Nominatim)
const fetchModule = require('node-fetch');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { User, Transaction, CreditLedger, Analytics, Referral, referralQueries } = require('./db');
const crypto = require('crypto');
// Import question bank
const { getRandomQuestion, getQuestions, getQuestionStats } = require('./questionBank');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const ANALYTICS_SECRET = process.env.ANALYTICS_SECRET || 'change-this-secret-key-for-analytics';

// Helper function to hash IP addresses for privacy
function hashIP(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + ANALYTICS_SECRET).digest('hex').substring(0, 16);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fire-interview-coach.onrender.com';
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow the frontend URL
    if (origin === FRONTEND_URL || origin === 'https://fire-interview-coach.onrender.com' || origin === 'http://localhost:3000') {
      return callback(null, true);
    }
    
    // In development, allow localhost
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie']
}));
app.use(express.json());
app.use(cookieParser());

// Helper to get client IP (respects proxies)
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         null;
}

// Authentication middleware
function authenticateToken(req, res, next) {
  // Try to get token from cookie first, then from Authorization header
  const token = req.cookies?.authToken || req.headers?.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('No token found - cookies:', Object.keys(req.cookies || {}), 'auth header:', !!req.headers?.authorization);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('Token verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth - doesn't fail if no token
function optionalAuth(req, res, next) {
  const token = req.cookies?.authToken || req.headers?.authorization?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Invalid token, but continue without user
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  next();
}

// Root route
app.get('/', (req, res) => {
  res.json({ 
    service: 'Fire Interview Coach API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      config: 'GET /api/config',
      auth: {
        signup: 'POST /api/auth/signup',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        google: 'POST /api/auth/google',
        profile: 'PUT /api/auth/profile',
        purchaseHistory: 'GET /api/auth/purchase-history'
      },
      analytics: {
        visit: 'POST /api/analytics/visit',
        question: 'POST /api/analytics/question',
        dashboard: 'GET /api/analytics/dashboard?secret=YOUR_SECRET'
      },
      credits: {
        createCheckout: 'POST /api/credits/create-checkout-session',
        webhook: 'POST /api/credits/webhook',
        balance: 'GET /api/credits/balance'
      },
      testMapbox: 'GET /api/test-mapbox',
      mapboxToken: 'GET /api/mapbox-token',
      mapboxSearch: 'GET /api/mapbox-search',
      question: 'POST /api/question',
      followup: 'POST /api/followup',
      analyze: 'POST /api/analyze-answer',
      parseResume: 'POST /api/parse-resume',
      tts: 'POST /api/tts',
      researchCity: 'POST /api/research-city',
      searchLocation: 'POST /api/search-location',
      feedback: 'POST /api/feedback',
      areasToWorkOn: 'POST /api/areas-to-work-on (generate), GET /api/areas-to-work-on (retrieve)'
    },
    message: 'API is running. Use the endpoints above to interact with the service.'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fire Interview Coach API is running' });
});

// GET /api/config - Get public configuration (like Google Client ID)
app.get('/api/config', (req, res) => {
  const hasGoogleClientId = !!GOOGLE_CLIENT_ID;
  console.log('[CONFIG] Request received - GOOGLE_CLIENT_ID exists:', hasGoogleClientId);
  console.log('[CONFIG] GOOGLE_CLIENT_ID length:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.length : 0);
  console.log('[CONFIG] GOOGLE_CLIENT_ID prefix:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'null');
  
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    configured: hasGoogleClientId,
    backendUrl: process.env.FRONTEND_URL || 'https://fire-interview-coach.onrender.com'
  });
});

// GET /api/analytics/check-secret - Check if analytics secret is configured (for debugging)
app.get('/api/analytics/check-secret', (req, res) => {
  const isConfigured = !!ANALYTICS_SECRET && ANALYTICS_SECRET !== 'change-this-secret-key-for-analytics';
  res.json({
    configured: isConfigured,
    secretLength: ANALYTICS_SECRET ? ANALYTICS_SECRET.length : 0,
    firstChars: ANALYTICS_SECRET ? ANALYTICS_SECRET.substring(0, 8) + '...' : 'not set',
    hint: isConfigured ? 'Secret is configured. Use it in the dashboard URL.' : 'ANALYTICS_SECRET not set or using default value. Set it in Render environment variables.'
  });
});

// ========== AUTHENTICATION ENDPOINTS ==========

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, trialCredits, referralCode } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Create user
    const user = await User.create(email, password, name);
    
    // Handle referral code if provided
    if (referralCode) {
      try {
        const codeUpper = referralCode.toUpperCase().trim();
        
        // Special test referral code for unlimited credits
        if (codeUpper === 'TEST' || codeUpper === 'UNLIMITED' || codeUpper === 'DEV') {
          const testCredits = 9999; // Effectively unlimited for testing
          await User.addCredits(user.id, testCredits, `Test referral code ${codeUpper} - unlimited credits for testing`);
          console.log(`Test referral code ${codeUpper} used by user ${user.id} - granted ${testCredits} credits`);
        } else {
          // Regular referral code - track it
          await Referral.useCode(referralCode, user.id, 0);
          console.log(`Referral code ${referralCode} used by user ${user.id} - referrer will get credits when they complete first question`);
          
          // SPECIAL CASE: If user used all trial credits before signing up (trialCredits === 0),
          // grant them 1 full access credit so they can complete that first question for the referrer
          if (trialCredits === 0 || (trialCredits !== undefined && parseInt(trialCredits) === 0)) {
            await User.addCredits(user.id, 1, `Referral code bonus - 1 credit to complete first question (trial credits already used)`);
            console.log(`[REFERRAL] Granted 1 credit to user ${user.id} who used trial credits before signup with referral code ${referralCode}`);
          }
        }
      } catch (refError) {
        console.error('Referral code error:', refError.message);
        // Return error to frontend so user knows why referral code failed
        return res.status(400).json({ 
          error: 'Referral code error', 
          message: refError.message,
          referralCodeError: true
        });
      }
    }
    
    // Transfer trial credits if provided
    if (trialCredits && trialCredits > 0) {
      await User.addCredits(user.id, trialCredits, 'Trial credits transferred on signup');
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Set cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
    };
    
    res.cookie('authToken', token, cookieOptions);
    
    // Refresh user from database to get latest credits after any updates
    const freshUser = await User.findById(user.id);
    console.log(`[SIGNUP] User ${freshUser.id} (${freshUser.email}) - Credits: ${freshUser.credits_balance}`);
    res.json({
      success: true,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        name: freshUser.name,
        credits_balance: freshUser.credits_balance
      },
      token // Include token in response for localStorage fallback
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account', message: error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, trialCredits, referralCode, rememberMe } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const isValid = await User.verifyPassword(user, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Handle referral code if provided (only for new users with 0 credits)
    if (referralCode && user.credits_balance === 0) {
      try {
        const codeUpper = referralCode.toUpperCase().trim();
        
        // Special test referral code for unlimited credits
        if (codeUpper === 'TEST' || codeUpper === 'UNLIMITED' || codeUpper === 'DEV') {
          const testCredits = 9999; // Effectively unlimited for testing
          await User.addCredits(user.id, testCredits, `Test referral code ${codeUpper} - unlimited credits for testing`);
          console.log(`Test referral code ${codeUpper} used by user ${user.id} - granted ${testCredits} credits`);
        } else {
          // Regular referral code - track it
          await Referral.useCode(referralCode, user.id, 0);
          console.log(`Referral code ${referralCode} used by user ${user.id} - referrer will get credits when they complete first question`);
          
          // SPECIAL CASE: If user used all trial credits before logging in (trialCredits === 0),
          // grant them 1 full access credit so they can complete that first question for the referrer
          if (trialCredits === 0 || (trialCredits !== undefined && parseInt(trialCredits) === 0)) {
            await User.addCredits(user.id, 1, `Referral code bonus - 1 credit to complete first question (trial credits already used)`);
            console.log(`[REFERRAL] Granted 1 credit to user ${user.id} who used trial credits before login with referral code ${referralCode}`);
          }
        }
      } catch (refError) {
        console.error('Referral code error:', refError.message);
        // Return error to frontend so user knows why referral code failed
        return res.status(400).json({ 
          error: 'Referral code error', 
          message: refError.message,
          referralCodeError: true
        });
      }
    }
    
    // Transfer trial credits ONLY if user has 0 credits (first time transfer, not on every login)
    // This prevents trial credits from being added repeatedly on every login
    if (trialCredits && trialCredits > 0 && user.credits_balance === 0) {
      await User.addCredits(user.id, trialCredits, 'Trial credits transferred on login');
      console.log(`[TRIAL CREDITS] Transferred ${trialCredits} trial credits to user ${user.id} on first login`);
    } else if (trialCredits && trialCredits > 0 && user.credits_balance > 0) {
      console.log(`[TRIAL CREDITS] Skipped transfer - user ${user.id} already has ${user.credits_balance} credits`);
    }
    
    // Generate JWT token with extended expiration if "Remember Me" is checked
    const tokenExpiration = rememberMe ? '365d' : '30d'; // 1 year if remember me, 30 days otherwise
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: tokenExpiration }
    );
    
    // Set cookie with extended expiration if "Remember Me" is checked
    const cookieMaxAge = rememberMe ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; // 1 year or 30 days
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
    };
    
    res.cookie('authToken', token, cookieOptions);
    
    // Refresh user from database to get latest credits after any updates
    const freshUser = await User.findById(user.id);
    console.log(`[LOGIN] User ${freshUser.id} (${freshUser.email}) - Credits: ${freshUser.credits_balance}`);
    res.json({
      success: true,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        name: freshUser.name,
        credits_balance: freshUser.credits_balance
      },
      token // Include token in response for localStorage fallback
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login', message: error.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/google - Google OAuth sign-in
app.post('/api/auth/google', async (req, res) => {
  try {
    console.log('Google auth request received');
    const { idToken, accessToken, userInfo, trialCredits } = req.body;
    
    // Check if Google OAuth is configured
    if (!GOOGLE_CLIENT_ID || !googleClient) {
      console.error('Google OAuth not configured - GOOGLE_CLIENT_ID:', !!GOOGLE_CLIENT_ID, 'googleClient:', !!googleClient);
      return res.status(500).json({ error: 'Google OAuth not configured on server' });
    }
    
    let email, name, providerId;
    
    // Support both ID token (preferred) and access token (fallback)
    if (idToken) {
      console.log('Verifying ID token...');
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        providerId = payload.sub;
        email = payload.email;
        name = payload.name;
        console.log('ID token verified - email:', email, 'name:', name);
      } catch (verifyError) {
        console.error('ID token verification failed:', verifyError);
        return res.status(401).json({ error: 'Invalid ID token', message: verifyError.message });
      }
    } else if (accessToken && userInfo) {
      console.log('Verifying access token...');
      // Fallback: verify access token and use userInfo
      try {
        const verifyRes = await fetchModule(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
        if (!verifyRes.ok) {
          const errorText = await verifyRes.text();
          console.error('Token verification failed:', verifyRes.status, errorText);
          return res.status(401).json({ error: 'Invalid access token' });
        }
        
        const tokenInfo = await verifyRes.json();
        providerId = tokenInfo.user_id || userInfo.id;
        email = userInfo.email;
        name = userInfo.name || (userInfo.given_name + ' ' + (userInfo.family_name || ''));
        console.log('Access token verified - email:', email, 'name:', name);
      } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Failed to verify access token', message: error.message });
      }
    } else {
      console.error('Missing tokens - idToken:', !!idToken, 'accessToken:', !!accessToken, 'userInfo:', !!userInfo);
      return res.status(400).json({ error: 'ID token or access token is required' });
    }
    
    if (!email) {
      console.error('No email extracted from Google Sign-In');
      return res.status(400).json({ error: 'Email is required from Google Sign-In' });
    }
    
    if (!providerId) {
      console.error('No provider ID extracted from Google Sign-In');
      return res.status(400).json({ error: 'Provider ID is required from Google Sign-In' });
    }
    
    // Find or create user
    console.log('Looking up user by provider:', providerId);
    let user = await User.findByProvider('google', providerId);
    
    if (!user) {
      console.log('User not found by provider, checking for existing email...');
      console.log(`[GOOGLE AUTH] Searching for email: "${email}"`);
      
      // CRITICAL FIX: Use case-insensitive email lookup (now handled in User.findByEmail)
      // This is the ROOT CAUSE - email lookups were case-sensitive, causing duplicate accounts
      const existingUser = await User.findByEmail(email);
      
      if (existingUser) {
        console.log(`[GOOGLE AUTH] ✅ FOUND EXISTING ACCOUNT - User ID: ${existingUser.id}, Email: ${existingUser.email}, Provider: ${existingUser.provider}, Credits: ${existingUser.credits_balance}`);
        
        // CRITICAL: Link Google account to existing account if it's the same email
        // This handles the case where user signed in with Google on computer, then phone
        if (existingUser.provider === 'google') {
          // Same email, same provider, but different provider_id - update the provider_id to link accounts
          // This allows the same Google account to work across devices
          console.log(`[GOOGLE AUTH] Linking Google account - updating provider_id for existing user ${existingUser.id} (old: ${existingUser.provider_id}, new: ${providerId})`);
          const { query } = require('./db');
          await query('UPDATE users SET provider_id = $1 WHERE id = $2', [providerId, existingUser.id]);
          
          // Refresh user to get updated data
          user = await User.findById(existingUser.id);
          console.log(`[GOOGLE AUTH] ✅ Account linked successfully - User ID: ${user.id}, Credits: ${user.credits_balance}`);
        } else if (existingUser.provider === 'email') {
          // Email/password account exists - link Google to it
          console.log(`[GOOGLE AUTH] Linking Google account to existing email/password account ${existingUser.id}`);
          const { query } = require('./db');
          await query('UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', ['google', providerId, existingUser.id]);
          
          // Refresh user to get updated data
          user = await User.findById(existingUser.id);
          console.log(`[GOOGLE AUTH] ✅ Account linked successfully - User ID: ${user.id}, Credits: ${user.credits_balance}`);
        } else {
          // Different provider - block to prevent account confusion
          console.log(`[GOOGLE AUTH] Email exists with different provider ${existingUser.provider} - blocking`);
          return res.status(409).json({ 
            error: 'An account with this email already exists with a different sign-in method.',
            credits_preserved: existingUser.credits_balance
          });
        }
      } else {
        // No existing user found - create new one
        console.log(`[GOOGLE AUTH] No existing account found for email "${email}" - creating new account`);
        try {
          user = await User.create(email, null, name || email.split('@')[0], 'google', providerId);
          console.log(`[GOOGLE AUTH] New user created - ID: ${user.id}, Email: ${user.email}, Credits: ${user.credits_balance}`);
        } catch (createError) {
          console.error('User creation failed:', createError);
          return res.status(500).json({ error: 'Failed to create user', message: createError.message });
        }
      }
    } else {
      console.log(`[GOOGLE AUTH] Existing user found - ID: ${user.id}, Email: ${user.email}, Credits: ${user.credits_balance}`);
      // CRITICAL: Refresh user from database to ensure we have latest credits
      user = await User.findById(user.id);
      console.log(`[GOOGLE AUTH] Refreshed user credits: ${user.credits_balance}`);
    }
    
    // Handle referral code if provided (for new signups via Google)
    const { referralCode } = req.body;
    if (referralCode && user.credits_balance === 0) {
      try {
        const codeUpper = referralCode.toUpperCase().trim();
        
        // Special test referral code for unlimited credits
        if (codeUpper === 'TEST' || codeUpper === 'UNLIMITED' || codeUpper === 'DEV') {
          const testCredits = 9999; // Effectively unlimited for testing
          await User.addCredits(user.id, testCredits, `Test referral code ${codeUpper} - unlimited credits for testing`);
          console.log(`Test referral code ${codeUpper} used by user ${user.id} - granted ${testCredits} credits`);
        } else {
          // Regular referral code - track it
          await Referral.useCode(referralCode, user.id, 0);
          console.log(`Referral code ${referralCode} used by user ${user.id} - referrer will get credits when they complete first question`);
          
          // SPECIAL CASE: If user used all trial credits before Google sign-in (trialCredits === 0),
          // grant them 1 full access credit so they can complete that first question for the referrer
          if (trialCredits === 0 || (trialCredits !== undefined && parseInt(trialCredits) === 0)) {
            await User.addCredits(user.id, 1, `Referral code bonus - 1 credit to complete first question (trial credits already used)`);
            console.log(`[REFERRAL] Granted 1 credit to user ${user.id} who used trial credits before Google sign-in with referral code ${referralCode}`);
          }
        }
      } catch (refError) {
        console.error('Referral code error:', refError.message);
        // Return error to frontend so user knows why referral code failed
        return res.status(400).json({ 
          error: 'Referral code error', 
          message: refError.message,
          referralCodeError: true
        });
      }
    }
    
    // Transfer trial credits if provided (from localStorage)
    // CRITICAL: Only transfer if user has ZERO credits (not just checking the variable, but the actual DB value)
    // Refresh user again before checking to ensure we have the latest balance
    user = await User.findById(user.id);
    if (trialCredits && trialCredits > 0 && user.credits_balance === 0) {
      console.log('Transferring trial credits:', trialCredits, 'Current balance:', user.credits_balance);
      try {
        await User.addCredits(user.id, trialCredits, 'Trial credits transferred on Google sign-in');
        user = await User.findById(user.id);
        console.log('Trial credits transferred - new balance:', user.credits_balance);
      } catch (creditError) {
        console.error('Failed to transfer trial credits:', creditError);
        // Don't fail the auth, just log the error
      }
    } else if (trialCredits && trialCredits > 0 && user.credits_balance > 0) {
      console.log(`[GOOGLE AUTH] SKIPPING trial credit transfer - user already has ${user.credits_balance} credits (trial credits: ${trialCredits})`);
    }
    
    // Generate JWT token
    console.log('Generating JWT token...');
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Set cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/'
    };
    
    res.cookie('authToken', token, cookieOptions);
    
    // Refresh user from database to get latest credits after any updates
    const freshUser = await User.findById(user.id);
    console.log(`[GOOGLE AUTH] User ${freshUser.id} (${freshUser.email}) - Credits: ${freshUser.credits_balance}`);
    res.json({
      success: true,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        name: freshUser.name,
        credits_balance: freshUser.credits_balance,
        provider: freshUser.provider
      },
      token
    });
  } catch (error) {
    console.error('Google auth error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to authenticate with Google', message: error.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Log credits for debugging
    console.log(`[AUTH/ME] User ${user.id} (${user.email}) - Credits: ${user.credits_balance}`);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      credits_balance: user.credits_balance,
      provider: user.provider || 'email',
      created_at: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

// PUT /api/auth/profile - Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, password, currentPassword } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update name if provided
    if (name !== undefined) {
      await User.updateProfile(user.id, name);
    }
    
    // Update password if provided (only for email/password users)
    if (password && user.provider === 'email') {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      
      const isValid = await User.verifyPassword(user, currentPassword);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      // Update password
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);
      const { query } = require('./db');
      await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, user.id]);
    } else if (password && user.provider !== 'email') {
      return res.status(400).json({ error: 'Password cannot be changed for OAuth accounts' });
    }
    
    // Refresh user data
    const updatedUser = await User.findById(user.id);
    
    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        credits_balance: updatedUser.credits_balance,
        provider: updatedUser.provider || 'email'
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile', message: error.message });
  }
});

// GET /api/auth/purchase-history - Get purchase history
app.get('/api/auth/purchase-history', authenticateToken, async (req, res) => {
  try {
    const transactions = await Transaction.getByUserId(req.user.userId, 50);
    const ledger = await CreditLedger.getByUserId(req.user.userId, 100);
    
    res.json({
      transactions: transactions.map(t => ({
        id: t.id,
        pack_id: t.pack_id,
        credits_purchased: t.credits_purchased,
        amount_paid_cents: t.amount_paid_cents,
        currency: t.currency,
        status: t.status,
        created_at: t.created_at
      })),
      credit_history: ledger.map(l => ({
        id: l.id,
        change: l.change,
        reason: l.reason,
        created_at: l.created_at
      }))
    });
  } catch (error) {
    console.error('Get purchase history error:', error);
    res.status(500).json({ error: 'Failed to get purchase history', message: error.message });
  }
});

// ========== CREDIT ENDPOINTS ==========

// Credit bundle configurations
const CREDIT_BUNDLES = {
  starter: { 
    credits: 20, 
    priceCents: 999, 
    name: 'Foundation',
    description: 'Good for casual practice',
    pricePerCredit: 0.50
  },
  core: { 
    credits: 75, 
    priceCents: 2499, 
    name: 'Execute', 
    isPopular: true,
    description: 'Balanced prep + full feedback',
    pricePerCredit: 0.33
  },
  serious: { 
    credits: 200, 
    priceCents: 4999, 
    name: 'Elevate',
    description: 'Serious interview training',
    pricePerCredit: 0.25,
    isBestValue: true
  },
  heavy: { 
    credits: 500, 
    priceCents: 8999, 
    name: 'Dominate',
    description: 'Used by applicants applying to multiple departments',
    pricePerCredit: 0.18
  }
};

// GET /api/credits/balance
app.get('/api/credits/balance', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      // Anonymous user - return trial credits info
      return res.json({
        isAuthenticated: false,
        credits_balance: 0,
        isTrialUser: true
      });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      isAuthenticated: true,
      credits_balance: user.credits_balance,
      isTrialUser: false
    });
  } catch (error) {
    console.error('Get credits balance error:', error);
    res.status(500).json({ error: 'Failed to get credits balance', message: error.message });
  }
});

// GET /api/credits/bundles - Get available credit bundles
app.get('/api/credits/bundles', (req, res) => {
  res.json({
    bundles: Object.entries(CREDIT_BUNDLES).map(([id, bundle]) => ({
      id,
      name: bundle.name,
      credits: bundle.credits,
      price_cents: bundle.priceCents,
      price_dollars: (bundle.priceCents / 100).toFixed(2),
      price_per_credit: bundle.pricePerCredit ? `$${bundle.pricePerCredit.toFixed(2)}` : null,
      description: bundle.description || '',
      isPopular: bundle.isPopular || false,
      isBestValue: bundle.isBestValue || false
    }))
  });
});

// POST /api/credits/create-checkout-session - Create Stripe checkout session
app.post('/api/credits/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    console.log('Create checkout session request - User:', req.user.userId);
    const { packId } = req.body;
    
    if (!packId || !CREDIT_BUNDLES[packId]) {
      console.error('Invalid pack ID:', packId);
      return res.status(400).json({ error: 'Invalid pack ID' });
    }
    
    const bundle = CREDIT_BUNDLES[packId];
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      console.error('User not found:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Initialize Stripe if not already done
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Stripe not configured - STRIPE_SECRET_KEY missing');
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe initialized, creating checkout session...');
    
    // Create transaction record
    const transaction = await Transaction.create(
      user.id,
      packId,
      bundle.credits,
      bundle.priceCents,
      'usd',
      'pending',
      null
    );
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${bundle.name} Pack - ${bundle.credits} Credits`,
            description: `${bundle.credits} coaching questions with full detailed feedback`
          },
          unit_amount: bundle.priceCents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancel`,
      metadata: {
        userId: user.id.toString(),
        transactionId: transaction.id.toString(),
        packId: packId,
        credits: bundle.credits.toString()
      },
      customer_email: user.email
    });
    
    // Update transaction with payment intent ID
    await Transaction.updateStatus(transaction.id, 'processing');
    
    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session', message: error.message });
  }
});

// POST /api/credits/webhook - Stripe webhook handler
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      const userId = parseInt(session.metadata.userId);
      const transactionId = parseInt(session.metadata.transactionId);
      const credits = parseInt(session.metadata.credits);
      
      // Get user to verify
      const user = await User.findById(userId);
      if (!user) {
        console.error(`User ${userId} not found for webhook`);
        return;
      }
      
      // Add credits to user (transaction was already created in create-checkout-session)
      await User.addCredits(userId, credits, `purchase_${transactionId}`);
      
      // Update transaction status
      await Transaction.updateStatus(transactionId, 'completed');
      
      console.log(`Credits added: ${credits} to user ${userId} from transaction ${transactionId}`);
    } catch (error) {
      console.error('Error processing webhook:', error);
    }
  }
  
  res.json({ received: true });
});

// ========== REFERRAL ENDPOINTS ==========

// GET /api/referrals/my-code - Get or generate user's referral code
app.get('/api/referrals/my-code', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user already has a referral code
    const existingReferrals = await Referral.getByReferrer(user.id);
    let code = existingReferrals.length > 0 ? existingReferrals[0].referral_code : null;
    
    // Generate new code if doesn't exist
    if (!code) {
      code = await Referral.generateCode(user.id);
    }
    
    res.json({ referralCode: code });
  } catch (error) {
    console.error('Get referral code error:', error);
    res.status(500).json({ error: 'Failed to get referral code', message: error.message });
  }
});

// POST /api/referrals/validate - Validate a referral code (for display purposes)
app.post('/api/referrals/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }
    
    const codeUpper = code.toUpperCase().trim();
    
    // Special test referral codes are always valid
    if (codeUpper === 'TEST' || codeUpper === 'UNLIMITED' || codeUpper === 'DEV') {
      return res.json({ valid: true, message: 'Valid test referral code - grants unlimited credits' });
    }
    
    const referral = await Referral.findByCode(code);
    if (!referral) {
      return res.json({ valid: false, message: 'Invalid referral code' });
    }
    
    if (referral.referred_user_id) {
      return res.json({ valid: false, message: 'Referral code already used' });
    }
    
    res.json({ valid: true, message: 'Valid referral code' });
  } catch (error) {
    console.error('Validate referral code error:', error);
    res.status(500).json({ error: 'Failed to validate referral code', message: error.message });
  }
});

// POST /api/referrals/redeem - Redeem a referral code for existing users
app.post('/api/referrals/redeem', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const codeUpper = code.toUpperCase().trim();
    
    // Special test referral codes - always work, even if user has credits
    if (codeUpper === 'TEST' || codeUpper === 'UNLIMITED' || codeUpper === 'DEV') {
      const testCredits = 9999;
      await User.addCredits(user.id, testCredits, `Test referral code ${codeUpper} redeemed`);
      const updatedUser = await User.findById(user.id);
      console.log(`Test referral code ${codeUpper} redeemed by user ${user.id} - granted ${testCredits} credits`);
      return res.json({ success: true, creditsGranted: testCredits, newBalance: updatedUser.credits_balance });
    }
    
    // Regular referral code - just track it, don't grant credits to referred user
    try {
      await Referral.useCode(code, user.id, 0);
      return res.json({ success: true, creditsGranted: 0, message: 'Referral code applied. Referrer will receive credits when you complete your first question.' });
    } catch (refError) {
      return res.status(400).json({ error: refError.message });
    }
  } catch (error) {
    console.error('Redeem referral code error:', error);
    res.status(500).json({ error: 'Failed to redeem referral code', message: error.message });
  }
});

// Test endpoint to verify Mapbox token is configured
app.get('/api/test-mapbox', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  res.json({ 
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    tokenPrefix: token ? token.substring(0, 10) + '...' : 'none'
  });
});

// GET /api/mapbox-token - Return Mapbox token (stored in environment variable)
app.get('/api/mapbox-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return res.status(404).json({ error: 'Mapbox token not configured' });
  }
  res.json({ token: token });
});

// GET /api/mapbox-search - Proxy Mapbox search requests to avoid CORS issues
app.get('/api/mapbox-search', async (req, res) => {
  try {
    const { q, types, limit, session_token } = req.query;
    const token = process.env.MAPBOX_TOKEN;
    
    if (!token) {
      console.error('Mapbox token not configured in environment variables');
      return res.status(500).json({ error: 'Mapbox token not configured' });
    }
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    // Build Mapbox API URL parameters
    const params = new URLSearchParams();
    params.append('q', q);
    params.append('types', types || 'place,locality');
    params.append('limit', limit || '5');
    params.append('access_token', token);
    if (session_token) {
      params.append('session_token', session_token);
    }
    
    const mapboxUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`;
    
    console.log('Proxying Mapbox search request:', { q, types, limit, hasToken: !!token });
    
    // Proxy the request to Mapbox
    const response = await fetchModule(mapboxUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Fire-Interview-Coach-API/1.0'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mapbox API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Mapbox API error: ${response.status}`,
        details: errorText
      });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Mapbox search proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to proxy Mapbox search request',
      message: error.message 
    });
  }
});

// POST /api/user-profile - Create or update user profile
app.post('/api/user-profile', async (req, res) => {
  try {
    const { sessionId, name, city, stateProvince, country, departmentName, jobType, voicePreference, resumeText, resumeAnalysis, cityResearch } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const profile = updateUserProfile(sessionId, {
      name: name || null,
      city: city || null,
      stateProvince: stateProvince || null,
      country: country || null,
      departmentName: departmentName || null,
      jobType: jobType || null,
      voicePreference: voicePreference || null,
      resumeText: resumeText || null,
      resumeAnalysis: resumeAnalysis || null,
      cityResearch: cityResearch || null
    });
    
    res.json({ 
      success: true, 
      profile: {
        sessionId: profile.sessionId,
        name: profile.name,
        city: profile.city,
        stateProvince: profile.stateProvince,
        country: profile.country,
        departmentName: profile.departmentName,
        jobType: profile.jobType,
        voicePreference: profile.voicePreference,
        hasResume: !!profile.resumeText,
        hasCityResearch: !!profile.cityResearch,
        updatedAt: profile.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile', message: error.message });
  }
});

// GET /api/user-profile/:sessionId - Get user profile
app.get('/api/user-profile/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const profile = getUserProfile(sessionId);
    
    res.json({
      sessionId: profile.sessionId,
      name: profile.name,
      city: profile.city,
      stateProvince: profile.stateProvince,
      country: profile.country,
      departmentName: profile.departmentName,
      jobType: profile.jobType,
      voicePreference: profile.voicePreference,
      hasResume: !!profile.resumeText,
      hasCityResearch: !!profile.cityResearch,
      conversationCount: profile.conversationHistory.length,
      askedQuestionsCount: profile.askedQuestions.length,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile', message: error.message });
  }
});

// GET /api/question-stats - Get question bank statistics
app.get('/api/question-stats', (req, res) => {
  try {
    const stats = getQuestionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting question stats:', error);
    res.status(500).json({ error: 'Failed to get question stats', message: error.message });
  }
});

// POST /api/question - Generate a new interview question
app.post('/api/question', async (req, res) => {
  try {
    const { sessionId, resumeText, resumeAnalysis, history, askedQuestions = [], askedCategories = [], practiceMode = "simulation", selectedCategory = "", onboardingData = null, questionType = null, difficulty = null, useQuestionBank = true } = req.body;
    
    // Get or create user profile
    let userProfile = null;
    if (sessionId) {
      userProfile = getUserProfile(sessionId);
      
      // Update profile with latest data if provided
      if (onboardingData) {
        updateUserProfile(sessionId, {
          name: onboardingData.name || userProfile.name,
          city: onboardingData.city || userProfile.city,
          stateProvince: onboardingData.stateProvince || userProfile.stateProvince,
          country: onboardingData.country || userProfile.country,
          departmentName: onboardingData.departmentName || userProfile.departmentName,
          jobType: onboardingData.jobType || userProfile.jobType,
          voicePreference: onboardingData.voicePreference || userProfile.voicePreference,
          cityResearch: onboardingData.cityResearch || userProfile.cityResearch
        });
        userProfile = getUserProfile(sessionId); // Refresh
      }
      
      if (resumeText) {
        updateUserProfile(sessionId, { resumeText });
        userProfile = getUserProfile(sessionId);
      }
      
    if (resumeAnalysis) {
        updateUserProfile(sessionId, { resumeAnalysis });
        userProfile = getUserProfile(sessionId);
      }
      
      // Update conversation history
      if (history && history.length > 0) {
        updateUserProfile(sessionId, { conversationHistory: history });
        userProfile = getUserProfile(sessionId);
      }
      
      // Update asked questions and categories
      if (askedQuestions.length > 0 || askedCategories.length > 0) {
        updateUserProfile(sessionId, { 
          askedQuestions: askedQuestions,
          askedCategories: askedCategories
        });
        userProfile = getUserProfile(sessionId);
      }
    }
    
    // Use profile data if available, otherwise fall back to request data
    const profileName = userProfile?.name || onboardingData?.name || null;
    const profileCity = userProfile?.city || onboardingData?.city || null;
    const profileStateProvince = userProfile?.stateProvince || onboardingData?.stateProvince || null;
    const profileCountry = userProfile?.country || onboardingData?.country || null;
    const profileDepartmentName = userProfile?.departmentName || onboardingData?.departmentName || null;
    const profileJobType = userProfile?.jobType || onboardingData?.jobType || null;
    const profileCityResearch = userProfile?.cityResearch || onboardingData?.cityResearch || null;
    const profileResumeText = userProfile?.resumeText || resumeText || null;
    const profileResumeAnalysis = userProfile?.resumeAnalysis || resumeAnalysis || null;
    const profileHistory = userProfile?.conversationHistory || history || [];
    const profileAskedQuestions = userProfile?.askedQuestions || askedQuestions || [];
    const profileAskedCategories = userProfile?.askedCategories || askedCategories || [];

    // Build comprehensive resume context (use profile data)
    let resumeContext = "";
    if (profileResumeAnalysis) {
      const analysis = profileResumeAnalysis;
      const allJobs = analysis.allJobs || analysis.workHistory || [];
      const jobsList = Array.isArray(allJobs) && allJobs.length > 0 
        ? allJobs.join("; ")
        : (Array.isArray(analysis.workHistory) ? analysis.workHistory.join("; ") : "N/A");
      
      resumeContext = `Resume Summary (COMPLETE - includes ALL jobs, not just fire-related):
- Total Experience: ${analysis.experience || analysis.yearsOfExperience || "N/A"} (includes ALL work experience)
- ALL Past Jobs: ${jobsList}
- Certifications: ${Array.isArray(analysis.certifications) ? analysis.certifications.join(", ") : "None listed"}
- Key Skills: ${Array.isArray(analysis.skills) ? analysis.skills.join(", ") : "General"}
- Education: ${analysis.education ? (Array.isArray(analysis.education) ? analysis.education.join(", ") : analysis.education) : "N/A"}
- Interview Focus Areas: ${Array.isArray(analysis.interviewFocus) ? analysis.interviewFocus.join(", ") : "General competencies"}

Full Resume Analysis: ${JSON.stringify(profileResumeAnalysis)}

IMPORTANT: Reference ALL past jobs and experiences when generating questions, not just fire-related experience. Past jobs in construction, retail, customer service, healthcare, etc. are all valuable for interview questions.`;
    } else if (profileResumeText) {
      resumeContext = `Resume Text (full text for context - includes ALL jobs and experience):
${profileResumeText}

IMPORTANT: Reference ALL past jobs and experiences when generating questions, not just fire-related experience.`;
    } else {
      resumeContext = "No resume provided";
    }
    
    const conversationContext = profileHistory && profileHistory.length > 0
      ? `\n\nPrevious questions asked:\n${profileHistory.slice(-3).map((item, i) => 
          `${i + 1}. Q: ${item.question}\n   A: ${item.answer ? item.answer.slice(0, 200) + "..." : "No answer yet"}`
        ).join("\n")}`
      : "";
    
    // Normalize asked categories (usually sent as lowercase from frontend)
    const normalizedAskedCategories = profileAskedCategories.map(c => String(c).toLowerCase());

    // Base category set we want to cycle through over a session
    const baseCategories = [
      "Behavioural – High Stress",
      "Behavioural – Conflict",
      "Safety & Accountability",
      "Medical / EMR",
      "Teamwork",
      "Community Focus",
      "Resilience",
      "Technical – Fireground"
    ];

    const unusedCategories = baseCategories.filter(
      c => !normalizedAskedCategories.includes(c.toLowerCase())
    );

    const categoryRotationHint = unusedCategories.length > 0
      ? `\n\nCategory rotation hint: The following base categories have NOT been used yet in this session: ${unusedCategories.join(", ")}.\nFor THIS next question, choose ONE of these unused categories and clearly state it as the category.`
      : `\n\nCategory rotation hint: All base categories have been used at least once.\nYou may reuse categories, but vary the scenario and angle significantly from earlier questions.`;

    const diversityContext = profileAskedQuestions.length > 0
      ? `\n\nCRITICAL - Questions already asked in this session (DO NOT repeat these):\n${profileAskedQuestions.slice(-10).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCategories already covered: ${profileAskedCategories.join(", ") || "None"}\n\nYou MUST generate a completely different question that hasn't been asked yet.${categoryRotationHint}`
      : `\n\nNo questions have been asked yet in this session. Start with any one of the base categories: ${baseCategories.join(", ")}. Make the category explicit.`;

    // Build comprehensive user profile context (city, department, job type, name, etc.)
    let userProfileContext = "";
    if (profileCity || profileDepartmentName || profileJobType || profileName) {
      const locationString = profileStateProvince 
        ? `${profileCity}, ${profileStateProvince}, ${profileCountry}`
        : `${profileCity}, ${profileCountry}`;
      
      userProfileContext = `\n\nCOMPREHENSIVE USER PROFILE (USE THIS TO CREATE HIGHLY PERSONALIZED QUESTIONS):
- Candidate Name: ${profileName || "Not provided"}
- Position Type: ${profileJobType || "Not specified"}
- Department: ${profileDepartmentName || "Not specified"}
- Location: ${locationString || "Not specified"}`;
      
      if (profileCityResearch) {
        userProfileContext += `\n\nCity/Department Research:\n${profileCityResearch}\n\nIMPORTANT: RANDOMLY decide whether to incorporate this information. Most questions should be GENERAL and not reference specific departments or cities. Only occasionally (about 20-30% of the time) reference the department name "${profileDepartmentName}" or city-specific details. Make it feel random and natural - most questions should be general firefighter questions that apply to any department.`;
      } else if (profileDepartmentName || profileCity) {
        userProfileContext += `\n\nIMPORTANT: RANDOMLY decide whether to reference the department or city. Most questions should be GENERAL and not mention "${profileDepartmentName}" or "${profileCity}". Only occasionally (about 20-30% of the time) incorporate the department name or location context. Most questions should be general firefighter questions that apply to any department. Make it feel random - don't force personalization into every question.`;
      }
      
      // Add name context if available
      if (profileName) {
        // Use name very randomly - only about 10-15% of the time
        userProfileContext += `\n\nIMPORTANT: The candidate's name is ${profileName}. RANDOMLY decide whether to use it - only about 10-15% of questions should address them by name. Most questions should NOT use their name. Make it feel completely random and natural.`;
      }
    }

    // Determine question strategy based on mode, with heavy emphasis on personalization
    let questionStrategy = "";
    
    // Determine question type: if category is "Situational" or "Behavioral", use that; otherwise random
    let questionTypeToUse;
    if (selectedCategory === "Situational") {
      questionTypeToUse = 'situational';
    } else if (selectedCategory === "Behavioral") {
      questionTypeToUse = 'behavioral';
    } else {
      // Randomly choose between situational and behavioral when no specific category
      questionTypeToUse = questionType || (Math.random() < 0.5 ? 'behavioral' : 'situational');
    }
    
    const difficultyToUse = difficulty || (() => {
      const rand = Math.random();
      if (rand < 0.3) return 'easy';
      if (rand < 0.7) return 'medium';
      return 'hard';
    })();
    
    // Get a question from the bank for inspiration (matching type, difficulty, and category)
    let questionBankReference = null;
    let bankReferenceText = "";
    
    // Try to get a question from the bank that matches the criteria
    if (useQuestionBank) {
      try {
        // Map selectedCategory to question bank category if needed
        let bankCategory = selectedCategory;
        if (selectedCategory === "City & Department Specific") {
          bankCategory = null; // Let bank provide any category for inspiration
        }
        
        questionBankReference = getRandomQuestion(
          questionTypeToUse,
          difficultyToUse,
          bankCategory,
          profileAskedQuestions || []
        );
        
        if (questionBankReference) {
          console.log(`[QUESTION BANK] Selected question for inspiration: ${questionBankReference.category} - ${questionBankReference.question.substring(0, 60)}...`);
        }
      } catch (error) {
        console.error('[QUESTION BANK] Error getting question reference:', error);
      }
    }
    
    // Build personalization context
    let personalizationContext = "";
    if (profileName) {
      personalizationContext += `\n- Candidate's name: ${profileName} (RANDOMLY decide - only use name in about 10-15% of questions. Most questions should NOT use their name. Make it feel completely random.)`;
    }
    if (profileDepartmentName) {
      personalizationContext += `\n- Department: ${profileDepartmentName} (RANDOMLY decide - only reference department in about 20-30% of questions. Most questions should be GENERAL and not mention the department. Make it feel random.)`;
    }
    if (profileCity) {
      personalizationContext += `\n- City: ${profileCity}${profileStateProvince ? `, ${profileStateProvince}` : ''}${profileCountry ? `, ${profileCountry}` : ''} (RANDOMLY decide - only reference city in about 20-30% of questions. Most questions should be GENERAL. Make it feel random.)`;
    }
    if (profileJobType) {
      personalizationContext += `\n- Position: ${profileJobType}`;
    }
    if (profileResumeAnalysis) {
      const allJobs = profileResumeAnalysis.allJobs || profileResumeAnalysis.workHistory || [];
      const jobsText = Array.isArray(allJobs) && allJobs.length > 0 
        ? `All past jobs: ${allJobs.slice(0, 5).join("; ")}${allJobs.length > 5 ? "..." : ""}`
        : "Work history available";
      personalizationContext += `\n- Resume highlights: ${profileResumeAnalysis.experience || 'N/A'} total experience (ALL jobs), ${jobsText}, Certifications: ${Array.isArray(profileResumeAnalysis.certifications) ? profileResumeAnalysis.certifications.slice(0, 3).join(", ") : 'None'}, Key skills: ${Array.isArray(profileResumeAnalysis.skills) ? profileResumeAnalysis.skills.slice(0, 5).join(", ") : 'General'}`;
    }
    if (profileCityResearch) {
      personalizationContext += `\n- City/Department research available: Use specific details from this research to make questions feel authentic and personalized to this exact department and location.`;
    }
    
    if (practiceMode === "specific" && selectedCategory) {
      if (selectedCategory === "Situational") {
        questionStrategy = `Generate a SITUATIONAL question (${difficultyToUse} difficulty). A situational question presents a hypothetical scenario and asks what the candidate would do.${personalizationContext}

CRITICAL REQUIREMENTS:
- This MUST be a SITUATIONAL question (hypothetical scenario)
- Use formats like: "How would you handle...", "What would you do if...", "How would you approach...", "Imagine you are...", "You are faced with..."
- DO NOT use "Tell us about a time..." or "Describe a situation where..." (those are behavioral questions)
- Present a specific scenario or situation laid out for the candidate
- Ask them to explain what they would do in that situation
- Test their judgment, decision-making, chain of command understanding, ethics, and approach
- RANDOMLY decide whether to personalize - most questions should be GENERAL
- Only occasionally (20-30%) reference department/city, very rarely (10-15%) use their name
- Most questions should be general firefighter questions that apply to any candidate

EXAMPLES OF GOOD SITUATIONAL QUESTIONS:
- "How would you handle a situation if you felt you weren't treated fairly?"
- "Your Captain orders you to get a radio from the engine. On the way a senior fire officer stops you and asks you to deliver an axe to the team on the roof right away. How would you handle this?"
- "How would you handle a leader where you question their leadership, would you still respect them?"
- "Imagine you're on a call and you notice a safety violation that could put your team at risk. How would you address this?"
- "What would you do if you saw a fellow firefighter engaging in behavior that violates department policy?"

The question should present a clear situation and ask what they would do, not ask about past experiences.`;
      } else if (selectedCategory === "Behavioral") {
        questionStrategy = `Generate a BEHAVIORAL question (${difficultyToUse} difficulty). A behavioral question asks about past experiences and past behavior.${personalizationContext}

CRITICAL REQUIREMENTS:
- This MUST be a BEHAVIORAL question (past experiences)
- Use formats like: "Tell us about a time when...", "Describe a situation where...", "Give me an example of...", "Share an experience where...", "Can you recall a time when..."
- DO NOT use "How would you handle..." or "What would you do if..." (those are situational questions)
- Ask about actual past experiences and behaviors
- Test their ability to reflect on past actions and learn from experiences
- RANDOMLY decide whether to personalize - most questions should be GENERAL
- Only occasionally (20-30%) reference department/city, very rarely (10-15%) use their name
- Most questions should be general firefighter questions that apply to any candidate

EXAMPLES OF GOOD BEHAVIORAL QUESTIONS:
- "Tell us about a time when you had to work under extreme pressure."
- "Describe a situation where you had to resolve a conflict with a team member."
- "Give me an example of a time when you had to make a difficult decision quickly."
- "Share an experience where you had to adapt to a sudden change in plans."
- "Can you recall a time when you had to step up and take leadership in a challenging situation?"

The question should ask about past experiences and behaviors, not hypothetical future scenarios.`;
      } else if (selectedCategory === "Resume-Based") {
        questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) SPECIFICALLY personalized to this candidate's COMPLETE resume and background.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- Reference their ACTUAL experience from ALL past jobs (fire-related AND non-fire-related jobs like construction, retail, customer service, healthcare, etc.)
- Reference their certifications, skills, and achievements from ALL their work experience
- RANDOMLY decide whether to use their name (${profileName ? profileName : 'if provided'}) - only about 10-15% of the time
- Connect the question to their COMPLETE background while still testing general firefighter competencies
- Make it feel like the panel researched their ENTIRE resume and is asking a tailored question
- RANDOMLY decide whether to mention department - only about 20-30% of the time
- Examples: 
  * If they have construction experience, ask about safety protocols or working in teams
  * If they have customer service experience, ask about communication or conflict resolution
  * If they have healthcare experience, ask about medical scenarios or patient care
  * If they have retail experience, ask about following procedures or handling stress
  * If they have EMR certification, ask about a medical scenario
  * Draw from ALL their past jobs, not just fire-related experience

IMPORTANT: Reference ALL their work history, not just fire-related jobs. Past jobs provide valuable transferable skills and experiences that are relevant to firefighting. However, keep it general enough that it tests their judgment and understanding, not just their specific past. Mix resume-specific elements with general firefighter competencies.`;
      } else if (selectedCategory === "City & Department Specific") {
        questionStrategy = `CRITICAL: Generate a KNOWLEDGE-TESTING question (NOT behavioral or situational) that asks about SPECIFIC FACTS regarding ${profileCity || 'the city'} and ${profileDepartmentName || 'the department'}.${personalizationContext}

THIS CATEGORY IS FOR KNOWLEDGE TESTS ONLY - NOT BEHAVIORAL/SITUATIONAL QUESTIONS:
- DO NOT ask "How would you handle..." or "Tell us about a time..."
- DO NOT ask about hypothetical scenarios or past experiences
- DO ask "Who is...", "What is...", "How many...", "When did...", "What is the..."
- The question MUST test factual knowledge that a well-prepared candidate should know

REQUIRED KNOWLEDGE AREAS TO TEST (use city research data):
1. City Leadership: "Who is the mayor of ${profileCity || 'this city'}?" "What are the mayor's priorities for emergency services?"
2. Fire Department Leadership: "Who is the fire chief of ${profileDepartmentName || 'this department'}?" "Who are the deputy chiefs?"
3. Department Details: "How many members does ${profileDepartmentName || 'the department'} have?" "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
4. Union Information: "What is the local union number for ${profileDepartmentName || 'the fire department'}?" "What union represents ${profileDepartmentName || 'this department'}?"
5. Department History: "When was ${profileDepartmentName || 'this department'} established?" "What is the history of ${profileDepartmentName || 'this department'}?"
6. City/Department Facts: "What are the main industries in ${profileCity || 'this city'}?" "What challenges does ${profileCity || 'this city'} face?"

QUESTION FORMAT EXAMPLES (USE THESE STYLES - VARIETY IS KEY):
Leadership & Structure:
- "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?"
- "Who are the deputy chiefs of ${profileDepartmentName || 'this department'}?"
- "What is the organizational structure of ${profileDepartmentName || 'this department'}?"
- "Who is the mayor of ${profileCity || 'this city'}?"
- "What city council members serve on the public safety committee for ${profileCity || 'this city'}?"

Union & Labor:
- "What is the local union number for ${profileDepartmentName || 'the fire department'} in ${profileCity || 'this city'}?"
- "What union represents ${profileDepartmentName || 'this department'}?"
- "Who is the union president for ${profileDepartmentName || 'this department'}?"

Department Size & Resources:
- "How many members does ${profileDepartmentName || 'the department'} currently have?"
- "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
- "How many apparatus/engines does ${profileDepartmentName || 'the department'} have?"
- "What is the annual budget for ${profileDepartmentName || 'this department'}?"

Department History:
- "When was ${profileDepartmentName || 'this department'} first established as a career department?"
- "Can you tell us about the history of ${profileDepartmentName || 'this department'}?"
- "What are some significant milestones in ${profileDepartmentName || 'this department'}'s history?"
- "When did ${profileDepartmentName || 'this department'} transition from volunteer to career?"

City & Department Context:
- "What are the main industries in ${profileCity || 'this city'}?"
- "What unique challenges does ${profileCity || 'this city'} face that affect fire department operations?"
- "What is the population of ${profileCity || 'this city'}?"
- "What response areas or coverage zones does ${profileDepartmentName || 'this department'} serve?"
- "How does ${profileDepartmentName || 'this department'} coordinate with neighboring fire departments?"

Programs & Initiatives:
- "What community programs does ${profileDepartmentName || 'this department'} participate in?"
- "What fire prevention programs does ${profileDepartmentName || 'this department'} offer?"
- "What recent initiatives has ${profileDepartmentName || 'this department'} implemented?"
- "Does ${profileDepartmentName || 'this department'} participate in any mutual aid agreements?"

Values & Mission:
- "What are the core values of ${profileDepartmentName || 'this department'}?"
- "What is the mission statement of ${profileDepartmentName || 'this department'}?"
- "What makes ${profileDepartmentName || 'this department'} unique or special?"

Equipment & Capabilities:
- "What specialized equipment or apparatus does ${profileDepartmentName || 'this department'} have?"
- "Does ${profileDepartmentName || 'this department'} have any technical rescue capabilities?"
- "What type of hazmat response capabilities does ${profileDepartmentName || 'this department'} have?"

ABSOLUTELY FORBIDDEN QUESTION TYPES:
- "How would you handle..." (situational)
- "Tell us about a time..." (behavioral)
- "What would you do if..." (hypothetical)
- Any question about past experiences or future scenarios

REQUIRED: The question MUST be a direct knowledge question asking about a specific fact. Use the city research data to find the actual facts and ask about them.

IMPORTANT: Only ask knowledge questions about facts that are available in the city research data. If the research data doesn't contain specific information (e.g., "Information not found"), do NOT ask about that topic. Ask about facts that ARE available in the research.`;
      } else {
        questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) focused EXCLUSIVELY on the category: "${selectedCategory}".${personalizationContext}

CRITICAL REQUIREMENTS:
- The question MUST be about "${selectedCategory}" and ONLY this category
- Do NOT generate questions about other categories like "Behavioural – High Stress", "Medical / EMR", "Teamwork", etc.
- The question must directly test competencies related to "${selectedCategory}"
- RANDOMLY decide whether to personalize - most questions should be GENERAL
- Reference their name (${profileName ? profileName : 'if provided'}) very rarely (10-15% of questions), department/city only occasionally (20-30% of questions)
- Most questions should be general firefighter questions that apply to any candidate
- Make it relevant to this specific area while still being a general question that tests judgment

CATEGORY-SPECIFIC GUIDANCE:
- If category is "Behavioural – High Stress": Focus on stress management, pressure situations, crisis response
- If category is "Behavioural – Conflict": Focus on conflict resolution, disagreements, interpersonal challenges
- If category is "Safety & Accountability": Focus on safety protocols, hazard recognition, responsibility
- If category is "Medical / EMR": Focus on medical emergencies, patient care, first aid scenarios
- If category is "Teamwork": Focus on collaboration, team dynamics, working with others
- If category is "Community Focus": Focus on public service, community relations, citizen interaction
- If category is "Resilience": Focus on overcoming challenges, bouncing back, perseverance
- If category is "Technical – Fireground": Focus on firefighting techniques, equipment, fireground operations

IMPORTANT: The question MUST stay within the "${selectedCategory}" category. Do not drift into other competency areas.`;
      }
    } else if (practiceMode === "simulation") {
      questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) for an interview simulation.${personalizationContext}

CRITICAL REQUIREMENTS FOR NEW PROBIE:
- This candidate is a BRAND NEW PROBIE FIREFIGHTER (entry-level, no firefighting experience yet)
- ONLY ~10% of questions should be fire-related. ~90% should be GENERAL behavioral/situational questions
- DO NOT ask about leading teams, making command decisions, or managing others
- DO ask about following orders, learning, being part of a team, respecting chain of command, adapting to new environments
- Questions should reflect an entry-level position where they follow instructions and learn from experienced firefighters

CRITICAL PERSONALIZATION REQUIREMENTS:
- RANDOMLY decide whether to personalize - most questions should be GENERAL questions
- Use the candidate's name (${profileName ? profileName : 'if provided'}) very rarely - only about 10-15% of questions, make it feel completely random
- Reference their department "${profileDepartmentName || '[if provided]'}" only occasionally - about 20-30% of questions. Most questions should NOT mention the department
- Reference their city "${profileCity || '[if provided]'}" only occasionally - about 20-30% of questions. Most questions should be general
- Reference their COMPLETE resume background (ALL past jobs including non-fire jobs, experience, certifications, skills) naturally when it fits, but don't force it
- Most questions should be general questions that apply to any candidate
- Make personalization feel random and natural - don't include department/name in every question

${questionTypeToUse === 'behavioral' ? 'Use "Tell us about a time..." format asking about past experience (BEHAVIORAL question).' : 'Use "How would you handle..." format asking about a hypothetical situation (SITUATIONAL question).'} 

IMPORTANT: Randomly vary between behavioral and situational questions. This is a ${questionTypeToUse} question.

Vary the topics to simulate a real interview where questions come from different areas. Most questions should be general (70-80%), with occasional personalization (20-30%) that feels random.`;
    } else {
      questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) mixing general firefighter competencies with heavy personalization.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- RANDOMLY decide whether to personalize - most questions should be GENERAL
- Reference their name only occasionally (10-15% of questions), department only occasionally (20-30% of questions), city only occasionally (20-30% of questions)
- Most questions should be general firefighter questions that apply to any candidate
- Make personalization feel random and natural - don't force it into every question
- About 70-80% general questions, 20-30% personalized if profile information is available.`;
    }
    
    // Add question bank reference as inspiration if available
    // (This is defined earlier in the code, but ensure it's always initialized)
    if (questionBankReference) {
      bankReferenceText = `\n\nQUESTION BANK REFERENCE (use as inspiration and personalize it):
- Type: ${questionBankReference.type}
- Difficulty: ${questionBankReference.difficulty}
- Category: ${questionBankReference.category}
- Example question: "${questionBankReference.question}"

CRITICAL INSTRUCTIONS:
1. Use this question as a BASE/INSPIRATION - you can keep it general or personalize it
2. RANDOMLY decide whether to personalize - most questions should be GENERAL
3. If personalizing: incorporate their name very rarely (10-15%), department/city only occasionally (20-30%)
4. Maintain the same TYPE (${questionBankReference.type}), DIFFICULTY level (${questionBankReference.difficulty}), and CATEGORY focus (${questionBankReference.category})
5. Most questions should be general firefighter questions that apply to any candidate
6. The final question should be UNIQUE, but doesn't need to be personalized - most should be general
7. Make personalization feel random and natural - don't force department/name into every question

Example transformation (RANDOM - sometimes keep it general):
- Original: "What do you know about the demographics of [CITY]?"
- General version: "What do you think are the biggest fire-related risks in a typical urban community and how would you prepare to serve that community?"
- Personalized version (only 20-30% of the time): "Given your background in ${profileCity || 'this city'}, what do you think are the biggest fire-related risks in ${profileCity || 'this city'} and how would your experience help you serve this community?"

Remember: Most questions should be GENERAL. Personalization should feel RANDOM.`;
    } else {
      bankReferenceText = "";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert firefighter interview panel member. Your role is to generate realistic and challenging interview questions for a BRAND NEW PROBIE FIREFIGHTER (entry-level candidate with no firefighting experience yet).

CRITICAL REQUIREMENTS:
1. ONLY ~10% of questions should be fire-related. The remaining ~90% should be GENERAL behavioral/situational questions that could apply to any profession or made-up scenarios.
2. This candidate is a BRAND NEW PROBIE - they are NOT a captain, officer, or leader. Questions should reflect an entry-level position:
   - DO NOT ask "how would you keep YOUR team safe" (they don't have a team)
   - DO NOT ask about leading others or managing a team
   - DO NOT ask about making command decisions
   - DO ask about following orders, learning, being part of a team, respecting chain of command
   - DO ask about how they would handle being new, learning protocols, working under supervision
3. RANDOMLY decide whether to personalize - MOST questions should be GENERAL questions that apply to any candidate
4. Only occasionally (20-30% of questions) reference the candidate's department or city - make it feel random
5. Only very rarely (10-15% of questions) address the candidate by name - make it feel completely random
6. Most questions should be general and not mention specific departments, cities, or names
7. Test behavioral competencies, judgment, ethics, following instructions, teamwork, and situational judgment
8. Reference their COMPLETE background naturally when relevant, but don't force it
9. Ensure questions are UNIQUE and cover diverse topics/areas
10. Vary between behavioral ("Tell us about a time...") and situational ("How would you handle...") questions

QUESTION TOPIC DISTRIBUTION:
- ~10% fire-related scenarios (safety protocols, following fireground procedures, learning firefighting basics)
- ~90% general scenarios (conflict resolution, following orders, teamwork, ethics, communication, stress management, adapting to new environments, etc.)

EXAMPLES OF APPROPRIATE QUESTIONS FOR A NEW PROBIE:
- "How would you handle a situation if you felt you weren't treated fairly?"
- "Tell us about a time when you had to follow instructions you didn't fully understand."
- "How would you handle a situation where a senior colleague asks you to do something that conflicts with what your supervisor told you?"
- "Describe a time when you had to work as part of a team under pressure."
- "How would you approach learning a completely new skill or procedure?"

EXAMPLES OF INAPPROPRIATE QUESTIONS (DO NOT GENERATE):
- "How would you keep YOUR team safe?" (they don't have a team - they ARE part of a team)
- "How would you lead your crew in an emergency?" (they're not a leader)
- "What would you do if you had to make a command decision?" (they follow commands, not give them)

CRITICAL EXCEPTION: If the category is "City & Department Specific", you MUST generate KNOWLEDGE-TESTING questions (Who/What/When/How many) about specific facts, NOT behavioral or situational questions. For this category only, ask about factual information like fire chief's name, union number, department size, mayor's name, etc.

CRITICAL: Most questions should be GENERAL. Personalization should feel RANDOM and NATURAL - don't include department name or candidate name in every question. About 70-80% of questions should be general questions.`
        },
        {
          role: "user",
          content: `Generate a single ${profileJobType || 'firefighter'} interview question.

${questionStrategy}${bankReferenceText}

${resumeContext}${diversityContext}${userProfileContext}

CRITICAL PERSONALIZATION INSTRUCTIONS:
- RANDOMLY decide whether to personalize - MOST questions should be GENERAL
- If a name is provided, address them by name very rarely (only about 10-15% of the time, make it feel completely random)
- If a department is provided, reference it only occasionally (about 20-30% of questions). Most questions should NOT mention the department
- If city research is available, incorporate specific details only occasionally (about 20-30% of questions)
- If resume information is available, reference their background naturally when it fits, but don't force it
- Most questions should be general firefighter questions that apply to any candidate
- Make personalization feel random and natural - don't include department/name in every question
- About 70-80% of questions should be general, 20-30% can be personalized

${selectedCategory === "City & Department Specific" ? `\n\nCRITICAL: This is the "City & Department Specific" category. The question MUST be a KNOWLEDGE-TESTING question asking about SPECIFIC FACTS about ${profileCity || 'the city'} and ${profileDepartmentName || 'the department'}.

FORBIDDEN: Do NOT generate behavioral questions ("Tell us about a time...") or situational questions ("How would you handle..."). 
REQUIRED: Generate a direct knowledge question like "Who is the fire chief?" or "What is the union number?" or "How many members does the department have?"

Use the city research data provided above to find specific facts and ask about them.` : selectedCategory && selectedCategory !== "Resume-Based" ? `\nCRITICAL CATEGORY REQUIREMENT: The question MUST be about "${selectedCategory}" category ONLY. Do NOT generate questions about other categories. Stay strictly within the "${selectedCategory}" competency area.` : ''}

IMPORTANT: This is a NEW, UNRELATED question. Do NOT make it a follow-up to previous questions. Generate a completely fresh question from a different topic/angle.

The question must be highly personalized and feel authentic to this specific candidate's application.

Requirements:
${selectedCategory && selectedCategory !== "Resume-Based" && selectedCategory !== "City & Department Specific" ? `- CRITICAL: The question MUST be about "${selectedCategory}" category. The category in your response MUST be exactly "${selectedCategory}". Do not use a different category.
- Stay strictly within the "${selectedCategory}" competency area. Do NOT generate questions about other categories.
` : practiceMode === "simulation" ? `- Question should be a GENERAL situational/hypothetical question (like "How would you handle a situation if...")
- Keep it broad and applicable to all candidates, not overly specific to their resume
- Ensure diversity: Cover different topics and areas. If many questions have been asked, explore new categories/topics. Vary between: chain of command, ethics, conflict resolution, safety, teamwork, leadership, decision-making, communication, stress management, equipment, training, etc.
` : `- Question should be a GENERAL situational/hypothetical question (like "How would you handle a situation if...")
- Keep it broad and applicable to all candidates, not overly specific to their resume
`}
- Examples of good questions (REMEMBER: Only ~10% fire-related, ~90% general):
${selectedCategory === "City & Department Specific" ? `  * KNOWLEDGE QUESTIONS (REQUIRED for this category - use city research data):
    * Leadership: "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?" "Who are the deputy chiefs?"
    * Union: "What is the local union number for ${profileDepartmentName || 'the fire department'}?" "Who is the union president?"
    * Department Size: "How many members does ${profileDepartmentName || 'the department'} have?" "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
    * City Leadership: "Who is the mayor of ${profileCity || 'this city'}?" "What are the mayor's priorities for emergency services?"
    * History: "When was ${profileDepartmentName || 'this department'} established?" "What significant milestones has ${profileDepartmentName || 'this department'} achieved?"
    * Programs: "What community programs does ${profileDepartmentName || 'this department'} participate in?" "What fire prevention programs does ${profileDepartmentName || 'this department'} offer?"
    * City Context: "What are the main industries in ${profileCity || 'this city'}?" "What is the population of ${profileCity || 'this city'}?"
    * Equipment: "What specialized equipment does ${profileDepartmentName || 'this department'} have?" "What technical rescue capabilities does ${profileDepartmentName || 'this department'} have?"
    * Values: "What are the core values of ${profileDepartmentName || 'this department'}?" "What is the mission statement of ${profileDepartmentName || 'this department'}?"
  * FORBIDDEN: "How would you handle..." or "Tell us about a time..." (these are behavioral/situational, NOT knowledge questions)` : `  * GENERAL Behavioral/Situational questions (90% of questions should be like these):
  * "How would you handle a situation if you felt you weren't treated fairly?"
  * "Tell us about a time when you had to follow instructions you didn't fully understand."
  * "How would you handle a situation where two people you respect give you conflicting instructions?"
  * "Describe a time when you had to work as part of a team under pressure."
  * "How would you approach learning a completely new skill or procedure?"
  * "Tell us about a time when you had to adapt to a completely new environment."
  * "How would you handle a situation where you see someone doing something unsafe?"
  * "Describe a time when you had to communicate something difficult to a supervisor."
  * FIRE-RELATED questions (only ~10% of questions - use sparingly):
  * "Your Captain orders you to get a radio from the engine. On the way a senior fire officer stops you and asks you to deliver an axe to the team on the roof right away. How would you handle this?"
  * "If you were on a fire scene and noticed a safety violation, how would you address it as a new probie?"
  * FORBIDDEN for new probie: "How would you keep YOUR team safe?" (they don't have a team - they ARE part of a team)
  * FORBIDDEN for new probie: "How would you lead your crew?" (they're not a leader - they follow leaders)`}
- Test: ${selectedCategory === "City & Department Specific" ? 'candidate knowledge of specific facts about the city and department' : 'chain of command, ethics, judgment, decision-making, conflict resolution'}
- CRITICAL: The question MUST be completely different from any question already asked (see list above)
${practiceMode === "simulation" ? `- If resume is provided and mode allows, occasionally reference different aspects of their background (certifications, experience, skills) but keep questions general enough for all candidates
- Rotate through different question types: hypothetical scenarios, ethical dilemmas, chain of command situations, team dynamics, safety protocols, etc.
` : ''}
- Format: "Category: [category]\nQuestion: [question text]"
${selectedCategory && selectedCategory !== "Resume-Based" && selectedCategory !== "City & Department Specific" ? `\nCRITICAL: The category in your response MUST be exactly "${selectedCategory}". Do not use a different category name.` : ''}

Return ONLY the category and question in that format.`
        }
      ]
    });

    const content = response.choices[0].message.content;
    const categoryMatch = content.match(/Category:\s*(.+)/i);
    const questionMatch = content.match(/Question:\s*(.+)/is);
    
    const category = categoryMatch ? categoryMatch[1].trim() : "General";
    const question = questionMatch ? questionMatch[1].trim() : content.trim();

    // Track question answered in analytics
    if (sessionId) {
      try {
        const visit = await Analytics.findBySession(sessionId);
        if (visit) {
          const newCount = (visit.questions_answered || 0) + 1;
          await Analytics.updateQuestions(sessionId, newCount);
        }
      } catch (analyticsError) {
        console.error('Analytics tracking error:', analyticsError);
        // Don't fail the request if analytics fails
      }
    }

    res.json({
      category,
      template: question,
      tags: [],
      isAI: true,
      isFollowup: false
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ error: 'Failed to generate question', message: error.message });
  }
});

// POST /api/followup - Generate a follow-up question
app.post('/api/followup', async (req, res) => {
  try {
    const { lastQuestion, lastAnswer, history } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview panel member. Generate a followup question that digs deeper into the candidate's answer, just like a real panel would. Ask for clarification, more detail, or explore a related aspect."
        },
        {
          role: "user",
          content: `The candidate was asked: "${lastQuestion}"

Their answer: "${lastAnswer.slice(0, 1000)}"

Generate a followup question that:
- Probes deeper into their answer
- Asks for specific examples or clarification
- Tests their knowledge or judgment further
- Is what a real firefighter panel would ask next

Format: "Category: [category]\nQuestion: [question text]"

Return ONLY the category and question.`
        }
      ]
    });

    const content = response.choices[0].message.content;
    const categoryMatch = content.match(/Category:\s*(.+)/i);
    const questionMatch = content.match(/Question:\s*(.+)/is);
    
    const category = categoryMatch ? categoryMatch[1].trim() : "Followup";
    const question = questionMatch ? questionMatch[1].trim() : content.trim();

    res.json({
      category,
      template: question,
      tags: [],
      isAI: true,
      isFollowup: true
    });
  } catch (error) {
    console.error('Error generating followup:', error);
    res.status(500).json({ error: 'Failed to generate followup question', message: error.message });
  }
});

// POST /api/analyze-answer - Analyze candidate's answer
app.post('/api/analyze-answer', optionalAuth, async (req, res) => {
  try {
    const { question, answer, motionScore, resumeAnalysis, resumeText, conversationHistory = [], cityResearch, category, sessionId, questionCount, trialCreditsRemaining } = req.body;
    
    // Check credits: trial or paid
    let hasPaidCredits = false;
    let isTrialUser = false;
    let canAccessDetailedFeedback = false;
    
    if (req.user) {
      // Authenticated user - check paid credits
      const user = await User.findById(req.user.userId);
      if (user && user.credits_balance > 0) {
        hasPaidCredits = true;
        canAccessDetailedFeedback = true;
      } else {
        // Authenticated but no credits - need to purchase
        return res.status(402).json({ 
          error: 'NO_CREDITS',
          message: 'You have no credits remaining. Please purchase credits to continue.',
          requiresPayment: true
        });
      }
    } else {
      // Anonymous user - check trial credits
      const trialRemaining = trialCreditsRemaining !== undefined ? parseInt(trialCreditsRemaining) : 3;
      if (trialRemaining > 0) {
        isTrialUser = true;
        canAccessDetailedFeedback = false; // Trial users never get detailed feedback
      } else {
        // Trial exhausted - need to sign up and purchase
        return res.status(402).json({ 
          error: 'NO_CREDITS',
          message: 'You have used all 3 free sessions. Please sign up and purchase credits to continue.',
          requiresPayment: true,
          requiresSignup: true
        });
      }
    }

    // Check if this is a knowledge-testing question (City & Department Specific)
    const isKnowledgeQuestion = category === "City & Department Specific" ||
                                question.toLowerCase().match(/^(who is|what is|how many|when was|what are)/) ||
                                question.toLowerCase().includes('who is the') ||
                                question.toLowerCase().includes('what is the') ||
                                question.toLowerCase().includes('how many') ||
                                question.toLowerCase().includes('when was');

    const resumeContext = resumeAnalysis 
      ? `Resume Analysis: ${JSON.stringify(resumeAnalysis)}`
      : resumeText 
        ? `Resume (full): ${resumeText}`
        : "No resume provided";
    
    // Extract proper names from research data to help with transcript error matching
    function extractProperNames(text) {
      if (!text) return [];
      // Look for patterns like "Mayor [Name]", "Chief [Name]", "[Name] is the", etc.
      const namePatterns = [
        /(?:Mayor|mayor|Mayor of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /(?:Chief|chief|Fire Chief|fire chief|Fire Chief of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:is|was|serves as|served as|the current|the)\s+(?:mayor|chief|fire chief|director|manager)/gi,
        /(?:named|called|known as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
        /(?:current|Current)\s+(?:mayor|chief|fire chief|director)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
      ];
      const names = new Set();
      namePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1] && match[1].length > 2 && !match[1].match(/^(The|Current|Mayor|Chief|Fire|City|Department)$/i)) {
            names.add(match[1].trim());
          }
        }
      });
      return Array.from(names);
    }
    
    // Build knowledge verification context if this is a knowledge question
    let knowledgeVerificationContext = "";
    let properNamesList = "";
    if (isKnowledgeQuestion && cityResearch) {
      // Extract proper names from research data
      const properNames = extractProperNames(cityResearch);
      if (properNames.length > 0) {
        properNamesList = `\n\n⚠️ CRITICAL - PROPER NAMES FROM RESEARCH DATA:
The following proper names appear in the research data. Speech transcripts OFTEN mis-transcribe these names. You MUST consider phonetically similar variations as CORRECT:

${properNames.map(name => `- Correct name: "${name}"`).join('\n')}

TRANSCRIPT ERROR EXAMPLES (all should be marked CORRECT):
- If research says "Ross Siemens" and transcript says "Russ Simmons" → CORRECT (phonetically similar)
- If research says "Eric Peterson" and transcript says "Erick Peterson" → CORRECT (phonetically similar)  
- If research says "John Smith" and transcript says "Jon Smith" → CORRECT (phonetically similar)
- If research says "Ross Siemens" and transcript says "Russ Simmons" or "Ross Simmons" → CORRECT

ONLY mark as INCORRECT if:
- The name refers to a completely different person (e.g., research says "Ross Siemens" but transcript says "Mike Johnson")
- The FACTS are wrong (wrong position, wrong department, etc.)
- NOT if it's just a transcript/spelling variation of the same name`;
      }
      
      knowledgeVerificationContext = `\n\nCRITICAL: This is a KNOWLEDGE-TESTING question. You MUST verify the candidate's answer against the research data provided below.

CITY/DEPARTMENT RESEARCH DATA (use this to verify the answer):
${cityResearch}${properNamesList}

VERIFICATION REQUIREMENTS:
1. Check if the candidate's answer is CORRECT or INCORRECT based on the research data
2. ⚠️ CRITICAL: The answer is from a SPEECH TRANSCRIPT - spelling/transcript variations in proper names should be considered CORRECT if phonetically similar
3. Use the proper names list above to match transcript variations (e.g., "Russ Simmons" = "Ross Siemens" if that's the correct name)
4. Focus on CONTENT/FACTUAL accuracy, NOT spelling differences
5. If incorrect, provide the CORRECT answer from the research data
6. If partially correct, specify what was correct and what was missing/incorrect (but don't mention spelling)
7. If they missed important details, list what they missed
8. Provide specific factual corrections, not just general feedback

The feedback MUST include:
- Whether the answer was correct, incorrect, or partially correct (based on FACTS, not spelling)
- The correct answer (if they got it wrong or missed details)
- What specific facts they missed (if any)
- How accurate their knowledge is of the city/department
- DO NOT penalize for spelling/transcript differences in proper names - only mark incorrect if facts are wrong`;
    } else if (isKnowledgeQuestion && !cityResearch) {
      // If it's a knowledge question but we don't have research, note this in feedback
      knowledgeVerificationContext = `\n\nNOTE: This appears to be a knowledge-testing question, but research data is not available to verify the answer. Provide general feedback on the answer's completeness and structure.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview coach. Your goal is to help candidates develop better answers. IMPORTANT: Distinguish between two types of questions:\n\n1. BEHAVIORAL QUESTIONS (past experiences): \"Tell me about a time when...\", \"Describe a situation where...\", \"Give me an example of...\" - Use STAR method (Situation-Task-Action-Result) for these\n2. HYPOTHETICAL/SITUATIONAL QUESTIONS: \"How would you...\", \"What would you do if...\", \"How would you approach...\" - DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.\n\nBe encouraging, specific, and actionable. Provide constructive feedback on what firefighter panels actually look for."
        },
        {
          role: "user",
          content: ("You are an expert firefighter interview coach. Your goal is to help candidates develop better answers.\n\n" +
            "Interview Question: " + question + "\n" +
            `Question Category: ${category || 'General'}\n\n` +
            "Candidate's Answer:\n" +
            "\"" + String(answer).replace(/"/g, '\\"') + "\"\n\n" +
            "⚠️ IMPORTANT: This answer is from a SPEECH TRANSCRIPT (speech-to-text). Spelling variations are expected and should NOT be penalized.\n" +
            "- Focus on CONTENT ACCURACY, not exact spelling\n" +
            "- For proper names (e.g., 'Eric' vs 'Erick', 'Peterson' vs 'Petersen'), consider them correct if phonetically similar\n" +
            "- Only mark as incorrect if the CONTENT/FACTS are wrong, not spelling differences\n" +
            "- Spelling errors in transcripts are NOT the candidate's fault\n\n" +
            "Body Language Score (higher = more movement/fidgeting): " + (motionScore ?? "unknown") + "\n" +
            resumeContext + knowledgeVerificationContext + "\n\n" +
            (isKnowledgeQuestion ? 
            "CRITICAL: This is a KNOWLEDGE-TESTING question. You MUST:\n" +
            "1. Verify the candidate's answer against the research data provided\n" +
            "2. REMEMBER: This is a transcript - spelling variations (especially in names) are expected and should be considered CORRECT if phonetically similar\n" +
            "3. State clearly if the answer was CORRECT, INCORRECT, or PARTIALLY CORRECT (based on CONTENT, not spelling)\n" +
            "4. If incorrect or partially correct, provide the CORRECT answer from the research data\n" +
            "5. List any specific facts they missed (but don't penalize spelling differences)\n" +
            "6. Score based on CONTENT accuracy: 10/10 = completely correct with all details, lower scores only for factually incorrect or incomplete answers (NOT spelling)\n\n" :
            "CRITICAL: First, determine if this is a BEHAVIORAL question (past experience) or HYPOTHETICAL question (future scenario).\n\n" +
            "- BEHAVIORAL questions: \"Tell me about a time when...\", \"Describe a situation where...\", \"Give me an example of...\"\n" +
            "  → Use STAR method (Situation-Task-Action-Result) for these.\n\n" +
            "- HYPOTHETICAL questions: \"How would you...\", \"What would you do if...\", \"How would you approach...\"\n" +
            "  → DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.\n\n") +
            "Keep the response concise and easy to skim. Avoid long paragraphs. Use short sentences and compact sections.\n\n" +
            "STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS (use markdown headings and bold labels with double asterisks, NOT star symbols):\n\n" +
            "## Answer Summary & Score\n" +
            (isKnowledgeQuestion ?
            "- **Summary:** [1–2 short sentences summarizing what they said, and whether it was correct or incorrect. NOTE: Use the proper names list above - if transcript says 'Russ Simmons' but correct name is 'Ross Siemens', consider it CORRECT (phonetically similar)]\n" +
            "- **Correctness:** [State clearly: CORRECT, INCORRECT, or PARTIALLY CORRECT. Remember: transcript variations in proper names (e.g., 'Russ' vs 'Ross', 'Simmons' vs 'Siemens') are CORRECT if phonetically similar. Only mark incorrect if FACTS are wrong or completely different person]\n" +
            "- **Score:** [X/10 – based on CONTENT accuracy only. 10/10 = factually correct with all details. Do NOT deduct points for transcript/spelling differences - only deduct if facts are wrong]\n" :
            "- **Summary:** [1–2 short sentences summarizing what they actually said, using plain language]\n" +
            "- **Score:** [X/10 – very short explanation of why, and what would make it panel ready]\n") +
            "\n\n## What You Did Well\n" +
            "- **Positive 1:** [Short, specific positive point]" +
            (isKnowledgeQuestion ? " (e.g., 'Got the fire chief's name correct' or 'Knew the union number')" : "") + "\n" +
            "- **Positive 2:** [Short, specific positive point]\n" +
            "- **Positive 3 (optional):** [Only if there is a clear extra strength]\n\n" +
            "## What To Improve Next\n" +
            "- **Focus 1:** " + (isKnowledgeQuestion ? "[If factually incorrect: 'The correct answer is [correct answer from research].' If missed details: 'You missed [specific fact].' DO NOT mention spelling - transcripts have spelling variations]" : "[Very practical change they can make next time]") + "\n" +
            "- **Focus 2:** [Another clear tweak or addition]\n" +
            "- **Focus 3 (optional):** [Only if it adds real value]\n\n" +
            (isKnowledgeQuestion ? 
            "## Correct Answer (from Research Data)\n" +
            "Provide the complete, correct answer based on the research data:\n" +
            "- **Correct Answer:** [The full, accurate answer from the research data]\n" +
            "- **Additional Details:** [Any relevant context or additional facts they should know]\n\n" :
            "## STAR or Approach Overview\n" +
            "If this is a BEHAVIORAL (past) question, use STAR in a very compact way:\n" +
            "- **Situation:** [1 short sentence: how they should set the scene]\n" +
            "- **Task:** [1 short sentence: what the goal or responsibility was]\n" +
            "- **Action:** [1–2 short sentences: the key actions they should clearly state]\n" +
            "- **Result:** [1 short sentence: the outcome + what changed or improved]\n\n" +
            "If this is a HYPOTHETICAL (future) question, DO NOT use STAR. Instead, describe a clear approach:\n" +
            "- **Step 1:** [What they should do first and why]\n" +
            "- **Step 2:** [Next key step, including chain of command / safety / communication]\n" +
            "- **Step 3:** [How they would wrap up, debrief, or follow up]\n\n") +
            "## Panel-Ready Answer\n" +
            "Write a single, polished answer that would be panel ready on a real firefighter panel. Use the candidate's ideas and resume context but clean them up:\n" +
            "- 1 short opening sentence that orients the panel.\n" +
            "- 1–2 short paragraphs that walk through the STAR story or hypothetical approach clearly.\n" +
            "- Keep language natural, plain, and realistic for a firefighter candidate.\n\n" +
            "Rules:\n" +
            "- Use markdown bullets (dash) with bold labels using double asterisks, e.g., use dash followed by space and double asterisks for bold.\n" +
            "- Do NOT use star symbols or plain asterisks for formatting.\n" +
            "- Keep each bullet to 1–2 short sentences.\n" +
            "- Avoid walls of text – this should feel light, skimmable, and coach-like.\n" +
            "- Be encouraging but very specific and honest about what needs to improve.")
        }
      ]
    });

    const aiFeedback = response.choices[0].message.content;
    
    // Deduct credit for paid users (only after successful AI response)
    if (hasPaidCredits && req.user) {
      try {
        await User.deductCredit(req.user.userId, 'coached_question');
        console.log(`[CREDITS] Deducted 1 credit from user ${req.user.userId}`);
      } catch (creditError) {
        console.error('Error deducting credit:', creditError);
        // Don't fail the request, but log the error
      }
    }
    
    // Grant referrer credits when referred user completes their first question
    if (req.user && questionCount === 1) {
      try {
        const referrals = await Referral.getByReferredUser(req.user.userId);
        if (referrals && referrals.length > 0) {
          // Find the first referral that hasn't credited the referrer yet
          const referral = referrals.find(r => r.referrer_credited === 0);
          if (referral && referral.referrer_user_id) {
            // Grant 3 credits to the referrer
            await User.addCredits(referral.referrer_user_id, 3, `Referral bonus - ${referral.referral_code} used`);
            // Mark referrer as credited
            const { query } = require('./db');
            await query('UPDATE referrals SET referrer_credited = 1 WHERE referred_user_id = $1 AND referrer_credited = 0', [req.user.userId]);
            console.log(`[REFERRAL] Granted 3 credits to referrer ${referral.referrer_user_id} for referral code ${referral.referral_code}`);
          }
        }
      } catch (refError) {
        console.error('Error granting referrer credits:', refError);
        // Don't fail the request if referral credit fails
      }
    }
    
    // Track answer analysis after 5 questions for "areas to work on" feature
    if (sessionId && questionCount && questionCount >= 5) {
      try {
        const profile = getUserProfile(sessionId);
        const analysisEntry = {
          question: question,
          answer: answer,
          feedback: aiFeedback,
          category: category || 'General',
          timestamp: new Date().toISOString(),
          questionCount: questionCount
        };
        
        // Keep only last 10 analyses to avoid too much data
        profile.answerAnalyses = (profile.answerAnalyses || []).slice(-9).concat([analysisEntry]);
        updateUserProfile(sessionId, { answerAnalyses: profile.answerAnalyses });
        
        console.log(`[AREAS TO WORK ON] Tracked analysis #${questionCount} for session ${sessionId}`);
      } catch (trackError) {
        console.error('Error tracking answer analysis:', trackError);
        // Don't fail the request if tracking fails
      }
    }
    
    // Get updated credits balance for paid users
    let creditsRemaining = null;
    if (hasPaidCredits && req.user) {
      const user = await User.findById(req.user.userId);
      creditsRemaining = user ? user.credits_balance : null;
    }
    
    res.json({ 
      feedback: aiFeedback,
      hasDetailedFeedback: canAccessDetailedFeedback,
      isTrialUser: isTrialUser,
      creditsRemaining: creditsRemaining
    });
  } catch (error) {
    console.error('Error analyzing answer:', error);
    res.status(500).json({ error: 'Failed to analyze answer', message: error.message });
  }
});

// POST /api/parse-resume - Parse resume with AI
app.post('/api/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Resume text is required',
        message: 'No resume text provided'
      });
    }

    console.log(`[RESUME] Parsing resume, text length: ${resumeText.length} characters`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing resumes. Extract ALL information from the resume, including ALL past jobs and work experience, not just fire-related experience. Extract structured information in JSON format."
        },
        {
          role: "user",
          content: `Analyze this COMPLETE resume and extract ALL information, including ALL past jobs and work experience (fire-related AND non-fire-related):

CRITICAL: Extract ALL work history, including:
- ALL past jobs (fire-related AND non-fire-related jobs like construction, retail, customer service, healthcare, etc.)
- ALL work experience, even if not directly related to firefighting
- Years of experience in each role
- Certifications (fire-related like EMR, POC, etc. AND any other certifications)
- ALL skills (fire-related AND transferable skills from other jobs)
- Key achievements from ALL jobs
- Education background
- Areas that would be interesting for interview questions (draw from ALL experience, not just fire-related)

Resume text (full text - analyze completely):
${resumeText}

Return a JSON object with this structure:
{
  "experience": "X years total (include all work experience)",
  "certifications": ["cert1", "cert2"],
  "skills": ["skill1", "skill2"],
  "workHistory": ["ALL jobs - job1 with details", "ALL jobs - job2 with details", "Include non-fire jobs too"],
  "achievements": ["achievement1 from all jobs"],
  "interviewFocus": ["area1", "area2"],
  "education": ["education details"],
  "allJobs": ["Complete list of ALL jobs with company names, titles, and dates"]
}

IMPORTANT: Include ALL jobs, not just fire-related ones. For example, if they worked in construction, retail, customer service, healthcare, etc., include those jobs in workHistory and allJobs. These experiences are valuable for interview questions too.`
        }
      ],
      response_format: { type: "json_object" }
    });

    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid response from OpenAI API');
    }

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI API');
    }

    let resumeAnalysis;
    try {
      resumeAnalysis = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseError) {
      console.error('[RESUME] JSON parse error:', parseError);
      console.error('[RESUME] Content received:', content);
      throw new Error('Failed to parse JSON response from AI');
    }

    console.log('[RESUME] Successfully parsed resume analysis');
    res.json({ analysis: resumeAnalysis });
  } catch (error) {
    console.error('[RESUME] Error parsing resume:', error);
    console.error('[RESUME] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'Failed to parse resume', 
      message: error.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Store feedback in memory (in production, you'd want to use a database)
const feedbackStore = [];

// POST /api/feedback - Submit user feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { sessionId, satisfaction, workingWell, improvements, categories, additional, timestamp } = req.body;
    
    if (!satisfaction) {
      return res.status(400).json({ error: 'Satisfaction level is required' });
    }
    
    const feedback = {
      id: Date.now().toString(),
      sessionId: sessionId || 'anonymous',
      satisfaction: satisfaction,
      workingWell: workingWell || '',
      improvements: improvements || '',
      categories: categories || [],
      additional: additional || '',
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    feedbackStore.push(feedback);
    
    // Log feedback for visibility (detailed)
    console.log('\n========== NEW FEEDBACK RECEIVED ==========');
    console.log(`Satisfaction: ${feedback.satisfaction}`);
    console.log(`Session ID: ${feedback.sessionId}`);
    if (feedback.workingWell) {
      console.log(`What's Working: ${feedback.workingWell.substring(0, 100)}${feedback.workingWell.length > 100 ? '...' : ''}`);
    }
    if (feedback.improvements) {
      console.log(`Improvements: ${feedback.improvements.substring(0, 100)}${feedback.improvements.length > 100 ? '...' : ''}`);
    }
    if (feedback.categories.length > 0) {
      console.log(`Categories Requested: ${feedback.categories.join(', ')}`);
    }
    if (feedback.additional) {
      console.log(`Additional: ${feedback.additional.substring(0, 100)}${feedback.additional.length > 100 ? '...' : ''}`);
    }
    console.log(`Timestamp: ${feedback.createdAt}`);
    console.log('==========================================\n');
    
    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully',
      feedbackId: feedback.id
    });
  } catch (error) {
    console.error('[FEEDBACK] Error processing feedback:', error);
    res.status(500).json({ 
      error: 'Failed to process feedback', 
      message: error.message || 'Unknown error occurred'
    });
  }
});

// GET /api/feedback - Get all feedback (for admin/viewing)
app.get('/api/feedback', (req, res) => {
  try {
    // Calculate summary statistics
    const satisfactionCounts = {
      'very-satisfied': 0,
      'satisfied': 0,
      'neutral': 0,
      'dissatisfied': 0,
      'very-dissatisfied': 0
    };
    
    const categoryCounts = {};
    
    feedbackStore.forEach(fb => {
      if (fb.satisfaction) {
        satisfactionCounts[fb.satisfaction] = (satisfactionCounts[fb.satisfaction] || 0) + 1;
      }
      if (fb.categories && Array.isArray(fb.categories)) {
        fb.categories.forEach(cat => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      }
    });
    
    res.json({
      success: true,
      count: feedbackStore.length,
      summary: {
        satisfaction: satisfactionCounts,
        topCategories: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([category, count]) => ({ category, count }))
      },
      feedback: feedbackStore
    });
  } catch (error) {
    console.error('[FEEDBACK] Error retrieving feedback:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve feedback', 
      message: error.message || 'Unknown error occurred'
    });
  }
});

// POST /api/tts - Text-to-speech using OpenAI TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voicePreference } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Map voice preference to OpenAI voice
    // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    // Male-sounding: alloy, echo, onyx
    // Female-sounding: fable, nova, shimmer
    let voice = "alloy"; // Default
    if (voicePreference === "male") {
      voice = "onyx"; // Deep, male-sounding voice
    } else if (voicePreference === "female") {
      voice = "nova"; // Clear, female-sounding voice
    } else {
      // Auto mode: randomly alternate between male and female
      const randomChoice = Math.random() < 0.5 ? "male" : "female";
      voice = randomChoice === "male" ? "onyx" : "nova";
    }

    console.log(`Generating TTS for text: "${text.substring(0, 50)}..." with voice: ${voice} (preference: ${voicePreference || 'default'})`);

    const response = await openai.audio.speech.create({
      model: "tts-1-hd", // High quality, or use "tts-1" for faster/cheaper
      voice: voice, // alloy, echo, fable, onyx, nova, shimmer
      input: text
    });

    // Convert the response to buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`Generated audio buffer, size: ${audioBuffer.byteLength} bytes`);
    
    res.setHeader('Content-Type', 'audio/mp3');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error with OpenAI TTS:', error);
    res.status(500).json({ error: 'TTS failed', message: error.message });
  }
});

// POST /api/research-city - Research city-specific information for personalized questions
app.post('/api/research-city', async (req, res) => {
  try {
    const { country, stateProvince, city, jobType, departmentName } = req.body;

    if (!country || !city || !jobType || !departmentName) {
      return res.status(400).json({ error: 'Missing required fields: country, city, jobType, departmentName' });
    }

    const locationString = stateProvince 
      ? `${city}, ${stateProvince}, ${country}`
      : `${city}, ${country}`;

    console.log(`Researching city information for: ${locationString}, ${jobType}, ${departmentName}`);

    // Perform actual web searches for critical facts using OpenAI's web search capability
    console.log('Performing web searches for current information...');
    
    // All 17 critical searches for comprehensive research
    // Run in parallel batches of 2 for speed
    const criticalSearches = [
      { query: `current fire chief ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'fire chief name' },
      { query: `current deputy chief assistant chief ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'deputy chiefs' },
      { query: `current mayor ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'mayor name' },
      { query: `city council public safety committee ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'city council members' },
      { query: `city manager chief administrative officer ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'city manager' },
      { query: `${departmentName} union number IAFF local ${city} ${country}`, fact: 'union number' },
      { query: `${departmentName} union president ${city} ${country} 2024 2025`, fact: 'union president' },
      { query: `${departmentName} number of fire stations ${city} ${country} 2024 2025`, fact: 'number of fire stations' },
      { query: `${departmentName} number of members staff firefighters ${city} ${country} 2024 2025`, fact: 'number of members' },
      { query: `${departmentName} established founded history ${city} ${country}`, fact: 'department history' },
      { query: `${departmentName} mission statement values motto ${city} ${country}`, fact: 'department mission' },
      { query: `${departmentName} community programs initiatives ${city} ${country} 2024 2025`, fact: 'community programs' },
      { query: `${departmentName} equipment apparatus capabilities ${city} ${country} 2024 2025`, fact: 'equipment information' },
      { query: `${departmentName} response areas coverage zones ${city} ${country}`, fact: 'response areas' },
      { query: `population demographics ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'city demographics' },
      { query: `major industries economic drivers ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'city industries' },
      { query: `${city} emergency services structure fire police EMS ${stateProvince || ''} ${country} 2024 2025`, fact: 'emergency services structure' }
    ];

    let verifiedFacts = {};
    
    console.log(`\n=== Starting ${criticalSearches.length} web searches (optimized, parallel batches) ===`);
    console.log(`Researching: ${locationString}, ${departmentName}\n`);
    
    // Process searches in parallel batches for speed (2 at a time)
    const processSearch = async (search) => {
      try {
        let factResult = null;
        let usedWebSearch = false;
        
        try {
          // Try Responses API with web_search tool for real-time information
          if (openai.responses && typeof openai.responses.create === 'function') {
            const searchResponse = await openai.responses.create({
              model: "gpt-4o",
              tools: [{ type: "web_search" }],
              input: `What is the current, verified fact for: "${search.query}"? Return ONLY the fact itself (name or number), no explanations.`
            });
            
            if (searchResponse && searchResponse.output_text) {
              factResult = searchResponse.output_text.trim();
              usedWebSearch = true;
            }
          }
        } catch (responsesError) {
          // Fallback to chat completions
        }
        
        // Fallback to chat completions if Responses API not available
        if (!factResult) {
          const searchResponse = await openai.chat.completions.create({
            model: "gpt-4o",  // Use gpt-4o for better web search and fact-finding capabilities
            messages: [
              {
                role: "system",
                content: `You are an expert fact-checker with access to current web information. Your job is to find the MOST CURRENT, VERIFIED information. 

IMPORTANT:
- Use web search to find current, accurate information
- Return the fact directly (name, number, or brief answer)
- If you find the information, return it clearly
- Only return "NOT FOUND" if you truly cannot find any current information after searching
- Be specific and accurate - include full names when available`
              },
              {
                role: "user",
                content: `Search the web and find the current, verified information for: "${search.query}"

Return the fact directly (name, number, or brief answer). Be specific and accurate. If you cannot find current information, return "NOT FOUND".`
              }
            ],
            temperature: 0.1,
            max_tokens: 100  // Increased slightly to allow for full names and more complete answers
          });
          
          factResult = searchResponse.choices[0].message.content.trim();
        }
        
        // Clean up the response
        factResult = factResult.split('\n')[0].split('.')[0].trim();
        factResult = factResult.replace(/^["']|["']$/g, '');
        
        if (factResult && 
            factResult !== 'NOT FOUND' && 
            !factResult.toLowerCase().includes('not found') &&
            !factResult.toLowerCase().includes('outdated') &&
            !factResult.toLowerCase().includes('uncertain') &&
            factResult.length > 0 &&
            factResult.length < 100) {
          verifiedFacts[search.fact] = factResult;
          console.log(`✓ Found ${search.fact}: ${factResult}`);
          return { success: true, fact: search.fact, result: factResult };
        } else {
          console.log(`✗ Could not verify ${search.fact}`);
          return { success: false, fact: search.fact };
        }
      } catch (err) {
        console.error(`✗ ERROR for ${search.fact}:`, err.message);
        return { success: false, fact: search.fact, error: err.message };
      }
    };
    
    // Process in parallel batches of 2 for speed
    const batchSize = 2;
    for (let i = 0; i < criticalSearches.length; i += batchSize) {
      const batch = criticalSearches.slice(i, i + batchSize);
      await Promise.all(batch.map(processSearch));
    }
    
    console.log(`\n=== Completed all ${criticalSearches.length} searches ===`);
    console.log(`Successfully verified ${Object.keys(verifiedFacts).length} facts\n`);
    
    // Format verified facts by category for better organization
    const formatVerifiedFacts = (facts) => {
      const categories = {
        'leadership': [],
        'union': [],
        'department_size': [],
        'city_info': [],
        'history': [],
        'programs': [],
        'equipment': [],
        'other': []
      };
      
      Object.entries(facts).forEach(([key, value]) => {
        if (key.includes('chief') || key.includes('mayor') || key.includes('committee')) {
          categories.leadership.push(`${key}: ${value}`);
        } else if (key.includes('union')) {
          categories.union.push(`${key}: ${value}`);
        } else if (key.includes('number') || key.includes('members') || key.includes('stations') || key.includes('budget')) {
          categories.department_size.push(`${key}: ${value}`);
        } else if (key.includes('population') || key.includes('industries')) {
          categories.city_info.push(`${key}: ${value}`);
        } else if (key.includes('established') || key.includes('history')) {
          categories.history.push(`${key}: ${value}`);
        } else if (key.includes('programs') || key.includes('mission')) {
          categories.programs.push(`${key}: ${value}`);
        } else if (key.includes('equipment') || key.includes('capabilities')) {
          categories.equipment.push(`${key}: ${value}`);
        } else {
          categories.other.push(`${key}: ${value}`);
        }
      });
      
      let formatted = 'VERIFIED FACTS FROM WEB SEARCH (USE THESE - DO NOT USE TRAINING DATA):\n\n';
      Object.entries(categories).forEach(([cat, items]) => {
        if (items.length > 0) {
          const catName = cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          formatted += `${catName}:\n${items.map(item => `  - ${item}`).join('\n')}\n\n`;
        }
      });
      
      return formatted.trim();
    };
    
    const verifiedFactsText = Object.keys(verifiedFacts).length > 0 
      ? `${formatVerifiedFacts(verifiedFacts)}

CRITICAL: These are the ONLY facts you should use. If a fact is not listed above, state "Information not found" rather than using your training data.`
      : `WARNING: Web search verification failed. You MUST state "Information not found - web search unavailable" for any facts you cannot verify. DO NOT use outdated training data.`;

    // Use the verified facts directly as the research result (no additional comprehensive search)
    const research = verifiedFactsText;

    res.json({
      success: true,
      research: research,
      location: locationString,
      departmentName: departmentName,
      jobType: jobType
    });
  } catch (error) {
    console.error('Error researching city:', error);
    res.status(500).json({ error: 'Failed to research city information', message: error.message });
  }
});

// Simple in-memory cache for location searches (expires after 1 hour)
const locationCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// User profiles - stores comprehensive user information for personalized questions
// In production, this would be stored in a database (e.g., MongoDB, PostgreSQL)
// For now, using in-memory storage with session-based keys
const userProfiles = new Map();

// Helper function to get or create user profile
function getUserProfile(sessionId) {
  if (!userProfiles.has(sessionId)) {
    userProfiles.set(sessionId, {
      sessionId: sessionId,
      name: null,
      city: null,
      stateProvince: null,
      country: null,
      departmentName: null,
      jobType: null,
      voicePreference: null,
      resumeText: null,
      resumeAnalysis: null,
      cityResearch: null,
      conversationHistory: [],
      askedQuestions: [],
      askedCategories: [],
      answerAnalyses: [], // Store recent answer analyses for "areas to work on"
      areasToWorkOn: null, // AI-generated summary of areas to improve
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return userProfiles.get(sessionId);
}

// Helper function to update user profile
function updateUserProfile(sessionId, updates) {
  const profile = getUserProfile(sessionId);
  Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
  return profile;
}

// Load comprehensive country/state/city data from countries-states-cities-database
// Using the public JSON files from: https://github.com/dr5hn/countries-states-cities-database
let countriesData = null;
let statesData = null;
let citiesData = null;

// Load data on startup (lightweight, fast)
async function loadLocationData() {
  try {
    // Use GitHub raw content URLs - more reliable than npm CDN
    // The files are in the json/ directory of the repository
    const baseUrl = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json';
    
    console.log('Loading location data from countries-states-cities-database...');
    
    // Helper function to fetch with timeout
    const fetchWithTimeout = (url, options, timeout = 30000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      return fetchModule(url, {
        ...options,
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
    };
    
    const [countriesRes, statesRes, citiesRes] = await Promise.allSettled([
      fetchWithTimeout(`${baseUrl}/countries.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 30000),
      fetchWithTimeout(`${baseUrl}/states.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 30000),
      fetchWithTimeout(`${baseUrl}/cities.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 60000) // Cities file is larger, allow more time
    ]);
    
    // Handle results - allow partial success
    const countriesResult = countriesRes.status === 'fulfilled' ? countriesRes.value : null;
    const statesResult = statesRes.status === 'fulfilled' ? statesRes.value : null;
    const citiesResult = citiesRes.status === 'fulfilled' ? citiesRes.value : null;
    
    // Check if responses are OK (cities can fail, that's okay)
    if (!countriesResult || !countriesResult.ok) {
      throw new Error(`Failed to load countries: ${countriesResult?.status || 'network error'}`);
    }
    if (!statesResult || !statesResult.ok) {
      throw new Error(`Failed to load states: ${statesResult?.status || 'network error'}`);
    }
    // Cities can fail - we'll just log it and continue
    if (!citiesResult || !citiesResult.ok) {
      console.warn(`Cities data not available (status: ${citiesResult?.status || 'network error'}) - will use Nominatim for city searches`);
    }
    
    // Get text first to check if it's actually JSON
    const [countriesText, statesText, citiesText] = await Promise.all([
      countriesResult.text(),
      statesResult.text(),
      citiesResult && citiesResult.ok ? citiesResult.text() : Promise.resolve('[]')
    ]);
    
    // Check if we got HTML (error page) instead of JSON
    if (countriesText.trim().startsWith('<') || statesText.trim().startsWith('<')) {
      throw new Error('Received HTML instead of JSON (likely an error page)');
    }
    if (citiesText && citiesText.trim().startsWith('<')) {
      console.warn('Cities data returned HTML - will use Nominatim for city searches');
    }
    
    // Parse JSON
    countriesData = JSON.parse(countriesText);
    statesData = JSON.parse(statesText);
    if (citiesResult && citiesResult.ok && citiesText && !citiesText.trim().startsWith('<')) {
      citiesData = JSON.parse(citiesText);
      console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states, ${citiesData.length} cities`);
    } else {
      citiesData = null;
      console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states (cities will use Nominatim)`);
    }
  } catch (error) {
    console.error('Failed to load location data, falling back to static lists:', error.message || error);
    // Fall back to static lists if API fails - this is non-critical
    countriesData = null;
    statesData = null;
    citiesData = null;
  }
}

// Load data on server start
// DISABLED: Old map data loading - no longer using countries-states-cities-database
// loadLocationData();

// Static lists for instant results (fallback if API data not loaded yet)
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

const CANADIAN_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon'
];

// Common cities by state/province (for instant results)
const COMMON_CITIES = {
  'California': ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose', 'Oakland', 'Fresno', 'Long Beach'],
  'Texas': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi'],
  'Florida': ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'Tallahassee', 'St. Petersburg', 'Hialeah'],
  'New York': ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Yonkers', 'Utica', 'New Rochelle'],
  'Illinois': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Elgin', 'Springfield', 'Peoria'],
  'Pennsylvania': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton', 'Bethlehem', 'Lancaster'],
  'Ohio': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma', 'Canton'],
  'British Columbia': ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Richmond', 'Abbotsford', 'Coquitlam', 'Kelowna'],
  'Ontario': ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Windsor'],
  'Alberta': ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Medicine Hat', 'Grande Prairie', 'Airdrie'],
  'Quebec': ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil', 'Sherbrooke', 'Saguenay', 'Levis']
};

// Helper function to search comprehensive location database (instant results)
function searchLocationDatabase(query, type, country, stateProvince) {
  const queryLower = query.toLowerCase();
  let results = [];
  
  if (type === 'state') {
    // Search states/provinces
    let filteredStates = statesData || [];
    
    // Filter by country if specified
    if (country && countriesData) {
      const countryObj = countriesData.find(c => 
        c.name.toLowerCase() === country.toLowerCase() || 
        c.name === country
      );
      if (countryObj) {
        filteredStates = filteredStates.filter(state => 
          state.country_id === countryObj.id
        );
      }
    }
    
    results = filteredStates
      .filter(state => {
        const stateName = (state.name || '').toLowerCase();
        // Strict check: must actually contain the query string
        const contains = stateName.includes(queryLower);
        if (!contains) {
          return false;
        }
        // Debug: log matches
        if (queryLower === 'br') {
          console.log(`  Checking "${stateName}" for "br": ${contains ? 'MATCH' : 'NO MATCH'}`);
        }
        return true;
      })
      .map(state => {
        const stateName = state.name || '';
        const stateLower = stateName.toLowerCase();
        let relevance = 3;
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        } else {
          // This shouldn't happen due to filter, but just in case
          return null;
        }
        
        // Get country name
        let countryName = country || 'Unknown';
        if (countriesData && state.country_id) {
          const countryObj = countriesData.find(c => c.id === state.country_id);
          if (countryObj) {
            countryName = countryObj.name;
          }
        }
        
        return {
          name: stateName,
          country: countryName,
          fullLocation: `${stateName}, ${countryName}`,
          relevance: relevance
        };
      })
      .filter(item => item !== null) // Remove any null items
      .sort((a, b) => {
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        const { relevance, ...clean } = item;
        return clean;
      });
      
  } else if (type === 'city') {
    // Search cities
    let filteredCities = citiesData || [];
    
    // Filter by state/province if specified
    if (stateProvince && statesData) {
      const stateObj = statesData.find(s => 
        (s.name || '').toLowerCase() === stateProvince.toLowerCase()
      );
      if (stateObj) {
        filteredCities = filteredCities.filter(city => 
          city.state_id === stateObj.id
        );
      }
    }
    
    // Filter by country if specified (and no state filter)
    if (country && !stateProvince && countriesData) {
      const countryObj = countriesData.find(c => 
        c.name.toLowerCase() === country.toLowerCase() || 
        c.name === country
      );
      if (countryObj && statesData) {
        const countryStates = statesData.filter(s => s.country_id === countryObj.id);
        const countryStateIds = new Set(countryStates.map(s => s.id));
        filteredCities = filteredCities.filter(city => 
          countryStateIds.has(city.state_id)
        );
      }
    }
    
    results = filteredCities
      .filter(city => {
        const cityName = (city.name || '').toLowerCase();
        return cityName.includes(queryLower);
      })
      .map(city => {
        const cityName = city.name || '';
        const cityLower = cityName.toLowerCase();
        let relevance = 3;
        if (cityLower.startsWith(queryLower)) {
          relevance = 1;
        } else if (cityLower.includes(queryLower)) {
          relevance = 2;
        }
        
        // Get state and country names
        let stateName = stateProvince || '';
        let countryName = country || 'Unknown';
        
        if (statesData && city.state_id) {
          const stateObj = statesData.find(s => s.id === city.state_id);
          if (stateObj) {
            stateName = stateObj.name || '';
            
            if (countriesData && stateObj.country_id) {
              const countryObj = countriesData.find(c => c.id === stateObj.country_id);
              if (countryObj) {
                countryName = countryObj.name;
              }
            }
          }
        }
        
        return {
          name: cityName,
          stateProvince: stateName,
          country: countryName,
          fullLocation: [cityName, stateName, countryName].filter(Boolean).join(', '),
          relevance: relevance
        };
      })
      .sort((a, b) => {
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        const { relevance, ...clean } = item;
        return clean;
      });
  }
  
  return results;
}

// Fallback function using static lists (if database not loaded)
function searchStaticList(query, type, country) {
  const queryLower = query.toLowerCase();
  let results = [];
  
  // Skip static lists for non-US/Canada countries - let them fall through to Nominatim
  if (country && country !== 'United States' && country !== 'Canada') {
    return []; // Return empty to fall through to Nominatim
  }
  
  if (type === 'state') {
    let list = [];
    if (country === 'United States') {
      list = US_STATES;
    } else if (country === 'Canada') {
      list = CANADIAN_PROVINCES;
    } else {
      // If no country specified, search both US and Canada
      list = [...US_STATES, ...CANADIAN_PROVINCES];
    }
    
    results = list
      .filter(state => {
        const stateLower = state.toLowerCase();
        // Strict check: must actually contain the query string
        const contains = stateLower.includes(queryLower);
        if (!contains) {
          return false;
        }
        // Debug logging for "br" query
        if (queryLower === 'br' && country === 'Canada') {
          console.log(`  Filter: "${state}" (${stateLower}) contains "br": ${contains}`);
        }
        return true;
      })
      .map(state => {
        const stateLower = state.toLowerCase();
        let relevance = 3;
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        }
        // Debug logging for "br" query
        if (queryLower === 'br' && country === 'Canada') {
          console.log(`  Map: "${state}" -> relevance ${relevance}`);
        }
        return {
          name: state,
          country: US_STATES.includes(state) ? 'United States' : 'Canada',
          fullLocation: `${state}, ${US_STATES.includes(state) ? 'United States' : 'Canada'}`,
          relevance: relevance
        };
      })
      .sort((a, b) => {
        // Sort by relevance first (1 = best, 2 = good, 3 = ok)
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        // If same length, sort alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        // Remove relevance before returning
        const { relevance, ...clean } = item;
        return clean;
      });
  } else if (type === 'city') {
    // Search common cities (only for US/Canada)
    const allCities = [];
    Object.entries(COMMON_CITIES).forEach(([state, cities]) => {
      cities.forEach(city => {
        allCities.push({ city, state, country: US_STATES.includes(state) ? 'United States' : 'Canada' });
      });
    });
    
    results = allCities
      .filter(item => {
        const cityLower = item.city.toLowerCase();
        const matchesQuery = cityLower.includes(queryLower);
        // Only match if country is US/Canada or not specified
        const matchesCountry = !country || item.country === country;
        return matchesQuery && matchesCountry;
      })
      .map(item => {
        const cityLower = item.city.toLowerCase();
        let relevance = 3;
        if (cityLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (cityLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        }
        return {
          name: item.city,
          stateProvince: item.state,
          country: item.country,
          fullLocation: `${item.city}, ${item.state}, ${item.country}`,
          relevance: relevance
        };
      })
      .sort((a, b) => {
        // Sort by relevance first (1 = best, 2 = good, 3 = ok)
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, sort alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        // Remove relevance before returning
        const { relevance, ...clean } = item;
        return clean;
      });
  }
  
  return results;
}

// POST /api/search-location - Location search with static lists (instant) + Nominatim fallback
app.post('/api/search-location', async (req, res) => {
  try {
    const { query, type, country, stateProvince } = req.body; // type: 'city' or 'state'

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const queryLower = query.toLowerCase();
    
    // ALWAYS use static lists FIRST (instant, no loading time, covers US/Canada)
    console.log(`Searching for ${type} with query: "${query}"${country ? ` in ${country}` : ''}`);
    let searchResults = searchStaticList(query, type, country);
    
    // For cities, filter by state/province if provided
    if (type === 'city' && stateProvince && searchResults.length > 0) {
      searchResults = searchResults.filter(item => 
        item.stateProvince && item.stateProvince.toLowerCase() === stateProvince.toLowerCase()
      );
    }
    
    console.log(`✓ Static list: ${searchResults.length} results for "${query}" (${type})`);
    if (searchResults.length > 0) {
      console.log(`  Results: ${searchResults.map(r => r.name).join(', ')}`);
      return res.json({ suggestions: searchResults });
    }
    
    // Only if static list has no results, try comprehensive database (if loaded)
    if (countriesData && statesData && citiesData) {
      console.log(`Static list empty, trying database for "${query}" (${type})`);
      searchResults = searchLocationDatabase(query, type, country, stateProvince);
      if (searchResults.length > 0) {
        console.log(`✓ Database search: ${searchResults.length} results`);
        return res.json({ suggestions: searchResults });
      }
    }
    
    // Only check cache for Nominatim results (not static - those are always instant)
    const cacheKey = `${type}:${queryLower}:${country || ''}:${stateProvince || ''}`;
    const cached = locationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.json({ suggestions: cached.data });
    }

    console.log(`Static list empty, searching Nominatim for ${type} with query: "${query}"${country ? ` in ${country}` : ''}`);

    // Use OpenStreetMap Nominatim API (free, no API key required)
    // Documentation: https://nominatim.org/release-docs/develop/api/Search/
    
    let searchQuery = query;
    
    if (type === 'city') {
      // Optimize: search for cities/towns/villages, prioritize by state and country
      if (stateProvince && country) {
        searchQuery = `${query}, ${stateProvince}, ${country}`;
      } else if (stateProvince) {
        searchQuery = `${query}, ${stateProvince}`;
      } else if (country) {
        searchQuery = `${query}, ${country}`;
      }
    } else if (type === 'state') {
      // Optimize: search for states/provinces, prioritize by country
      if (country) {
        searchQuery = `${query}, ${country}`;
      }
    } else {
      return res.status(400).json({ error: 'Invalid type. Must be "city" or "state"' });
    }

    // Build Nominatim API URL with optimized parameters
    const baseUrl = 'https://nominatim.openstreetmap.org/search';
    const params = new URLSearchParams({
      q: searchQuery,
      format: 'json',
      addressdetails: '1',
      limit: '8',
      dedupe: '1', // Remove duplicates
      'accept-language': 'en',
      namedetails: '0', // Don't need named details for speed
      extratags: '0' // Don't need extra tags for speed
    });
    
    // Add feature type filter for better results (but don't use it if it slows things down)
    if (type === 'city') {
      // Prioritize cities/towns
      params.append('featuretype', 'city,town,village');
    } else if (type === 'state') {
      params.append('featuretype', 'state,province');
    }

    const url = `${baseUrl}?${params.toString()}`;
    
    console.log(`Calling Nominatim API: ${url}`);

    // Call Nominatim API with proper headers (required by their usage policy)
    // Add timeout to prevent hanging (increased to 15 seconds for reliability)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetchModule(url, {
        headers: {
          'User-Agent': 'FireInterviewCoach/1.0 (contact: support@fireinterviewcoach.com)', // Required by Nominatim
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data = await response.json();
    
    // Transform Nominatim results to our format
    const queryLower = query.toLowerCase();
    const suggestions = data.map(item => {
      const address = item.address || {};
      
      if (type === 'city') {
        const cityName = address.city || address.town || address.village || address.municipality || item.display_name.split(',')[0];
        const stateProvince = address.state || address.province || address.region || '';
        const countryName = address.country || '';
        
        return {
          name: cityName,
          stateProvince: stateProvince,
          country: countryName,
          fullLocation: [cityName, stateProvince, countryName].filter(Boolean).join(', '),
          relevance: cityName.toLowerCase().startsWith(queryLower) ? 1 : (cityName.toLowerCase().includes(queryLower) ? 2 : 3)
        };
      } else {
        // type === 'state'
        const stateName = address.state || address.province || address.region || item.display_name.split(',')[0];
        const countryName = address.country || '';
        
        // Calculate relevance score (lower is better)
        const stateLower = stateName.toLowerCase();
        let relevance = 3; // Default: low relevance
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Exact start match - highest priority
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Contains query - medium priority
        }
        
        return {
          name: stateName,
          country: countryName,
          fullLocation: [stateName, countryName].filter(Boolean).join(', '),
          relevance: relevance
        };
      }
    }).filter(item => {
      // Filter by country if specified
      if (country && item.country) {
        const countryMatch = item.country.toLowerCase().includes(country.toLowerCase()) || 
                            country.toLowerCase().includes(item.country.toLowerCase());
        if (!countryMatch) return false;
      }
      
      // Filter by state/province if specified (for cities)
      if (type === 'city' && stateProvince && item.stateProvince) {
        const stateMatch = item.stateProvince.toLowerCase().includes(stateProvince.toLowerCase()) ||
                          stateProvince.toLowerCase().includes(item.stateProvince.toLowerCase());
        if (!stateMatch) return false;
      }
      
      // Filter out results that don't match the query at all
      const nameLower = item.name.toLowerCase();
      if (!nameLower.includes(queryLower)) {
        return false;
      }
      
      return true;
    }).sort((a, b) => {
      // Sort by relevance (lower number = more relevant)
      if (a.relevance !== b.relevance) {
        return a.relevance - b.relevance;
      }
      // If same relevance, sort alphabetically
      return a.name.localeCompare(b.name);
    });

    // Limit to 8 suggestions and remove duplicates based on name and country
    const uniqueSuggestions = [];
    const seen = new Set();
    for (const suggestion of suggestions) {
      if (uniqueSuggestions.length >= 8) break; // Limit to 8 suggestions
      const key = `${suggestion.name}|${suggestion.country}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Remove relevance score before adding (it's only for sorting)
        const { relevance, ...cleanSuggestion } = suggestion;
        uniqueSuggestions.push(cleanSuggestion);
      }
    }

      console.log(`Returning ${uniqueSuggestions.length} suggestions for ${type} query: "${query}"`);
      
      // Cache the results
      locationCache.set(cacheKey, {
        data: uniqueSuggestions.slice(0, 8),
        timestamp: Date.now()
      });
      
      // Clean up old cache entries (keep cache under 1000 entries)
      if (locationCache.size > 1000) {
        const oldestKey = Array.from(locationCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        locationCache.delete(oldestKey);
      }
      
      res.json({ suggestions: uniqueSuggestions.slice(0, 8) });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Nominatim API timeout');
        throw new Error('Search timeout - please try again');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error searching location:', error);
    console.error('Error stack:', error.stack);
    // Return empty suggestions instead of error to prevent UI breakage
    res.json({ suggestions: [], error: error.message });
  }
});

// POST /api/areas-to-work-on - Generate or update "areas to work on" based on recent answer analyses
app.post('/api/areas-to-work-on', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const profile = getUserProfile(sessionId);
    const analyses = profile.answerAnalyses || [];
    
    if (analyses.length < 3) {
      return res.status(400).json({ 
        error: 'Not enough data', 
        message: 'Need at least 3 answer analyses to generate areas to work on' 
      });
    }
    
    // Extract key feedback points from recent analyses
    const recentAnalyses = analyses.slice(-10); // Last 10 analyses
    const feedbackSummary = recentAnalyses.map(a => ({
      question: a.question,
      category: a.category,
      feedback: a.feedback
    }));
    
    console.log(`[AREAS TO WORK ON] Generating summary for session ${sessionId} based on ${recentAnalyses.length} analyses`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview coach. Analyze multiple answer feedbacks and identify the most important areas a candidate should focus on improving. Be specific, actionable, and encouraging."
        },
        {
          role: "user",
          content: `Based on the candidate's recent interview practice sessions, analyze their performance and provide 2-3 key areas they should work on.

Recent Answer Analyses:
${feedbackSummary.map((a, i) => `
Question ${i + 1} (${a.category}): ${a.question}
Feedback: ${a.feedback.substring(0, 500)}...
`).join('\n---\n')}

Instructions:
- Identify the MOST IMPORTANT patterns across all their answers
- Focus on areas where they consistently struggle or could improve
- Be specific and actionable (not vague like "improve communication")
- Write 2-3 sentences maximum
- Be encouraging but honest
- Update based on their recent performance (if they're improving, note it; if they're getting worse, address it)
- Focus on what will have the biggest impact on their interview success

Format your response as 2-3 clear, concise sentences that directly tell them what to work on.`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });
    
    const areasToWorkOn = response.choices[0].message.content.trim();
    
    // Update profile
    updateUserProfile(sessionId, { areasToWorkOn: areasToWorkOn });
    
    console.log(`[AREAS TO WORK ON] Generated summary for session ${sessionId}`);
    
    res.json({ 
      success: true, 
      areasToWorkOn: areasToWorkOn,
      basedOnAnalyses: recentAnalyses.length
    });
  } catch (error) {
    console.error('Error generating areas to work on:', error);
    res.status(500).json({ error: 'Failed to generate areas to work on', message: error.message });
  }
});

// GET /api/areas-to-work-on - Get current "areas to work on" for a session
app.get('/api/areas-to-work-on', async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const profile = getUserProfile(sessionId);
    const areasToWorkOn = profile.areasToWorkOn || null;
    const analysisCount = (profile.answerAnalyses || []).length;
    
    res.json({ 
      areasToWorkOn: areasToWorkOn,
      hasData: analysisCount >= 3,
      analysisCount: analysisCount
    });
  } catch (error) {
    console.error('Error getting areas to work on:', error);
    res.status(500).json({ error: 'Failed to get areas to work on', message: error.message });
  }
});

// Start server
// ========== ANALYTICS ENDPOINTS ==========

// POST /api/analytics/visit - Log a visit (called from frontend)
app.post('/api/analytics/visit', optionalAuth, async (req, res) => {
  try {
    const { sessionId, city, stateProvince, country, departmentName, jobType } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get client IP and hash it for privacy
    const clientIP = getClientIP(req);
    const ipHash = hashIP(clientIP);
    
    // Check if visit already exists for this session
    let visit = await Analytics.findBySession(sessionId);
    
    if (!visit) {
      // Create new visit record
      visit = await Analytics.create(
        sessionId,
        req.user?.userId || null,
        ipHash,
        city || null,
        stateProvince || null,
        country || null,
        departmentName || null,
        jobType || null
      );
    } else {
      // Update last visit time and increment visit count
      await Analytics.updateLastVisit(sessionId);
      
      // Update user_id if user logged in
      if (req.user?.userId && !visit.user_id) {
        const { query } = require('./db');
        await query('UPDATE analytics_visits SET user_id = $1 WHERE session_id = $2', [req.user.userId, sessionId]);
      }
      
      // Update location/department info if provided and different
      if (city || stateProvince || country || departmentName || jobType) {
        const { query } = require('./db');
        await query(`
          UPDATE analytics_visits 
          SET city = COALESCE($1, city),
              state_province = COALESCE($2, state_province),
              country = COALESCE($3, country),
              department_name = COALESCE($4, department_name),
              job_type = COALESCE($5, job_type)
          WHERE session_id = $6
        `, [city || null, stateProvince || null, country || null, departmentName || null, jobType || null, sessionId]);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics visit error:', error);
    res.status(500).json({ error: 'Failed to log visit', message: error.message });
  }
});

// POST /api/analytics/question - Track question answered
app.post('/api/analytics/question', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    let visit = await Analytics.findBySession(sessionId);
    
    if (visit) {
      // Increment questions answered
      const newCount = (visit.questions_answered || 0) + 1;
      await Analytics.updateQuestions(sessionId, newCount);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics question error:', error);
    res.status(500).json({ error: 'Failed to track question', message: error.message });
  }
});

// GET /api/analytics/dashboard - Admin analytics dashboard (requires secret key)
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    let { secret } = req.query;
    
    // Handle URL encoding - decode if needed
    if (secret) {
      try {
        secret = decodeURIComponent(secret);
      } catch (e) {
        // If decoding fails, use as-is
      }
    }
    
    // Debug logging
    console.log('Analytics dashboard access attempt');
    console.log('Provided secret length:', secret ? secret.length : 0);
    console.log('Provided secret (first 8):', secret ? secret.substring(0, 8) + '...' : 'none');
    console.log('Expected secret length:', ANALYTICS_SECRET ? ANALYTICS_SECRET.length : 0);
    console.log('Expected secret (first 8):', ANALYTICS_SECRET ? ANALYTICS_SECRET.substring(0, 8) + '...' : 'not set');
    console.log('Secrets match:', secret === ANALYTICS_SECRET);
    console.log('Secret comparison (strict):', secret === ANALYTICS_SECRET);
    console.log('Secret comparison (trimmed):', secret?.trim() === ANALYTICS_SECRET?.trim());
    
    // Verify secret key (trim whitespace to handle copy/paste issues)
    const providedSecret = secret ? secret.trim() : '';
    const expectedSecret = ANALYTICS_SECRET ? ANALYTICS_SECRET.trim() : '';
    
    if (!expectedSecret || expectedSecret === 'change-this-secret-key-for-analytics') {
      return res.status(500).json({ 
        error: 'Analytics secret not configured on server',
        hint: 'Set ANALYTICS_SECRET environment variable in Render and restart the service'
      });
    }
    
    if (providedSecret !== expectedSecret) {
      return res.status(401).json({ 
        error: 'Unauthorized - invalid secret key',
        hint: 'Check that ANALYTICS_SECRET environment variable matches the secret in your URL. Make sure to restart the backend service after setting the variable.',
        debug: {
          providedLength: providedSecret.length,
          expectedLength: expectedSecret.length,
          providedFirst8: providedSecret.substring(0, 8),
          expectedFirst8: expectedSecret.substring(0, 8)
        }
      });
    }
    
    // Get all analytics data
    const stats = await Analytics.getStats();
    const visits = await Analytics.getAll(1000);
    const byDepartment = await Analytics.getByDepartment();
    const byCountry = await Analytics.getByCountry();
    const byDate = await Analytics.getByDate(30);
    
    // Format visits for display (remove IP hash for privacy, keep only anonymized data)
    const formattedVisits = visits.map(v => ({
      id: v.id,
      session_id: v.session_id.substring(0, 8) + '...', // Partial session ID only
      user_id: v.user_id || null,
      city: v.city,
      state_province: v.state_province,
      country: v.country,
      department_name: v.department_name,
      job_type: v.job_type,
      questions_answered: v.questions_answered,
      visit_count: v.visit_count || 1,
      first_visit_at: v.first_visit_at,
      last_visit_at: v.last_visit_at
    }));
    
    // Check if client wants JSON (for API access)
    const wantsJSON = req.query.format === 'json' || req.headers.accept?.includes('application/json');
    
    if (wantsJSON) {
      return res.json({
        stats,
        visits: formattedVisits,
        breakdown: {
          by_department: byDepartment,
          by_country: byCountry,
          by_date: byDate
        }
      });
    }
    
    // Return beautiful HTML dashboard
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics Dashboard - Fire Interview Coach</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      padding: 20px;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    h1 {
      color: #fbbf24;
      font-size: 2.5rem;
      margin-bottom: 10px;
      text-align: center;
    }
    
    .subtitle {
      text-align: center;
      color: #94a3b8;
      margin-bottom: 40px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    
    .stat-card {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(251, 191, 36, 0.2);
    }
    
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #fbbf24;
      margin-bottom: 8px;
    }
    
    .stat-label {
      color: #cbd5e1;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .section {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
    }
    
    .section-title {
      color: #fbbf24;
      font-size: 1.5rem;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(251, 191, 36, 0.3);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      background: rgba(30, 41, 59, 0.6);
      color: #fbbf24;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      color: #e2e8f0;
      font-size: 0.9rem;
    }
    
    tr:hover {
      background: rgba(251, 191, 36, 0.05);
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    
    .badge-primary {
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
    }
    
    .badge-success {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }
    
    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    
    .breakdown-item {
      background: rgba(30, 41, 59, 0.4);
      padding: 16px;
      border-radius: 8px;
      border-left: 3px solid #fbbf24;
    }
    
    .breakdown-label {
      color: #cbd5e1;
      font-size: 0.9rem;
      margin-bottom: 8px;
    }
    
    .breakdown-value {
      color: #fbbf24;
      font-size: 1.5rem;
      font-weight: 700;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
    }
    
    .refresh-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: #0f172a;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
      transition: transform 0.2s;
    }
    
    .refresh-btn:hover {
      transform: scale(1.05);
    }
    
    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      table {
        font-size: 0.8rem;
      }
      
      th, td {
        padding: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Analytics Dashboard</h1>
    <p class="subtitle">Fire Interview Coach - Visitor Analytics</p>
    
    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total_visits || 0}</div>
        <div class="stat-label">Total Visits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.unique_sessions || 0}</div>
        <div class="stat-label">Unique Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.registered_users || 0}</div>
        <div class="stat-label">Registered Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.total_questions || 0}</div>
        <div class="stat-label">Questions Answered</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.countries || 0}</div>
        <div class="stat-label">Countries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.departments || 0}</div>
        <div class="stat-label">Departments</div>
      </div>
    </div>
    
    <!-- Breakdowns -->
    <div class="breakdown-grid" style="margin-bottom: 30px;">
      <div class="section">
        <h2 class="section-title">Top Departments</h2>
        ${byDepartment.length > 0 ? byDepartment.map(d => `
          <div class="breakdown-item" style="margin-bottom: 12px;">
            <div class="breakdown-label">${d.department_name || 'Unknown'}</div>
            <div class="breakdown-value">${d.count} visits</div>
          </div>
        `).join('') : '<div class="empty-state">No department data yet</div>'}
      </div>
      
      <div class="section">
        <h2 class="section-title">Top Countries</h2>
        ${byCountry.length > 0 ? byCountry.map(c => `
          <div class="breakdown-item" style="margin-bottom: 12px;">
            <div class="breakdown-label">${c.country || 'Unknown'}</div>
            <div class="breakdown-value">${c.count} visits</div>
          </div>
        `).join('') : '<div class="empty-state">No country data yet</div>'}
      </div>
    </div>
    
    <!-- Recent Visits -->
    <div class="section">
      <h2 class="section-title">Recent Visits (Last ${formattedVisits.length})</h2>
      ${formattedVisits.length > 0 ? `
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Location</th>
                <th>Department</th>
                <th>Job Type</th>
                <th>Questions</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              ${formattedVisits.map(v => `
                <tr>
                  <td>${new Date(v.first_visit_at).toLocaleDateString()}</td>
                  <td>${[v.city, v.state_province, v.country].filter(Boolean).join(', ') || 'Unknown'}</td>
                  <td>${v.department_name || '-'}</td>
                  <td><span class="badge badge-primary">${v.job_type || '-'}</span></td>
                  <td><span class="badge badge-success">${v.questions_answered || 0}</span></td>
                  <td>${v.user_id ? '<span class="badge badge-success">Registered</span>' : '<span class="badge">Anonymous</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state">No visits recorded yet</div>'}
    </div>
    
    <!-- Daily Stats -->
    <div class="section">
      <h2 class="section-title">Daily Visits (Last 30 Days)</h2>
      ${byDate.length > 0 ? `
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Visits</th>
              </tr>
            </thead>
            <tbody>
              ${byDate.map(d => `
                <tr>
                  <td>${new Date(d.date).toLocaleDateString()}</td>
                  <td><span class="badge badge-primary">${d.count}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state">No daily data yet</div>'}
    </div>
  </div>
  
  <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh</button>
  
  <script>
    // Auto-refresh every 30 seconds
    setInterval(() => {
      window.location.reload();
    }, 30000);
    
    // Show last updated time
    const lastUpdated = new Date().toLocaleTimeString();
    const updateIndicator = document.createElement('div');
    updateIndicator.style.cssText = 'position: fixed; bottom: 20px; left: 20px; color: #94a3b8; font-size: 0.85rem; background: rgba(15, 23, 42, 0.9); padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.2);';
    updateIndicator.textContent = 'Last updated: ' + lastUpdated + ' | Auto-refreshing every 30s';
    document.body.appendChild(updateIndicator);
  </script>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to get analytics', message: error.message });
  }
});

// DIAGNOSTIC ENDPOINT: Find all accounts by email (for debugging credit issues)
app.get('/api/admin/find-accounts', async (req, res) => {
  try {
    const { email, secret } = req.query;
    
    // Require secret for security
    if (!secret || secret !== ANALYTICS_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { query } = require('./db');
    
    let accounts = [];
    let allAccounts = [];
    let highCreditAccounts = [];
    let creditHistory = [];
    let transactions = [];
    
    if (email) {
      // Find all accounts with this email (case-insensitive)
      const accountsResult = await query(`
        SELECT id, email, provider, provider_id, credits_balance, created_at, updated_at
        FROM users
        WHERE LOWER(email) = LOWER($1)
        ORDER BY created_at DESC
      `, [email]);
      accounts = accountsResult.rows;
      
      // Get credit ledger for the email accounts
      if (accounts.length > 0) {
        const userIds = accounts.map(a => a.id);
        const historyResult = await query(`
          SELECT user_id, change, reason, created_at
          FROM credit_ledger
          WHERE user_id = ANY($1)
          ORDER BY created_at DESC
          LIMIT 50
        `, [userIds]);
        creditHistory = historyResult.rows;
      }
    }
    
    // Get ALL accounts in the database
    const allAccountsResult = await query(`
      SELECT id, email, provider, provider_id, credits_balance, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 50
    `);
    allAccounts = allAccountsResult.rows;
    
    // Find accounts with high credit balances
    const highCreditResult = await query(`
      SELECT id, email, provider, provider_id, credits_balance, created_at
      FROM users
      WHERE credits_balance > 0
      ORDER BY credits_balance DESC
      LIMIT 20
    `);
    highCreditAccounts = highCreditResult.rows;
    
    // Get all transactions with high credit amounts
    const transactionsResult = await query(`
      SELECT id, user_id, pack_id, credits_purchased, amount_paid_cents, status, created_at
      FROM transactions
      WHERE credits_purchased > 0
      ORDER BY created_at DESC
      LIMIT 20
    `);
    transactions = transactionsResult.rows;
    
    // Get all credit ledger entries with large changes
    const largeCreditResult = await query(`
      SELECT user_id, change, reason, created_at
      FROM credit_ledger
      WHERE ABS(change) > 100
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const largeCreditChanges = largeCreditResult.rows;
    
    res.json({
      email: email || 'all',
      accounts: accounts,
      allAccounts: allAccounts,
      highCreditAccounts: highCreditAccounts,
      creditHistory: creditHistory,
      largeCreditChanges: largeCreditChanges,
      transactions: transactions,
      totalAccountsFound: accounts.length,
      totalAccountsInDatabase: allAccounts.length,
      databaseStats: {
        totalUsers: allAccounts.length,
        usersWithCredits: highCreditAccounts.length,
        totalTransactions: transactions.length
      }
    });
  } catch (error) {
    console.error('Find accounts error:', error);
    res.status(500).json({ error: 'Failed to find accounts', message: error.message });
  }
});

// MERGE ENDPOINT: Merge two accounts (transfer credits from source to target)
app.post('/api/admin/merge-accounts', async (req, res) => {
  try {
    const { sourceUserId, targetUserId, secret } = req.body;
    
    // Require secret for security
    if (!secret || secret !== ANALYTICS_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!sourceUserId || !targetUserId) {
      return res.status(400).json({ error: 'sourceUserId and targetUserId required' });
    }
    
    if (sourceUserId === targetUserId) {
      return res.status(400).json({ error: 'Cannot merge account with itself' });
    }
    
    // Get both users
    const sourceUser = await User.findById(sourceUserId);
    const targetUser = await User.findById(targetUserId);
    
    if (!sourceUser || !targetUser) {
      return res.status(404).json({ error: 'One or both users not found' });
    }
    
    console.log(`[MERGE] Merging account ${sourceUserId} (${sourceUser.email}, ${sourceUser.credits_balance} credits) into ${targetUserId} (${targetUser.email}, ${targetUser.credits_balance} credits)`);
    
    // Transfer credits
    if (sourceUser.credits_balance > 0) {
      await User.addCredits(targetUserId, sourceUser.credits_balance, `Merged from account ${sourceUserId} (${sourceUser.email})`);
      console.log(`[MERGE] Transferred ${sourceUser.credits_balance} credits to account ${targetUserId}`);
    }
    
    // Update source account provider_id to point to target (so future logins use target)
    if (sourceUser.provider === 'google' && sourceUser.provider_id) {
      const { query } = require('./db');
      // Copy provider_id from source to target so both work
      await query('UPDATE users SET provider_id = $1 WHERE id = $2', [sourceUser.provider_id, targetUserId]);
      console.log(`[MERGE] Updated provider_id for account ${targetUserId}`);
    }
    
    // Get updated target user
    const updatedTarget = await User.findById(targetUserId);
    
    res.json({
      success: true,
      message: `Merged account ${sourceUserId} into ${targetUserId}`,
      sourceAccount: {
        id: sourceUser.id,
        email: sourceUser.email,
        credits_before: sourceUser.credits_balance,
        credits_after: 0
      },
      targetAccount: {
        id: updatedTarget.id,
        email: updatedTarget.email,
        credits_before: targetUser.credits_balance,
        credits_after: updatedTarget.credits_balance
      }
    });
  } catch (error) {
    console.error('Merge accounts error:', error);
    res.status(500).json({ error: 'Failed to merge accounts', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Fire Interview Coach API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Analytics dashboard: http://localhost:${PORT}/api/analytics/dashboard?secret=${ANALYTICS_SECRET}`);
});
