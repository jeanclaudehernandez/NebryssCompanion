const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Search and load environment variables (.env or .env.duckdns)
function findFirstExistingPath(relativePaths) {
  for (const rel of relativePaths) {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(__dirname, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

const envCandidates = [
  '../.env',
  '../../.env',
  '../NebryssCompanion/.env',
  '../../NebryssCompanion/.env',
  './.env',
  './NebryssCompanion/.env',
  '../.env.duckdns',
  './NebryssCompanion/.env.duckdns'
];

for (const cand of envCandidates) {
  const envPath = findFirstExistingPath([cand]);
  if (envPath) {
    try {
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
    } catch (e) { }
  }
}

// Import auth module token signing if available
let signSessionTokenFn = null;
try {
  const auth = require('../api/auth');
  if (auth && typeof auth.signSessionToken === 'function') {
    signSessionTokenFn = auth.signSessionToken;
  }
} catch (e) { }

function generateToolAuthToken() {
  if (signSessionTokenFn) {
    return signSessionTokenFn({
      userId: 'system-tool',
      email: 'tool@nebryss.local',
      username: 'CampaignSessionTool',
      role: 'admin',
      isVerified: true
    });
  }
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'nebryss-campaign-imperial-auth-secret-key-2026';
  const data = JSON.stringify({
    userId: 'system-tool',
    email: 'tool@nebryss.local',
    username: 'CampaignSessionTool',
    role: 'admin',
    isVerified: true,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000
  });
  const encoded = Buffer.from(data, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

async function apiRequest(endpoint, method = 'GET', body = null, campaignId = null) {
  const base = (process.env.API_URL || process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api`).replace(/\/$/, '');
  let url = `${base}/${endpoint.replace(/^\//, '')}`;
  const token = generateToolAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (process.env.ADMIN_PIN) {
    headers['x-admin-pin'] = process.env.ADMIN_PIN;
  }
  if (campaignId !== null && campaignId !== undefined) {
    headers['x-campaign-id'] = String(campaignId);
  }

  // For GET/DELETE, append campaignId as query param
  if (campaignId !== null && campaignId !== undefined && (method === 'GET' || method === 'DELETE')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}campaignId=${encodeURIComponent(String(campaignId))}`;
  }

  const options = {
    method,
    headers,
  };
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify({
      payload: body,
      campaignId: campaignId !== null && campaignId !== undefined ? String(campaignId) : undefined
    });
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    // Connection fallback: try localhost if 127.0.0.1 fails, or vice-versa
    let fallbackUrl = null;
    if (url.includes('127.0.0.1')) {
      fallbackUrl = url.replace('127.0.0.1', 'localhost');
    } else if (url.includes('localhost')) {
      fallbackUrl = url.replace('localhost', '127.0.0.1');
    }

    if (fallbackUrl) {
      try {
        res = await fetch(fallbackUrl, options);
        url = fallbackUrl;
      } catch (fErr) {
        const reason = netErr.cause?.code || netErr.cause?.message || netErr.message || 'Connection refused';
        throw new Error(`Cannot connect to API server at ${base} (${reason}). Please ensure the local server is running.`);
      }
    } else {
      const reason = netErr.cause?.code || netErr.cause?.message || netErr.message || 'Connection refused';
      throw new Error(`Cannot connect to API server at ${base} (${reason}). Please ensure the local server is running.`);
    }
  }

  if (!res.ok) {
    let errMessage = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errMessage = errJson.error;
      }
    } catch (e) {
      try {
        const text = await res.text();
        if (text) errMessage = text;
      } catch (e2) { }
    }
    throw new Error(`API request failed [${method} ${url}]: ${errMessage}`);
  }
  return await res.json();
}

const ENTITY_REGEX = /@(player|npc|location|shop|bestiary|letter|item|weapon|weaponrule|weaponRule|alteredstate|alteredState|affliction)\[([^\]]+)\]/gi;

function cleanString(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeEntityType(type) {
  const t = String(type || '').toLowerCase().trim();
  if (t === 'weaponrule' || t === 'weaponrules') return 'weaponrule';
  if (t === 'alteredstate' || t === 'alteredstates' || t === 'status') return 'alteredstate';
  if (t === 'creature' || t === 'creatures') return 'bestiary';
  if (t === 'players') return 'player';
  if (t === 'npcs') return 'npc';
  if (t === 'locations') return 'location';
  if (t === 'shops') return 'shop';
  if (t === 'letters') return 'letter';
  if (t === 'items') return 'item';
  if (t === 'weapons') return 'weapon';
  if (t === 'afflictions') return 'affliction';
  if (t === 'sessions') return 'session';
  return t;
}

const CAMPAIGN_SCOPED_TYPES = new Set(['player', 'npc', 'location', 'shop', 'letter']);

function getApiEndpointForType(type) {
  const norm = normalizeEntityType(type);
  switch (norm) {
    case 'player': return 'player';
    case 'npc': return 'npc';
    case 'location': return 'location';
    case 'shop': return 'shop';
    case 'letter': return 'letter';
    case 'bestiary': return 'bestiary';
    case 'item': return 'item';
    case 'itemcategory': return 'itemCategory';
    case 'weapon': return 'weapon';
    case 'weaponrule': return 'weaponRule';
    case 'alteredstate': return 'status';
    case 'affliction': return 'affliction';
    case 'session': return 'campaignSession';
    case 'campaign': return 'campaign';
    case 'talent': return 'talent';
    case 'misteffect': return 'mistEffect';
    case 'terrainrule': return 'terrainRule';
    case 'lore': return 'lore';
    default: return norm;
  }
}

function getDefaultCampaignId() {
  if (process.env.NEBRYSS_ACTIVE_CAMPAIGN_ID) {
    const parsed = Number(process.env.NEBRYSS_ACTIVE_CAMPAIGN_ID);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return process.env.NEBRYSS_ACTIVE_CAMPAIGN_ID;
  }
  return 1;
}

async function resolveCampaign(campaignId) {
  const targetId = campaignId !== undefined && campaignId !== null ? campaignId : getDefaultCampaignId();
  const campaigns = await apiRequest('/campaign', 'GET');
  if (!campaigns || !campaigns.length) {
    throw new Error('No campaigns found in API. Please configure campaigns first.');
  }
  const search = String(targetId).trim().toLowerCase();
  const campaign = campaigns.find(c =>
    String(c.id) === search ||
    String(c.name || '').toLowerCase() === search ||
    String(c.prefix || '').toLowerCase() === search
  );
  if (!campaign) {
    const list = campaigns.map(c => `ID ${c.id}: "${c.name}" (prefix: "${c.prefix}")`).join(', ');
    throw new Error(`Campaign '${targetId}' not found in API. Existing campaigns: [${list}]. Please indicate the correct campaign.`);
  }
  const prefix = String(campaign.prefix || campaign.name || '').trim();
  if (!prefix) {
    throw new Error(`Campaign '${campaign.name || targetId}' has no prefix configured in API.`);
  }
  return { campaign, prefix };
}

function findEntityId(type, identifier, context) {
  const raw = String(identifier).trim();
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  if (raw.includes(':')) {
    const [possibleId] = raw.split(':');
    if (/^\d+$/.test(possibleId.trim())) {
      return Number(possibleId.trim());
    }
  }

  const cleaned = cleanString(raw);
  const normType = normalizeEntityType(type);
  let list = [];
  if (normType === 'player') list = context.players || [];
  else if (normType === 'npc') list = context.npcs || [];
  else if (normType === 'location') list = context.locations || [];
  else if (normType === 'shop') list = context.shops || [];
  else if (normType === 'bestiary') list = context.bestiary || [];
  else if (normType === 'letter') list = context.letters || [];
  else if (normType === 'item') list = context.items || [];
  else if (normType === 'weapon') list = context.weapons || [];
  else if (normType === 'weaponrule') list = context.weaponRules || [];
  else if (normType === 'alteredstate') list = context.alteredStates || [];
  else if (normType === 'affliction') list = context.afflictions || [];

  const exact = list.find(item => cleanString(item.name || item.subject || item.title) === cleaned || String(item.id) === raw);
  if (exact) return exact.id;

  const partial = list.find(item => {
    const label = cleanString(item.name || item.subject || item.title);
    return label && (label.includes(cleaned) || cleaned.includes(label));
  });
  if (partial) return partial.id;

  return raw;
}

function findEntityName(type, id, context) {
  const normType = normalizeEntityType(type);
  let list = [];
  if (normType === 'player') list = context.players || [];
  else if (normType === 'npc') list = context.npcs || [];
  else if (normType === 'location') list = context.locations || [];
  else if (normType === 'shop') list = context.shops || [];
  else if (normType === 'bestiary') list = context.bestiary || [];
  else if (normType === 'letter') list = context.letters || [];
  else if (normType === 'item') list = context.items || [];
  else if (normType === 'weapon') list = context.weapons || [];
  else if (normType === 'weaponrule') list = context.weaponRules || [];
  else if (normType === 'alteredstate') list = context.alteredStates || [];
  else if (normType === 'affliction') list = context.afflictions || [];

  const found = list.find(item => String(item.id) === String(id));
  if (!found) return null;
  return found.name || found.subject || found.title || null;
}

function normalizeToIdTags(text, context) {
  if (!text) return '';
  const regex = new RegExp(ENTITY_REGEX.source, 'gi');
  return text.replace(regex, (match, type, content) => {
    const id = findEntityId(type, content, context);
    const normType = normalizeEntityType(type);
    return `@${normType}[${id}]`;
  });
}

function expandToDisplayTags(text, context) {
  if (!text) return '';
  const regex = new RegExp(ENTITY_REGEX.source, 'gi');
  return text.replace(regex, (match, type, content) => {
    const raw = String(content).trim();
    const normType = normalizeEntityType(type);
    if (/^\d+$/.test(raw)) {
      const name = findEntityName(normType, Number(raw), context);
      return name ? `@${normType}[${raw}: ${name}]` : match;
    }
    return match;
  });
}

function toCleanText(text, context) {
  if (!text) return '';
  const regex = new RegExp(ENTITY_REGEX.source, 'gi');
  return text.replace(regex, (match, type, content) => {
    const raw = String(content).trim();
    const normType = normalizeEntityType(type);
    let name = null;
    if (/^\d+$/.test(raw)) {
      name = findEntityName(normType, Number(raw), context);
    } else if (raw.includes(':')) {
      const parts = raw.split(':');
      name = parts.slice(1).join(':').trim();
    } else {
      const id = findEntityId(normType, raw, context);
      name = findEntityName(normType, id, context) || raw;
    }
    return name || match;
  });
}

function autoTagEntities(text, context) {
  if (!text) return '';
  let result = text;

  // First normalize any existing tag syntax
  result = normalizeToIdTags(result, context);

  // Build candidate entity search terms (sorted by name length descending to match full names first)
  const candidates = [];

  (context.players || []).forEach(p => {
    if (p.name) {
      candidates.push({ type: 'player', id: p.id, name: p.name.trim() });
      const unaccented = p.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (unaccented && unaccented !== p.name.trim()) {
        candidates.push({ type: 'player', id: p.id, name: unaccented });
      }
    }
  });

  (context.npcs || []).forEach(n => {
    if (n.name) {
      candidates.push({ type: 'npc', id: n.id, name: n.name.trim() });
      const cleanName = n.name.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (cleanName && cleanName !== n.name.trim()) {
        candidates.push({ type: 'npc', id: n.id, name: cleanName });
      }
      const unaccented = n.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (unaccented && unaccented !== n.name.trim()) {
        candidates.push({ type: 'npc', id: n.id, name: unaccented });
      }
    }
  });

  (context.locations || []).forEach(l => {
    if (l.name) candidates.push({ type: 'location', id: l.id, name: l.name.trim() });
  });

  (context.shops || []).forEach(s => {
    if (s.name) candidates.push({ type: 'shop', id: s.id, name: s.name.trim() });
  });

  (context.bestiary || []).forEach(b => {
    if (b.name) {
      candidates.push({ type: 'bestiary', id: b.id, name: b.name.trim() });
      if (!b.name.endsWith('s')) {
        candidates.push({ type: 'bestiary', id: b.id, name: b.name.trim() + 's' });
      }
    }
  });

  (context.letters || []).forEach(l => {
    const label = l.subject || l.title;
    if (label && label.trim().length >= 4) {
      candidates.push({ type: 'letter', id: l.id, name: label.trim() });
    }
  });

  (context.items || []).forEach(i => {
    if (i.name && i.name.trim().length >= 3) {
      candidates.push({ type: 'item', id: i.id, name: i.name.trim() });
    }
  });

  (context.weapons || []).forEach(w => {
    if (w.name && w.name.trim().length >= 3) {
      candidates.push({ type: 'weapon', id: w.id, name: w.name.trim() });
    }
  });

  (context.weaponRules || []).forEach(r => {
    if (r.name && r.name.trim().length >= 3) {
      candidates.push({ type: 'weaponrule', id: r.id, name: r.name.trim() });
    }
  });

  (context.alteredStates || []).forEach(s => {
    if (s.name && s.name.trim().length >= 3) {
      candidates.push({ type: 'alteredstate', id: s.id, name: s.name.trim() });
    }
  });

  (context.afflictions || []).forEach(a => {
    if (a.name && a.name.trim().length >= 3) {
      candidates.push({ type: 'affliction', id: a.id, name: a.name.trim() });
    }
  });

  // Sort longest names first to prevent partial substring clashes
  candidates.sort((a, b) => b.name.length - a.name.length);

  // Replace occurrences not already inside a tag
  for (const cand of candidates) {
    if (cand.name.length < 3) continue;
    const escapedName = cand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<!@(?:player|npc|location|shop|bestiary|letter|item|weapon|weaponrule|weaponRule|alteredstate|alteredState|affliction)\\[[^\\]]*)(?:^|(?<=[^\\p{L}\\p{N}_]))${escapedName}(?:(?=[^\\p{L}\\p{N}_])|$)`, 'gu');
    result = result.replace(pattern, `@${cand.type}[${cand.id}]`);
  }

  return result;
}

function parseEntities(text, context = null) {
  if (!text) return [];
  const matches = [];
  let match;
  const regex = new RegExp(ENTITY_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const type = normalizeEntityType(match[1]);
    const rawVal = match[2].trim();
    const id = context ? findEntityId(type, rawVal, context) : (/^\d+$/.test(rawVal) ? Number(rawVal) : rawVal);
    const name = context ? (findEntityName(type, id, context) || rawVal) : rawVal;
    matches.push({
      fullMatch: match[0],
      type,
      id,
      name,
      idTag: `@${type}[${id}]`
    });
  }
  return matches;
}

async function getAllWeaponsAndRules() {
  const [weapons, weaponRules] = await Promise.all([
    apiRequest('/weapon', 'GET'),
    apiRequest('/weaponRule', 'GET')
  ]);
  return { weapons: weapons || [], weaponRules: weaponRules || [] };
}

function calculatePR(entry, weaponsList = [], weaponRulesList = []) {
  const attributes = entry.attributes || {};
  const Movement = typeof attributes.Movement === 'number' ? attributes.Movement : 6;
  const Wounds = typeof attributes.Wounds === 'number' ? attributes.Wounds : 10;
  const Save = typeof attributes.Save === 'number' ? attributes.Save : 5;
  const APL = typeof attributes.APL === 'number' ? attributes.APL : 2;

  const basePR = (Wounds * 2.2) + ((6 - Save) * 7) + (Movement * 4) + (APL * 6);

  let weaponThreat = 0;
  if (Array.isArray(entry.weapons)) {
    for (const wid of entry.weapons) {
      const w = weaponsList.find(item => item.id === wid);
      if (!w || !Array.isArray(w.profiles)) continue;
      for (const profile of w.profiles) {
        const attacks = typeof profile.attacks === 'number' && !isNaN(profile.attacks) ? profile.attacks : 0;
        const minDamage = typeof profile?.damage?.min === 'number' && !isNaN(profile.damage.min) ? profile.damage.min : 0;
        const ws = typeof profile.ws === 'number' && !isNaN(profile.ws) ? profile.ws : 0;
        const threatFromStats = attacks * minDamage * (7 - ws);
        let rulesSum = 0;
        if (Array.isArray(profile.specialRules)) {
          for (const r of profile.specialRules) {
            const ruleDef = weaponRulesList.find(rule => rule.id === r.ruleId);
            if (ruleDef && typeof ruleDef.prModifier === 'number') {
              rulesSum += ruleDef.prModifier;
            }
          }
        }
        const totalThreat = threatFromStats + rulesSum;
        if (totalThreat > weaponThreat) weaponThreat = totalThreat;
      }
    }
  }

  let abilityScore = 0;
  if (Array.isArray(entry.abilities)) {
    for (const ab of entry.abilities) {
      if (typeof ab.prModifier === 'number' && !isNaN(ab.prModifier)) {
        abilityScore += ab.prModifier;
      }
    }
  }

  const total = Math.round(basePR + weaponThreat + abilityScore);
  return { total, basePR, weaponThreat, abilityScore };
}

function validateWeaponsExist(weaponIds, weaponsList) {
  const invalid = [];
  const valid = [];
  for (const id of weaponIds) {
    const numId = Number(id);
    if (isNaN(numId)) {
      invalid.push(id);
      continue;
    }
    const found = weaponsList.find(w => w.id === numId);
    if (!found) {
      invalid.push(id);
    } else {
      valid.push(numId);
    }
  }
  if (invalid.length > 0) {
    throw new Error(
      `Invalid weapon ID(s): [${invalid.join(', ')}]. Bestiary entries must ONLY use weapons that already exist in the weapons compendium. Use 'list-weapons' to find valid existing weapon IDs.`
    );
  }
  return valid;
}

async function listWeapons(query = '') {
  const { weapons, weaponRules } = await getAllWeaponsAndRules();
  let filtered = weapons;
  if (query && query.trim()) {
    const q = cleanString(query);
    filtered = weapons.filter(w => {
      if (String(w.id) === query.trim()) return true;
      if (cleanString(w.name).includes(q)) return true;
      if (Array.isArray(w.profiles)) {
        return w.profiles.some(p =>
          cleanString(p.type).includes(q) ||
          cleanString(p.body).includes(q) ||
          cleanString(p.profileName).includes(q)
        );
      }
      return false;
    });
  }

  return filtered.map(w => ({
    id: w.id,
    name: w.name,
    price: w.price,
    profiles: (w.profiles || []).map(p => ({
      profileName: p.profileName || '',
      rng: p.rng,
      attacks: p.attacks,
      ws: p.ws,
      damage: p.damage,
      body: p.body,
      type: p.type,
      specialRules: (p.specialRules || []).map(sr => {
        const ruleDef = weaponRules.find(r => r.id === sr.ruleId);
        return {
          ruleId: sr.ruleId,
          ruleName: ruleDef ? ruleDef.name : `Rule #${sr.ruleId}`,
          modValue: sr.modValue,
          prModifier: ruleDef ? ruleDef.prModifier : null
        };
      })
    }))
  }));
}

async function getCampaignContext(campaignId) {
  const { campaign, prefix } = await resolveCampaign(campaignId);
  const resolvedCampaignId = campaign.id;

  const [
    campaigns,
    sessions,
    players,
    npcs,
    locations,
    shops,
    letters,
    bestiary,
    weapons,
    weaponRules,
    items,
    alteredStates,
    afflictions
  ] = await Promise.all([
    apiRequest('/campaign', 'GET'),
    apiRequest('/campaignSession', 'GET'),
    apiRequest('/player', 'GET', null, resolvedCampaignId),
    apiRequest('/npc', 'GET', null, resolvedCampaignId),
    apiRequest('/location', 'GET', null, resolvedCampaignId),
    apiRequest('/shop', 'GET', null, resolvedCampaignId),
    apiRequest('/letter', 'GET', null, resolvedCampaignId),
    apiRequest('/bestiary', 'GET'),
    apiRequest('/weapon', 'GET'),
    apiRequest('/weaponRule', 'GET'),
    apiRequest('/item', 'GET'),
    apiRequest('/status', 'GET'),
    apiRequest('/affliction', 'GET')
  ]);

  const campaignSessions = (sessions || []).filter(s =>
    String(s.campaignId) === String(resolvedCampaignId) ||
    Number(s.campaignId) === Number(resolvedCampaignId)
  ).sort((a, b) => (a.sessionId || a.id || 0) - (b.sessionId || b.id || 0));

  const context = {
    campaignId: Number(resolvedCampaignId),
    campaign,
    prefix,
    campaigns: [campaign],
    sessions: campaignSessions,
    players: (players || []).map(p => ({ id: p.id, name: p.name, race: p.race, origin: p.origin })),
    npcs: (npcs || []).map(n => ({ id: n.id, name: n.name, faction: n.faction, role: n.role, location: n.location, bestiaryId: n.bestiaryId })),
    locations: (locations || []).map(l => ({ id: l.id, name: l.name, faction: l.faction, isCapital: l.isCapital })),
    shops: (shops || []).map(s => ({ id: s.id, name: s.name, locationName: s.locationName || s.location, owner: s.owner })),
    bestiary: (bestiary || []).map(b => ({ id: b.id, name: b.name, factionId: b.factionId, pr: b.pr, weapons: b.weapons })),
    weapons: (weapons || []).map(w => ({ id: w.id, name: w.name, price: w.price, profiles: w.profiles })),
    weaponRules: (weaponRules || []).map(r => ({ id: r.id, name: r.name, effect: r.effect, prModifier: r.prModifier })),
    letters: (letters || []).filter(l => !l.isDeleted).map(l => ({ id: l.id, subject: l.subject, title: l.subject, senderName: l.senderName, date: l.date })),
    items: (items || []).map(i => ({ id: i.id, name: i.name, price: i.price, type: i.type })),
    alteredStates: (alteredStates || []).map(s => ({ id: s.id, name: s.name, effect: s.effect })),
    afflictions: (afflictions || []).map(a => ({ id: a.id, name: a.name, treatment: a.treatment, effect: a.effect }))
  };

  return context;
}

async function calculateContextUsage(campaignId) {
  const context = await getCampaignContext(campaignId);
  const jsonStr = JSON.stringify(context);
  const rawChars = jsonStr.length;
  // Estimate tokens (~4 characters per token heuristic for mixed JSON/Markdown)
  const estimatedContextTokens = Math.ceil(rawChars / 4);
  const systemPromptTokens = 4500; // estimated system preamble & designer skills
  const totalTokens = estimatedContextTokens + systemPromptTokens;
  const maxContextTokens = 1048576; // 1M tokens (Gemini 3.7 Flash context limit)
  const percentage = (totalTokens / maxContextTokens) * 100;

  return {
    campaignId: Number(context.campaignId) || campaignId,
    campaignName: context.campaign ? context.campaign.name : `Campaign #${campaignId}`,
    totalEstimatedTokens: totalTokens,
    contextLimit: maxContextTokens,
    percentageUsed: `${percentage.toFixed(3)}%`,
    remainingTokens: maxContextTokens - totalTokens,
    breakdown: {
      campaignDataTokens: estimatedContextTokens,
      systemAndSkillsTokens: systemPromptTokens,
      rawCharacters: rawChars,
      entityCounts: {
        sessions: (context.sessions || []).length,
        players: (context.players || []).length,
        npcs: (context.npcs || []).length,
        locations: (context.locations || []).length,
        shops: (context.shops || []).length,
        bestiary: (context.bestiary || []).length,
        letters: (context.letters || []).length,
        items: (context.items || []).length,
        weapons: (context.weapons || []).length,
        weaponRules: (context.weaponRules || []).length,
        alteredStates: (context.alteredStates || []).length,
        afflictions: (context.afflictions || []).length
      }
    },
    summary: `Campaign #${context.campaignId} (${context.campaign ? context.campaign.name : 'Active Campaign'}) uses ~${totalTokens.toLocaleString()} tokens (~${percentage.toFixed(2)}% of the 1,048,576 token window), leaving ${(maxContextTokens - totalTokens).toLocaleString()} tokens (~${(100 - percentage).toFixed(2)}%) available.`
  };
}

async function listSessions(campaignId, format = 'raw') {
  const context = await getCampaignContext(campaignId || 1);
  let sessions = context.sessions;
  if (format === 'clean') {
    sessions = sessions.map(s => ({
      ...s,
      displayContent: toCleanText(s.content, context),
      displayConclussion: toCleanText(s.conclussion, context)
    }));
  } else if (format === 'expand') {
    sessions = sessions.map(s => ({
      ...s,
      displayContent: expandToDisplayTags(s.content, context),
      displayConclussion: expandToDisplayTags(s.conclussion, context)
    }));
  }
  return sessions;
}

async function saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches, autoTag = true }) {
  const context = await getCampaignContext(campaignId);
  const processedContent = content !== undefined ? (autoTag ? autoTagEntities(content || '', context) : normalizeToIdTags(content || '', context)) : undefined;
  const processedConclussion = conclussion !== undefined ? (autoTag ? autoTagEntities(conclussion || '', context) : normalizeToIdTags(conclussion || '', context)) : undefined;

  const branchesArray = playerVisibleBranches !== undefined
    ? (Array.isArray(playerVisibleBranches)
      ? playerVisibleBranches
      : (typeof playerVisibleBranches === 'string'
        ? playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean)
        : []))
    : undefined;

  const allSessions = await apiRequest('/campaignSession', 'GET');
  const existing = (allSessions || []).find(s =>
    (Number(s.campaignId) === Number(campaignId) || String(s.campaignId) === String(campaignId)) &&
    (Number(s.sessionId) === Number(sessionId) || String(s.sessionId) === String(sessionId))
  );

  const finalContent = processedContent !== undefined ? processedContent : (existing ? (existing.content || '') : '');
  const finalConclussion = processedConclussion !== undefined ? processedConclussion : (existing ? (existing.conclussion || '') : '');
  const finalBranches = branchesArray !== undefined ? branchesArray : (existing ? (existing.playerVisibleBranches || []) : []);

  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: finalContent,
    conclussion: finalConclussion,
    playerVisibleBranches: finalBranches
  };

  let saved = null;
  if (existing) {
    sessionDoc.id = existing.id !== undefined && existing.id !== null ? Number(existing.id) : (existing.sessionId !== undefined ? Number(existing.sessionId) : Number(sessionId));
    if (existing._id) sessionDoc._id = existing._id;
    saved = await apiRequest('/campaignSession', 'PUT', sessionDoc);
  } else {
    const maxId = (allSessions || []).reduce((m, s) => {
      const num = Number(s.id !== undefined && s.id !== null ? s.id : 0);
      return !isNaN(num) && num > m ? num : m;
    }, 0);
    sessionDoc.id = maxId + 1;
    try {
      saved = await apiRequest('/campaignSession', 'POST', sessionDoc);
    } catch (postErr) {
      if (postErr.message && postErr.message.includes('already exists')) {
        saved = await apiRequest('/campaignSession', 'PUT', sessionDoc);
      } else {
        throw postErr;
      }
    }
  }

  return {
    ...sessionDoc,
    ...saved,
    cleanContent: toCleanText(finalContent, context),
    cleanConclussion: toCleanText(finalConclussion, context),
    displayContent: expandToDisplayTags(finalContent, context)
  };
}

async function finalizeSession({ campaignId, sessionId, conclussion, playerVisibleBranches, autoTag = true }) {
  const context = await getCampaignContext(campaignId);
  const processedConclussion = autoTag ? autoTagEntities(conclussion || '', context) : normalizeToIdTags(conclussion || '', context);

  const branchesArray = playerVisibleBranches !== undefined
    ? (Array.isArray(playerVisibleBranches)
      ? playerVisibleBranches
      : (typeof playerVisibleBranches === 'string'
        ? playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean)
        : []))
    : undefined;

  const allSessions = await apiRequest('/campaignSession', 'GET');
  const existing = (allSessions || []).find(s =>
    (Number(s.campaignId) === Number(campaignId) || String(s.campaignId) === String(campaignId)) &&
    (Number(s.sessionId) === Number(sessionId) || String(s.sessionId) === String(sessionId))
  );

  if (!existing) {
    throw new Error(`Session ${sessionId} in campaign ${campaignId} not found in API.`);
  }

  const updateFields = {
    ...existing,
    conclussion: processedConclussion,
  };
  if (branchesArray !== undefined) {
    updateFields.playerVisibleBranches = branchesArray;
  }

  const updated = await apiRequest('/campaignSession', 'PUT', updateFields);

  const res = {
    ...existing,
    ...updateFields,
    ...updated,
    cleanConclussion: toCleanText(processedConclussion, context),
    displayConclussion: expandToDisplayTags(processedConclussion, context)
  };
  return res;
}

async function createNPC(npcData) {
  const { campaignId, ...fields } = npcData;
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  if (!fields.name || (fields.factionId === undefined && !fields.faction)) {
    throw new Error('NPC requires at least "name" and "factionId" (or "faction").');
  }
  if (fields.factionId === undefined && fields.faction) {
    const factionMap = {
      'imperium of man': 1,
      'gilded accord': 2,
      'abyssal cabal': 3,
      'nebryssian liberation republic': 4,
      'crimson corsairs': 5
    };
    const fLower = String(fields.faction).toLowerCase();
    fields.factionId = factionMap[fLower] || (!isNaN(Number(fields.faction)) ? Number(fields.faction) : 2);
  } else if (fields.factionId !== undefined) {
    fields.factionId = Number(fields.factionId);
  }
  delete fields.faction;
  const created = await apiRequest('/npc', 'POST', fields, resolvedCampId);
  return {
    ...created,
    entityTag: `@npc[${created.id}]`,
    displayTag: `@npc[${created.id}: ${created.name}]`
  };
}

async function updateNPC(npcUpdateData) {
  const { id, campaignId, ...updates } = npcUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateNPC requires an "id" property to identify the NPC.');
  }
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  const existing = await apiRequest(`/npc/${id}`, 'GET', null, resolvedCampId);
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.factionId !== undefined) {
    updates.factionId = Number(updates.factionId);
    delete updates.faction;
  } else if (updates.faction) {
    const factionMap = {
      'imperium of man': 1,
      'gilded accord': 2,
      'abyssal cabal': 3,
      'nebryssian liberation republic': 4,
      'crimson corsairs': 5
    };
    const fLower = String(updates.faction).toLowerCase();
    updates.factionId = factionMap[fLower] || (!isNaN(Number(updates.faction)) ? Number(updates.faction) : 2);
    delete updates.faction;
  }
  if (updates.wargear !== undefined && typeof updates.wargear === 'string') {
    updates.wargear = parseArgJson(updates.wargear) || [];
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  delete updatedDoc.faction;
  const updated = await apiRequest('/npc', 'PUT', updatedDoc, resolvedCampId);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@npc[${updatedDoc.id}]`,
    displayTag: `@npc[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createPlayer(playerData) {
  const { campaignId, ...fields } = playerData;
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  if (!fields.name) {
    throw new Error('Player requires at least a "name".');
  }

  const parsedAttributes = typeof fields.attributes === 'string'
    ? (parseArgJson(fields.attributes) || { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['universal', 'human'] })
    : (fields.attributes || { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['universal', 'human'] });

  const parsedWeapons = parseIdArray(fields.weapons);

  const parsedAbilities = typeof fields.abilities === 'string'
    ? (parseArgJson(fields.abilities) || [])
    : (fields.abilities || []);

  const parsedItems = typeof fields.items === 'string'
    ? (parseArgJson(fields.items) || [])
    : (fields.items || (typeof fields.inventory === 'string' ? parseArgJson(fields.inventory) : (fields.inventory || [])));

  let parsedProgression = typeof fields.progression === 'string'
    ? (parseArgJson(fields.progression) || { talentPoints: 0, mistrals: { digital: 0, physical: 0 }, talents: [], afflictions: [], equipment: [] })
    : (fields.progression || {
      talentPoints: fields.talentPoints !== undefined ? Number(fields.talentPoints) : 0,
      mistrals: {
        digital: fields.digitalGold !== undefined ? Number(fields.digitalGold) : 0,
        physical: fields.gold !== undefined ? Number(fields.gold) : 0
      },
      talents: typeof fields.talents === 'string' ? (parseArgJson(fields.talents) || []) : (fields.talents || []),
      afflictions: typeof fields.afflictions === 'string' ? (parseArgJson(fields.afflictions) || []) : (fields.afflictions || []),
      equipment: typeof fields.equipment === 'string' ? (parseArgJson(fields.equipment) || []) : (fields.equipment || [])
    });

  if (fields.gold !== undefined && (!parsedProgression || !parsedProgression.mistrals)) {
    if (!parsedProgression) parsedProgression = { talentPoints: 0, mistrals: { digital: 0, physical: 0 }, talents: [], afflictions: [], equipment: [] };
    if (!parsedProgression.mistrals) parsedProgression.mistrals = { digital: 0, physical: 0 };
    parsedProgression.mistrals.physical = Number(fields.gold);
  }

  const doc = {
    name: fields.name,
    race: fields.race || 'Human',
    origin: fields.origin || '',
    attributes: parsedAttributes,
    weapons: parsedWeapons,
    abilities: parsedAbilities,
    items: parsedItems,
    progression: parsedProgression
  };

  if (fields.notes) doc.notes = fields.notes;

  delete doc._id;
  const created = await apiRequest('/player', 'POST', doc, resolvedCampId);
  return {
    ...created,
    entityTag: `@player[${created.id}]`,
    displayTag: `@player[${created.id}: ${created.name}]`
  };
}

async function updatePlayer(playerUpdateData) {
  const { id, campaignId, ...updates } = playerUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updatePlayer requires an "id" property to identify the player.');
  }
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  const existing = await apiRequest(`/player/${id}`, 'GET', null, resolvedCampId);

  // Clean undefined properties from updates so they don't overwrite existing document properties
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };

  if (updates.weapons !== undefined) {
    updatedDoc.weapons = parseIdArray(updates.weapons);
  }
  if (updates.attributes !== undefined) {
    updatedDoc.attributes = typeof updates.attributes === 'string'
      ? (parseArgJson(updates.attributes) || updatedDoc.attributes)
      : updates.attributes;
  }
  if (updates.abilities !== undefined) {
    updatedDoc.abilities = typeof updates.abilities === 'string'
      ? (parseArgJson(updates.abilities) || updatedDoc.abilities)
      : updates.abilities;
  }
  if (updates.items !== undefined || updates.inventory !== undefined) {
    const rawItems = updates.items !== undefined ? updates.items : updates.inventory;
    updatedDoc.items = typeof rawItems === 'string'
      ? (parseArgJson(rawItems) || updatedDoc.items)
      : rawItems;
  }
  if (updates.progression !== undefined) {
    updatedDoc.progression = typeof updates.progression === 'string'
      ? (parseArgJson(updates.progression) || updatedDoc.progression)
      : updates.progression;
  }

  if (updates.gold !== undefined || updates.digitalGold !== undefined || updates.talentPoints !== undefined || updates.talents !== undefined || updates.afflictions !== undefined) {
    if (!updatedDoc.progression) {
      updatedDoc.progression = { talentPoints: 0, mistrals: { digital: 0, physical: 0 }, talents: [], afflictions: [], equipment: [] };
    }
    if (!updatedDoc.progression.mistrals) {
      updatedDoc.progression.mistrals = { digital: 0, physical: 0 };
    }
    if (updates.gold !== undefined) updatedDoc.progression.mistrals.physical = Number(updates.gold);
    if (updates.digitalGold !== undefined) updatedDoc.progression.mistrals.digital = Number(updates.digitalGold);
    if (updates.talentPoints !== undefined) updatedDoc.progression.talentPoints = Number(updates.talentPoints);
    if (updates.talents !== undefined) {
      updatedDoc.progression.talents = typeof updates.talents === 'string' ? (parseArgJson(updates.talents) || []) : updates.talents;
    }
    if (updates.afflictions !== undefined) {
      updatedDoc.progression.afflictions = typeof updates.afflictions === 'string' ? (parseArgJson(updates.afflictions) || []) : updates.afflictions;
    }
  }

  delete updatedDoc._id;
  const updated = await apiRequest('/player', 'PUT', updatedDoc, resolvedCampId);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@player[${updatedDoc.id}]`,
    displayTag: `@player[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createBestiaryEntry(bestiaryData) {
  const {
    name,
    factionId,
    faction,
    subgroup = '',
    attributes = {},
    weapons = [],
    abilities = [],
    deployables = [],
    isDiscovered = true,
    discoveredCampaignIds = null,
    campaignId = 1,
    pr = null
  } = bestiaryData;

  if (!name || (!factionId && !faction)) {
    throw new Error('Bestiary entry requires at least "name" and "factionId" (or "faction").');
  }

  let resolvedFactionId = factionId !== undefined ? Number(factionId) : undefined;
  if (!resolvedFactionId && faction) {
    if (typeof faction === 'number') {
      resolvedFactionId = faction;
    } else {
      try {
        const lore = await apiRequest('/lore', 'GET');
        const found = (lore?.factions || []).find(f => f.name.toLowerCase() === faction.trim().toLowerCase());
        if (found) resolvedFactionId = found.id;
      } catch { }
    }
  }
  if (!resolvedFactionId) {
    resolvedFactionId = 1;
  }

  const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();
  const validatedWeaponIds = validateWeaponsExist(parseIdArray(weapons), allWeapons);

  const finalAttributes = {
    Movement: typeof attributes.Movement === 'number' ? attributes.Movement : 6,
    Wounds: typeof attributes.Wounds === 'number' ? attributes.Wounds : 10,
    Save: typeof attributes.Save === 'number' ? attributes.Save : 5,
    APL: typeof attributes.APL === 'number' ? attributes.APL : 2,
    body: Array.isArray(attributes.body) && attributes.body.length > 0
      ? attributes.body
      : ['universal', 'human']
  };

  const prBreakdown = calculatePR({
    attributes: finalAttributes,
    weapons: validatedWeaponIds,
    abilities: Array.isArray(abilities) ? abilities : []
  }, allWeapons, allRules);

  const finalPR = (typeof pr === 'number' && pr > 0) ? pr : prBreakdown.total;

  const finalDiscoveredCampaignIds = Array.isArray(discoveredCampaignIds)
    ? discoveredCampaignIds
    : (isDiscovered !== false ? (campaignId ? [Number(campaignId)] : [1]) : []);

  const bestiaryDoc = {
    name: name.trim(),
    factionId: resolvedFactionId,
    subgroup: subgroup ? subgroup.trim() : 'General',
    pr: finalPR,
    attributes: finalAttributes,
    weapons: validatedWeaponIds,
    abilities: Array.isArray(abilities) ? abilities : [],
    ...(Array.isArray(deployables) && deployables.length > 0 ? { deployables } : {}),
    isDiscovered: finalDiscoveredCampaignIds.length > 0,
    discoveredCampaignIds: finalDiscoveredCampaignIds
  };

  const created = await apiRequest('/bestiary', 'POST', bestiaryDoc);
  return {
    ...bestiaryDoc,
    ...created,
    prBreakdown,
    entityTag: `@bestiary[${created.id}]`,
    displayTag: `@bestiary[${created.id}: ${created.name}]`
  };
}

async function updateBestiaryEntry(bestiaryUpdateData) {
  const { id, factionId, faction, ...updates } = bestiaryUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateBestiaryEntry requires an "id" property to identify the creature.');
  }

  const numericId = Number(id) || id;
  const targetBestiary = await apiRequest(`/bestiary/${id}`, 'GET');
  const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();

  let resolvedFactionId = factionId !== undefined ? Number(factionId) : undefined;
  if (resolvedFactionId === undefined && faction) {
    if (typeof faction === 'number') {
      resolvedFactionId = faction;
    } else {
      try {
        const lore = await apiRequest('/lore', 'GET');
        const found = (lore?.factions || []).find(f => f.name.toLowerCase() === faction.trim().toLowerCase());
        if (found) resolvedFactionId = found.id;
      } catch { }
    }
  }
  if (resolvedFactionId === undefined) {
    resolvedFactionId = targetBestiary.factionId ?? 1;
  }

  let finalWeapons = targetBestiary.weapons || [];
  if (updates.weapons !== undefined) {
    finalWeapons = validateWeaponsExist(parseIdArray(updates.weapons), allWeapons);
  }

  const finalAttributes = {
    ...(targetBestiary.attributes || {}),
    ...(updates.attributes || {})
  };

  const finalAbilities = Array.isArray(updates.abilities) ? updates.abilities : (targetBestiary.abilities || []);

  const prBreakdown = calculatePR({
    attributes: finalAttributes,
    weapons: finalWeapons,
    abilities: finalAbilities
  }, allWeapons, allRules);

  const finalPR = (typeof updates.pr === 'number' && updates.pr > 0) ? updates.pr : prBreakdown.total;

  const updatedDoc = {
    ...targetBestiary,
    ...updates,
    id: numericId,
    factionId: resolvedFactionId,
    pr: finalPR,
    attributes: finalAttributes,
    weapons: finalWeapons,
    abilities: finalAbilities,
  };
  delete updatedDoc._id;
  delete updatedDoc.faction;

  const updated = await apiRequest('/bestiary', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    prBreakdown,
    entityTag: `@bestiary[${numericId}]`,
    displayTag: `@bestiary[${numericId}: ${updatedDoc.name}]`
  };
}

async function createCombatNPC(combatData) {
  const {
    campaignId,
    name,
    faction,
    factionId,
    subgroup = '',
    role = 'Combatant',
    mission = '',
    methods = '',
    personality = '',
    location = '',
    reputation = '',
    backstory = '',
    description = '',
    attributes = {},
    weapons = [],
    abilities = [],
    deployables = [],
    wargear = [],
    isDiscovered = true
  } = combatData;

  const factionMap = {
    'imperium of man': 1,
    'gilded accord': 2,
    'abyssal cabal': 3,
    'nebryssian liberation republic': 4,
    'crimson corsairs': 5
  };
  const resolvedFactionId = factionId !== undefined ? Number(factionId) : (factionMap[String(faction).toLowerCase()] || (!isNaN(Number(faction)) ? Number(faction) : 2));
  const factionNameMap = {
    1: 'Imperium of Man',
    2: 'Gilded Accord',
    3: 'Abyssal Cabal',
    4: 'Nebryssian Liberation Republic',
    5: 'Crimson Corsairs'
  };
  const resolvedFactionName = faction || factionNameMap[resolvedFactionId] || 'Gilded Accord';

  if (!name || (!faction && factionId === undefined)) {
    throw new Error('Combat NPC requires at least "name" and "factionId" (or "faction").');
  }

  const bestiaryRes = await createBestiaryEntry({
    name,
    faction: resolvedFactionName,
    subgroup,
    attributes,
    weapons,
    abilities,
    deployables,
    isDiscovered,
    campaignId
  });

  const npcRes = await createNPC({
    campaignId,
    name,
    factionId: resolvedFactionId,
    subgroup,
    role,
    mission,
    methods,
    personality,
    location,
    bestiaryId: bestiaryRes.id,
    reputation,
    backstory,
    description,
    wargear,
    discovered: isDiscovered
  });

  return {
    npc: npcRes,
    bestiary: bestiaryRes,
    entityTags: {
      npc: `@npc[${npcRes.id}]`,
      bestiary: `@bestiary[${bestiaryRes.id}]`
    },
    displayTags: {
      npc: `@npc[${npcRes.id}: ${npcRes.name}]`,
      bestiary: `@bestiary[${bestiaryRes.id}: ${bestiaryRes.name}]`
    }
  };
}

async function createLocation(locationData) {
  const { campaignId, ...fields } = locationData;
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  if (!fields.name || !fields.faction) {
    throw new Error('Location requires at least "name" and "faction".');
  }
  const created = await apiRequest('/location', 'POST', fields, resolvedCampId);
  return {
    ...created,
    entityTag: `@location[${created.id}]`,
    displayTag: `@location[${created.id}: ${created.name}]`
  };
}

async function updateLocation(locationUpdateData) {
  const { id, campaignId, ...updates } = locationUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLocation requires an "id" property to identify the location.');
  }
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  const existing = await apiRequest(`/location/${id}`, 'GET', null, resolvedCampId);
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.features !== undefined && typeof updates.features === 'string') {
    updates.features = parseArgJson(updates.features) || [];
  }
  if (updates.secrets !== undefined && typeof updates.secrets === 'string') {
    updates.secrets = parseArgJson(updates.secrets) || [];
  }
  if (updates.shops !== undefined) {
    updates.shops = parseIdArray(updates.shops);
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/location', 'PUT', updatedDoc, resolvedCampId);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@location[${updatedDoc.id}]`,
    displayTag: `@location[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createShop(shopData) {
  const { campaignId, ...fields } = shopData;
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  if (!fields.name) {
    throw new Error('Shop requires at least a "name".');
  }
  const created = await apiRequest('/shop', 'POST', fields, resolvedCampId);
  return {
    ...created,
    entityTag: `@shop[${created.id}]`,
    displayTag: `@shop[${created.id}: ${created.name}]`
  };
}

async function updateShop(shopUpdateData) {
  const { id, campaignId, ...updates } = shopUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateShop requires an "id" property to identify the shop.');
  }
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  const existing = await apiRequest(`/shop/${id}`, 'GET', null, resolvedCampId);
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.items !== undefined && typeof updates.items === 'string') {
    updates.items = parseArgJson(updates.items) || [];
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/shop', 'PUT', updatedDoc, resolvedCampId);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@shop[${updatedDoc.id}]`,
    displayTag: `@shop[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createLetter(letterData) {
  const { campaignId, ...fields } = letterData;
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  if (!fields.subject && !fields.title) {
    throw new Error('Letter requires at least "subject" or "title".');
  }
  const created = await apiRequest('/letter', 'POST', {
    ...fields,
    subject: fields.subject || fields.title
  }, resolvedCampId);
  return {
    ...created,
    entityTag: `@letter[${created.id}]`,
    displayTag: `@letter[${created.id}: ${created.subject || created.title}]`
  };
}

async function updateLetter(letterUpdateData) {
  const { id, campaignId, ...updates } = letterUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLetter requires an "id" property to identify the letter.');
  }
  const resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  const existing = await apiRequest(`/letter/${id}`, 'GET', null, resolvedCampId);
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.recipientIds !== undefined) {
    updates.recipientIds = parseIdArray(updates.recipientIds);
  }
  if (updates.targetNames !== undefined && typeof updates.targetNames === 'string') {
    updates.targetNames = parseArgJson(updates.targetNames) || [];
  }
  if (updates.readBy !== undefined && typeof updates.readBy === 'string') {
    updates.readBy = parseArgJson(updates.readBy) || [];
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/letter', 'PUT', updatedDoc, resolvedCampId);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@letter[${updatedDoc.id}]`,
    displayTag: `@letter[${updatedDoc.id}: ${updatedDoc.subject || updatedDoc.title}]`
  };
}

