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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Waits until something listens on the port (the API server), up to timeoutMs. */
async function waitForPort(checkPort, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await isPortOpen(checkPort)) return true;
    await sleep(500);
  }
  return false;
}

/**
 * One real HTTPS request to the public URL. ngrok marks its own error pages with an
 * `ngrok-error-code` header (ERR_NGROK_3200 = tunnel offline, ERR_NGROK_8012 = local server
 * unreachable); any other response came from our server through the tunnel.
 */
function probePublicUrl(host, timeoutMs = 10000) {
  const https = require('https');
  return new Promise((resolve) => {
    const req = https.request({
      host,
      path: '/',
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'nebryss-launcher-healthcheck',
        'ngrok-skip-browser-warning': '1',
        'bypass-tunnel-reminder': '1'
      }
    }, (res) => {
      res.resume();
      const ngrokError = res.headers['ngrok-error-code'] || null;
      resolve({ ok: !ngrokError && res.statusCode < 500, status: res.statusCode, ngrokError });
    });
    req.on('timeout', () => req.destroy(new Error(`no answer within ${timeoutMs / 1000}s`)));
    req.on('error', (err) => resolve({ ok: false, status: null, ngrokError: null, error: err.message }));
    req.end();
  });
}

const NGROK_ERROR_HINTS = {
  ERR_NGROK_3200: 'the tunnel is offline (ngrok has no agent connected for this domain)',
  ERR_NGROK_8012: `ngrok is connected, but it could not reach the local server on port ${port}`,
  ERR_NGROK_334: 'the domain is already in use by another ngrok agent'
};

let verifyTimer = null;
let lastVerifyResult = null;

/**
 * Checks the public URL a few times and reports the real state of the tunnel, instead of
 * trusting log lines. Calls within a short window are merged into one check.
 */
function scheduleTunnelVerification(host, delayMs = 2000) {
  if (!host) return;
  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(async () => {
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await probePublicUrl(host);
      if (result.ok) break;
      await sleep(4000);
    }
    const key = result.ok ? 'ok' : (result.ngrokError || result.error || `HTTP ${result.status}`);
    if (key === lastVerifyResult) return;   // only report changes
    lastVerifyResult = key;
    if (result.ok) {
      console.log(`[Tunnel] ✔ Verified: https://${host} is reachable (HTTP ${result.status}).`);
    } else if (result.ngrokError) {
      const hint = NGROK_ERROR_HINTS[result.ngrokError] || 'ngrok returned an error page';
      console.error(`[Tunnel] ✖ https://${host} is NOT working: ${hint} (${result.ngrokError}).`);
    } else if (result.error) {
      console.warn(`[Tunnel] ⚠ Could not reach https://${host} from this machine (${result.error}). ` +
        'The tunnel may still work from other networks; the check will run again if ngrok reports a problem.');
    } else {
      console.warn(`[Tunnel] ⚠ https://${host} is reachable, but the server answered HTTP ${result.status}.`);
    }
  }, delayMs);
}

// ---- tunnel process lifetime -----------------------------------------------------------------
// ngrok used to be started through a cmd shell, so closing the launcher left it running. Those
// orphans kept serving the domain (--pooling-enabled), filled the account's 3-agent limit and made
// every new launch fail with ERR_NGROK_108 while the tunnel "worked fine".
let activeTunnelProc = null;

function stopTunnelProcess() {
  const proc = activeTunnelProc;
  activeTunnelProc = null;
  if (!proc || proc.exitCode !== null || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) { }
}

process.on('exit', stopTunnelProcess);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    stopTunnelProcess();
    process.exit(0);
  });
}

/**
 * Stops ngrok agents for this domain whose launcher is gone (left over from earlier runs).
 * Agents whose parent process still exists are left alone. Returns how many were stopped.
 */
function cleanupOrphanedNgrok(forDomain) {
  if (!forDomain) return 0;
  let agents = [];
  try {
    if (process.platform === 'win32') {
      const ps = "Get-CimInstance Win32_Process -Filter \"Name='ngrok.exe'\" | ForEach-Object { " +
        "[pscustomobject]@{ pid = $_.ProcessId; cmd = $_.CommandLine; " +
        "parentAlive = [bool](Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue) } } | ConvertTo-Json -Compress";
      const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
      const out = (res.stdout || '').trim();
      if (out) {
        const parsed = JSON.parse(out);
        agents = Array.isArray(parsed) ? parsed : [parsed];
      }
    } else {
      const res = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
      agents = (res.stdout || '').split('\n')
        .map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
        .filter(m => m && /(^|\/)ngrok\s/.test(m[3]))
        .map(m => ({ pid: Number(m[1]), cmd: m[3], parentAlive: m[2] !== '1' }));
    }
  } catch (err) {
    console.warn('[Tunnel] Could not list running ngrok agents:', err.message);
    return 0;
  }
  const orphans = agents.filter(a => String(a.cmd || '').includes(`--domain=${forDomain}`) && !a.parentAlive);
  for (const a of orphans) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(a.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(a.pid, 'SIGTERM');
      }
    } catch (_) { }
  }
  if (orphans.length > 0) {
    console.log(`[Tunnel] Stopped ${orphans.length} leftover ngrok agent(s) from earlier launches.`);
  }
  return orphans.length;
}

/** Feeds complete lines to onLine; a log chunk can hold several lines or half of one. */
function createLineReader(onLine) {
  let buffer = '';
  return (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) onLine(line.trim());
    }
  };
}

