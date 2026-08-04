const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

const port = process.env.PORT || 8080;
const domain = process.env.DUCKDNS_DOMAIN || 'nebryss';
const ngrokDomain = process.env.NGROK_DOMAIN;
const ngrokAuthToken = process.env.NGROK_AUTHTOKEN;

console.log('====================================================');
console.log('  NebryssCompanion - Permanent Local Server Launcher');
console.log('====================================================');
console.log(`DuckDNS    : ${domain}.duckdns.org`);
console.log(`Local Port : ${port}`);
if (ngrokDomain) {
  console.log(`Fixed Domain: ${ngrokDomain}`);
}
console.log('====================================================');

// Start DuckDNS Updater
require('./duckdns-updater');

// Start API, WebSockets & Static Frontend Server
require('../api/index.js');

// Establish HTTPS Tunnel
function startTunnel() {
  if (ngrokDomain) {
    if (ngrokAuthToken && ngrokAuthToken !== 'your-ngrok-authtoken') {
      try {
        spawn('npx', ['-y', 'ngrok', 'config', 'add-authtoken', ngrokAuthToken], { shell: true, windowsHide: true });
      } catch (e) {}
    }

    console.log(`\n[Tunnel] Connecting to fixed Ngrok static domain: https://${ngrokDomain}...`);
    const tunnelProc = spawn('npx', ['-y', 'ngrok', 'http', `--url=${ngrokDomain}`, port], {
      shell: true,
      windowsHide: true
    });

    let urlPrinted = false;

    const parseLog = (data) => {
      const str = data.toString();
      if (!urlPrinted && (str.includes(ngrokDomain) || str.includes('online') || str.includes('Forwarding'))) {
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

    tunnelProc.on('close', () => {
      console.log('[Tunnel] Tunnel disconnected. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });
  } else {
    console.log('\n[Tunnel] Establishing Cloudflare HTTPS public tunnel...');
    const tunnelProc = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
      shell: true,
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
      console.log('[Tunnel] Tunnel disconnected. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });
  }
}

setTimeout(startTunnel, 1000);