async function createItem(itemData) {
  if (!itemData.name) throw new Error('Item requires at least a "name".');
  const created = await apiRequest('/item', 'POST', itemData);
  return {
    ...created,
    entityTag: `@item[${created.id}]`,
    displayTag: `@item[${created.id}: ${created.name}]`
  };
}

async function updateItem(itemUpdateData) {
  const { id, ...updates } = itemUpdateData;
  if (id === undefined || id === null) throw new Error('updateItem requires an "id" property.');
  const existing = await apiRequest(`/item/${id}`, 'GET');
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.statModifications !== undefined && typeof updates.statModifications === 'string') {
    updates.statModifications = parseArgJson(updates.statModifications) || updates.statModifications;
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/item', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@item[${updatedDoc.id}]`,
    displayTag: `@item[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createWeapon(weaponData) {
  if (!weaponData.name) throw new Error('Weapon requires at least a "name".');
  const created = await apiRequest('/weapon', 'POST', weaponData);
  return {
    ...created,
    entityTag: `@weapon[${created.id}]`,
    displayTag: `@weapon[${created.id}: ${created.name}]`
  };
}

async function updateWeapon(weaponUpdateData) {
  const { id, ...updates } = weaponUpdateData;
  if (id === undefined || id === null) throw new Error('updateWeapon requires an "id" property.');
  const existing = await apiRequest(`/weapon/${id}`, 'GET');
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  if (updates.profiles !== undefined && typeof updates.profiles === 'string') {
    updates.profiles = parseArgJson(updates.profiles) || updates.profiles;
  }
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/weapon', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@weapon[${updatedDoc.id}]`,
    displayTag: `@weapon[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createWeaponRule(ruleData) {
  if (!ruleData.name) throw new Error('Weapon Rule requires at least a "name".');
  const created = await apiRequest('/weaponRule', 'POST', ruleData);
  return {
    ...created,
    entityTag: `@weaponrule[${created.id}]`,
    displayTag: `@weaponrule[${created.id}: ${created.name}]`
  };
}

async function updateWeaponRule(ruleUpdateData) {
  const { id, ...updates } = ruleUpdateData;
  if (id === undefined || id === null) throw new Error('updateWeaponRule requires an "id" property.');
  const existing = await apiRequest(`/weaponRule/${id}`, 'GET');
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/weaponRule', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@weaponrule[${updatedDoc.id}]`,
    displayTag: `@weaponrule[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createAlteredState(stateData) {
  if (!stateData.name) throw new Error('Altered State requires at least a "name".');
  const created = await apiRequest('/status', 'POST', stateData);
  return {
    ...created,
    entityTag: `@alteredstate[${created.id}]`,
    displayTag: `@alteredstate[${created.id}: ${created.name}]`
  };
}

async function updateAlteredState(stateUpdateData) {
  const { id, ...updates } = stateUpdateData;
  if (id === undefined || id === null) throw new Error('updateAlteredState requires an "id" property.');
  const existing = await apiRequest(`/status/${id}`, 'GET');
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/status', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@alteredstate[${updatedDoc.id}]`,
    displayTag: `@alteredstate[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createAffliction(afflictionData) {
  if (!afflictionData.name) throw new Error('Affliction requires at least a "name".');
  const created = await apiRequest('/affliction', 'POST', afflictionData);
  return {
    ...created,
    entityTag: `@affliction[${created.id}]`,
    displayTag: `@affliction[${created.id}: ${created.name}]`
  };
}

async function updateAffliction(afflictionUpdateData) {
  const { id, ...updates } = afflictionUpdateData;
  if (id === undefined || id === null) throw new Error('updateAffliction requires an "id" property.');
  const existing = await apiRequest(`/affliction/${id}`, 'GET');
  Object.keys(updates).forEach(key => {
    if (updates[key] === undefined) delete updates[key];
  });
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/affliction', 'PUT', updatedDoc);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@affliction[${updatedDoc.id}]`,
    displayTag: `@affliction[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function getEntity({ type, id, name, campaignId }) {
  if (!type) throw new Error('getEntity requires a "type" property.');
  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let resolvedCampId = null;
  if (isScoped) {
    resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  }

  if (id !== undefined && id !== null) {
    try {
      const doc = await apiRequest(`/${endpoint}/${id}`, 'GET', null, resolvedCampId);
      if (doc) return doc;
    } catch (e) { }
  }

  // Fetch full list and search by id/name
  const list = await apiRequest(`/${endpoint}`, 'GET', null, resolvedCampId);
  if (!Array.isArray(list)) return list || null;

  if (id !== undefined && id !== null) {
    const foundById = list.find(item => String(item.id) === String(id) || String(item.sessionId) === String(id));
    if (foundById) return foundById;
  }

  if (name) {
    const cleaned = cleanString(name);
    const foundByName = list.find(item => cleanString(item.name || item.subject || item.title) === cleaned);
    if (foundByName) return foundByName;

    const partial = list.find(item => {
      const label = cleanString(item.name || item.subject || item.title);
      return label && (label.includes(cleaned) || cleaned.includes(label));
    });
    if (partial) return partial;
  }

  throw new Error(`Entity of type '${type}' with ID '${id}' or name '${name}' not found.`);
}

async function readEntities({ type, campaignId, filter = null, search = '', limit = 0 }) {
  if (!type) throw new Error('readEntities requires a "type" property.');
  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let resolvedCampId = null;
  if (isScoped) {
    resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  }

  let list = await apiRequest(`/${endpoint}`, 'GET', null, resolvedCampId);
  if (!Array.isArray(list)) return [];

  if (normalizedType === 'session') {
    const targetCamp = campaignId ? (isNaN(Number(campaignId)) ? campaignId : Number(campaignId)) : getDefaultCampaignId();
    list = list.filter(s =>
      String(s.campaignId) === String(targetCamp) ||
      Number(s.campaignId) === Number(targetCamp)
    );
  }

  if (search && search.trim()) {
    const q = cleanString(search);
    list = list.filter(item => {
      const label = cleanString(item.name || item.subject || item.title || item.content || item.description || '');
      return label.includes(q);
    });
  }

  if (filter && typeof filter === 'object') {
    list = list.filter(item => {
      return Object.entries(filter).every(([key, val]) => {
        if (item[key] === undefined) return false;
        if (typeof val === 'string') return cleanString(item[key]) === cleanString(val);
        return item[key] === val;
      });
    });
  }

  if (limit && Number(limit) > 0) {
    list = list.slice(0, Number(limit));
  }

  return list;
}

async function deleteEntity({ type, id, campaignId }) {
  if (!type) throw new Error('deleteEntity requires a "type" property.');
  if (id === undefined || id === null) throw new Error('deleteEntity requires an "id" property.');

  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let resolvedCampId = null;
  if (isScoped) {
    resolvedCampId = (await resolveCampaign(campaignId)).campaign.id;
  }

  const res = await apiRequest(`/${endpoint}/${id}`, 'DELETE', null, resolvedCampId);
  return {
    success: true,
    type: normalizedType,
    id,
    campaignId: Number(campaignId) || campaignId,
    apiResponse: res,
    message: `Successfully moved ${normalizedType} with ID ${id} to ${res?.movedTo || normalizedType + '-trash'}`
  };
}

function parseIdArray(val) {
  if (val === undefined || val === null || val === '') return [];
  if (Array.isArray(val)) {
    return val.map(Number).filter(n => !isNaN(n));
  }
  if (typeof val === 'number') {
    return isNaN(val) ? [] : [val];
  }
  if (typeof val === 'string') {
    let s = val.trim();
    if (!s) return [];
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    if (!s) return [];
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(part => Number(part.trim().replace(/^['"]|['"]$/g, ''))).filter(n => !isNaN(n));
    }
    return s.split(',').map(part => Number(part.trim().replace(/^['"]|['"]$/g, ''))).filter(n => !isNaN(n));
  }
  return [];
}

function parseArgJson(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  let str = String(raw).trim();

  // Strip wrapping quotes if any (single, double, or escaped quotes)
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  if ((str.startsWith('\\"') && str.endsWith('\\"')) || (str.startsWith("\\'") && str.endsWith("\\'"))) {
    str = str.slice(2, -2).trim();
  }

  // Handle base64 encoded JSON
  if (str.startsWith('base64:')) {
    try {
      const decoded = Buffer.from(str.slice(7), 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) { }
  }

  // 1. Direct JSON parse
  try {
    return JSON.parse(str);
  } catch (e) { }

  // 2. Normalize escaped quotes like \" or \\"
  try {
    const unescaped = str.replace(/\\"/g, '"');
    return JSON.parse(unescaped);
  } catch (e) { }

  // 3. Relaxed JS evaluation
  try {
    return Function(`"use strict"; return (${str});`)();
  } catch (e) { }

  // 4. Tokenizer/Parser for PowerShell-stripped quotes:
  // e.g. {Movement:6,Wounds:14,Save:4,APL:2,body:[construct,human]}
  // or [{name:Vigilance,effect:Overwatch attacks hit on 4+ instead of 5+,prModifier:8}]
  try {
    const repaired = repairStrippedJson(str);
    if (repaired !== null && repaired !== undefined) return repaired;
  } catch (e) { }

  return null;
}

function repairStrippedJson(input) {
  if (!input) return null;
  let s = String(input).trim();
  let i = 0;

  function skipWhitespace() {
    while (i < s.length && /\s/.test(s[i])) i++;
  }

  function parseValue() {
    skipWhitespace();
    if (i >= s.length) return undefined;
    const ch = s[i];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"' || ch === "'") return parseQuotedString();
    return parsePrimitiveOrUnquotedString();
  }

  function parseQuotedString() {
    const quote = s[i++];
    let res = '';
    while (i < s.length) {
      if (s[i] === '\\' && i + 1 < s.length) {
        res += s[i + 1];
        i += 2;
      } else if (s[i] === quote) {
        i++;
        return res;
      } else {
        res += s[i++];
      }
    }
    return res;
  }

  function parsePrimitiveOrUnquotedString() {
    let start = i;
    while (i < s.length && s[i] !== ',' && s[i] !== '}' && s[i] !== ']') {
      i++;
    }
    let val = s.slice(start, i).trim();
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val === 'undefined') return undefined;
    if (!isNaN(Number(val)) && val !== '') return Number(val);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  }

  function parseObject() {
    i++; // skip '{'
    const obj = {};
    skipWhitespace();
    if (s[i] === '}') {
      i++;
      return obj;
    }
    while (i < s.length) {
      skipWhitespace();
      if (s[i] === '}') {
        i++;
        return obj;
      }
      let key = '';
      if (s[i] === '"' || s[i] === "'") {
        key = parseQuotedString();
      } else {
        let keyStart = i;
        while (i < s.length && s[i] !== ':' && s[i] !== '}' && !/\s/.test(s[i])) {
          i++;
        }
        key = s.slice(keyStart, i).trim();
      }
      skipWhitespace();
      if (s[i] === ':') {
        i++; // skip ':'
      }
      skipWhitespace();
      const val = parseValue();
      obj[key] = val;
      skipWhitespace();
      if (s[i] === ',') {
        i++; // skip ','
      } else if (s[i] === '}') {
        i++;
        return obj;
      }
    }
    return obj;
  }

  function parseArray() {
    i++; // skip '['
    const arr = [];
    skipWhitespace();
    if (s[i] === ']') {
      i++;
      return arr;
    }
    while (i < s.length) {
      skipWhitespace();
      if (s[i] === ']') {
        i++;
        return arr;
      }
      const val = parseValue();
      arr.push(val);
      skipWhitespace();
      if (s[i] === ',') {
        i++; // skip ','
      } else if (s[i] === ']') {
        i++;
        return arr;
      }
    }
    return arr;
  }

  return parseValue();
}

const MUTATION_COMMANDS = new Set([
  'save', 'update-session', 'finalize', 'delete-entity',
  'create-npc', 'update-npc',
  'create-location', 'update-location',
  'create-shop', 'update-shop',
  'create-bestiary', 'update-bestiary', 'create-combat-npc',
  'create-player', 'update-player',
  'create-letter', 'update-letter',
  'create-item', 'update-item',
  'create-weapon', 'update-weapon',
  'create-weapon-rule', 'update-weapon-rule',
  'create-altered-state', 'update-altered-state',
  'create-affliction', 'update-affliction'
]);

function isMutationCommand(cmd) {
  if (!cmd) return false;
  const c = cmd.toLowerCase();
  return MUTATION_COMMANDS.has(c) || c.startsWith('create-') || c.startsWith('update-') || c.startsWith('delete-');
}

function generateMutationSummary(command, params) {
  const c = (command || '').toLowerCase();
  const name = params.name ? ` "${params.name}"` : (params.id ? ` #${params.id}` : '');
  const targetCamp = params.campaignId || getDefaultCampaignId();
  const campaign = targetCamp ? ` [Campaign ${targetCamp}]` : '';

  if (c === 'save' || c === 'update-session') {
    return `Save Session #${params.sessionId || params.id || '?'}${campaign}`;
  }
  if (c === 'finalize') {
    return `Finalize Session #${params.sessionId || '?'}${campaign}`;
  }
  if (c.startsWith('create-npc')) {
    return `Create NPC${name}${params.faction ? ` (${params.faction})` : ''}${campaign}`;
  }
  if (c.startsWith('update-npc')) {
    return `Update NPC${name}${campaign}`;
  }
  if (c.startsWith('create-location')) {
    return `Create Location${name}${campaign}`;
  }
  if (c.startsWith('update-location')) {
    return `Update Location${name}${campaign}`;
  }
  if (c.startsWith('create-shop')) {
    return `Create Shop${name}${campaign}`;
  }
  if (c.startsWith('update-shop')) {
    return `Update Shop${name}${campaign}`;
  }
  if (c.startsWith('create-bestiary')) {
    return `Create Bestiary Entry${name}${campaign}`;
  }
  if (c.startsWith('update-bestiary')) {
    return `Update Bestiary Entry${name}${campaign}`;
  }
  if (c.startsWith('create-combat-npc')) {
    return `Create Combat NPC${name}${campaign}`;
  }
  if (c.startsWith('create-player')) {
    return `Create Player${name}${campaign}`;
  }
  if (c.startsWith('update-player')) {
    return `Update Player${name}${campaign}`;
  }
  if (c.startsWith('create-letter')) {
    return `Create Letter: "${params.subject || params.title || 'Untitled'}"${campaign}`;
  }
  if (c.startsWith('update-letter')) {
    return `Update Letter: "${params.subject || params.title || 'Untitled'}"${campaign}`;
  }
  if (c.startsWith('create-item')) {
    return `Create Item${name}${campaign}`;
  }
  if (c.startsWith('update-item')) {
    return `Update Item${name}${campaign}`;
  }
  if (c.startsWith('create-weapon-rule')) {
    return `Create Weapon Rule${name}`;
  }
  if (c.startsWith('update-weapon-rule')) {
    return `Update Weapon Rule${name}`;
  }
  if (c.startsWith('create-weapon')) {
    return `Create Weapon${name}`;
  }
  if (c.startsWith('update-weapon')) {
    return `Update Weapon${name}`;
  }
  if (c.startsWith('create-altered-state')) {
    return `Create Altered State${name}`;
  }
  if (c.startsWith('update-altered-state')) {
    return `Update Altered State${name}`;
  }
  if (c.startsWith('create-affliction')) {
    return `Create Affliction${name}`;
  }
  if (c.startsWith('update-affliction')) {
    return `Update Affliction${name}`;
  }
  if (c.startsWith('delete-') || c === 'delete-entity') {
    return `Delete ${params.type || 'Entity'}${params.id ? ` #${params.id}` : ''}${campaign}`;
  }
  return `${command}${name}${campaign}`;
}