/** Parses an ngrok logfmt line: t=... lvl=eror msg="..." err="..." */
function parseLogfmt(line) {
  const fields = {};
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    fields[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1).replace(/\\"/g, '"') : m[2];
  }
  return fields;
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
    activeTunnelProc = tunnelProc;   // stopped (with its child tree) when the launcher exits

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
        scheduleTunnelVerification(`${localtunnelSubdomain}.loca.lt`);
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
          scheduleTunnelVerification(ngrokDomain);
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

    // Agents left over from earlier launches hold the account's session slots.
    cleanupOrphanedNgrok(ngrokDomain);

    // Started directly (no cmd wrapper) so stopTunnelProcess() really ends it on exit.
    const tunnelProc = spawn('ngrok', ngrokArgs, { windowsHide: true });
    activeTunnelProc = tunnelProc;
    tunnelProc.on('error', (err) => {
      console.error(`[Tunnel Error]: could not start ngrok (${err.message}). Is it installed and on PATH?`);
    });

    let urlPrinted = false;
    let err334Seen = false;
    let sessionLimitSeen = false;
    let lastLocalWarning = 0;
    const reported = new Set();   // one message per distinct error per ngrok run

    const handleLine = (line) => {
      const f = parseLogfmt(line);
      const lvl = f.lvl || (/^ERROR:/.test(line) ? 'eror' : '');
      const detail = [f.msg, f.err].filter(Boolean).join(': ') || line.replace(/^ERROR:\s*/, '');
      const code = (line.match(/ERR_NGROK_\d+/) || [])[0];

      if (code === 'ERR_NGROK_334' || /already online/i.test(line)) {
        err334Seen = true;
        if (!reported.has('334')) {
          reported.add('334');
          console.error(`[Tunnel Error]: ${NGROK_ERROR_HINTS.ERR_NGROK_334} (ERR_NGROK_334).`);
        }
        return;
      }

      // Account session limit: other agents (often leftovers on other machines) hold every slot.
      // One of them may well be serving this domain, so check the URL instead of crying failure.
      if (code === 'ERR_NGROK_108' || /simultaneous ngrok agent sessions/i.test(line)) {
        sessionLimitSeen = true;
        if (!reported.has('108')) {
          reported.add('108');
          console.warn('[Tunnel] ngrok refused a new agent: the account already has its maximum of ' +
            'simultaneous agents connected (ERR_NGROK_108). Checking whether the domain is still served...');
          scheduleTunnelVerification(ngrokDomain, 0);
        }
        return;
      }

      // ngrok's multi-line exit summary ("ERROR:  ...", links, blank lines) repeats what was logged.
      if (/^ERROR:/.test(line) && (reported.size > 0 || !detail.trim() || /^https?:\/\//.test(detail.trim()))) {
        return;
      }

      if (f.msg === 'started tunnel' || /\bForwarding\b/.test(line)) {
        if (!urlPrinted) {
          urlPrinted = true;
          console.log('\n====================================================');
          console.log('  🚀 SERVIDOR CON URL FIJA Y PERMANENTE EN VIVO!');
          console.log('====================================================');
          console.log(`  🔗 Tu URL Fija para compartir (NUNCA cambia):`);
          console.log(`     https://${ngrokDomain}`);
          console.log('====================================================\n');
        }
        scheduleTunnelVerification(ngrokDomain);
        return;
      }

      // A request reached ngrok but our local server did not answer: not a tunnel problem.
      if (/ERR_NGROK_8012|dial tcp|actively refused|connection refused|failed to dial/i.test(line)) {
        if (Date.now() - lastLocalWarning > 30000) {
          lastLocalWarning = Date.now();
          console.warn(`[Tunnel] ⚠ A request came through the tunnel, but the local server on port ${port} did not answer (${f.err || f.msg || 'connection refused'}).`);
        }
        return;
      }

      if (lvl === 'eror' || lvl === 'crit') {
        const key = code || f.err || detail;
        if (reported.has(key)) return;
        reported.add(key);
        if (urlPrinted) {
          // ngrok logs transient session errors and reconnects by itself: check the real state.
          console.warn(`[Tunnel] ngrok reported: ${detail.split('\\n')[0]} — checking whether the public URL still works...`);
          scheduleTunnelVerification(ngrokDomain, 5000);
        } else {
          console.error(`[Tunnel Error]: ${detail.split('\\n')[0]}`);
        }
        return;
      }

      if (lvl === 'warn') {
        console.warn(`[Tunnel] ngrok warning: ${detail}`);
      }
    };

    const parseLog = createLineReader(handleLine);
    tunnelProc.stdout.on('data', parseLog);
    tunnelProc.stderr.on('data', parseLog);

    tunnelProc.on('close', (code) => {
      if (activeTunnelProc === tunnelProc) activeTunnelProc = null;
      if (err334Seen) {
        console.warn('[Tunnel] Domain already online elsewhere (ERR_NGROK_334); stopping leftover local agents...');
        cleanupOrphanedNgrok(ngrokDomain);
      }
      if (sessionLimitSeen) {
        // Retrying every 5s cannot succeed until a slot frees up; the verification above says
        // whether the domain works meanwhile.
        console.log('[Tunnel] Will try to start an own ngrok agent again in 60s (close other ngrok agents to free a slot: https://dashboard.ngrok.com/agents).');
        setTimeout(startTunnel, 60000);
        return;
      }
      lastVerifyResult = null;
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
  activeTunnelProc = tunnelProc;   // stopped (with its child tree) when the launcher exits

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
      scheduleTunnelVerification(match[0].replace(/^https:\/\//, ''), 5000);
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

  // 5. Establish HTTPS Tunnel once the local server is actually listening, so early requests
  //    through the tunnel don't hit a closed port.
  if (!(await waitForPort(port, 60000))) {
    console.warn(`[Tunnel] Local server is not listening on port ${port} after 60s; starting the tunnel anyway.`);
  }
  startTunnel();
}

main().catch(err => {
  console.error('[Error] Failed to start DuckDNS server:', err);
});
