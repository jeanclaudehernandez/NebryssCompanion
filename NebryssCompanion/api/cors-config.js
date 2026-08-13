const fs = require('fs');
const path = require('path');

/**
 * Ensures environment variables (.env and .env.duckdns) are loaded.
 */
function loadEnv() {
  const envFiles = [
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../.env.duckdns')
  ];
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const envConfig = fs.readFileSync(envFile, 'utf8');
      envConfig.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          if (key && !process.env[key.trim()]) {
            process.env[key.trim()] = vals.join('=').trim();
          }
        }
      });
    }
  }
}

// Load env at module import time
loadEnv();

/**
 * Normalizes a domain string (strips protocol and trailing slashes).
 */
function cleanDomain(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim().toLowerCase();
}

/**
 * Checks whether localhost and local network origins are allowed.
 */
function isLocalhostAllowed() {
  const val = process.env.ALLOW_LOCALHOST || process.env.ALLOW_LOCAL_ORIGINS;
  if (val !== undefined && (String(val).trim().toLowerCase() === 'false' || String(val).trim() === '0')) {
    return false;
  }
  return true;
}

/**
 * Checks whether a given hostname is a localhost or local LAN IP.
 */
function isLocalhostHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.trim().toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    h === '::1' ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h) ||
    h.endsWith('.local')
  );
}

/**
 * Computes all allowed origins dynamically based on active environment variables.
 */
function getAllowedOrigins() {
  loadEnv();
  const origins = new Set();

  // 1. Localhost and Loopback (only when allowed in local dev mode)
  if (isLocalhostAllowed()) {
    const localHostnames = ['localhost', '127.0.0.1', '[::1]'];
    const localPorts = [80, 443, 8080, 8081, 4200, 3000, 5000, 5173, 8000];

    localHostnames.forEach(host => {
      origins.add(`http://${host}`);
      origins.add(`https://${host}`);
      localPorts.forEach(port => {
        origins.add(`http://${host}:${port}`);
        origins.add(`https://${host}:${port}`);
      });
    });
  }

  // 2. Ngrok Fixed Domain from process.env.NGROK_DOMAIN
  if (process.env.NGROK_DOMAIN) {
    const ngrokHost = cleanDomain(process.env.NGROK_DOMAIN);
    if (ngrokHost) {
      origins.add(`https://${ngrokHost}`);
      origins.add(`http://${ngrokHost}`);
    }
  }

  // 3. DuckDNS Domain from process.env.DUCKDNS_DOMAIN
  if (process.env.DUCKDNS_DOMAIN) {
    const duckHost = `${cleanDomain(process.env.DUCKDNS_DOMAIN)}.duckdns.org`;
    origins.add(`https://${duckHost}`);
    origins.add(`http://${duckHost}`);
    if (process.env.PORT) {
      origins.add(`http://${duckHost}:${process.env.PORT}`);
      origins.add(`https://${duckHost}:${process.env.PORT}`);
    }
  }

  // 4. Explicit list from ALLOWED_ORIGINS (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(o => {
      const trimmed = o.trim();
      if (trimmed) {
        origins.add(trimmed.replace(/\/+$/, ''));
      }
    });
  }

  // 5. Explicit list from CORS_ORIGIN
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').forEach(o => {
      const trimmed = o.trim();
      if (trimmed) {
        origins.add(trimmed.replace(/\/+$/, ''));
      }
    });
  }

  return origins;
}

/**
 * Checks if a given origin (or referer) is allowed.
 *
 * @param {string} [origin] - Origin or URL string to check
 * @param {string} [reqHost] - Host header from request
 * @returns {boolean}
 */
function isOriginAllowed(origin, reqHost) {
  // If Origin header is missing (e.g. non-browser / direct API calls), check Host header
  if (!origin || typeof origin !== 'string') {
    if (reqHost) {
      const hostPart = cleanDomain(reqHost).split(':')[0];
      if (isLocalhostHostname(hostPart)) {
        return isLocalhostAllowed();
      }
    }
    return true;
  }

  const normalized = origin.trim().replace(/\/+$/, '');
  const allowed = getAllowedOrigins();

  if (allowed.has(normalized)) {
    return true;
  }

  // Check case-insensitively
  for (const allowedOrigin of allowed) {
    if (allowedOrigin.toLowerCase() === normalized.toLowerCase()) {
      return true;
    }
  }

  // Check URL hostname matching
  try {
    const parsedUrl = new URL(normalized);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Localhost / Loopback / Local IP matching
    if (isLocalhostHostname(hostname)) {
      return isLocalhostAllowed();
    }

    // Configured Ngrok Domain match
    if (process.env.NGROK_DOMAIN) {
      const configuredNgrok = cleanDomain(process.env.NGROK_DOMAIN);
      if (hostname === configuredNgrok) {
        return true;
      }
    }

    // DuckDNS Domain match
    if (process.env.DUCKDNS_DOMAIN) {
      const configuredDuck = `${cleanDomain(process.env.DUCKDNS_DOMAIN)}.duckdns.org`;
      if (hostname === configuredDuck) {
        return true;
      }
    }

    // Cloudflare tunnels if active
    if (hostname.endsWith('.trycloudflare.com')) {
      return true;
    }

    // Match against Request Host header (same host)
    if (reqHost) {
      const cleanReqHost = cleanDomain(reqHost).split(':')[0];
      if (cleanReqHost && cleanReqHost === hostname) {
        if (isLocalhostHostname(hostname)) {
          return isLocalhostAllowed();
        }
        return true;
      }
    }
  } catch (err) {
    return false;
  }

  return false;
}

/**
 * Express CORS options object.
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser / same-origin requests without an Origin header
    if (!origin) {
      return callback(null, true);
    }
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Rejected request from unauthorized origin: ${origin}`);
    return callback(new Error('CORS origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Admin-PIN',
    'X-Campaign',
    'ngrok-skip-browser-warning',
    'ngsw-bypass',
    'Cache-Control',
    'Pragma',
    'Expires',
    'Cookie',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Set-Cookie']
};

/**
 * Middleware explicitly validating Origin and Referer on incoming requests.
 */
function originValidationMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host;

  if (origin && !isOriginAllowed(origin, reqHost)) {
    console.warn(`[API] Blocked unauthorized origin: ${origin} on ${req.method} ${req.originalUrl || req.url}`);
    return res.status(403).json({ error: 'Forbidden: CORS origin not allowed' });
  }

  if (referer && !origin) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refOrigin, reqHost)) {
        console.warn(`[API] Blocked unauthorized referer: ${referer} on ${req.method} ${req.originalUrl || req.url}`);
        return res.status(403).json({ error: 'Forbidden: Referer origin not allowed' });
      }
    } catch (e) {
      // Ignore malformed referer
    }
  }

  next();
}

/**
 * WebSocket upgrade origin validator.
 * Returns true if allowed, false if rejected.
 */
function validateWsOrigin(request) {
  const origin = request.headers.origin;
  const referer = request.headers.referer;
  const reqHost = request.headers['x-forwarded-host'] || request.headers.host;

  if (origin && !isOriginAllowed(origin, reqHost)) {
    return false;
  }

  if (referer && !origin) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refOrigin, reqHost)) {
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  return true;
}

module.exports = {
  loadEnv,
  cleanDomain,
  getAllowedOrigins,
  isOriginAllowed,
  isLocalhostAllowed,
  isLocalhostHostname,
  corsOptions,
  originValidationMiddleware,
  validateWsOrigin
};
