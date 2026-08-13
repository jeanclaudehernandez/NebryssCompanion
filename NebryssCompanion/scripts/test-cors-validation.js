const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const { isOriginAllowed, corsOptions, originValidationMiddleware, validateWsOrigin } = require('../api/cors-config');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runUnitTests() {
  console.log('\n--- 1. Unit Tests for DuckDNS / Remote Mode (ALLOW_LOCALHOST=false) ---');
  process.env.ALLOW_LOCALHOST = 'false';

  // Configured Ngrok domain must be allowed
  assert(
    isOriginAllowed('https://chitchat-statistic-shuffle.ngrok-free.dev'),
    '[Remote] Configured Ngrok domain with https is allowed'
  );
  assert(
    isOriginAllowed('http://chitchat-statistic-shuffle.ngrok-free.dev'),
    '[Remote] Configured Ngrok domain with http is allowed'
  );

  // DuckDNS domain must be allowed
  assert(
    isOriginAllowed('https://nebryss.duckdns.org'),
    '[Remote] DuckDNS domain is allowed'
  );

  // Localhost & LAN IP variations must be BLOCKED in remote/duckdns mode
  assert(
    !isOriginAllowed('http://localhost:4200'),
    '[Remote] Localhost (http://localhost:4200) is blocked in DuckDNS mode'
  );
  assert(
    !isOriginAllowed('http://localhost:8080'),
    '[Remote] Localhost (http://localhost:8080) is blocked in DuckDNS mode'
  );
  assert(
    !isOriginAllowed('http://127.0.0.1:8080'),
    '[Remote] 127.0.0.1 is blocked in DuckDNS mode'
  );
  assert(
    !isOriginAllowed('http://192.168.1.105:8080'),
    '[Remote] LAN IP is blocked in DuckDNS mode'
  );
  assert(
    !isOriginAllowed('https://evil-hacker.com'),
    '[Remote] Arbitrary external domain is blocked'
  );

  console.log('\n--- 2. Unit Tests for Local Dev Mode (ALLOW_LOCALHOST=true) ---');
  process.env.ALLOW_LOCALHOST = 'true';

  // Localhost & LAN IP variations must be ALLOWED in local dev mode
  assert(
    isOriginAllowed('http://localhost:4200'),
    '[Local] Local Angular dev server (http://localhost:4200) is allowed'
  );
  assert(
    isOriginAllowed('http://localhost:8080'),
    '[Local] Localhost port 8080 is allowed'
  );
  assert(
    isOriginAllowed('http://127.0.0.1:8080'),
    '[Local] 127.0.0.1 loopback is allowed'
  );
  assert(
    isOriginAllowed('http://192.168.1.105:8080'),
    '[Local] Private LAN IPv4 (192.168.x.x) is allowed for mobile dev'
  );
  assert(
    isOriginAllowed('https://chitchat-statistic-shuffle.ngrok-free.dev'),
    '[Local] Configured Ngrok domain is still allowed'
  );
  assert(
    !isOriginAllowed('https://evil-hacker.com'),
    '[Local] Arbitrary external domain is still blocked'
  );
}

async function runIntegrationTests() {
  console.log('\n--- 3. Integration Tests in Remote / DuckDNS Mode (ALLOW_LOCALHOST=false) ---');
  process.env.ALLOW_LOCALHOST = 'false';

  const testPort = 8998;
  const app = express();
  app.use(cors(corsOptions));
  app.use(originValidationMiddleware);

  app.use((err, req, res, next) => {
    if (err && err.message === 'CORS origin not allowed') {
      return res.status(403).json({ error: 'Forbidden: CORS origin not allowed' });
    }
    next(err);
  });

  app.get('/api/test-cors', (req, res) => {
    res.json({ success: true, message: 'CORS OK' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (!validateWsOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nForbidden: Origin not allowed\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  await new Promise((resolve) => server.listen(testPort, resolve));

  // 1. HTTP: Valid Ngrok Origin
  const ngrokRes = await new Promise((resolve) => {
    const req = http.request(
      `http://127.0.0.1:${testPort}/api/test-cors`,
      {
        method: 'GET',
        headers: {
          Origin: 'https://chitchat-statistic-shuffle.ngrok-free.dev',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
      }
    );
    req.end();
  });

  assert(
    ngrokRes.status === 200 &&
    ngrokRes.headers['access-control-allow-origin'] === 'https://chitchat-statistic-shuffle.ngrok-free.dev',
    'HTTP API allows valid Ngrok origin in DuckDNS mode'
  );

  // 2. HTTP: Localhost Origin (Should be blocked in DuckDNS mode!)
  const localhostRes = await new Promise((resolve) => {
    const req = http.request(
      `http://127.0.0.1:${testPort}/api/test-cors`,
      {
        method: 'GET',
        headers: {
          Origin: 'http://localhost:4200',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
      }
    );
    req.end();
  });

  assert(
    localhostRes.status === 403,
    'HTTP API rejects localhost in DuckDNS mode with HTTP 403 Forbidden'
  );

  // 3. WebSocket: Valid Ngrok Origin Handshake
  const wsValid = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`, {
      headers: {
        Origin: 'https://chitchat-statistic-shuffle.ngrok-free.dev',
      },
    });

    ws.on('open', () => {
      ws.close();
      resolve(true);
    });

    ws.on('error', () => {
      resolve(false);
    });
  });

  assert(wsValid === true, 'WebSocket connection succeeds with authorized Ngrok Origin');

  // 4. WebSocket: Localhost Origin Handshake (Should be blocked in DuckDNS mode!)
  const wsLocalBlocked = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`, {
      headers: {
        Origin: 'http://localhost:4200',
      },
    });

    ws.on('open', () => {
      ws.close();
      resolve(false);
    });

    ws.on('unexpected-response', (req, res) => {
      resolve(res.statusCode === 403);
    });

    ws.on('error', (err) => {
      resolve(true);
    });
  });

  assert(wsLocalBlocked === true, 'WebSocket connection from localhost is rejected with 403 in DuckDNS mode');

  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  console.log('====================================================');
  console.log('  CORS & WebSocket Mode Validation Test Suite');
  console.log('====================================================');

  await runUnitTests();
  await runIntegrationTests();

  console.log('\n====================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