function parseCliArgs(rawArgs) {
  const params = {};
  let currentKey = null;
  let currentValParts = [];

  function flush() {
    if (currentKey) {
      let fullVal = currentValParts.join(' ').trim();
      if ((fullVal.startsWith('"') && fullVal.endsWith('"')) || (fullVal.startsWith("'") && fullVal.endsWith("'"))) {
        fullVal = fullVal.slice(1, -1);
      }
      if (currentValParts.length === 0 && fullVal === '') {
        fullVal = 'true';
      }
      params[currentKey] = fullVal;
      currentKey = null;
      currentValParts = [];
    }
  }

  // Check if a token is a valid CLI flag option (e.g. --key or --key=value)
  // Must start with -- followed by a letter, and only alphanumeric/dash/underscore before optional =
  const FLAG_REGEX = /^--([a-zA-Z][a-zA-Z0-9_-]*)(?:=(.*))?$/;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const flagMatch = typeof arg === 'string' ? arg.match(FLAG_REGEX) : null;
    if (flagMatch) {
      flush();
      currentKey = flagMatch[1];
      if (flagMatch[2] !== undefined) {
        let val = flagMatch[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        currentValParts.push(val);
      }
    } else if (currentKey) {
      currentValParts.push(arg);
    }
  }
  flush();

  // Decode base64 payloads/content or payload-file if present
  if (params['payload-file'] || params['payloadFile']) {
    try {
      const pFile = params['payload-file'] || params['payloadFile'];
      if (fs.existsSync(pFile)) {
        const fileContent = fs.readFileSync(pFile, 'utf8');
        const parsedObj = parseArgJson(fileContent);
        if (parsedObj && typeof parsedObj === 'object') {
          Object.assign(params, parsedObj);
        }
      }
    } catch (e) {
      console.warn('Failed to parse payload-file:', e.message);
    }
  }

  if (params['payload-base64'] || params['payloadBase64']) {
    try {
      const b64 = params['payload-base64'] || params['payloadBase64'];
      const decodedJson = Buffer.from(b64, 'base64').toString('utf8');
      const parsedObj = parseArgJson(decodedJson);
      if (parsedObj && typeof parsedObj === 'object') {
        Object.assign(params, parsedObj);
      }
    } catch (e) {
      console.warn('Failed to parse payload-base64:', e.message);
    }
  }

  if (params['payload-json'] || params['payloadJson']) {
    try {
      const jsonStr = params['payload-json'] || params['payloadJson'];
      const parsedObj = parseArgJson(jsonStr);
      if (parsedObj && typeof parsedObj === 'object') {
        Object.assign(params, parsedObj);
      }
    } catch (e) {
      console.warn('Failed to parse payload-json:', e.message);
    }
  }

  if (params['content-base64'] || params['contentBase64']) {
    try {
      const b64 = params['content-base64'] || params['contentBase64'];
      params.content = Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      console.warn('Failed to decode content-base64:', e.message);
    }
  }

  if (params['conclussion-base64'] || params['conclussionBase64'] || params['conclusion-base64']) {
    try {
      const b64 = params['conclussion-base64'] || params['conclussionBase64'] || params['conclusion-base64'];
      params.conclussion = Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      console.warn('Failed to decode conclussion-base64:', e.message);
    }
  }

  return params;
}

