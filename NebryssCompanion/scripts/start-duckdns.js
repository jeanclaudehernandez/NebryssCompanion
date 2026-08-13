const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

// Load .env.duckdns
const envPath = path.join(__dirname, '../.env.duckdns');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  });
}

// Disallow localhost / local network origins in remote DuckDNS & Ngrok mode
process.env.ALLOW_LOCALHOST = 'false';
process.env.ALLOW_LOCAL_ORIGINS = 'false';

const port = process.env.PORT || 8080;
const domain = process.env.DUCKDNS_DOMAIN || 'nebryss';
const ngrokDomain = process.env.NGROK_DOMAIN;
const ngrokAuthToken = process.env.NGROK_AUTHTOKEN;

console.log('====================================================');
console.log('  NebryssCompanion - Permanent Local Server Launcher');
console.log('====================================================');
console.log(`DuckDNS    : ${domain}.duckdns.org`);
console.log(`Local Port : ${port}`);
console.log(`Localhost  : Blocked (Remote/Ngrok Only)`);
if (ngrokDomain) {
  console.log(`Fixed Domain: ${ngrokDomain}`);
}
console.log('====================================================');

function isPortOpen(checkPort, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(checkPort, host);
  });
}

function findMongodExecutable() {
  const isWin = process.platform === 'win32';
  const checkCmd = isWin ? 'where mongod' : 'which mongod';
  try {
    const stdout = spawnSync(isWin ? 'cmd.exe' : 'sh', [isWin ? '/c' : '-c', checkCmd], { encoding: 'utf8' });
    if (stdout.stdout) {
      const line = stdout.stdout.trim().split(/\r?\n/)[0].trim();
      if (line && fs.existsSync(line)) {
        return line;
      }
    }
  } catch (e) {}

  if (isWin) {
    const basePath = 'C:\\Program Files\\MongoDB\\Server';
    if (fs.existsSync(basePath)) {
      try {
        const versions = fs.readdirSync(basePath);
        for (const ver of versions.sort().reverse()) {
          const binPath = path.join(basePath, ver, 'bin', 'mongod.exe');
          if (fs.existsSync(binPath)) {
            return binPath;
          }
        }
      } catch (e) {}
    }
  } else {
    const unixPaths = ['/usr/local/bin/mongod', '/usr/bin/mongod', '/opt/homebrew/bin/mongod'];
    for (const candidate of unixPaths) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function ensureDatabase() {
  const mongoPort = 27017;
  const isRunning = await isPortOpen(mongoPort);

  if (isRunning) {
    console.log('[DB] MongoDB service is already running on port 27017.');
    return true;
  }

  const mongodExe = findMongodExecutable();
  if (mongodExe) {
    const dbPath = path.join(__dirname, '../local-db/mongodb_data');
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }

    console.log(`[DB] Starting background MongoDB instance (${mongodExe})...`);
    const bgMongod = spawn(mongodExe, ['--dbpath', dbPath, '--port', String(mongoPort)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    bgMongod.unref();

    // Wait up to 5 seconds for MongoDB to accept connections
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isPortOpen(mongoPort)) {
        console.log('[DB] MongoDB started successfully in background on port 27017!\n');
        return true;
      }
    }
    console.warn('[DB] MongoDB process spawned, proceeding with connection attempts...');
    return true;
  }

  console.log('[DB] MongoDB binary not found on local path. Using local JSON database (local-db/).\n');
  return false;
}

// Establish HTTPS Tunnel
function startTunnel() {
  const localtunnelSubdomain = process.env.LOCALTUNNEL_SUBDOMAIN;

  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';

  if (localtunnelSubdomain) {
    console.log(`\n[Tunnel] Establishing LocalTunnel with subdomain: https://${localtunnelSubdomain}.loca.lt ...`);
    const tunnelProc = spawn(npxCmd, ['-y', 'localtunnel', '--port', String(port), '--subdomain', localtunnelSubdomain], {
      shell: isWin,
      windowsHide: true
    });

    let urlPrinted = false;

    const parseLog = (data) => {
      const str = data.toString();
      if (!urlPrinted && str.includes('loca.lt')) {
        urlPrinted = true;
        console.log('\n====================================================');
        console.log('  🚀 SERVIDOR CON URL FIJA Y PERMANENTE EN VIVO!');
        console.log('====================================================');
        console.log(`  🔗 Tu URL Fija para compartir:`);
        console.log(`     https://${localtunnelSubdomain}.loca.lt`);
        console.log('====================================================\n');
      }
    };

    tunnelProc.stdout.on('data', parseLog);
    tunnelProc.stderr.on('data', parseLog);

    tunnelProc.on('close', () => {
      console.log('[Tunnel] Tunnel disconnected. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });
    return;
  }

  if (ngrokDomain) {
    console.log(`\n[Tunnel] Connecting to fixed Ngrok static domain: https://${ngrokDomain}...`);

    let ngrokModule = null;
    try {
      ngrokModule = require('@ngrok/ngrok');
    } catch (e) { }

    if (ngrokModule && ngrokAuthToken) {
      (async () => {
        try {
          const listener = await ngrokModule.forward({
            addr: `127.0.0.1:${port}`,
            domain: ngrokDomain,
            authtoken: ngrokAuthToken
          });
          console.log('\n====================================================');
          console.log('  🚀 SERVIDOR CON URL FIJA Y PERMANENTE EN VIVO!');
          console.log('====================================================');
          console.log(`  🔗 Tu URL Fija para compartir (NUNCA cambia):`);
          console.log(`     ${listener.url()}`);
          console.log('====================================================\n');
        } catch (err) {
          const errMsg = err.message || String(err);
          console.warn('[Tunnel] Ngrok static domain notice:', errMsg);
          if (errMsg.includes('334') || errMsg.includes('already online')) {
            console.log('[Tunnel] The static domain is temporarily occupied. Connecting via Cloudflare fallback tunnel...');
            startCloudflareTunnel();
            return;
          }
          console.log('[Tunnel] Reconnecting in 10s...');
          setTimeout(startTunnel, 10000);
        }
      })();
      return;
    }

    if (ngrokAuthToken && ngrokAuthToken !== 'your-ngrok-authtoken') {
      try {
        spawn(npxCmd, ['-y', '-p', '@ngrok/ngrok', 'ngrok', 'config', 'add-authtoken', ngrokAuthToken], { shell: isWin, windowsHide: true });
      } catch (e) { }
    }

    const tunnelProc = spawn(npxCmd, ['-y', '@ngrok/ngrok', 'http', String(port), `--url=${ngrokDomain}`, `--authtoken=${ngrokAuthToken}`], {
      shell: isWin,
      windowsHide: true
    });

    let urlPrinted = false;

    const parseLog = (data) => {
      const str = data.toString();
      if (!urlPrinted && (str.includes(ngrokDomain) || str.includes('online') || str.includes('Forwarding') || str.includes('started tunnel'))) {
        urlPrinted = true;
        console.log('\n====================================================');
        console.log('  🚀 SERVIDOR CON URL FIJA Y PERMANENTE EN VIVO!');
        console.log('====================================================');
        console.log(`  🔗 Tu URL Fija para compartir (NUNCA cambia):`);
        console.log(`     https://${ngrokDomain}`);
        console.log('====================================================\n');
      } else if (!urlPrinted && (str.includes('ERR_') || str.includes('error') || str.includes('failed'))) {
        console.error('[Tunnel Error]:', str.trim());
      }
    };

    tunnelProc.stdout.on('data', parseLog);
    tunnelProc.stderr.on('data', parseLog);

    tunnelProc.on('close', (code) => {
      console.log(`[Tunnel] Tunnel process exited (code ${code}). Reconnecting in 5s...`);
      setTimeout(startTunnel, 5000);
    });
  } else {
    startCloudflareTunnel();
  }
}

function startCloudflareTunnel() {
  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  console.log('\n[Tunnel] Establishing Cloudflare HTTPS public tunnel...');
  const tunnelProc = spawn(npxCmd, ['-y', 'cloudflared', 'tunnel', '--url', `http://127.0.0.1:${port}`], {
    shell: isWin,
    windowsHide: true
  });

  let urlFound = false;

  const parseLog = (data) => {
    const str = data.toString();
    const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
      urlFound = true;
      console.log('\n====================================================');
      console.log('  🚀 SERVIDOR REMOTO PUBLICO EN VIVO!');
      console.log('====================================================');
      console.log(`  🔗 Enlace público activo:`);
      console.log(`     ${match[0]}`);
      console.log('====================================================\n');
    }
  };

  tunnelProc.stdout.on('data', parseLog);
  tunnelProc.stderr.on('data', parseLog);

  tunnelProc.on('close', () => {
    console.log('[Tunnel] Cloudflare disconnected. Reconnecting in 5s...');
    setTimeout(startTunnel, 5000);
  });
}

async function main() {
  // 1. Start / Verify Background DB (keeps running when this script is stopped)
  await ensureDatabase();

  // 2. Start DuckDNS Updater
  require('./duckdns-updater');

  // 3. Start API, WebSockets & Static Frontend Server
  require('../api/index.js');

  // 4. Establish HTTPS Tunnel
  setTimeout(startTunnel, 1000);
}

main().catch(err => {
  console.error('[Error] Failed to start DuckDNS server:', err);
});
