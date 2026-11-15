const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

// Load .env (primary) and fallback to .env.duckdns if present
const envFiles = [
  path.join(__dirname, '../.env'),
  path.join(__dirname, '../.env.duckdns')
];
for (const envPath of envFiles) {
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
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

// Respect ALLOW_LOCALHOST from .env (default to 'false' only if not specified)
if (process.env.ALLOW_LOCALHOST === undefined) {
  process.env.ALLOW_LOCALHOST = 'false';
}
if (process.env.ALLOW_LOCAL_ORIGINS === undefined) {
  process.env.ALLOW_LOCAL_ORIGINS = process.env.ALLOW_LOCALHOST;
}

const port = process.env.PORT || 8080;
const domain = process.env.DUCKDNS_DOMAIN || 'nebryss';
const rawNgrokDomain = process.env.NGROK_DOMAIN || '';
const ngrokDomain = rawNgrokDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim() || undefined;
const ngrokAuthToken = process.env.NGROK_AUTHTOKEN;

console.log('====================================================');
console.log('  NebryssCompanion - Permanent Local Server Launcher');
console.log('====================================================');
if (process.env.DUCKDNS_DOMAIN) {
  console.log(`DuckDNS    : ${domain}.duckdns.org`);
}
console.log(`Local Port : ${port}`);
console.log(`Localhost  : ${process.env.ALLOW_LOCALHOST === 'true' ? 'Allowed' : 'Blocked (Remote/Ngrok Only)'}`);
if (ngrokDomain) {
  console.log(`Fixed Domain: https://${ngrokDomain}`);
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
  } catch (e) { }

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
      } catch (e) { }
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

  const dockerCandidates = [
    'C:\\Users\\Jean\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    'docker'
  ];
  for (const dockerExe of dockerCandidates) {
    if (dockerExe === 'docker' || fs.existsSync(dockerExe)) {
      try {
        const res = spawnSync(dockerExe, ['start', 'nebryss-mongodb'], { stdio: 'ignore' });
        if (res.status === 0) {
          console.log('[DB] Started Docker container nebryss-mongodb on port 27017!\n');
          return true;
        }
      } catch (e) { }
    }
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

    if (ngrokModule && ngrokAuthToken && ngrokAuthToken !== 'your-ngrok-authtoken') {
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

    // Use system ngrok CLI (or fallback to npx ngrok) with --domain and --log=stdout
    const ngrokArgs = ['http', String(port), `--domain=${ngrokDomain}`, '--pooling-enabled', '--log=stdout'];
    if (ngrokAuthToken && ngrokAuthToken !== 'your-ngrok-authtoken') {
      ngrokArgs.push(`--authtoken=${ngrokAuthToken}`);
    }

    const tunnelProc = spawn('ngrok', ngrokArgs, {
      shell: isWin,
      windowsHide: true
    });

    let urlPrinted = false;
    let err334Seen = false;

    const parseLog = (data) => {
      const str = data.toString();
      const isError = str.includes('ERR_') || str.includes('ERROR:') || str.includes('lvl=eror') || str.includes('lvl=crit');

      if (isError) {
        if (str.includes('ERR_NGROK_334') || str.includes('already online')) {
          err334Seen = true;
        }
        console.error('[Tunnel Error]:', str.trim());
        return;
      }

      if (!urlPrinted && (str.includes('started tunnel') || str.includes('Forwarding'))) {
        urlPrinted = true;
        console.log('\n====================================================');
        console.log('  🚀 SERVIDOR CON URL FIJA Y PERMANENTE EN VIVO!');
        console.log('====================================================');
        console.log(`  🔗 Tu URL Fija para compartir (NUNCA cambia):`);
        console.log(`     https://${ngrokDomain}`);
        console.log('====================================================\n');
      }
    };

    tunnelProc.stdout.on('data', parseLog);
    tunnelProc.stderr.on('data', parseLog);

    tunnelProc.on('close', (code) => {
      if (err334Seen) {
        console.warn('[Tunnel] Ngrok static domain is already online (ERR_NGROK_334). Cleaning up any stale local ngrok process...');
        try {
          if (isWin) {
            spawnSync('taskkill', ['/F', '/IM', 'ngrok.exe'], { stdio: 'ignore' });
          } else {
            spawnSync('pkill', ['-f', 'ngrok'], { stdio: 'ignore' });
          }
        } catch (_) {}
      }
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

function buildFrontend() {
  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build') || args.includes('-s');
  const indexHtmlPath = path.join(__dirname, '../dist/nebryss-companion/browser/index.html');

  if (skipBuild && fs.existsSync(indexHtmlPath)) {
    console.log('[Frontend] Skipping build (--skip-build flag detected).\n');
    return;
  }

  const isWin = process.platform === 'win32';
  const npmCmd = isWin ? 'npm.cmd' : 'npm';

  console.log('[Frontend] Building Angular frontend for deployment...');
  const result = spawnSync(npmCmd, ['run', 'build'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: isWin
  });
  if (result.status !== 0) {
    console.warn('[Frontend] Build warning or non-zero exit code, continuing server startup...');
  } else {
    console.log('[Frontend] Build complete!\n');
  }
}

async function main() {
  // 1. Start / Verify Background DB (keeps running when this script is stopped)
  await ensureDatabase();

  // 2. Build Frontend so dist/nebryss-companion/browser is ready
  buildFrontend();

  // 3. Start DuckDNS Updater
  require('./duckdns-updater');

  // 4. Start API, WebSockets & Static Frontend Server
  require('../api/index.js');

  // 5. Establish HTTPS Tunnel
  setTimeout(startTunnel, 1000);
}

main().catch(err => {
  console.error('[Error] Failed to start DuckDNS server:', err);
});