const COMMAND_HELP_MAP = {
  'help': `
Command: help
Usage:
  node scripts/campaign-session-tool.js help [command]
  node scripts/campaign-session-tool.js <command> --help

Description:
  Displays general usage or detailed command-specific documentation, parameters, and examples.
`,
  'get-context': `
Command: get-context
Usage:
  node scripts/campaign-session-tool.js get-context [campaignId]

Description:
  Fetches full active campaign context including previous sessions, active player roster, NPCs, visited locations, and active factions.
`,
  'context-usage': `
Command: context-usage
Usage:
  node scripts/campaign-session-tool.js context-usage [campaignId]

Description:
  Calculates and reports the estimated context window token usage, database asset sizes, percentage utilized, and remaining capacity for the active campaign.
`,
  'list': `
Command: list
Usage:
  node scripts/campaign-session-tool.js list [campaignId] [--clean | --expand]

Description:
  Lists all play sessions in the active campaign. Use --clean for human-readable entity names or --expand for full entity objects.
`,
  'get-latest': `
Command: get-latest
Usage:
  node scripts/campaign-session-tool.js get-latest [campaignId] [--clean | --expand]

Description:
  Retrieves the most recent campaign session.
`,
  'get-entity': `
Command: get-entity
Usage:
  node scripts/campaign-session-tool.js get-entity <type> [id or name] [--campaignId=N]

Parameters:
  <type>                  Entity type (player, npc, location, shop, bestiary, letter, item, weapon, weaponrule, status, affliction, session)
  <id or name>            Numeric ID or exact/partial name
  --campaignId=<id>       Active campaign ID (required for player, npc, location, shop, letter, session)

Example:
  node scripts/campaign-session-tool.js get-entity player 1 --campaignId=1
  node scripts/campaign-session-tool.js get-entity weapon "Balefire Blade"
`,
  'list-entities': `
Command: list-entities
Usage:
  node scripts/campaign-session-tool.js list-entities <type> [--campaignId=N] [--filter='...'] [--search="..."] [--limit=N]

Parameters:
  <type>                  Entity type (player, npc, location, shop, bestiary, letter, item, weapon, weaponrule, status, affliction, session)
  --campaignId=<id>       Active campaign ID (for campaign-scoped entities)
  --filter='{...}'        JSON filter criteria
  --search="<string>"     Text search query
  --limit=<number>        Max records to return

Example:
  node scripts/campaign-session-tool.js list-entities npc --campaignId=1 --search="Inquisitor"
`,
  'delete-entity': `
Command: delete-entity
Usage:
  node scripts/campaign-session-tool.js delete-entity <type> <id> [--campaignId=N]

Parameters:
  <type>                  Entity type
  <id>                    Numeric ID of the entity to delete
  --campaignId=<id>       Active campaign ID (for campaign-scoped entities)
`,
  'auto-tag': `
Command: auto-tag
Usage:
  node scripts/campaign-session-tool.js auto-tag [campaignId] --input="<text>"

Description:
  Converts plain-text entity names in the input string into unique database reference tags (@player[id], @npc[id], etc.).
`,
  'clean-text': `
Command: clean-text
Usage:
  node scripts/campaign-session-tool.js clean-text [campaignId] --input="<text>"

Description:
  Replaces database reference tags (@player[id], @location[id], etc.) with natural, clean entity names for presentation.
`,
  'list-weapons': `
Command: list-weapons
Usage:
  node scripts/campaign-session-tool.js list-weapons [searchQuery]

Description:
  Lists all weapons from the official compendium. Used for PR validation and Bestiary weapon selection.
`,
  'calculate-pr': `
Command: calculate-pr
Usage:
  node scripts/campaign-session-tool.js calculate-pr --weapons="<ids>" --attributes='{...}' --abilities='[...]'

Parameters:
  --weapons="<ids>"       Comma-separated weapon IDs e.g. "1,8"
  --attributes='{...}'    JSON attributes e.g. {"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}
  --abilities='[...]'     JSON abilities array e.g. [{"name":"Shield","effect":"...","prModifier":10}]
`,
  'save': `
Command: save
Usage:
  node scripts/campaign-session-tool.js save --campaignId=N --sessionId=N [--content="<tagged text>"] [--conclussion="..."] [--branches="..."]

Description:
  Saves/stages a campaign session narrative plan with entity reference tags (@player[id], @npc[id], etc.). Preserves existing conclusion/branches when updating.
`,
  'update-session': `
Command: update-session
Usage:
  node scripts/campaign-session-tool.js update-session --campaignId=N --sessionId=N [--content="<tagged text>"] [--conclussion="..."] [--branches="..."]

Description:
  Updates an existing campaign session narrative plan or conclusion.
`,
  'finalize': `
Command: finalize
Usage:
  node scripts/campaign-session-tool.js finalize --campaignId=N --sessionId=N --conclussion="<tagged text>" [--branches="..."]

Description:
  Concludes/finalizes a campaign session with the debrief narrative and player-visible completed branches.
`,
  'create-player': `
Command: create-player
Usage:
  node scripts/campaign-session-tool.js create-player --campaignId=N --name="<name>" [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --name="<string>"       Player character name (required)
  --race="<string>"       Race/species (default: "Human")
  --origin="<string>"     Character origin or background
  --gold=<number>         Physical mistrals/gold
  --digitalGold=<number>  Digital mistrals/gold
  --talentPoints=<number> Unspent talent points
  --attributes='{...}'    JSON object e.g. {"Movement":6,"Wounds":10,"Save":5,"APL":2,"body":["universal","human"]}
  --weapons="<ids>"       Comma-separated weapon IDs e.g. "1,8"
  --abilities='[...]'     JSON array of abilities
  --items='[...]'         JSON array of inventory items
  --talents='[...]'       JSON array of talent IDs or talent objects
  --afflictions='[...]'   JSON array of afflictions
  --notes="<string>"      Character notes / backstory

Example:
  node scripts/campaign-session-tool.js create-player --campaignId=1 --name="Mark" --race="Human" --origin="Zephyria" --gold=100 --weapons="1,8"
`,
  'update-player': `
Command: update-player
Usage:
  node scripts/campaign-session-tool.js update-player --campaignId=N --id=<id> [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --id=<id>               Player ID to update (required)
  --name="<string>"       Player character name
  --race="<string>"       Race/species
  --origin="<string>"     Character origin or background
  --attributes='{...}'    JSON object of attributes: {"Movement":6,"Wounds":10,"Save":5,"APL":2,"body":["human"]}
  --weapons="<ids>"       Comma-separated weapon IDs (e.g. "58,75")
  --abilities='[...]'     JSON array of abilities: [{"name":"...","effect":"..."}]
  --items='[...]'         JSON array of inventory items
  --gold=<number>         Physical mistrals/gold
  --digitalGold=<number>  Digital mistrals/gold
  --talentPoints=<number> Unspent talent points
  --talents='[...]'       JSON array of talent IDs
  --afflictions='[...]'   JSON array of afflictions
  --notes="<string>"      Character notes / backstory

Note:
  Always pass all entity parameters (--attributes, --weapons, --abilities, --items, --progression/gold) to preserve the full character sheet.
  If full parameters are not in context, run 'get-entity player <id>' first.
`,
  'create-npc': `
Command: create-npc
Usage:
  node scripts/campaign-session-tool.js create-npc --campaignId=N --name="<name>" --factionId=N [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --name="<string>"       NPC Name (required)
  --factionId=<id>        Faction ID (1: Imperium, 2: Gilded Accord, 3: Abyssal Cabal, 4: NLR, 5: Crimson Corsairs)
  --subgroup="<string>"   Sub-faction / fleet / order
  --role="<string>"       Title or archetype
  --personality="<str>"   Personality traits
  --mission="<string>"    Current objective
  --methods="<string>"    Operational tactics
  --location="<string>"   Known location
  --wargear='[...]'       JSON array of wargear objects [{"name":"...","description":"..."}]
  --discovered=<boolean>  Whether discovered by players (default: true)
`,
  'update-npc': `
Command: update-npc
Usage:
  node scripts/campaign-session-tool.js update-npc --campaignId=N --id=<id> [options]
`,
  'create-location': `
Command: create-location
Usage:
  node scripts/campaign-session-tool.js create-location --campaignId=N --name="<name>" --faction="<faction>" [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --name="<string>"       Location Name (required)
  --faction="<string>"    Controlling Faction (required)
  --category="<string>"   Category (e.g. "fortress", "island", "reef", "city")
  --categorySize=<number> Size rating (1 to 5)
  --mapX=<number>         World Map X coordinate percentage (0-100)
  --mapY=<number>         World Map Y coordinate percentage (0-100)
  --isCapital=<boolean>   Capital status
  --discovered=<boolean>  Whether discovered (default: true)
`,
  'update-location': `
Command: update-location
Usage:
  node scripts/campaign-session-tool.js update-location --campaignId=N --id=<id> [options]
`,
  'create-shop': `
Command: create-shop
Usage:
  node scripts/campaign-session-tool.js create-shop --campaignId=N --name="<name>" [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --name="<string>"       Shop Name (required)
  --owner=<id>            Owner NPC ID
  --locationId=<id>       Location ID
  --locationName="<str>"  Location name
  --categories='[...]'    JSON array of category IDs (e.g. [1, 2, 3])
  --items='[...]'         JSON array of item objects [{"id":1,"price":50,"type":"item"}]
  --discovered=<boolean>  Whether discovered (default: true)
`,
  'update-shop': `
Command: update-shop
Usage:
  node scripts/campaign-session-tool.js update-shop --campaignId=N --id=<id> [options]
`,
  'create-bestiary': `
Command: create-bestiary
Usage:
  node scripts/campaign-session-tool.js create-bestiary --name="<name>" --faction="<faction>" [options]

Parameters:
  --name="<string>"       Creature / operative name (required)
  --faction="<string>"    Faction name or factionId (required)
  --subgroup="<string>"   Subgroup / type
  --attributes='{...}'    JSON attributes: {"Movement":6,"Wounds":10,"Save":5,"APL":2,"body":["human"]}
  --weapons="<ids>"       Comma-separated weapon IDs (must exist in compendium)
  --abilities='[...]'     JSON array of abilities [{"name":"...","effect":"...","prModifier":5}]
  --deployables='[...]'   JSON array of deployables
  --pr=<number>           Explicit PR override (otherwise calculated automatically)
  --isDiscovered=<bool>   Discovery state (default: true)
`,
  'update-bestiary': `
Command: update-bestiary
Usage:
  node scripts/campaign-session-tool.js update-bestiary --id=<id> [options]
`,
  'create-combat-npc': `
Command: create-combat-npc
Usage:
  node scripts/campaign-session-tool.js create-combat-npc --campaignId=N --name="<name>" --factionId=N [options]

Description:
  Creates both a Bestiary statblock and an NPC profile linked together via bestiaryId.
`,
  'create-letter': `
Command: create-letter
Usage:
  node scripts/campaign-session-tool.js create-letter --campaignId=N --subject="<subject>" [options]

Parameters:
  --campaignId=<id>       Active campaign ID (required)
  --subject="<string>"    Letter title / subject (required)
  --senderId=<id>         Sender NPC ID
  --senderName="<string>" Sender name
  --content="<string>"    HTML / text letter content
  --date="<string>"       In-game imperial date
  --recipientIds="<ids>"  Comma-separated recipient player IDs
`,
  'update-letter': `
Command: update-letter
Usage:
  node scripts/campaign-session-tool.js update-letter --campaignId=N --id=<id> [options]
`,
  'create-item': `
Command: create-item
Usage:
  node scripts/campaign-session-tool.js create-item --name="<name>" --type="<type>" --price=<price> [options]
`,
  'update-item': `
Command: update-item
Usage:
  node scripts/campaign-session-tool.js update-item --id=<id> [options]
`,
  'create-weapon': `
Command: create-weapon
Usage:
  node scripts/campaign-session-tool.js create-weapon --name="<name>" --price=<price> --profiles='[...]'
`,
  'update-weapon': `
Command: update-weapon
Usage:
  node scripts/campaign-session-tool.js update-weapon --id=<id> [options]
`,
  'create-weapon-rule': `
Command: create-weapon-rule
Usage:
  node scripts/campaign-session-tool.js create-weapon-rule --name="<name>" --effect="<effect>" [--prModifier=N]
`,
  'update-weapon-rule': `
Command: update-weapon-rule
Usage:
  node scripts/campaign-session-tool.js update-weapon-rule --id=<id> [options]
`,
  'create-altered-state': `
Command: create-altered-state
Usage:
  node scripts/campaign-session-tool.js create-altered-state --name="<name>" --effect="<effect>"
`,
  'update-altered-state': `
Command: update-altered-state
Usage:
  node scripts/campaign-session-tool.js update-altered-state --id=<id> [options]
`,
  'create-affliction': `
Command: create-affliction
Usage:
  node scripts/campaign-session-tool.js create-affliction --name="<name>" --effect="<effect>"
`,
  'update-affliction': `
Command: update-affliction
Usage:
  node scripts/campaign-session-tool.js update-affliction --id=<id> [options]
`
};

