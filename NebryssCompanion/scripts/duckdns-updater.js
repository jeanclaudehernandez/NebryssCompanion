const https = require('https');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.duckdns or .env if present
const envPath = fs.existsSync(path.join(__dirname, '../.env.duckdns'))
  ? path.join(__dirname, '../.env.duckdns')
  : path.join(__dirname, '../.env');

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

const domain = process.env.DUCKDNS_DOMAIN;
const token = process.env.DUCKDNS_TOKEN;

function updateDuckDNS() {
  if (!domain || !token || domain === 'your-subdomain' || token === 'your-duckdns-token') {
    console.warn('[DuckDNS] Warning: DUCKDNS_DOMAIN or DUCKDNS_TOKEN is not set in .env.duckdns. Skipping update.');
    return;
  }

  const cleanDomain = domain.replace('.duckdns.org', '').trim();
  const url = `https://www.duckdns.org/update?domains=${cleanDomain}&token=${token}&ip=`;

  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const responseText = data.trim();
      const timestamp = new Date().toLocaleTimeString();
      if (responseText === 'OK') {
        console.log(`[DuckDNS ${timestamp}] Success: IP updated for ${cleanDomain}.duckdns.org`);
      } else {
        console.error(`[DuckDNS ${timestamp}] Error updating IP for ${cleanDomain}.duckdns.org: Response '${responseText}'`);
      }
    });
  }).on('error', (err) => {
    console.error('[DuckDNS] Network error updating IP:', err.message);
  });
}

// Initial update
updateDuckDNS();

// Repeat update every 5 minutes (300,000 ms)
const FIVE_MINUTES = 5 * 60 * 1000;
setInterval(updateDuckDNS, FIVE_MINUTES);

module.exports = { updateDuckDNS };
