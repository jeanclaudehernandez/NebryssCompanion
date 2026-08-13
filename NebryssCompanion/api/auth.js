const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { sendVerificationEmail } = require('./mailer');

const COOKIE_NAME = 'nebryss_auth_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days (1 Month)
const SESSION_DURATION_SEC = 30 * 24 * 60 * 60;

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || 'nebryss-campaign-imperial-auth-secret-key-2026';
}

// ─── Cryptographic Password Hashing & Verification ───────────────────────────

function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (hashBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
  } catch (err) {
    return false;
  }
}

// ─── Cryptographic Session Token (HMAC-SHA256) ──────────────────────────────

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function signSessionToken(payload) {
  const secret = getAuthSecret();
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const encodedData = base64UrlEncode(data);
  const signature = crypto.createHmac('sha256', secret).update(encodedData).digest('base64url');
  return `${encodedData}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedData, signature] = parts;
  const secret = getAuthSecret();
  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedData).digest('base64url');

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(encodedData));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

// ─── Cookie Utilities ────────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function setAuthCookie(res, token, req) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSite = isHttps ? 'None' : 'Lax';
  let cookieStr = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DURATION_SEC}; HttpOnly; SameSite=${sameSite}`;
  if (isHttps) {
    cookieStr += '; Secure';
  }
  res.setHeader('Set-Cookie', cookieStr);
}

