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

setTimeout(startTunnel, 1000);

