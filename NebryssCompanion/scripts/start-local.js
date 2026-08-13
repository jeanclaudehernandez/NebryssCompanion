const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

// Parse CLI flags
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build') || args.includes('-s');
const watchMode = args.includes('--watch') || args.includes('-w');
const shouldPopulate = args.includes('--populate') || args.includes('-d');

// Load environment variables (.env preferred, fallback to .env.duckdns)
const envFiles = [path.join(__dirname, '../.env'), path.join(__dirname, '../.env.duckdns')];
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

// Ensure local development defaults
process.env.ALLOW_LOCALHOST = 'true';
process.env.ALLOW_LOCAL_ORIGINS = 'true';
const port = process.env.PORT || 8080;
process.env.PORT = port;
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NebryssCompanion';
process.env.MONGODB_DB_MAIN = process.env.MONGODB_DB_MAIN || 'Nebryss-assets';
process.env.MONGODB_DB_PLAYERS = process.env.MONGODB_DB_PLAYERS || 'NebryssCampaignAssets';
process.env.ADMIN_PIN = process.env.ADMIN_PIN || '849201';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
let spawnedMongod = null;
let spawnedWatch = null;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

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

    console.log(`[DB] Starting local MongoDB instance (${mongodExe})...`);
    spawnedMongod = spawn(mongodExe, ['--dbpath', dbPath, '--port', String(mongoPort)], {
      windowsHide: true,
      stdio: 'ignore'
    });

    // Wait up to 5 seconds for MongoDB to accept connections
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await isPortOpen(mongoPort)) {
        console.log('[DB] MongoDB started successfully on port 27017!\n');
        return true;
      }
    }
    console.warn('[DB] MongoDB process spawned, proceeding with connection attempts...');
    return true;
  }

  console.log('[DB] MongoDB binary not found on local path. Using local JSON database (local-db/).\n');
  return false;
}

function buildFrontend() {
  if (skipBuild) {
    console.log('[Frontend] Skipping build (--skip-build flag detected).\n');
    return;
  }

  if (watchMode) {
    console.log('[Frontend] Starting Angular build in watch mode for live recompilation...');
    spawnedWatch = spawn(npmCmd, ['run', 'watch'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: isWin
    });
  } else {
    console.log('[Frontend] Building Angular frontend for local deployment...');
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
}

async function main() {
  const localIp = getLocalIp();

  console.log('====================================================');
  console.log('  ⚔️  NebryssCompanion - Local Full-Stack Dev Server');
  console.log('====================================================');
  console.log(`Mode        : Pure Local Dev (No DuckDNS / No Ngrok)`);
  console.log(`Local URL   : http://localhost:${port}`);
  console.log(`Network URL : http://${localIp}:${port}`);
  console.log(`API Base    : http://localhost:${port}/api`);
  console.log(`WebSocket   : ws://localhost:${port}/ws`);
  console.log('====================================================\n');

  // 1. Start / Verify DB
  await ensureDatabase();

  if (shouldPopulate) {
    console.log('[DB] Populating database collections from assets...');
    try {
      require('./populate-db');
    } catch (err) {
      console.warn('[DB] Populate script notice:', err.message);
    }
  }

  // 2. Build Frontend
  buildFrontend();

  // 3. Start API, WebSocket and Static Frontend Server
  console.log('[Server] Starting API, WebSockets & Static Frontend Server...');
  require('../api/index.js');

  console.log('\n====================================================');
  console.log('  🚀 LOCAL DEV ENVIRONMENT READY & RUNNING!');
  console.log('====================================================');
  console.log(`  🌐 Open in Browser: http://localhost:${port}`);
  console.log(`  📱 Mobile / LAN   : http://${localIp}:${port}`);
  console.log('====================================================\n');
}

// Cleanup on exit
function cleanup() {
  if (spawnedMongod) {
    try {
      spawnedMongod.kill();
    } catch (e) {}
  }
  if (spawnedWatch) {
    try {
      spawnedWatch.kill();
    } catch (e) {}
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  cleanup();
});

main().catch(err => {
  console.error('[Error] Failed to start local development server:', err);
  cleanup();
  process.exit(1);
});
