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
    } catch (e) {}
  }
}

// Import auth module token signing if available
let signSessionTokenFn = null;
try {
  const auth = require('../api/auth');
  if (auth && typeof auth.signSessionToken === 'function') {
    signSessionTokenFn = auth.signSessionToken;
  }
} catch (e) {}

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

async function apiRequest(endpoint, method = 'GET', body = null, campaign = null) {
  const base = (process.env.API_URL || process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api`).replace(/\/$/, '');
  const url = `${base}/${endpoint.replace(/^\//, '')}`;
  const token = generateToolAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (process.env.ADMIN_PIN) {
    headers['x-admin-pin'] = process.env.ADMIN_PIN;
  }
  if (campaign) {
    headers['x-campaign'] = typeof campaign === 'string' ? campaign : JSON.stringify(campaign);
  }

  const options = {
    method,
    headers,
  };
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify({
      payload: body,
      campaign: campaign || undefined
    });
  }

  const res = await fetch(url, options);
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
      } catch (e2) {}
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

async function resolveCampaign(campaignId = 1) {
  const campaigns = await apiRequest('/campaign', 'GET');
  if (!campaigns || !campaigns.length) {
    throw new Error('No campaigns found in API. Please configure campaigns first.');
  }
  const search = String(campaignId !== undefined && campaignId !== null ? campaignId : 1).trim().toLowerCase();
  const campaign = campaigns.find(c =>
    String(c.id) === search ||
    String(c.name || '').toLowerCase() === search ||
    String(c.prefix || '').toLowerCase() === search
  );
  if (!campaign) {
    const list = campaigns.map(c => `ID ${c.id}: "${c.name}" (prefix: "${c.prefix}")`).join(', ');
    throw new Error(`Campaign '${campaignId}' not found in API. Existing campaigns: [${list}]. Please indicate the correct campaign.`);
  }
  const prefix = String(campaign.prefix || campaign.name || '').trim();
  if (!prefix) {
    throw new Error(`Campaign '${campaign.name || campaignId}' has no prefix configured in API.`);
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

async function getCampaignContext(campaignId = 1) {
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
    apiRequest('/player', 'GET', null, campaign),
    apiRequest('/npc', 'GET', null, campaign),
    apiRequest('/location', 'GET', null, campaign),
    apiRequest('/shop', 'GET', null, campaign),
    apiRequest('/letter', 'GET', null, campaign),
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
    campaigns: campaigns || [],
    sessions: campaignSessions,
    players: (players || []).map(p => ({ id: p.id, name: p.name, race: p.race, origin: p.origin })),
    npcs: (npcs || []).map(n => ({ id: n.id, name: n.name, faction: n.faction, role: n.role, location: n.location, bestiaryId: n.bestiaryId })),
    locations: (locations || []).map(l => ({ id: l.id, name: l.name, faction: l.faction, isCapital: l.isCapital })),
    shops: (shops || []).map(s => ({ id: s.id, name: s.name, locationName: s.locationName || s.location, owner: s.owner })),
    bestiary: (bestiary || []).map(b => ({ id: b.id, name: b.name, faction: b.faction, pr: b.pr, weapons: b.weapons })),
    weapons: (weapons || []).map(w => ({ id: w.id, name: w.name, price: w.price, profiles: w.profiles })),
    weaponRules: (weaponRules || []).map(r => ({ id: r.id, name: r.name, effect: r.effect, prModifier: r.prModifier })),
    letters: (letters || []).filter(l => !l.isDeleted).map(l => ({ id: l.id, subject: l.subject, title: l.subject, senderName: l.senderName, date: l.date })),
    items: (items || []).map(i => ({ id: i.id, name: i.name, price: i.price, type: i.type })),
    alteredStates: (alteredStates || []).map(s => ({ id: s.id, name: s.name, effect: s.effect })),
    afflictions: (afflictions || []).map(a => ({ id: a.id, name: a.name, treatment: a.treatment, effect: a.effect }))
  };

  return context;
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
  const processedContent = autoTag ? autoTagEntities(content || '', context) : normalizeToIdTags(content || '', context);
  const processedConclussion = autoTag ? autoTagEntities(conclussion || '', context) : normalizeToIdTags(conclussion || '', context);

  const branchesArray = Array.isArray(playerVisibleBranches)
    ? playerVisibleBranches
    : (typeof playerVisibleBranches === 'string'
      ? playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean)
      : []);

  const allSessions = await apiRequest('/campaignSession', 'GET');
  const existing = (allSessions || []).find(s =>
    (Number(s.campaignId) === Number(campaignId) || String(s.campaignId) === String(campaignId)) &&
    (Number(s.sessionId) === Number(sessionId) || String(s.sessionId) === String(sessionId))
  );

  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: processedContent,
    conclussion: processedConclussion,
    playerVisibleBranches: branchesArray
  };

  let saved = null;
  if (existing) {
    sessionDoc.id = existing.id || Number(sessionId);
    saved = await apiRequest('/campaignSession', 'PUT', sessionDoc);
  } else {
    const maxId = (allSessions || []).reduce((m, s) => (s.id && typeof s.id === 'number' && s.id > m ? s.id : m), 0);
    sessionDoc.id = maxId + 1;
    saved = await apiRequest('/campaignSession', 'POST', sessionDoc);
  }

  return {
    ...sessionDoc,
    ...saved,
    cleanContent: toCleanText(processedContent, context),
    cleanConclussion: toCleanText(processedConclussion, context),
    displayContent: expandToDisplayTags(processedContent, context)
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
  const { campaignId = 1, ...fields } = npcData;
  const { campaign } = await resolveCampaign(campaignId);
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
  const created = await apiRequest('/npc', 'POST', fields, campaign);
  return {
    ...created,
    entityTag: `@npc[${created.id}]`,
    displayTag: `@npc[${created.id}: ${created.name}]`
  };
}

async function updateNPC(npcUpdateData) {
  const { id, campaignId = 1, ...updates } = npcUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateNPC requires an "id" property to identify the NPC.');
  }
  const { campaign } = await resolveCampaign(campaignId);
  const existing = await apiRequest(`/npc/${id}`, 'GET', null, campaign);
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
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  delete updatedDoc.faction;
  const updated = await apiRequest('/npc', 'PUT', updatedDoc, campaign);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@npc[${updatedDoc.id}]`,
    displayTag: `@npc[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function updatePlayer(playerUpdateData) {
  const { id, campaignId = 1, ...updates } = playerUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updatePlayer requires an "id" property to identify the player.');
  }
  const { campaign } = await resolveCampaign(campaignId);
  const existing = await apiRequest(`/player/${id}`, 'GET', null, campaign);
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/player', 'PUT', updatedDoc, campaign);
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

  if (!name || !faction) {
    throw new Error('Bestiary entry requires at least "name" and "faction".');
  }

  const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();
  const validatedWeaponIds = validateWeaponsExist(weapons || [], allWeapons);

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
    faction: faction.trim(),
    subgroup: subgroup ? subgroup.trim() : faction.trim(),
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
  const { id, ...updates } = bestiaryUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateBestiaryEntry requires an "id" property to identify the creature.');
  }

  const numericId = Number(id) || id;
  const targetBestiary = await apiRequest(`/bestiary/${id}`, 'GET');
  const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();

  let finalWeapons = targetBestiary.weapons || [];
  if (Array.isArray(updates.weapons)) {
    finalWeapons = validateWeaponsExist(updates.weapons, allWeapons);
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
    pr: finalPR,
    attributes: finalAttributes,
    weapons: finalWeapons,
    abilities: finalAbilities,
  };
  delete updatedDoc._id;

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
    campaignId = 1,
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
  const { campaignId = 1, ...fields } = locationData;
  const { campaign } = await resolveCampaign(campaignId);
  if (!fields.name || !fields.faction) {
    throw new Error('Location requires at least "name" and "faction".');
  }
  const created = await apiRequest('/location', 'POST', fields, campaign);
  return {
    ...created,
    entityTag: `@location[${created.id}]`,
    displayTag: `@location[${created.id}: ${created.name}]`
  };
}

async function updateLocation(locationUpdateData) {
  const { id, campaignId = 1, ...updates } = locationUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLocation requires an "id" property to identify the location.');
  }
  const { campaign } = await resolveCampaign(campaignId);
  const existing = await apiRequest(`/location/${id}`, 'GET', null, campaign);
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/location', 'PUT', updatedDoc, campaign);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@location[${updatedDoc.id}]`,
    displayTag: `@location[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createShop(shopData) {
  const { campaignId = 1, ...fields } = shopData;
  const { campaign } = await resolveCampaign(campaignId);
  if (!fields.name) {
    throw new Error('Shop requires at least a "name".');
  }
  const created = await apiRequest('/shop', 'POST', fields, campaign);
  return {
    ...created,
    entityTag: `@shop[${created.id}]`,
    displayTag: `@shop[${created.id}: ${created.name}]`
  };
}

async function updateShop(shopUpdateData) {
  const { id, campaignId = 1, ...updates } = shopUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateShop requires an "id" property to identify the shop.');
  }
  const { campaign } = await resolveCampaign(campaignId);
  const existing = await apiRequest(`/shop/${id}`, 'GET', null, campaign);
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/shop', 'PUT', updatedDoc, campaign);
  return {
    ...updatedDoc,
    ...updated,
    entityTag: `@shop[${updatedDoc.id}]`,
    displayTag: `@shop[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function createLetter(letterData) {
  const { campaignId = 1, ...fields } = letterData;
  const { campaign } = await resolveCampaign(campaignId);
  if (!fields.subject && !fields.title) {
    throw new Error('Letter requires at least "subject" or "title".');
  }
  const created = await apiRequest('/letter', 'POST', {
    ...fields,
    subject: fields.subject || fields.title
  }, campaign);
  return {
    ...created,
    entityTag: `@letter[${created.id}]`,
    displayTag: `@letter[${created.id}: ${created.subject || created.title}]`
  };
}

async function updateLetter(letterUpdateData) {
  const { id, campaignId = 1, ...updates } = letterUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLetter requires an "id" property to identify the letter.');
  }
  const { campaign } = await resolveCampaign(campaignId);
  const existing = await apiRequest(`/letter/${id}`, 'GET', null, campaign);
  const updatedDoc = {
    ...existing,
    ...updates,
    id: Number(id) || id
  };
  delete updatedDoc._id;
  const updated = await apiRequest('/letter', 'PUT', updatedDoc, campaign);
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

async function getEntity({ type, id, name, campaignId = 1 }) {
  if (!type) throw new Error('getEntity requires a "type" property.');
  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let campaign = null;
  if (isScoped) {
    const res = await resolveCampaign(campaignId);
    campaign = res.campaign;
  }

  if (id !== undefined && id !== null) {
    try {
      const doc = await apiRequest(`/${endpoint}/${id}`, 'GET', null, campaign);
      if (doc) return doc;
    } catch (e) {}
  }

  // Fetch full list and search by id/name
  const list = await apiRequest(`/${endpoint}`, 'GET', null, campaign);
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

async function readEntities({ type, campaignId = 1, filter = null, search = '', limit = 0 }) {
  if (!type) throw new Error('readEntities requires a "type" property.');
  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let campaign = null;
  if (isScoped) {
    const res = await resolveCampaign(campaignId);
    campaign = res.campaign;
  }

  let list = await apiRequest(`/${endpoint}`, 'GET', null, campaign);
  if (!Array.isArray(list)) return [];

  if (normalizedType === 'session') {
    list = list.filter(s =>
      String(s.campaignId) === String(campaignId) ||
      Number(s.campaignId) === Number(campaignId)
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

async function deleteEntity({ type, id, campaignId = 1 }) {
  if (!type) throw new Error('deleteEntity requires a "type" property.');
  if (id === undefined || id === null) throw new Error('deleteEntity requires an "id" property.');

  const normalizedType = normalizeEntityType(type);
  const endpoint = getApiEndpointForType(normalizedType);
  const isScoped = CAMPAIGN_SCOPED_TYPES.has(normalizedType);

  let campaign = null;
  if (isScoped) {
    const res = await resolveCampaign(campaignId);
    campaign = res.campaign;
  }

  const res = await apiRequest(`/${endpoint}/${id}`, 'DELETE', null, campaign);
  return {
    success: true,
    type: normalizedType,
    id,
    campaignId: Number(campaignId) || campaignId,
    apiResponse: res,
    message: `Successfully deleted ${normalizedType} with ID ${id} via API`
  };
}

function parseArgJson(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      return Function(`"use strict"; return (${str});`)();
    } catch (e2) {
      return null;
    }
  }
}

const MUTATION_COMMANDS = new Set([
  'save', 'finalize', 'delete-entity',
  'create-npc', 'update-npc',
  'create-location', 'update-location',
  'create-shop', 'update-shop',
  'create-bestiary', 'update-bestiary', 'create-combat-npc',
  'update-player',
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
  const campaign = params.campaignId ? ` [Campaign ${params.campaignId}]` : '';

  if (c === 'save') {
    return `Save Session #${params.sessionId || '?'}${campaign}`;
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
      params[currentKey] = fullVal;
      currentKey = null;
      currentValParts = [];
    }
  }

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      flush();
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        currentKey = arg.slice(2, eqIdx);
        currentValParts.push(arg.slice(eqIdx + 1));
      } else {
        currentKey = arg.slice(2);
      }
    } else if (currentKey) {
      currentValParts.push(arg);
    }
  }
  flush();
  return params;
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    console.log(`
Nebryss Campaign Session Tool v4.0 (API Operations)
Usage:
  node scripts/campaign-session-tool.js get-context [campaignId]
  node scripts/campaign-session-tool.js list [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-latest [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-entity <type> [id or name] [--campaignId=1]
  node scripts/campaign-session-tool.js list-entities <type> [--campaignId=1] [--filter='...'] [--search="..."] [--limit=N]
  node scripts/campaign-session-tool.js delete-entity <type> <id> [--campaignId=1]
  node scripts/campaign-session-tool.js auto-tag [campaignId] [--input="..."]
  node scripts/campaign-session-tool.js clean-text [campaignId] [--input="..."]
  node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 [--content="..."] [--conclussion="..."] [--branches="..."]
  node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 [--conclussion="..."] [--branches="..."]

Entity Management (via API):
  - NPC:            create-npc, update-npc
  - Location:       create-location, update-location
  - Shop:           create-shop, update-shop
  - Bestiary:       create-bestiary, update-bestiary, create-combat-npc
  - Player:         update-player
  - Letter:         create-letter, update-letter
  - Item:           create-item, update-item
  - Weapon:         create-weapon, update-weapon, list-weapons, calculate-pr
  - Weapon Rule:    create-weapon-rule, update-weapon-rule
  - Altered State:  create-altered-state, update-altered-state
  - Affliction:     create-affliction, update-affliction
    `);
    process.exit(0);
  }

  // Intercept mutation commands without explicit user UI approval or direct interactive TTY
  const isUiApproved = process.env.NEBRYSS_UI_APPROVED === 'true' || process.env.NEBRYSS_MUTATION_APPROVED === '1';
  const isInteractiveHumanTty = Boolean(process.stdin.isTTY && process.stdout.isTTY && (args.includes('--approved') || args.includes('--force')));
  const isApproved = isUiApproved || isInteractiveHumanTty;

  if (isMutationCommand(command) && !isApproved) {
    const cleanArgs = args.filter(a => a !== '--approved' && a !== '--force');
    const parsedParams = parseCliArgs(cleanArgs.slice(1));
    const summary = generateMutationSummary(command, parsedParams);

    // Build accurately escaped and quoted raw command line
    const quotedArgs = [command];
    Object.keys(parsedParams).forEach(k => {
      const v = parsedParams[k];
      if (v === true || v === '') {
        quotedArgs.push(`--${k}`);
      } else {
        const escaped = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        quotedArgs.push(`--${k}="${escaped}"`);
      }
    });

    const staged = {
      status: 'PENDING_USER_APPROVAL',
      requiresApproval: true,
      command,
      rawCommandLine: `node NebryssCompanion/scripts/campaign-session-tool.js ${quotedArgs.join(' ')}`,
      summary,
      payload: parsedParams,
      message: `Mutation command '${command}' is staged pending interactive user review and approval in the companion UI.`
    };
    console.log(JSON.stringify(staged, null, 2));
    process.exit(0);
  }

  const p = parseCliArgs(args.slice(1));

  if (command === 'get-context') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : (p.campaignId || 1);
    const ctx = await getCampaignContext(campaignId);
    console.log(JSON.stringify(ctx, null, 2));
  } else if (command === 'list') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : (p.campaignId || null);
    let format = 'raw';
    if (args.includes('--clean') || p.clean) format = 'clean';
    else if (args.includes('--expand') || p.expand) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    console.log(JSON.stringify(sessions, null, 2));
  } else if (command === 'get-latest') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : (p.campaignId || 1);
    let format = 'raw';
    if (args.includes('--clean') || p.clean) format = 'clean';
    else if (args.includes('--expand') || p.expand) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    const latest = sessions.length ? sessions[sessions.length - 1] : null;
    console.log(JSON.stringify(latest, null, 2));
  } else if (command === 'get-entity') {
    const entityParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
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
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
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
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      type,
      id: rawId !== undefined ? (isNaN(Number(rawId)) ? rawId : Number(rawId)) : undefined
    };
    const res = await deleteEntity(deleteParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'auto-tag') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : (p.campaignId || 1);
    const context = await getCampaignContext(campaignId);
    let text = p.input || '';
    if (!text && args[1] && !args[1].startsWith('--') && args[2]) text = args[2];
    const tagged = autoTagEntities(text, context);
    console.log(tagged);
  } else if (command === 'clean-text') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : (p.campaignId || 1);
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
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
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
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
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
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      name: p.name || '',
      faction: p.faction || '',
      description: p.description || '',
      isCapital: p.isCapital === 'true' || p.isCapital === true,
      discovered: p.discovered === 'true' || p.discovered === true,
      category: p.category || '',
      mapX: p.mapX ? Number(p.mapX) : undefined,
      mapY: p.mapY ? Number(p.mapY) : undefined,
      secrets: p.secrets ? parseArgJson(p.secrets) : undefined,
      rpgMapLayout: p.rpgMapLayout || undefined,
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined
    };
    const res = await createLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-location') {
    const locParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      faction: p.faction || undefined,
      description: p.description || undefined,
      isCapital: p.isCapital !== undefined ? (p.isCapital === 'true' || p.isCapital === true) : undefined,
      discovered: p.discovered !== undefined ? (p.discovered === 'true' || p.discovered === true) : undefined,
      category: p.category || undefined,
      mapX: p.mapX ? Number(p.mapX) : undefined,
      mapY: p.mapY ? Number(p.mapY) : undefined,
      secrets: p.secrets ? parseArgJson(p.secrets) : undefined,
      rpgMapLayout: p.rpgMapLayout || undefined,
      imgUrl: p.imgUrl || undefined,
      thumbnail: p.thumbnail || undefined
    };
    const res = await updateLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-shop') {
    const shopParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      name: p.name || '',
      location: p.location || '',
      owner: p.owner || '',
      items: p.items ? parseArgJson(p.items) : [],
      customItems: p.customItems ? parseArgJson(p.customItems) : [],
      specialties: p.specialties ? parseArgJson(p.specialties) : []
    };
    const res = await createShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-shop') {
    const shopParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      location: p.location || undefined,
      owner: p.owner || undefined,
      items: p.items ? parseArgJson(p.items) : undefined,
      customItems: p.customItems ? parseArgJson(p.customItems) : undefined,
      specialties: p.specialties ? parseArgJson(p.specialties) : undefined
    };
    const res = await updateShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-bestiary') {
    const bParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      name: p.name || '',
      faction: p.faction || '',
      subgroup: p.subgroup || '',
      attributes: p.attributes ? parseArgJson(p.attributes) : { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['human'] },
      weapons: p.weapons ? p.weapons.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [],
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
      faction: p.faction || undefined,
      subgroup: p.subgroup || undefined,
      attributes: p.attributes ? parseArgJson(p.attributes) : undefined,
      weapons: p.weapons ? p.weapons.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : undefined,
      abilities: p.abilities ? parseArgJson(p.abilities) : undefined,
      deployables: p.deployables ? parseArgJson(p.deployables) : undefined,
      pr: p.pr ? Number(p.pr) : undefined,
      isDiscovered: p.isDiscovered !== undefined ? (p.isDiscovered === 'true' || p.isDiscovered === true) : undefined
    };
    const res = await updateBestiaryEntry(bParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-combat-npc') {
    const cParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
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
      weapons: p.weapons ? p.weapons.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [],
      abilities: p.abilities ? parseArgJson(p.abilities) : [],
      wargear: p.wargear ? parseArgJson(p.wargear) : [],
      isDiscovered: p.isDiscovered === 'true' || p.isDiscovered === true
    };
    const res = await createCombatNPC(cParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-player') {
    const pParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      id: p.id ? Number(p.id) : undefined,
      name: p.name || undefined,
      race: p.race || undefined,
      origin: p.origin || undefined,
      gold: p.gold !== undefined ? Number(p.gold) : undefined,
      notes: p.notes || undefined,
      talents: p.talents ? parseArgJson(p.talents) : undefined,
      afflictions: p.afflictions ? parseArgJson(p.afflictions) : undefined,
      inventory: p.inventory ? parseArgJson(p.inventory) : undefined
    };
    const res = await updatePlayer(pParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-letter') {
    const lParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      subject: p.subject || p.title || '',
      content: p.content || '',
      senderName: p.senderName || '',
      senderRole: p.senderRole || '',
      senderAvatarUrl: p.senderAvatarUrl || '',
      recipientIds: p.recipientIds ? p.recipientIds.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : [],
      date: p.date || ''
    };
    const res = await createLetter(lParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-letter') {
    const lParams = {
      campaignId: p.campaignId ? Number(p.campaignId) : 1,
      id: p.id ? Number(p.id) : undefined,
      subject: p.subject || p.title || undefined,
      content: p.content || undefined,
      senderName: p.senderName || undefined,
      senderRole: p.senderRole || undefined,
      senderAvatarUrl: p.senderAvatarUrl || undefined,
      recipientIds: p.recipientIds ? p.recipientIds.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : undefined,
      date: p.date || undefined
    };
    const res = await updateLetter(lParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-item') {
    const itemParams = {
      name: p.name || '',
      type: p.type || '',
      price: p.price !== undefined ? Number(p.price) : 0,
      description: p.description || '',
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
  } else if (command === 'save') {
    const campaignId = p.campaignId ? Number(p.campaignId) : 1;
    const sessionId = p.sessionId ? Number(p.sessionId) : 1;
    const content = p.content || '';
    const conclussion = p.conclussion || '';
    const playerVisibleBranches = p.playerVisibleBranches ? p.playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean) : (p.branches ? p.branches.split(',').map(s => s.trim()).filter(Boolean) : []);
    const autoTag = p['no-auto-tag'] ? false : true;

    const res = await saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches, autoTag });
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'finalize') {
    const campaignId = p.campaignId ? Number(p.campaignId) : 1;
    const sessionId = p.sessionId ? Number(p.sessionId) : 1;
    const conclussion = p.conclussion || '';
    const playerVisibleBranches = p.playerVisibleBranches ? p.playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean) : (p.branches ? p.branches.split(',').map(s => s.trim()).filter(Boolean) : undefined);
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