function clearAuthCookie(res, req) {
  const isHttps = req ? (req.secure || req.headers['x-forwarded-proto'] === 'https') : false;
  const sameSite = isHttps ? 'None' : 'Lax';
  let cookieStr = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=${sameSite}`;
  if (isHttps) {
    cookieStr += '; Secure';
  }
  res.setHeader('Set-Cookie', cookieStr);
}

function extractTokenFromRequest(req) {
  if (req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[COOKIE_NAME]) {
      return cookies[COOKIE_NAME];
    }
  }
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.substring(7).trim();
  }
  if (req.query && req.query.token) {
    return req.query.token;
  }
  return null;
}

// ─── User Store Database Access (MongoDB or Local JSON) ─────────────────────

function createAuthModule(getDatabasesFn, assetsDir) {
  const usersJsonPath = path.join(assetsDir, 'users.json');

  function readLocalUsers() {
    try {
      if (fs.existsSync(usersJsonPath)) {
        const raw = fs.readFileSync(usersJsonPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[Auth] Error reading local users.json:', e);
    }
    return [];
  }

  function writeLocalUsers(users) {
    try {
      fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
    } catch (e) {
      console.error('[Auth] Error writing local users.json:', e);
    }
  }

  async function findUserByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const dbs = await getDatabasesFn();
    if (dbs && dbs.playersDb) {
      return await dbs.playersDb.collection('users').findOne({ email: normalized });
    }
    const local = readLocalUsers();
    return local.find(u => String(u.email || '').toLowerCase() === normalized) || null;
  }

  async function findUserByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    const dbs = await getDatabasesFn();
    if (dbs && dbs.playersDb) {
      return await dbs.playersDb.collection('users').findOne({
        username: { $regex: new RegExp(`^${normalized}$`, 'i') }
      });
    }
    const local = readLocalUsers();
    return local.find(u => String(u.username || '').toLowerCase() === normalized) || null;
  }

  async function findUserById(id) {
    const dbs = await getDatabasesFn();
    if (dbs && dbs.playersDb) {
      try {
        const { ObjectId } = require('mongodb');
        if (ObjectId.isValid(id)) {
          return await dbs.playersDb.collection('users').findOne({ _id: new ObjectId(id) });
        }
      } catch (e) {}
      return await dbs.playersDb.collection('users').findOne({ id: String(id) });
    }
    const local = readLocalUsers();
    return local.find(u => String(u._id || u.id) === String(id)) || null;
  }

  async function countUsers() {
    const dbs = await getDatabasesFn();
    if (dbs && dbs.playersDb) {
      return await dbs.playersDb.collection('users').countDocuments();
    }
    const local = readLocalUsers();
    return local.length;
  }

  async function createUser(userData) {
    const dbs = await getDatabasesFn();
    const newUser = {
      ...userData,
      email: String(userData.email).trim().toLowerCase(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (dbs && dbs.playersDb) {
      const res = await dbs.playersDb.collection('users').insertOne(newUser);
      newUser._id = res.insertedId;
      return newUser;
    }

    const local = readLocalUsers();
    newUser.id = String(Date.now());
    newUser._id = newUser.id;
    local.push(newUser);
    writeLocalUsers(local);
    return newUser;
  }

  async function updateUser(id, updates) {
    const dbs = await getDatabasesFn();
    const updatedFields = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (dbs && dbs.playersDb) {
      try {
        const { ObjectId } = require('mongodb');
        if (ObjectId.isValid(id)) {
          await dbs.playersDb.collection('users').updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
          );
          return await dbs.playersDb.collection('users').findOne({ _id: new ObjectId(id) });
        }
      } catch (e) {}
      await dbs.playersDb.collection('users').updateOne(
        { id: String(id) },
        { $set: updatedFields }
      );
      return await dbs.playersDb.collection('users').findOne({ id: String(id) });
    }

    const local = readLocalUsers();
    const index = local.findIndex(u => String(u._id || u.id) === String(id));
    if (index !== -1) {
      local[index] = { ...local[index], ...updatedFields };
      writeLocalUsers(local);
      return local[index];
    }
    return null;
  }

  // ─── Authentication Middleware ──────────────────────────────────────────────

  function requireAuth(req, res, next) {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Session authentication required' });
    }
    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
    }
    req.user = session;
    next();
  }

  // ─── Express Router ─────────────────────────────────────────────────────────

  const router = express.Router();

  // POST /api/auth/register
  router.post('/register', async (req, res) => {
    try {
      const { email, password } = req.body;
      let username = req.body.username;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const trimmedEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }

      if (String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      const existingEmail = await findUserByEmail(trimmedEmail);
      if (existingEmail) {
        return res.status(400).json({ error: 'An account with this email address already exists.' });
      }

      if (!username || !String(username).trim()) {
        username = trimmedEmail.split('@')[0];
      } else {
        username = String(username).trim();
      }

      const { salt, hash } = hashPassword(password);
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationCodeExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

      const totalUsers = await countUsers();
      const adminEmails = (process.env.ADMIN_EMAIL || '').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
      const userRole = (totalUsers === 0 || adminEmails.includes(trimmedEmail)) ? 'admin' : 'user';

      const user = await createUser({
        email: trimmedEmail,
        username,
        passwordHash: hash,
        salt,
        isVerified: false,
        verificationCode,
        verificationCodeExpires,
        role: userRole,
      });

      // Send real verification email via SMTP
      sendVerificationEmail(trimmedEmail, verificationCode, username).catch(err => {
        console.error('[Auth] Failed to send verification email:', err);
      });

      return res.json({
        success: true,
        message: 'Registration successful! A 6-digit verification code has been sent to your email.',
        email: user.email,
        username: user.username,
      });
    } catch (err) {
      console.error('[Auth] Register error:', err);
      return res.status(500).json({ error: 'Failed to complete registration.' });
    }
  });

  // POST /api/auth/validate-email
  router.post('/validate-email', async (req, res) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and verification code are required.' });
      }

      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      if (user.isVerified) {
        // Already verified, generate session and log in
        const token = signSessionToken({
          userId: String(user._id || user.id),
          email: user.email,
          username: user.username,
          role: user.role || 'user',
        });
        setAuthCookie(res, token, req);
        return res.json({
          success: true,
          message: 'Account is already verified.',
          user: {
            id: String(user._id || user.id),
            email: user.email,
            username: user.username,
            role: user.role || 'user',
            isVerified: true,
          },
          token,
        });
      }

      if (!user.verificationCode || String(user.verificationCode).trim() !== String(code).trim()) {
        return res.status(400).json({ error: 'Invalid verification code. Please check your email.' });
      }

      if (user.verificationCodeExpires && Date.now() > user.verificationCodeExpires) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
      }

      // Mark verified
      const updated = await updateUser(user._id || user.id, {
        isVerified: true,
        verificationCode: null,
        verificationCodeExpires: null,
        lastLoginAt: new Date().toISOString(),
      });

      const token = signSessionToken({
        userId: String(updated._id || updated.id),
        email: updated.email,
        username: updated.username,
        role: updated.role || 'user',
      });

      setAuthCookie(res, token, req);

      return res.json({
        success: true,
        message: 'Email successfully verified! Welcome to Nebryss Companion.',
        user: {
          id: String(updated._id || updated.id),
          email: updated.email,
          username: updated.username,
          role: updated.role || 'user',
          isVerified: true,
        },
        token,
      });
    } catch (err) {
      console.error('[Auth] Validate email error:', err);
      return res.status(500).json({ error: 'Failed to validate email.' });
    }
  });

  // POST /api/auth/resend-code
  router.post('/resend-code', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
      }

      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      if (user.isVerified) {
        return res.status(400).json({ error: 'Account is already verified. Please log in.' });
      }

      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationCodeExpires = Date.now() + 15 * 60 * 1000;

      await updateUser(user._id || user.id, {
        verificationCode,
        verificationCodeExpires,
      });

      sendVerificationEmail(user.email, verificationCode, user.username).catch(err => {
        console.error('[Auth] Resend email failed:', err);
      });

      return res.json({
        success: true,
        message: 'A new 6-digit verification code has been dispatched to your email.',
      });
    } catch (err) {
      console.error('[Auth] Resend code error:', err);
      return res.status(500).json({ error: 'Failed to resend verification code.' });
    }
  });

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    try {
      const { emailOrUsername, password } = req.body;

      if (!emailOrUsername || !password) {
        return res.status(400).json({ error: 'Email/Username and password are required.' });
      }

      const term = String(emailOrUsername).trim();
      let user = await findUserByEmail(term);
      if (!user) {
        user = await findUserByUsername(term);
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid email/username or password.' });
      }

      const isValidPassword = verifyPassword(password, user.salt, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email/username or password.' });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          error: 'Please verify your email address before logging in.',
          requiresVerification: true,
          email: user.email,
        });
      }

      await updateUser(user._id || user.id, {
        lastLoginAt: new Date().toISOString(),
      });

      const token = signSessionToken({
        userId: String(user._id || user.id),
        email: user.email,
        username: user.username,
        role: user.role || 'user',
      });

      setAuthCookie(res, token, req);

      return res.json({
        success: true,
        message: 'Login successful.',
        user: {
          id: String(user._id || user.id),
          email: user.email,
          username: user.username,
          role: user.role || 'user',
          isVerified: true,
        },
        token,
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      return res.status(500).json({ error: 'Failed to authenticate user.' });
    }
  });

  // GET /api/auth/me
  router.get('/me', requireAuth, async (req, res) => {
    try {
      const user = await findUserById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      return res.json({
        authenticated: true,
        user: {
          id: String(user._id || user.id),
          email: user.email,
          username: user.username,
          role: user.role || 'user',
          isVerified: user.isVerified !== false,
          lastLoginAt: user.lastLoginAt,
        },
      });
    } catch (err) {
      console.error('[Auth] /me error:', err);
      return res.status(500).json({ error: 'Failed to retrieve session info.' });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    clearAuthCookie(res, req);
    return res.json({ success: true, message: 'Logged out successfully.' });
  });

  return {
    router,
    requireAuth,
    verifySessionToken,
    extractTokenFromRequest,
    findUserById,
  };
}

module.exports = {
  createAuthModule,
  verifySessionToken,
  parseCookies,
  COOKIE_NAME,
};