function printHelp(targetCmd) {
  if (targetCmd) {
    const norm = String(targetCmd).toLowerCase().trim().replace(/^node\s+/, '').replace(/^scripts\/campaign-session-tool\.js\s+/, '');
    if (COMMAND_HELP_MAP[norm]) {
      console.log(COMMAND_HELP_MAP[norm].trim());
      return;
    }
  }

  console.log(`
Nebryss Campaign Session Tool v4.0 (API Operations)
Usage:
  node scripts/campaign-session-tool.js help [command]
  node scripts/campaign-session-tool.js <command> --help
  node scripts/campaign-session-tool.js get-context [campaignId]
  node scripts/campaign-session-tool.js context-usage [campaignId]
  node scripts/campaign-session-tool.js list [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-latest [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-entity <type> [id or name] [--campaignId=1]
  node scripts/campaign-session-tool.js list-entities <type> [--campaignId=1] [--filter='...'] [--search="..."] [--limit=N]
  node scripts/campaign-session-tool.js delete-entity <type> <id> [--campaignId=1]
  node scripts/campaign-session-tool.js auto-tag [campaignId] --input="..."
  node scripts/campaign-session-tool.js clean-text [campaignId] --input="..."
  node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 [--content="..."] [--conclussion="..."] [--branches="..."]
  node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 [--conclussion="..."] [--branches="..."]

Entity Management (via API):
  - NPC:            create-npc, update-npc
  - Location:       create-location, update-location
  - Shop:           create-shop, update-shop
  - Bestiary:       create-bestiary, update-bestiary, create-combat-npc
  - Player:         create-player, update-player
  - Letter:         create-letter, update-letter
  - Item:           create-item, update-item
  - Weapon:         create-weapon, update-weapon, list-weapons, calculate-pr
  - Weapon Rule:    create-weapon-rule, update-weapon-rule
  - Altered State:  create-altered-state, update-altered-state
  - Affliction:     create-affliction, update-affliction

Tip: Run 'node scripts/campaign-session-tool.js <command> --help' to see specific parameters and examples for any command.
  `);
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const isHelpRequested = !command || command === 'help' || command === '--help' || command === '-h' || args.includes('--help') || args.includes('-h');

  if (isHelpRequested) {
    let targetCmd = null;
    if (command === 'help' || command === '--help' || command === '-h') {
      targetCmd = args[1] && !args[1].startsWith('-') ? args[1] : null;
    } else {
      targetCmd = command;
    }
    printHelp(targetCmd);
    process.exit(0);
  }

  // Intercept mutation commands without explicit user UI approval or direct interactive TTY
  const isUiApproved = process.env.NEBRYSS_UI_APPROVED === 'true' || process.env.NEBRYSS_MUTATION_APPROVED === '1';
  const isInteractiveHumanTty = Boolean(process.stdin.isTTY && process.stdout.isTTY && (args.includes('--approved') || args.includes('--force')));
  const isApproved = isUiApproved || isInteractiveHumanTty;

  if (isMutationCommand(command) && !isApproved) {
    const cleanArgs = args.filter(a => a !== '--approved' && a !== '--force');
    const parsedParams = parseCliArgs(cleanArgs.slice(1));

    // Ensure campaign-scoped commands attach default campaignId if omitted
    const normType = normalizeEntityType(command.replace(/^(create|update|delete)-/, ''));
    if (!parsedParams.campaignId && (CAMPAIGN_SCOPED_TYPES.has(normType) || command === 'save' || command === 'finalize' || (command === 'delete-entity' && CAMPAIGN_SCOPED_TYPES.has(normalizeEntityType(parsedParams.type))))) {
      parsedParams.campaignId = String(getDefaultCampaignId());
    }

    const summary = generateMutationSummary(command, parsedParams);

    // Build rawCommandLine: skip base64 fields AND any large text/JSON value (> 200 chars) to keep it readable
    const LARGE_FIELD_THRESHOLD = 200;
    const SKIP_BASE64_KEYS = new Set(['payload-base64', 'payloadBase64', 'payload-json', 'payloadJson', 'content-base64', 'contentBase64', 'conclussion-base64', 'conclussionBase64', 'conclusion-base64', 'payload-file', 'payloadFile', '_payloadFile']);
    const quotedArgs = [command];
    Object.keys(parsedParams).forEach(k => {
      if (SKIP_BASE64_KEYS.has(k)) return;
      const v = parsedParams[k];
      const vStr = String(v);
      if (vStr.length > LARGE_FIELD_THRESHOLD) {
        // Truncate large values in rawCommandLine for display only
        quotedArgs.push(`--${k}="[${vStr.length} chars]"`);
        return;
      }
      if (v === 'true' || v === true || v === '') {
        quotedArgs.push(`--${k}`);
      } else {
        const escaped = vStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        quotedArgs.push(`--${k}="${escaped}"`);
      }
    });

    // Offload ALL large parameter values to a temp file so the staged JSON stays small.
    // agy truncates tool output that is too large, which would break PENDING_USER_APPROVAL detection.
    const os = require('os');
    const payloadForApproval = { ...parsedParams };
    const hasLargeField = Object.values(parsedParams).some(v => typeof v === 'string' && v.length > LARGE_FIELD_THRESHOLD);
    if (hasLargeField) {
      const tmpContentFile = path.join(os.tmpdir(), `nebryss-staged-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.json`);
      fs.writeFileSync(tmpContentFile, JSON.stringify(parsedParams), 'utf8');
      // Strip all large values from inline payload; store only small key fields + file reference
      Object.keys(payloadForApproval).forEach(k => {
        const v = payloadForApproval[k];
        if (typeof v === 'string' && v.length > LARGE_FIELD_THRESHOLD) {
          delete payloadForApproval[k];
        }
      });
      payloadForApproval['_payloadFile'] = tmpContentFile;
    }

    const staged = {
      status: 'PENDING_USER_APPROVAL',
      requiresApproval: true,
      command,
      rawCommandLine: `node scripts/campaign-session-tool.js ${quotedArgs.join(' ')}`,
      summary,
      payload: payloadForApproval,
      message: `Operation recorded successfully: ${summary}.`
    };
    console.log(JSON.stringify(staged, null, 2));
    process.exit(0);
  }

  const p = parseCliArgs(args.slice(1));
  const cliCampaignId = p.campaignId ? (isNaN(Number(p.campaignId)) ? p.campaignId : Number(p.campaignId)) : getDefaultCampaignId();

  if (command === 'get-context') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    const ctx = await getCampaignContext(campaignId);
    console.log(JSON.stringify(ctx, null, 2));
  } else if (command === 'context-usage' || command === 'calculate-context' || command === 'usage') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    const usage = await calculateContextUsage(campaignId);
    console.log(JSON.stringify(usage, null, 2));
  } else if (command === 'list') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    let format = 'raw';
    if (args.includes('--clean') || p.clean) format = 'clean';
    else if (args.includes('--expand') || p.expand) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    console.log(JSON.stringify(sessions, null, 2));
  } else if (command === 'get-latest') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    let format = 'raw';
    if (args.includes('--clean') || p.clean) format = 'clean';
    else if (args.includes('--expand') || p.expand) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    const latest = (sessions || []).reduce((maxS, s) => {
      if (!maxS) return s;
      const sNum = Number(s.sessionId !== undefined && s.sessionId !== null ? s.sessionId : (s.id || 0));
      const maxNum = Number(maxS.sessionId !== undefined && maxS.sessionId !== null ? maxS.sessionId : (maxS.id || 0));
      return sNum > maxNum ? s : maxS;
    }, null);
    console.log(JSON.stringify(latest, null, 2));
  } else if (command === 'get-entity') {
    const entityParams = {
      campaignId: cliCampaignId,
      type: p.type || args[1],
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined
    };
    const query = args[2];
    if (query && !query.startsWith('--') && !entityParams.id && !entityParams.name) {
      if (/^\d+$/.test(query)) entityParams.id = Number(query);
      else entityParams.name = query;
    }
    const res = await getEntity(entityParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'list-entities' || command === 'read-entities') {
    const queryParams = {
      campaignId: cliCampaignId,
      type: p.type || args[1],
      filter: p.filter ? parseArgJson(p.filter) : undefined,
      search: p.search || undefined,
      limit: p.limit ? Number(p.limit) : undefined
    };
    const res = await readEntities(queryParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'delete-entity' || command.startsWith('delete-')) {
    const isPrefix = command.startsWith('delete-') && command !== 'delete-entity';
    const type = isPrefix ? command.substring('delete-'.length) : (p.type || args[1]);
    const rawId = isPrefix ? (args[1] && !args[1].startsWith('--') ? args[1] : p.id) : (args[2] && !args[2].startsWith('--') ? args[2] : p.id);
    const deleteParams = {
      campaignId: cliCampaignId,
      type,
      id: rawId !== undefined ? (isNaN(Number(rawId)) ? rawId : Number(rawId)) : undefined
    };
    const res = await deleteEntity(deleteParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'auto-tag') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    const context = await getCampaignContext(campaignId);
    let text = p.input || '';
    if (!text && args[1] && !args[1].startsWith('--') && args[2]) text = args[2];
    const tagged = autoTagEntities(text, context);
    console.log(tagged);
  } else if (command === 'clean-text') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : cliCampaignId;
    const context = await getCampaignContext(campaignId);
    let text = p.input || '';
    if (!text && args[1] && !args[1].startsWith('--') && args[2]) text = args[2];
    const clean = toCleanText(text, context);
    console.log(clean);
  } else if (command === 'list-weapons') {
    const query = args[1] || p.search || p.query || '';
    const results = await listWeapons(query);
    console.log(JSON.stringify(results, null, 2));
  } else if (command === 'calculate-pr') {
    const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();
    let weapons = p.weapons ? p.weapons.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [];
    let attributes = p.attributes ? parseArgJson(p.attributes) : { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['human'] };
    let abilities = p.abilities ? parseArgJson(p.abilities) : [];

    const validatedWeaponIds = validateWeaponsExist(weapons, allWeapons);
    const prRes = calculatePR({ attributes, weapons: validatedWeaponIds, abilities }, allWeapons, allRules);
    console.log(JSON.stringify(prRes, null, 2));
  } else if (command === 'create-npc') {
    const npcParams = {
      campaignId: cliCampaignId,
      name: p.name || '',
      factionId: p.factionId !== undefined ? Number(p.factionId) : undefined,
      faction: p.faction || undefined,
      subgroup: p.subgroup || '',
      role: p.role || '',
      mission: p.mission || '',
      methods: p.methods || '',
      personality: p.personality || '',
      location: p.location || '',
      bestiaryId: p.bestiaryId ? Number(p.bestiaryId) : undefined,
      reputation: p.reputation || '',
      backstory: p.backstory || '',
      description: p.description || '',
      fleetSize: p.fleetSize || '',
      flagship: p.flagship || '',
      tactics: p.tactics || '',
      motivations: p.motivations || '',
      wargear: p.wargear ? parseArgJson(p.wargear) : [],
      discovered: p.discovered === 'true' || p.discovered === true,
    };
    const res = await createNPC(npcParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-npc') {
    const npcParams = {
      campaignId: cliCampaignId,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      factionId: p.factionId !== undefined ? Number(p.factionId) : undefined,
      faction: p.faction || undefined,
      subgroup: p.subgroup || undefined,
      role: p.role || undefined,
      mission: p.mission || undefined,
      methods: p.methods || undefined,
      personality: p.personality || undefined,
      location: p.location || undefined,
      bestiaryId: p.bestiaryId ? Number(p.bestiaryId) : undefined,
      reputation: p.reputation || undefined,
      backstory: p.backstory || undefined,
      description: p.description || undefined,
      fleetSize: p.fleetSize || undefined,
      flagship: p.flagship || undefined,
      tactics: p.tactics || undefined,
      motivations: p.motivations || undefined,
      wargear: p.wargear ? parseArgJson(p.wargear) : undefined,
      discovered: p.discovered !== undefined ? (p.discovered === 'true' || p.discovered === true) : undefined,
    };
    const res = await updateNPC(npcParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-location') {
    const locParams = {
      campaignId: cliCampaignId,
      name: p.name || '',
      faction: p.faction || '',
      description: p.description || '',
      category: p.category || '',
      categorySize: p.categorySize ? Number(p.categorySize) : undefined,
      isCapital: p.isCapital === 'true' || p.isCapital === true,
      isWorldMap: p.isWorldMap === 'true' || p.isWorldMap === true,
      mapX: p.mapX ? Number(p.mapX) : undefined,
      mapY: p.mapY ? Number(p.mapY) : undefined,
      discovered: p.discovered === 'true' || p.discovered === true,
      isSecret: p.isSecret === 'true' || p.isSecret === true,
      isSecretRevealed: p.isSecretRevealed === 'true' || p.isSecretRevealed === true,
      secrets: p.secrets ? parseArgJson(p.secrets) : undefined,
      rpgMapLayout: p.rpgMapLayout || undefined,
      privateNotes: p.privateNotes || undefined,
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined,
      notableFeatures: p.notableFeatures ? parseArgJson(p.notableFeatures) : undefined,
      shops: p.shops ? parseArgJson(p.shops) : undefined
    };
    const res = await createLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-location') {
    const locParams = {
      campaignId: cliCampaignId,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      faction: p.faction || undefined,
      description: p.description || undefined,
      category: p.category || undefined,
      categorySize: p.categorySize ? Number(p.categorySize) : undefined,
      isCapital: p.isCapital !== undefined ? (p.isCapital === 'true' || p.isCapital === true) : undefined,
      isWorldMap: p.isWorldMap !== undefined ? (p.isWorldMap === 'true' || p.isWorldMap === true) : undefined,
      mapX: p.mapX ? Number(p.mapX) : undefined,
      mapY: p.mapY ? Number(p.mapY) : undefined,
      discovered: p.discovered !== undefined ? (p.discovered === 'true' || p.discovered === true) : undefined,
      isSecret: p.isSecret !== undefined ? (p.isSecret === 'true' || p.isSecret === true) : undefined,
      isSecretRevealed: p.isSecretRevealed !== undefined ? (p.isSecretRevealed === 'true' || p.isSecretRevealed === true) : undefined,
      secrets: p.secrets ? parseArgJson(p.secrets) : undefined,
      rpgMapLayout: p.rpgMapLayout || undefined,
      privateNotes: p.privateNotes || undefined,
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined,
      notableFeatures: p.notableFeatures ? parseArgJson(p.notableFeatures) : undefined,
      shops: p.shops ? parseArgJson(p.shops) : undefined
    };
    const res = await updateLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-shop') {
    const shopParams = {
      campaignId: cliCampaignId,
      name: p.name || '',
      owner: p.owner ? (isNaN(Number(p.owner)) ? p.owner : Number(p.owner)) : undefined,
      locationId: p.locationId ? Number(p.locationId) : undefined,
      locationName: p.locationName || undefined,
      location: p.location || '',
      description: p.description || '',
      discovered: p.discovered === 'true' || p.discovered === true,
      categories: p.categories ? parseArgJson(p.categories) : [],
      items: p.items ? parseArgJson(p.items) : [],
      customItems: p.customItems ? parseArgJson(p.customItems) : undefined,
      specialties: p.specialties ? parseArgJson(p.specialties) : undefined,
      paymentMethod: p.paymentMethod ? parseArgJson(p.paymentMethod) : { digital: true, physical: true },
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined
    };
    const res = await createShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-shop') {
    const shopParams = {
      campaignId: cliCampaignId,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      owner: p.owner ? (isNaN(Number(p.owner)) ? p.owner : Number(p.owner)) : undefined,
      locationId: p.locationId ? Number(p.locationId) : undefined,
      locationName: p.locationName || undefined,
      location: p.location || undefined,
      description: p.description || undefined,
      discovered: p.discovered !== undefined ? (p.discovered === 'true' || p.discovered === true) : undefined,
      categories: p.categories ? parseArgJson(p.categories) : undefined,
      items: p.items ? parseArgJson(p.items) : undefined,
      customItems: p.customItems ? parseArgJson(p.customItems) : undefined,
      specialties: p.specialties ? parseArgJson(p.specialties) : undefined,
      paymentMethod: p.paymentMethod ? parseArgJson(p.paymentMethod) : undefined,
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined
    };
    const res = await updateShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-bestiary') {
    const bParams = {
      campaignId: cliCampaignId,
      name: p.name || '',
      factionId: p.factionId !== undefined ? Number(p.factionId) : undefined,
      faction: p.faction || undefined,
      subgroup: p.subgroup || '',
      attributes: p.attributes ? parseArgJson(p.attributes) : { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['human'] },
      weapons: p.weapons !== undefined ? parseIdArray(p.weapons) : [],
      abilities: p.abilities ? parseArgJson(p.abilities) : [],
      deployables: p.deployables ? parseArgJson(p.deployables) : [],
      pr: p.pr ? Number(p.pr) : undefined,
      isDiscovered: p.isDiscovered === 'true' || p.isDiscovered === true
    };
    const res = await createBestiaryEntry(bParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-bestiary') {
    const bParams = {
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      factionId: p.factionId !== undefined ? Number(p.factionId) : undefined,
      faction: p.faction || undefined,
      subgroup: p.subgroup || undefined,
      attributes: p.attributes ? parseArgJson(p.attributes) : undefined,
      weapons: p.weapons !== undefined ? parseIdArray(p.weapons) : undefined,
      abilities: p.abilities ? parseArgJson(p.abilities) : undefined,
      deployables: p.deployables ? parseArgJson(p.deployables) : undefined,
      pr: p.pr ? Number(p.pr) : undefined,
      isDiscovered: p.isDiscovered !== undefined ? (p.isDiscovered === 'true' || p.isDiscovered === true) : undefined
    };
    const res = await updateBestiaryEntry(bParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-combat-npc') {
    const cParams = {
      campaignId: cliCampaignId,
      name: p.name || '',
      factionId: p.factionId !== undefined ? Number(p.factionId) : undefined,
      faction: p.faction || undefined,
      subgroup: p.subgroup || '',
      role: p.role || '',
      mission: p.mission || '',
      methods: p.methods || '',
      personality: p.personality || '',
      location: p.location || '',
      reputation: p.reputation || '',
      backstory: p.backstory || '',
      description: p.description || '',
      attributes: p.attributes ? parseArgJson(p.attributes) : undefined,
      weapons: p.weapons !== undefined ? parseIdArray(p.weapons) : [],
      abilities: p.abilities ? parseArgJson(p.abilities) : [],
      wargear: p.wargear ? parseArgJson(p.wargear) : [],
      isDiscovered: p.isDiscovered === 'true' || p.isDiscovered === true
    };
    const res = await createCombatNPC(cParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-player') {
    const pParams = {
      campaignId: cliCampaignId,
      name: p.name,
      race: p.race || undefined,
      origin: p.origin || undefined,
      attributes: p.attributes ? parseArgJson(p.attributes) : undefined,
      weapons: p.weapons !== undefined ? parseIdArray(p.weapons) : undefined,
      abilities: p.abilities ? parseArgJson(p.abilities) : undefined,
      items: p.items ? parseArgJson(p.items) : (p.inventory ? parseArgJson(p.inventory) : undefined),
      progression: p.progression ? parseArgJson(p.progression) : undefined,
      gold: p.gold !== undefined ? Number(p.gold) : undefined,
      digitalGold: p.digitalGold !== undefined ? Number(p.digitalGold) : undefined,
      talents: p.talents ? parseArgJson(p.talents) : undefined,
      afflictions: p.afflictions ? parseArgJson(p.afflictions) : undefined,
      talentPoints: p.talentPoints !== undefined ? Number(p.talentPoints) : undefined,
      notes: p.notes || undefined
    };
    const res = await createPlayer(pParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-player') {
    const pParams = {
      campaignId: cliCampaignId,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      race: p.race || undefined,
      origin: p.origin || undefined,
      attributes: p.attributes ? parseArgJson(p.attributes) : undefined,
      weapons: p.weapons !== undefined ? parseIdArray(p.weapons) : undefined,
      abilities: p.abilities ? parseArgJson(p.abilities) : undefined,
      gold: p.gold !== undefined ? Number(p.gold) : undefined,
      digitalGold: p.digitalGold !== undefined ? Number(p.digitalGold) : undefined,
      talentPoints: p.talentPoints !== undefined ? Number(p.talentPoints) : undefined,
      notes: p.notes || undefined,
      talents: p.talents ? parseArgJson(p.talents) : undefined,
      afflictions: p.afflictions ? parseArgJson(p.afflictions) : undefined,
      inventory: p.inventory ? parseArgJson(p.inventory) : (p.items ? parseArgJson(p.items) : undefined),
      progression: p.progression ? parseArgJson(p.progression) : undefined
    };
    const res = await updatePlayer(pParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-letter') {
    const lParams = {
      campaignId: cliCampaignId,
      subject: p.subject || p.title || '',
      senderId: p.senderId ? Number(p.senderId) : null,
      senderName: p.senderName || '',
      senderRole: p.senderRole || '',
      senderAvatarUrl: p.senderAvatarUrl || '',
      content: p.content || p.message || '',
      date: p.date || '',
      recipientIds: p.recipientIds !== undefined ? parseIdArray(p.recipientIds) : [],
      targetNames: p.targetNames ? parseArgJson(p.targetNames) : undefined,
      readBy: p.readBy ? parseArgJson(p.readBy) : [],
      isDeleted: p.isDeleted === 'true' || p.isDeleted === true
    };
    const res = await createLetter(lParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-letter') {
    const lParams = {
      campaignId: cliCampaignId,
      id: p.id ? Number(p.id) : undefined,
      subject: p.subject || p.title || undefined,
      senderId: p.senderId !== undefined ? (p.senderId === 'null' ? null : Number(p.senderId)) : undefined,
      senderName: p.senderName || undefined,
      senderRole: p.senderRole || undefined,
      senderAvatarUrl: p.senderAvatarUrl || undefined,
      content: p.content || p.message || undefined,
      date: p.date || undefined,
      recipientIds: p.recipientIds !== undefined ? parseIdArray(p.recipientIds) : undefined,
      targetNames: p.targetNames ? parseArgJson(p.targetNames) : undefined,
      readBy: p.readBy ? parseArgJson(p.readBy) : undefined,
      isDeleted: p.isDeleted !== undefined ? (p.isDeleted === 'true' || p.isDeleted === true) : undefined
    };
    const res = await updateLetter(lParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-item') {
    const itemParams = {
      name: p.name || '',
      type: p.type || '',
      price: p.price !== undefined ? Number(p.price) : 0,
      description: p.description || '',
      raceReq: p.raceReq || undefined,
      isEquippable: p.isEquippable !== undefined ? (p.isEquippable === 'true' || p.isEquippable === true) : undefined,
      statModifications: p.statModifications ? parseArgJson(p.statModifications) : undefined,
      quantity: p.quantity ? Number(p.quantity) : undefined,
      subtype: p.subtype || undefined,
      optimalConditions: p.optimalConditions || undefined,
      maxSpeed: p.maxSpeed || undefined,
      maxWeight: p.maxWeight ? Number(p.maxWeight) : undefined,
      weight: p.weight ? Number(p.weight) : undefined,
      shipWounds: p.shipWounds ? Number(p.shipWounds) : undefined,
      defense: p.defense ? Number(p.defense) : undefined,
      maxCargo: p.maxCargo ? Number(p.maxCargo) : undefined,
      ammoType: p.ammoType || undefined,
      damage: p.damage || undefined,
      part: p.part || undefined,
      attachedTo: p.attachedTo ? Number(p.attachedTo) : undefined,
      bestiaryId: p.bestiaryId ? Number(p.bestiaryId) : undefined,
      blueprintFor: p.blueprintFor ? Number(p.blueprintFor) : undefined,
      buildMaterials: p.buildMaterials ? parseArgJson(p.buildMaterials) : undefined,
      effects: p.effects ? parseArgJson(p.effects) : undefined
    };
    const res = await createItem(itemParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-item') {
    const itemParams = {
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      type: p.type || undefined,
      price: p.price !== undefined ? Number(p.price) : undefined,
      description: p.description || undefined,
      raceReq: p.raceReq || undefined,
      isEquippable: p.isEquippable !== undefined ? (p.isEquippable === 'true' || p.isEquippable === true) : undefined,
      statModifications: p.statModifications ? parseArgJson(p.statModifications) : undefined,
      quantity: p.quantity ? Number(p.quantity) : undefined,
      subtype: p.subtype || undefined,
      optimalConditions: p.optimalConditions || undefined,
      maxSpeed: p.maxSpeed || undefined,
      maxWeight: p.maxWeight ? Number(p.maxWeight) : undefined,
      weight: p.weight ? Number(p.weight) : undefined,
      shipWounds: p.shipWounds ? Number(p.shipWounds) : undefined,
      defense: p.defense ? Number(p.defense) : undefined,
      maxCargo: p.maxCargo ? Number(p.maxCargo) : undefined,
      ammoType: p.ammoType || undefined,
      damage: p.damage || undefined,
      part: p.part || undefined,
      attachedTo: p.attachedTo ? Number(p.attachedTo) : undefined,
      bestiaryId: p.bestiaryId ? Number(p.bestiaryId) : undefined,
      blueprintFor: p.blueprintFor ? Number(p.blueprintFor) : undefined,
      buildMaterials: p.buildMaterials ? parseArgJson(p.buildMaterials) : undefined,
      effects: p.effects ? parseArgJson(p.effects) : undefined
    };
    const res = await updateItem(itemParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-weapon') {
    const weaponParams = {
      name: p.name || '',
      price: p.price !== undefined ? Number(p.price) : 0,
      profiles: p.profiles ? parseArgJson(p.profiles) : []
    };
    const res = await createWeapon(weaponParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-weapon') {
    const weaponParams = {
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      price: p.price !== undefined ? Number(p.price) : undefined,
      profiles: p.profiles ? parseArgJson(p.profiles) : undefined
    };
    const res = await updateWeapon(weaponParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-weapon-rule') {
    const ruleParams = {
      name: p.name || '',
      effect: p.effect || '',
      prModifier: p.prModifier !== undefined ? (p.prModifier === 'null' ? null : Number(p.prModifier)) : null
    };
    const res = await createWeaponRule(ruleParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-weapon-rule') {
    const ruleParams = {
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      effect: p.effect || undefined,
      prModifier: p.prModifier !== undefined ? (p.prModifier === 'null' ? null : Number(p.prModifier)) : undefined
    };
    const res = await updateWeaponRule(ruleParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-altered-state') {
    const stateParams = {
      name: p.name || '',
      effect: p.effect || ''
    };
    const res = await createAlteredState(stateParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-altered-state') {
    const stateParams = {
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      effect: p.effect || undefined
    };
    const res = await updateAlteredState(stateParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-affliction') {
    const affParams = {
      name: p.name || '',
      effect: p.effect || '',
      treatment: p.treatment || '',
      toHeal: p.toHeal ? Number(p.toHeal) : 1,
      progress: p.progress ? Number(p.progress) : 0,
      statModifications: p.statModifications ? parseArgJson(p.statModifications) : {}
    };
    const res = await createAffliction(affParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-affliction') {
    const affParams = {
      id: p.id ? p.id : undefined,
      name: p.name || undefined,
      effect: p.effect || undefined,
      treatment: p.treatment || undefined,
      toHeal: p.toHeal ? Number(p.toHeal) : undefined,
      progress: p.progress ? Number(p.progress) : undefined,
      statModifications: p.statModifications ? parseArgJson(p.statModifications) : undefined
    };
    const res = await updateAffliction(affParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'save' || command === 'update-session') {
    const campaignId = cliCampaignId;
    let sessionId = p.sessionId ? Number(p.sessionId) : (p.id ? Number(p.id) : undefined);
    if (!sessionId) {
      const context = await getCampaignContext(campaignId);
      const maxSessionId = (context.sessions || []).reduce((max, s) => {
        const n = Number(s.sessionId !== undefined && s.sessionId !== null ? s.sessionId : s.id);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      sessionId = maxSessionId + 1;
    }
    const content = p.content !== undefined ? p.content : undefined;
    const conclussion = p.conclussion !== undefined ? p.conclussion : (p.conclusion !== undefined ? p.conclusion : undefined);
    const rawBranches = p.playerVisibleBranches || p.branches;
    const playerVisibleBranches = Array.isArray(rawBranches)
      ? rawBranches
      : (typeof rawBranches === 'string' ? rawBranches.split(',').map(s => s.trim()).filter(Boolean) : undefined);
    const autoTag = p['no-auto-tag'] ? false : true;

    const res = await saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches, autoTag });
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'finalize') {
    const campaignId = cliCampaignId;
    let sessionId = p.sessionId ? Number(p.sessionId) : undefined;
    if (!sessionId) {
      const context = await getCampaignContext(campaignId);
      const maxSessionId = (context.sessions || []).reduce((max, s) => {
        const n = Number(s.sessionId !== undefined && s.sessionId !== null ? s.sessionId : s.id);
        return !isNaN(n) && n > max ? n : max;
      }, 0);
      sessionId = maxSessionId > 0 ? maxSessionId : 1;
    }
    const conclussion = p.conclussion || '';
    const rawBranches = p.playerVisibleBranches || p.branches;
    const playerVisibleBranches = Array.isArray(rawBranches)
      ? rawBranches
      : (typeof rawBranches === 'string' ? rawBranches.split(',').map(s => s.trim()).filter(Boolean) : undefined);
    const autoTag = p['no-auto-tag'] ? false : true;

    const res = await finalizeSession({ campaignId, sessionId, conclussion, playerVisibleBranches, autoTag });
    console.log(JSON.stringify(res, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error in campaign-session-tool:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  apiRequest,
  resolveCampaign,
  getCampaignContext,
  calculateContextUsage,
  listSessions,
  saveSession,
  finalizeSession,
  parseEntities,
  normalizeToIdTags,
  expandToDisplayTags,
  toCleanText,
  autoTagEntities,
  ENTITY_REGEX,
  listWeapons,
  calculatePR,
  validateWeaponsExist,
  getAllWeaponsAndRules,
  createNPC,
  createPlayer,
  updatePlayer,
  updateNPC,
  createBestiaryEntry,
  updateBestiaryEntry,
  createCombatNPC,
  createLocation,
  updateLocation,
  createShop,
  updateShop,
  createLetter,
  updateLetter,
  createItem,
  updateItem,
  createWeapon,
  updateWeapon,
  createWeaponRule,
  updateWeaponRule,
  createAlteredState,
  updateAlteredState,
  createAffliction,
  updateAffliction,
  getEntity,
  readEntities,
  deleteEntity,
  main
};

