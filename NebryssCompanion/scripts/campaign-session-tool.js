const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Helper to find existing files across potential roots
function findFirstExistingPath(relativePaths) {
  for (const rel of relativePaths) {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(__dirname, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

// Search and load environment variables (.env or .env.duckdns)
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

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NebryssCompanion';
const mainDbName = process.env.MONGODB_DB_MAIN || 'Nebryss-assets';
const playersDbName = process.env.MONGODB_DB_PLAYERS || 'NebryssCampaignAssets';

const localDbDir = findFirstExistingPath(['../local-db', './NebryssCompanion/local-db', './local-db']) || path.join(__dirname, '../local-db');
const assetsDir = findFirstExistingPath(['../src/assets', './NebryssCompanion/src/assets', './src/assets']) || path.join(__dirname, '../src/assets');

async function getClient() {
  try {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500, tlsAllowInvalidCertificates: true });
    await client.connect();
    return client;
  } catch (err) {
    return null;
  }
}

// Read-only fallback helper for reading contexts when MongoDB is offline
function readJsonFallback(filename) {
  const localPath = path.join(localDbDir, filename);
  const assetPath = path.join(assetsDir, filename);
  if (fs.existsSync(localPath)) {
    try { return JSON.parse(fs.readFileSync(localPath, 'utf8')); } catch (e) {}
  }
  if (fs.existsSync(assetPath)) {
    try { return JSON.parse(fs.readFileSync(assetPath, 'utf8')); } catch (e) {}
  }
  return [];
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
  const client = await getClient();
  let weapons = [];
  let weaponRules = [];
  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      weapons = await mainDb.collection('weapon').find().toArray();
      if (!weapons.length) weapons = await mainDb.collection('weapons').find().toArray();
      weaponRules = await mainDb.collection('weaponRule').find().toArray();
      if (!weaponRules.length) weaponRules = await mainDb.collection('weaponRules').find().toArray();
    } finally {
      await client.close();
    }
  }
  if (!weapons.length) weapons = readJsonFallback('weapons.json');
  if (!weaponRules.length) weaponRules = readJsonFallback('weaponRules.json');
  return { weapons, weaponRules };
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
  const client = await getClient();
  let campaigns = [];
  let sessions = [];
  let players = [];
  let npcs = [];
  let locations = [];
  let shops = [];
  let bestiary = [];
  let weapons = [];
  let weaponRules = [];
  let letters = [];
  let items = [];
  let alteredStates = [];
  let afflictions = [];

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);

      campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';
      const resolvedCampaignId = campaign ? campaign.id : Number(campaignId);

      sessions = await mainDb.collection('campaignSession').find({
        $or: [{ campaignId: Number(resolvedCampaignId) }, { campaignId: String(resolvedCampaignId) }]
      }).sort({ sessionId: 1 }).toArray();

      players = await playersDb.collection(`${prefix}-player`).find().toArray();
      if (!players.length) players = await playersDb.collection('player').find().toArray();

      npcs = await playersDb.collection(`${prefix}-npc`).find().toArray();
      if (!npcs.length) npcs = await playersDb.collection('npc').find().toArray();

      locations = await playersDb.collection(`${prefix}-location`).find().toArray();
      if (!locations.length) locations = await playersDb.collection('location').find().toArray();
      if (!locations.length) locations = await mainDb.collection('location').find().toArray();

      shops = await playersDb.collection(`${prefix}-shop`).find().toArray();
      if (!shops.length) shops = await playersDb.collection('shop').find().toArray();

      bestiary = await mainDb.collection('bestiary').find().toArray();

      weapons = await mainDb.collection('weapon').find().toArray();
      if (!weapons.length) weapons = await mainDb.collection('weapons').find().toArray();

      weaponRules = await mainDb.collection('weaponRule').find().toArray();
      if (!weaponRules.length) weaponRules = await mainDb.collection('weaponRules').find().toArray();

      letters = await playersDb.collection(`${prefix}-letter`).find({ isDeleted: { $ne: true } }).toArray();
      if (!letters.length) letters = await playersDb.collection('letter').find({ isDeleted: { $ne: true } }).toArray();
      if (!letters.length) letters = await mainDb.collection('letter').find({ isDeleted: { $ne: true } }).toArray();

      items = await mainDb.collection('item').find().toArray();
      if (!items.length) items = await mainDb.collection('items').find().toArray();

      alteredStates = await mainDb.collection('alteredState').find().toArray();
      if (!alteredStates.length) alteredStates = await mainDb.collection('status').find().toArray();

      afflictions = await mainDb.collection('affliction').find().toArray();
      if (!afflictions.length) afflictions = await mainDb.collection('afflictions').find().toArray();
    } finally {
      await client.close();
    }
  } else {
    campaigns = readJsonFallback('campaigns.json');
    sessions = readJsonFallback('campaignSessions.json').filter(s => String(s.campaignId) === String(campaignId));
    players = readJsonFallback('players.json');
    npcs = readJsonFallback('npcs.json');
    locations = readJsonFallback('locations.json');
    if (locations && locations.locations) locations = locations.locations;
    shops = readJsonFallback('shops.json');
    bestiary = readJsonFallback('bestiary.json');
    weapons = readJsonFallback('weapons.json');
    weaponRules = readJsonFallback('weaponRules.json');
    letters = readJsonFallback('letters.json').filter(l => !l.isDeleted);
    const rawItems = readJsonFallback('items.json');
    items = Array.isArray(rawItems) ? rawItems : (rawItems.items || []);
    alteredStates = readJsonFallback('alteredStates.json');
    afflictions = readJsonFallback('afflictions.json');
  }

  const context = {
    campaignId: Number(campaignId),
    campaigns,
    sessions,
    players: players.map(p => ({ id: p.id, name: p.name, race: p.race, origin: p.origin })),
    npcs: npcs.map(n => ({ id: n.id, name: n.name, faction: n.faction, role: n.role, location: n.location, bestiaryId: n.bestiaryId })),
    locations: locations.map(l => ({ id: l.id, name: l.name, faction: l.faction, isCapital: l.isCapital })),
    shops: shops.map(s => ({ id: s.id, name: s.name, locationName: s.locationName || s.location, owner: s.owner })),
    bestiary: bestiary.map(b => ({ id: b.id, name: b.name, faction: b.faction, pr: b.pr, weapons: b.weapons })),
    weapons: weapons.map(w => ({ id: w.id, name: w.name, price: w.price, profiles: w.profiles })),
    weaponRules: weaponRules.map(r => ({ id: r.id, name: r.name, effect: r.effect, prModifier: r.prModifier })),
    letters: letters.map(l => ({ id: l.id, subject: l.subject, title: l.subject, senderName: l.senderName, date: l.date })),
    items: items.map(i => ({ id: i.id, name: i.name, price: i.price, type: i.type })),
    alteredStates: alteredStates.map(s => ({ id: s.id, name: s.name, effect: s.effect })),
    afflictions: afflictions.map(a => ({ id: a.id, name: a.name, treatment: a.treatment, effect: a.effect }))
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

  const client = await getClient();
  if (!client) {
    throw new Error('Database connection failed. Cannot save session.');
  }

  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: processedContent,
    conclussion: processedConclussion,
    playerVisibleBranches: branchesArray
  };

  try {
    const mainDb = client.db(mainDbName);
    const collection = mainDb.collection('campaignSession');

    const existing = await collection.findOne({
      campaignId: Number(campaignId),
      sessionId: Number(sessionId)
    });

    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            content: sessionDoc.content,
            conclussion: sessionDoc.conclussion,
            playerVisibleBranches: sessionDoc.playerVisibleBranches
          }
        }
      );
      sessionDoc.id = existing.id || Number(sessionId);
    } else {
      const all = await collection.find().toArray();
      const maxId = all.reduce((m, s) => (s.id && typeof s.id === 'number' && s.id > m ? s.id : m), 0);
      sessionDoc.id = maxId + 1;
      await collection.insertOne(sessionDoc);
    }
  } finally {
    await client.close();
  }

  return {
    ...sessionDoc,
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

  const client = await getClient();
  if (!client) {
    throw new Error('Database connection failed. Cannot finalize session.');
  }

  let updated = null;
  try {
    const mainDb = client.db(mainDbName);
    const collection = mainDb.collection('campaignSession');
    const query = {
      campaignId: Number(campaignId),
      sessionId: Number(sessionId)
    };
    const existing = await collection.findOne(query);
    if (!existing) {
      throw new Error(`Session ${sessionId} in campaign ${campaignId} not found in database.`);
    }

    const updateFields = { conclussion: processedConclussion };
    if (branchesArray !== undefined) {
      updateFields.playerVisibleBranches = branchesArray;
    }
    await collection.updateOne({ _id: existing._id }, { $set: updateFields });
    updated = { ...existing, ...updateFields };
  } finally {
    await client.close();
  }

  if (updated) {
    updated.cleanConclussion = toCleanText(processedConclussion, context);
    updated.displayConclussion = expandToDisplayTags(processedConclussion, context);
  }

  return updated;
}

async function createNPC(npcData) {
  const {
    campaignId = 1,
    name,
    faction,
    subgroup = '',
    role = '',
    mission = '',
    methods = '',
    personality = '',
    location = '',
    bestiaryId = null,
    reputation = '',
    backstory = '',
    description = '',
    fleetSize = '',
    flagship = '',
    tactics = '',
    motivations = '',
    wargear = [],
    discovered = true
  } = npcData;

  if (!name || !faction) {
    throw new Error('NPC requires at least "name" and "faction".');
  }

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create NPC.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-npc`);
    const allExisting = await col.find().toArray();
    const genericExisting = await playersDb.collection('npc').find().toArray();
    const maxId = [...allExisting, ...genericExisting].reduce((max, n) => (n && typeof n.id === 'number' && n.id > max ? n.id : max), 0);
    const newId = maxId + 1;

    const parsedBestiaryId = (bestiaryId !== null && bestiaryId !== undefined && !isNaN(Number(bestiaryId)))
      ? Number(bestiaryId)
      : undefined;

    const npcDoc = {
      id: newId,
      name: name.trim(),
      faction: faction.trim(),
      subgroup: subgroup ? subgroup.trim() : faction.trim(),
      ...(role ? { role: role.trim() } : {}),
      ...(mission ? { mission: mission.trim() } : {}),
      ...(methods ? { methods: methods.trim() } : {}),
      ...(personality ? { personality: personality.trim() } : {}),
      ...(location ? { location: location.trim() } : {}),
      ...(parsedBestiaryId !== undefined ? { bestiaryId: parsedBestiaryId } : {}),
      ...(reputation ? { reputation: reputation.trim() } : {}),
      ...(backstory ? { backstory: backstory.trim() } : {}),
      ...(description ? { description: description.trim() } : {}),
      ...(fleetSize ? { fleetSize: fleetSize.trim() } : {}),
      ...(flagship ? { flagship: flagship.trim() } : {}),
      ...(tactics ? { tactics: tactics.trim() } : {}),
      ...(motivations ? { motivations: motivations.trim() } : {}),
      ...(Array.isArray(wargear) && wargear.length > 0 ? { wargear } : {}),
      discovered: discovered !== undefined ? !!discovered : true
    };

    await col.insertOne({ ...npcDoc });
    await playersDb.collection('npc').updateOne({ id: newId }, { $set: npcDoc }, { upsert: true });

    return {
      ...npcDoc,
      entityTag: `@npc[${npcDoc.id}]`,
      displayTag: `@npc[${npcDoc.id}: ${npcDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateNPC(npcUpdateData) {
  const { id, campaignId = 1, ...updates } = npcUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateNPC requires an "id" property to identify the NPC.');
  }

  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update NPC.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-npc`);
    let targetNPC = await col.findOne({ id: numericId });
    if (!targetNPC) targetNPC = await playersDb.collection('npc').findOne({ id: numericId });
    if (!targetNPC) throw new Error(`NPC with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...targetNPC,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.faction ? { faction: updates.faction.trim() } : {}),
      ...(updates.subgroup !== undefined ? { subgroup: updates.subgroup.trim() } : {}),
      ...(updates.role !== undefined ? { role: updates.role.trim() } : {}),
      ...(updates.mission !== undefined ? { mission: updates.mission.trim() } : {}),
      ...(updates.methods !== undefined ? { methods: updates.methods.trim() } : {}),
      ...(updates.personality !== undefined ? { personality: updates.personality.trim() } : {}),
      ...(updates.location !== undefined ? { location: updates.location.trim() } : {}),
      ...(updates.bestiaryId !== undefined ? { bestiaryId: (updates.bestiaryId !== null && !isNaN(Number(updates.bestiaryId))) ? Number(updates.bestiaryId) : undefined } : {}),
      ...(updates.reputation !== undefined ? { reputation: updates.reputation.trim() } : {}),
      ...(updates.backstory !== undefined ? { backstory: updates.backstory.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.fleetSize !== undefined ? { fleetSize: updates.fleetSize.trim() } : {}),
      ...(updates.flagship !== undefined ? { flagship: updates.flagship.trim() } : {}),
      ...(updates.tactics !== undefined ? { tactics: updates.tactics.trim() } : {}),
      ...(updates.motivations !== undefined ? { motivations: updates.motivations.trim() } : {}),
      ...(Array.isArray(updates.wargear) ? { wargear: updates.wargear } : {}),
      ...(updates.discovered !== undefined ? { discovered: !!updates.discovered } : {})
    };

    delete updatedDoc._id;

    await col.updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await playersDb.collection('npc').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@npc[${numericId}]`,
      displayTag: `@npc[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
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

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Bestiary entry.');

  try {
    const mainDb = client.db(mainDbName);
    const existingBestiary = await mainDb.collection('bestiary').find().toArray();
    const maxId = existingBestiary.reduce((max, b) => (b && typeof b.id === 'number' && b.id > max ? b.id : max), 0);
    const newId = maxId + 1;

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
      id: newId,
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

    await mainDb.collection('bestiary').insertOne({ ...bestiaryDoc });

    return {
      ...bestiaryDoc,
      prBreakdown,
      entityTag: `@bestiary[${bestiaryDoc.id}]`,
      displayTag: `@bestiary[${bestiaryDoc.id}: ${bestiaryDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateBestiaryEntry(bestiaryUpdateData) {
  const { id, ...updates } = bestiaryUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateBestiaryEntry requires an "id" property to identify the creature.');
  }

  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Bestiary entry.');

  try {
    const mainDb = client.db(mainDbName);
    const targetBestiary = await mainDb.collection('bestiary').findOne({ id: numericId });
    if (!targetBestiary) throw new Error(`Bestiary entry with ID ${numericId} not found in database.`);

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
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.faction ? { faction: updates.faction.trim() } : {}),
      ...(updates.subgroup !== undefined ? { subgroup: updates.subgroup.trim() } : {}),
      pr: finalPR,
      attributes: finalAttributes,
      weapons: finalWeapons,
      abilities: finalAbilities,
      ...(Array.isArray(updates.deployables) ? { deployables: updates.deployables } : {}),
      ...(updates.isDiscovered !== undefined ? { isDiscovered: !!updates.isDiscovered } : {}),
      ...(Array.isArray(updates.discoveredCampaignIds) ? { discoveredCampaignIds: updates.discoveredCampaignIds } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('bestiary').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      prBreakdown,
      entityTag: `@bestiary[${numericId}]`,
      displayTag: `@bestiary[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createCombatNPC(combatData) {
  const {
    campaignId = 1,
    name,
    faction,
    subgroup = '',
    role = '',
    mission = '',
    methods = '',
    personality = '',
    location = '',
    reputation = '',
    backstory = '',
    description = '',
    fleetSize = '',
    flagship = '',
    tactics = '',
    motivations = '',
    wargear = [],
    discovered = true,
    attributes = {},
    weapons = [],
    abilities = [],
    deployables = []
  } = combatData;

  const bestiaryEntry = await createBestiaryEntry({
    name,
    faction,
    subgroup: subgroup || faction,
    attributes,
    weapons,
    abilities,
    deployables,
    isDiscovered: discovered,
    campaignId
  });

  const npcDoc = await createNPC({
    campaignId,
    name,
    faction,
    subgroup: subgroup || faction,
    role,
    mission,
    methods,
    personality,
    location,
    bestiaryId: bestiaryEntry.id,
    reputation,
    backstory,
    description,
    fleetSize,
    flagship,
    tactics,
    motivations,
    wargear,
    discovered
  });

  return {
    npc: npcDoc,
    bestiary: bestiaryEntry,
    tags: {
      npcTag: `@npc[${npcDoc.id}]`,
      npcDisplayTag: `@npc[${npcDoc.id}: ${npcDoc.name}]`,
      bestiaryTag: `@bestiary[${bestiaryEntry.id}]`,
      bestiaryDisplayTag: `@bestiary[${bestiaryEntry.id}: ${bestiaryEntry.name}]`
    }
  };
}

async function createLocation(locationData) {
  const {
    campaignId = 1,
    name,
    faction = 'Unaligned',
    description = '',
    category = 'POI',
    categorySize = 'Medium',
    isCapital = false,
    isWorldMap = false,
    mapX = null,
    mapY = null,
    discovered = true,
    rpgMapLayout = '',
    privateNotes = '',
    secrets = [],
    isSecret = false,
    isSecretRevealed = false,
    notableFeatures = [],
    shops = [],
    imgUrl = '',
    thumbnail = ''
  } = locationData;

  if (!name) {
    throw new Error('Location requires at least "name".');
  }

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Location.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-location`);
    const allExisting = await col.find().toArray();
    const genericExisting = await playersDb.collection('location').find().toArray();
    const mainExisting = await mainDb.collection('location').find().toArray();
    const maxId = [...allExisting, ...genericExisting, ...mainExisting].reduce((max, l) => (l && typeof l.id === 'number' && l.id > max ? l.id : max), 0);
    const newId = maxId + 1;

    const locationDoc = {
      id: newId,
      name: name.trim(),
      faction: faction ? faction.trim() : 'Unaligned',
      description: description ? description.trim() : '',
      ...(category ? { category: category.trim() } : {}),
      ...(categorySize !== undefined ? { categorySize } : {}),
      isCapital: !!isCapital,
      ...(isWorldMap ? { isWorldMap: true } : {}),
      ...(typeof mapX === 'number' && !isNaN(mapX) ? { mapX } : {}),
      ...(typeof mapY === 'number' && !isNaN(mapY) ? { mapY } : {}),
      discovered: discovered !== undefined ? !!discovered : true,
      ...(rpgMapLayout ? { rpgMapLayout } : {}),
      ...(privateNotes ? { privateNotes } : {}),
      ...(Array.isArray(secrets) && secrets.length > 0 ? { secrets } : {}),
      ...(isSecret ? { isSecret: true } : {}),
      ...(isSecretRevealed ? { isSecretRevealed: true } : {}),
      ...(Array.isArray(notableFeatures) && notableFeatures.length > 0 ? { notableFeatures } : {}),
      ...(Array.isArray(shops) && shops.length > 0 ? { shops } : {}),
      ...(imgUrl ? { imgUrl } : {}),
      ...(thumbnail ? { thumbnail } : {})
    };

    await col.insertOne({ ...locationDoc });
    await playersDb.collection('location').updateOne({ id: newId }, { $set: locationDoc }, { upsert: true });
    await mainDb.collection('location').updateOne({ id: newId }, { $set: locationDoc }, { upsert: true });

    return {
      ...locationDoc,
      entityTag: `@location[${locationDoc.id}]`,
      displayTag: `@location[${locationDoc.id}: ${locationDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateLocation(locationUpdateData) {
  const { id, campaignId = 1, ...updates } = locationUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLocation requires an "id" property to identify the location.');
  }

  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Location.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-location`);
    let targetLoc = await col.findOne({ id: numericId });
    if (!targetLoc) targetLoc = await playersDb.collection('location').findOne({ id: numericId });
    if (!targetLoc) targetLoc = await mainDb.collection('location').findOne({ id: numericId });
    if (!targetLoc) throw new Error(`Location with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...targetLoc,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.faction !== undefined ? { faction: updates.faction.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.category !== undefined ? { category: updates.category.trim() } : {}),
      ...(updates.categorySize !== undefined ? { categorySize: updates.categorySize } : {}),
      ...(updates.isCapital !== undefined ? { isCapital: !!updates.isCapital } : {}),
      ...(updates.isWorldMap !== undefined ? { isWorldMap: !!updates.isWorldMap } : {}),
      ...(updates.mapX !== undefined ? { mapX: Number(updates.mapX) } : {}),
      ...(updates.mapY !== undefined ? { mapY: Number(updates.mapY) } : {}),
      ...(updates.discovered !== undefined ? { discovered: !!updates.discovered } : {}),
      ...(updates.rpgMapLayout !== undefined ? { rpgMapLayout: updates.rpgMapLayout } : {}),
      ...(updates.privateNotes !== undefined ? { privateNotes: updates.privateNotes } : {}),
      ...(Array.isArray(updates.secrets) ? { secrets: updates.secrets } : {}),
      ...(updates.isSecret !== undefined ? { isSecret: !!updates.isSecret } : {}),
      ...(updates.isSecretRevealed !== undefined ? { isSecretRevealed: !!updates.isSecretRevealed } : {}),
      ...(Array.isArray(updates.notableFeatures) ? { notableFeatures: updates.notableFeatures } : {}),
      ...(Array.isArray(updates.shops) ? { shops: updates.shops } : {}),
      ...(updates.imgUrl !== undefined ? { imgUrl: updates.imgUrl } : {}),
      ...(updates.thumbnail !== undefined ? { thumbnail: updates.thumbnail } : {})
    };

    delete updatedDoc._id;

    await col.updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await playersDb.collection('location').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('location').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@location[${numericId}]`,
      displayTag: `@location[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createShop(shopData) {
  const {
    campaignId = 1,
    name,
    owner = null,
    locationId = null,
    locationName = '',
    location = '',
    description = '',
    discovered = true,
    imgUrl = '',
    thumbnail = '',
    categories = [1],
    paymentMethod = { digital: true, physical: true },
    items = []
  } = shopData;

  if (!name) {
    throw new Error('Shop requires at least "name".');
  }

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Shop.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-shop`);
    const allExisting = await col.find().toArray();
    const genericExisting = await playersDb.collection('shop').find().toArray();
    const maxId = [...allExisting, ...genericExisting].reduce((max, s) => (s && typeof s.id === 'number' && s.id > max ? s.id : max), 0);
    const newId = maxId + 1;

    const parsedOwner = (owner !== null && owner !== undefined && !isNaN(Number(owner))) ? Number(owner) : undefined;
    const parsedLocId = (locationId !== null && locationId !== undefined && !isNaN(Number(locationId))) ? Number(locationId) : undefined;

    const shopDoc = {
      id: newId,
      name: name.trim(),
      ...(parsedOwner !== undefined ? { owner: parsedOwner } : {}),
      ...(parsedLocId !== undefined ? { locationId: parsedLocId } : {}),
      ...(locationName ? { locationName: locationName.trim() } : {}),
      ...(location ? { location: location.trim() } : {}),
      description: description ? description.trim() : '',
      discovered: discovered !== undefined ? !!discovered : true,
      ...(imgUrl ? { imgUrl } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      categories: Array.isArray(categories) && categories.length > 0 ? categories : [1],
      paymentMethod: paymentMethod && typeof paymentMethod === 'object' ? paymentMethod : { digital: true, physical: true },
      items: Array.isArray(items) ? items : []
    };

    await col.insertOne({ ...shopDoc });
    await playersDb.collection('shop').updateOne({ id: newId }, { $set: shopDoc }, { upsert: true });

    return {
      ...shopDoc,
      entityTag: `@shop[${shopDoc.id}]`,
      displayTag: `@shop[${shopDoc.id}: ${shopDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateShop(shopUpdateData) {
  const { id, campaignId = 1, ...updates } = shopUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateShop requires an "id" property to identify the shop.');
  }

  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Shop.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-shop`);
    let targetShop = await col.findOne({ id: numericId });
    if (!targetShop) targetShop = await playersDb.collection('shop').findOne({ id: numericId });
    if (!targetShop) throw new Error(`Shop with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...targetShop,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.owner !== undefined ? { owner: updates.owner !== null ? Number(updates.owner) : null } : {}),
      ...(updates.locationId !== undefined ? { locationId: updates.locationId !== null ? Number(updates.locationId) : null } : {}),
      ...(updates.locationName !== undefined ? { locationName: updates.locationName.trim() } : {}),
      ...(updates.location !== undefined ? { location: updates.location.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.discovered !== undefined ? { discovered: !!updates.discovered } : {}),
      ...(updates.imgUrl !== undefined ? { imgUrl: updates.imgUrl } : {}),
      ...(updates.thumbnail !== undefined ? { thumbnail: updates.thumbnail } : {})
    };

    if (Array.isArray(updates.categories)) {
      updatedDoc.categories = updates.categories;
    }
    if (updates.paymentMethod && typeof updates.paymentMethod === 'object') {
      updatedDoc.paymentMethod = { ...targetShop.paymentMethod, ...updates.paymentMethod };
    }
    if (Array.isArray(updates.items)) {
      updatedDoc.items = updates.items;
    }

    delete updatedDoc._id;

    await col.updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await playersDb.collection('shop').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@shop[${numericId}]`,
      displayTag: `@shop[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updatePlayer(playerUpdateData) {
  const { id, campaignId = 1, ...updates } = playerUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updatePlayer requires an "id" property to identify the player.');
  }

  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Player.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-player`);
    let targetPlayer = await col.findOne({ id: numericId });
    if (!targetPlayer) {
      targetPlayer = await playersDb.collection('player').findOne({ id: numericId });
    }
    if (!targetPlayer) {
      throw new Error(`Player with ID ${numericId} not found in database.`);
    }

    let finalAttributes = targetPlayer.attributes;
    if (updates.attributes && typeof updates.attributes === 'object') {
      finalAttributes = {
        ...(targetPlayer.attributes || {}),
        ...updates.attributes
      };
    }

    let finalProgression = targetPlayer.progression;
    if (updates.progression && typeof updates.progression === 'object') {
      finalProgression = {
        ...(targetPlayer.progression || {}),
        ...updates.progression,
        mistrals: {
          ...((targetPlayer.progression && targetPlayer.progression.mistrals) || { digital: 0, physical: 0 }),
          ...(updates.progression.mistrals || {})
        }
      };
    } else if (
      updates.talentPoints !== undefined ||
      updates.digitalMistrals !== undefined ||
      updates.physicalMistrals !== undefined ||
      updates.talents !== undefined ||
      updates.afflictions !== undefined ||
      updates.equipment !== undefined
    ) {
      finalProgression = {
        ...(targetPlayer.progression || { talentPoints: 0, mistrals: { digital: 0, physical: 0 }, talents: [], afflictions: [], equipment: [] }),
        ...(updates.talentPoints !== undefined ? { talentPoints: Number(updates.talentPoints) } : {}),
        mistrals: {
          ...((targetPlayer.progression && targetPlayer.progression.mistrals) || { digital: 0, physical: 0 }),
          ...(updates.digitalMistrals !== undefined ? { digital: Number(updates.digitalMistrals) } : {}),
          ...(updates.physicalMistrals !== undefined ? { physical: Number(updates.physicalMistrals) } : {})
        },
        ...(Array.isArray(updates.talents) ? { talents: updates.talents } : {}),
        ...(Array.isArray(updates.afflictions) ? { afflictions: updates.afflictions } : {}),
        ...(Array.isArray(updates.equipment) ? { equipment: updates.equipment } : {})
      };
    }

    let finalWeapons = targetPlayer.weapons;
    if (Array.isArray(updates.weapons)) {
      finalWeapons = updates.weapons.map(Number).filter(n => !isNaN(n));
    }

    let finalItems = targetPlayer.items;
    if (Array.isArray(updates.items)) {
      finalItems = updates.items;
    }

    let finalAbilities = targetPlayer.abilities;
    if (Array.isArray(updates.abilities)) {
      finalAbilities = updates.abilities;
    }

    const updatedDoc = {
      ...targetPlayer,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.race ? { race: updates.race.trim() } : {}),
      ...(updates.origin ? { origin: updates.origin.trim() } : {}),
      ...(updates.faction ? { faction: updates.faction.trim() } : {}),
      ...(updates.subgroup !== undefined ? { subgroup: updates.subgroup.trim() } : {}),
      ...(updates.role !== undefined ? { role: updates.role.trim() } : {}),
      ...(updates.personality !== undefined ? { personality: updates.personality.trim() } : {}),
      ...(updates.location !== undefined ? { location: updates.location.trim() } : {}),
      ...(updates.reputation !== undefined ? { reputation: updates.reputation.trim() } : {}),
      ...(updates.backstory !== undefined ? { backstory: updates.backstory.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(finalAttributes ? { attributes: finalAttributes } : {}),
      ...(finalWeapons ? { weapons: finalWeapons } : {}),
      ...(finalAbilities ? { abilities: finalAbilities } : {}),
      ...(finalProgression ? { progression: finalProgression } : {}),
      ...(finalItems ? { items: finalItems } : {})
    };

    delete updatedDoc._id;

    await col.updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await playersDb.collection('player').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@player[${numericId}]`,
      displayTag: `@player[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createLetter(letterData) {
  const {
    campaignId = 1,
    subject = '',
    senderId = null,
    senderName = '',
    message = '',
    date = '',
    readBy = [],
    recipientIds = [],
    targetNames = []
  } = letterData;

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Letter.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-letter`);
    const allExisting = await col.find().toArray();
    const genericExisting = await playersDb.collection('letter').find().toArray();
    const mainExisting = await mainDb.collection('letter').find().toArray();
    const maxId = [...allExisting, ...genericExisting, ...mainExisting].reduce((max, l) => (l && typeof l.id === 'number' && l.id > max ? l.id : max), 0);
    const newId = maxId + 1;

    const letterDoc = {
      id: newId,
      subject: subject ? subject.trim() : `Letter #${newId}`,
      senderId: (senderId !== null && senderId !== undefined && !isNaN(Number(senderId))) ? Number(senderId) : null,
      senderName: senderName ? senderName.trim() : null,
      message: message || '',
      date: date || new Date().toISOString().slice(0, 10),
      readBy: Array.isArray(readBy) ? readBy.map(Number) : [],
      recipientIds: Array.isArray(recipientIds) ? recipientIds.map(Number) : [],
      targetNames: Array.isArray(targetNames) ? targetNames : []
    };

    await col.insertOne({ ...letterDoc });
    await playersDb.collection('letter').updateOne({ id: newId }, { $set: letterDoc }, { upsert: true });
    await mainDb.collection('letter').updateOne({ id: newId }, { $set: letterDoc }, { upsert: true });

    return {
      ...letterDoc,
      entityTag: `@letter[${letterDoc.id}]`,
      displayTag: `@letter[${letterDoc.id}: ${letterDoc.subject}]`
    };
  } finally {
    await client.close();
  }
}

async function updateLetter(letterUpdateData) {
  const { id, campaignId = 1, ...updates } = letterUpdateData;
  if (id === undefined || id === null) throw new Error('updateLetter requires an "id" property.');
  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Letter.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    const col = playersDb.collection(`${prefix}-letter`);
    let existing = await col.findOne({ id: numericId });
    if (!existing) existing = await playersDb.collection('letter').findOne({ id: numericId });
    if (!existing) existing = await mainDb.collection('letter').findOne({ id: numericId });
    if (!existing) throw new Error(`Letter with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.subject !== undefined ? { subject: updates.subject ? updates.subject.trim() : null } : {}),
      ...(updates.senderId !== undefined ? { senderId: updates.senderId !== null ? Number(updates.senderId) : null } : {}),
      ...(updates.senderName !== undefined ? { senderName: updates.senderName ? updates.senderName.trim() : null } : {}),
      ...(updates.message !== undefined ? { message: updates.message } : {}),
      ...(updates.date !== undefined ? { date: updates.date } : {}),
      ...(Array.isArray(updates.readBy) ? { readBy: updates.readBy.map(Number) } : {}),
      ...(Array.isArray(updates.recipientIds) ? { recipientIds: updates.recipientIds.map(Number) } : {}),
      ...(Array.isArray(updates.targetNames) ? { targetNames: updates.targetNames } : {}),
      ...(updates.isDeleted !== undefined ? { isDeleted: !!updates.isDeleted } : {})
    };

    delete updatedDoc._id;

    await col.updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await playersDb.collection('letter').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('letter').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@letter[${numericId}]`,
      displayTag: `@letter[${numericId}: ${updatedDoc.subject || `Letter #${numericId}`}]`
    };
  } finally {
    await client.close();
  }
}

async function createItem(itemData) {
  const {
    name,
    price = 0,
    description = '',
    type = 'general',
    subtype = '',
    raceReq = 'universal',
    quantity = 1,
    isEquippable = false,
    statModifications = [],
    ...otherProps
  } = itemData;
  if (!name) throw new Error('Item requires at least "name".');

  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Item.');

  try {
    const mainDb = client.db(mainDbName);
    const existingItems = await mainDb.collection('item').find().toArray();
    const existingPlural = await mainDb.collection('items').find().toArray();
    const maxId = [...existingItems, ...existingPlural].reduce((max, i) => (i && typeof i.id === 'number' && i.id > max ? i.id : max), 0);
    const newId = maxId + 1;

    const itemDoc = {
      id: newId,
      name: name.trim(),
      price: Number(price) || 0,
      description: description ? description.trim() : '',
      type: type ? type.trim() : 'general',
      ...(subtype ? { subtype: subtype.trim() } : {}),
      raceReq: raceReq ? raceReq.trim() : 'universal',
      quantity: Number(quantity) || 1,
      isEquippable: !!isEquippable,
      ...(Array.isArray(statModifications) && statModifications.length > 0 ? { statModifications } : {}),
      ...otherProps
    };

    await mainDb.collection('item').insertOne({ ...itemDoc });
    await mainDb.collection('items').updateOne({ id: newId }, { $set: itemDoc }, { upsert: true });

    return {
      ...itemDoc,
      entityTag: `@item[${itemDoc.id}]`,
      displayTag: `@item[${itemDoc.id}: ${itemDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateItem(itemUpdateData) {
  const { id, ...updates } = itemUpdateData;
  if (id === undefined || id === null) throw new Error('updateItem requires an "id" property.');
  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Item.');

  try {
    const mainDb = client.db(mainDbName);
    let existing = await mainDb.collection('item').findOne({ id: numericId });
    if (!existing) existing = await mainDb.collection('items').findOne({ id: numericId });
    if (!existing) throw new Error(`Item with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.price !== undefined ? { price: Number(updates.price) } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.type !== undefined ? { type: updates.type.trim() } : {}),
      ...(updates.subtype !== undefined ? { subtype: updates.subtype.trim() } : {}),
      ...(updates.raceReq !== undefined ? { raceReq: updates.raceReq.trim() } : {}),
      ...(updates.quantity !== undefined ? { quantity: Number(updates.quantity) } : {}),
      ...(updates.isEquippable !== undefined ? { isEquippable: !!updates.isEquippable } : {}),
      ...(Array.isArray(updates.statModifications) ? { statModifications: updates.statModifications } : {}),
      ...(updates.buildMaterials ? { buildMaterials: updates.buildMaterials } : {}),
      ...(updates.weapons ? { weapons: updates.weapons } : {}),
      ...(updates.bestiaryId !== undefined ? { bestiaryId: updates.bestiaryId } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('item').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('items').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@item[${numericId}]`,
      displayTag: `@item[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createWeapon(weaponData) {
  const { name, price = 0, profiles = [] } = weaponData;
  if (!name) throw new Error('Weapon requires at least "name".');
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Weapon.');

  try {
    const mainDb = client.db(mainDbName);
    const existingWeapons = await mainDb.collection('weapon').find().toArray();
    const existingPlural = await mainDb.collection('weapons').find().toArray();
    const maxId = [...existingWeapons, ...existingPlural].reduce((max, w) => (w && typeof w.id === 'number' && w.id > max ? w.id : max), 0);
    const newId = maxId + 1;

    const weaponDoc = {
      id: newId,
      name: name.trim(),
      price: Number(price) || 0,
      profiles: Array.isArray(profiles) ? profiles : []
    };

    await mainDb.collection('weapon').insertOne({ ...weaponDoc });
    await mainDb.collection('weapons').updateOne({ id: newId }, { $set: weaponDoc }, { upsert: true });

    return {
      ...weaponDoc,
      entityTag: `@weapon[${weaponDoc.id}]`,
      displayTag: `@weapon[${weaponDoc.id}: ${weaponDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateWeapon(weaponUpdateData) {
  const { id, ...updates } = weaponUpdateData;
  if (id === undefined || id === null) throw new Error('updateWeapon requires an "id" property.');
  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Weapon.');

  try {
    const mainDb = client.db(mainDbName);
    let existing = await mainDb.collection('weapon').findOne({ id: numericId });
    if (!existing) existing = await mainDb.collection('weapons').findOne({ id: numericId });
    if (!existing) throw new Error(`Weapon with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.price !== undefined ? { price: Number(updates.price) } : {}),
      ...(Array.isArray(updates.profiles) ? { profiles: updates.profiles } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('weapon').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('weapons').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@weapon[${numericId}]`,
      displayTag: `@weapon[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createWeaponRule(ruleData) {
  const { name, effect, prModifier = null } = ruleData;
  if (!name || !effect) throw new Error('Weapon rule requires "name" and "effect".');
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Weapon Rule.');

  try {
    const mainDb = client.db(mainDbName);
    const existingRules = await mainDb.collection('weaponRule').find().toArray();
    const existingPlural = await mainDb.collection('weaponRules').find().toArray();
    const maxId = [...existingRules, ...existingPlural].reduce((max, r) => (r && typeof r.id === 'number' && r.id > max ? r.id : max), 0);
    const newId = maxId + 1;

    const ruleDoc = {
      id: newId,
      name: name.trim(),
      effect: effect.trim(),
      prModifier: prModifier !== null && prModifier !== undefined && !isNaN(Number(prModifier)) ? Number(prModifier) : null
    };

    await mainDb.collection('weaponRule').insertOne({ ...ruleDoc });
    await mainDb.collection('weaponRules').updateOne({ id: newId }, { $set: ruleDoc }, { upsert: true });

    return {
      ...ruleDoc,
      entityTag: `@weaponrule[${ruleDoc.id}]`,
      displayTag: `@weaponrule[${ruleDoc.id}: ${ruleDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateWeaponRule(ruleUpdateData) {
  const { id, ...updates } = ruleUpdateData;
  if (id === undefined || id === null) throw new Error('updateWeaponRule requires an "id" property.');
  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Weapon Rule.');

  try {
    const mainDb = client.db(mainDbName);
    let existing = await mainDb.collection('weaponRule').findOne({ id: numericId });
    if (!existing) existing = await mainDb.collection('weaponRules').findOne({ id: numericId });
    if (!existing) throw new Error(`Weapon rule with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.effect ? { effect: updates.effect.trim() } : {}),
      ...(updates.prModifier !== undefined ? { prModifier: updates.prModifier !== null && !isNaN(Number(updates.prModifier)) ? Number(updates.prModifier) : null } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('weaponRule').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('weaponRules').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@weaponrule[${numericId}]`,
      displayTag: `@weaponrule[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createAlteredState(stateData) {
  const { name, effect } = stateData;
  if (!name || !effect) throw new Error('Altered state requires "name" and "effect".');
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Altered State.');

  try {
    const mainDb = client.db(mainDbName);
    const existingStates = await mainDb.collection('alteredState').find().toArray();
    const existingStatus = await mainDb.collection('status').find().toArray();
    const maxId = [...existingStates, ...existingStatus].reduce((max, s) => (s && typeof s.id === 'number' && s.id > max ? s.id : max), 0);
    const newId = maxId + 1;

    const stateDoc = {
      id: newId,
      name: name.trim(),
      effect: effect.trim()
    };

    await mainDb.collection('alteredState').insertOne({ ...stateDoc });
    await mainDb.collection('status').updateOne({ id: newId }, { $set: stateDoc }, { upsert: true });

    return {
      ...stateDoc,
      entityTag: `@alteredstate[${stateDoc.id}]`,
      displayTag: `@alteredstate[${stateDoc.id}: ${stateDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateAlteredState(stateUpdateData) {
  const { id, ...updates } = stateUpdateData;
  if (id === undefined || id === null) throw new Error('updateAlteredState requires an "id" property.');
  const numericId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Altered State.');

  try {
    const mainDb = client.db(mainDbName);
    let existing = await mainDb.collection('alteredState').findOne({ id: numericId });
    if (!existing) existing = await mainDb.collection('status').findOne({ id: numericId });
    if (!existing) throw new Error(`Altered state with ID ${numericId} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.effect ? { effect: updates.effect.trim() } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('alteredState').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('status').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: numericId,
      entityTag: `@alteredstate[${numericId}]`,
      displayTag: `@alteredstate[${numericId}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function createAffliction(afflictionData) {
  const { name, effect = '', treatment = 'Resting', toHeal = 3, progress = 0, statModifications = [] } = afflictionData;
  if (!name) throw new Error('Affliction requires at least "name".');
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot create Affliction.');

  try {
    const mainDb = client.db(mainDbName);
    const existingAffs = await mainDb.collection('affliction').find().toArray();
    const existingPlural = await mainDb.collection('afflictions').find().toArray();
    const maxId = [...existingAffs, ...existingPlural].reduce((max, a) => {
      const num = Number(a.id);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = String(maxId + 1);

    const affDoc = {
      id: newId,
      name: name.trim(),
      effect: effect ? effect.trim() : '',
      treatment: treatment ? treatment.trim() : 'Resting',
      toHeal: Number(toHeal) || 3,
      progress: Number(progress) || 0,
      ...(Array.isArray(statModifications) && statModifications.length > 0 ? { statModifications } : {})
    };

    await mainDb.collection('affliction').insertOne({ ...affDoc });
    await mainDb.collection('afflictions').updateOne({ id: newId }, { $set: affDoc }, { upsert: true });

    return {
      ...affDoc,
      entityTag: `@affliction[${affDoc.id}]`,
      displayTag: `@affliction[${affDoc.id}: ${affDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function updateAffliction(afflictionUpdateData) {
  const { id, ...updates } = afflictionUpdateData;
  if (id === undefined || id === null) throw new Error('updateAffliction requires an "id" property.');
  const strId = String(id).trim();
  const numId = Number(id);
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot update Affliction.');

  try {
    const mainDb = client.db(mainDbName);
    let existing = await mainDb.collection('affliction').findOne({ $or: [{ id: strId }, { id: numId }] });
    if (!existing) existing = await mainDb.collection('afflictions').findOne({ $or: [{ id: strId }, { id: numId }] });
    if (!existing) throw new Error(`Affliction with ID ${id} not found in database.`);

    const updatedDoc = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.effect !== undefined ? { effect: updates.effect.trim() } : {}),
      ...(updates.treatment !== undefined ? { treatment: updates.treatment.trim() } : {}),
      ...(updates.toHeal !== undefined ? { toHeal: Number(updates.toHeal) } : {}),
      ...(updates.progress !== undefined ? { progress: Number(updates.progress) } : {}),
      ...(Array.isArray(updates.statModifications) ? { statModifications: updates.statModifications } : {})
    };

    delete updatedDoc._id;

    await mainDb.collection('affliction').updateOne({ id: existing.id }, { $set: updatedDoc }, { upsert: true });
    await mainDb.collection('afflictions').updateOne({ id: existing.id }, { $set: updatedDoc }, { upsert: true });

    return {
      ...updatedDoc,
      id: existing.id,
      entityTag: `@affliction[${existing.id}]`,
      displayTag: `@affliction[${existing.id}: ${updatedDoc.name}]`
    };
  } finally {
    await client.close();
  }
}

async function readEntities({ type, campaignId = 1, filter = {}, search = '', limit = null }) {
  const normalizedType = normalizeEntityType(type);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let docs = [];

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      if (normalizedType === 'player') {
        docs = await playersDb.collection(`${prefix}-player`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('player').find().toArray();
      } else if (normalizedType === 'npc') {
        docs = await playersDb.collection(`${prefix}-npc`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('npc').find().toArray();
      } else if (normalizedType === 'location') {
        docs = await playersDb.collection(`${prefix}-location`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('location').find().toArray();
        if (!docs.length) docs = await mainDb.collection('location').find().toArray();
      } else if (normalizedType === 'shop') {
        docs = await playersDb.collection(`${prefix}-shop`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('shop').find().toArray();
      } else if (normalizedType === 'bestiary') {
        docs = await mainDb.collection('bestiary').find().toArray();
      } else if (normalizedType === 'session') {
        docs = await mainDb.collection('campaignSession').find({
          $or: [{ campaignId: Number(campaignId) }, { campaignId: String(campaignId) }]
        }).toArray();
      } else if (normalizedType === 'weapon') {
        docs = await mainDb.collection('weapon').find().toArray();
        if (!docs.length) docs = await mainDb.collection('weapons').find().toArray();
      } else if (normalizedType === 'weaponrule') {
        docs = await mainDb.collection('weaponRule').find().toArray();
        if (!docs.length) docs = await mainDb.collection('weaponRules').find().toArray();
      } else if (normalizedType === 'letter') {
        docs = await playersDb.collection(`${prefix}-letter`).find({ isDeleted: { $ne: true } }).toArray();
        if (!docs.length) docs = await playersDb.collection('letter').find({ isDeleted: { $ne: true } }).toArray();
        if (!docs.length) docs = await mainDb.collection('letter').find({ isDeleted: { $ne: true } }).toArray();
      } else if (normalizedType === 'item') {
        docs = await mainDb.collection('item').find().toArray();
        if (!docs.length) docs = await mainDb.collection('items').find().toArray();
      } else if (normalizedType === 'alteredstate') {
        docs = await mainDb.collection('alteredState').find().toArray();
        if (!docs.length) docs = await mainDb.collection('status').find().toArray();
      } else if (normalizedType === 'affliction') {
        docs = await mainDb.collection('affliction').find().toArray();
        if (!docs.length) docs = await mainDb.collection('afflictions').find().toArray();
      } else if (normalizedType === 'talent' || normalizedType === 'talents') {
        docs = await mainDb.collection('talent').find().toArray();
        if (!docs.length) docs = await mainDb.collection('talents').find().toArray();
      } else {
        throw new Error(`Unknown entity type "${type}". Allowed types: player, npc, location, shop, bestiary, session, letter, item, weapon, weaponrule, alteredstate, affliction, talent.`);
      }
    } finally {
      await client.close();
    }
  } else {
    // Read fallback if MongoDB client failed
    if (normalizedType === 'player') docs = readJsonFallback('players.json');
    else if (normalizedType === 'npc') docs = readJsonFallback('npcs.json');
    else if (normalizedType === 'location') {
      const locData = readJsonFallback('locations.json');
      docs = locData && locData.locations ? locData.locations : locData;
    } else if (normalizedType === 'shop') docs = readJsonFallback('shops.json');
    else if (normalizedType === 'bestiary') docs = readJsonFallback('bestiary.json');
    else if (normalizedType === 'session') docs = readJsonFallback('campaignSessions.json').filter(s => Number(s.campaignId) === Number(campaignId));
    else if (normalizedType === 'weapon') docs = readJsonFallback('weapons.json');
    else if (normalizedType === 'weaponrule') docs = readJsonFallback('weaponRules.json');
    else if (normalizedType === 'letter') docs = readJsonFallback('letters.json').filter(l => !l.isDeleted);
    else if (normalizedType === 'item') {
      const raw = readJsonFallback('items.json');
      docs = Array.isArray(raw) ? raw : (raw.items || []);
    } else if (normalizedType === 'alteredstate') docs = readJsonFallback('alteredStates.json');
    else if (normalizedType === 'affliction') docs = readJsonFallback('afflictions.json');
    else if (normalizedType === 'talent') docs = readJsonFallback('talents.json');
  }

  // Apply filters
  let filtered = docs;
  if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
    filtered = filtered.filter(item => {
      for (const [k, v] of Object.entries(filter)) {
        if (v === undefined || v === null || v === '') continue;
        const itemVal = item[k];
        if (itemVal === undefined) return false;
        if (typeof v === 'string' && typeof itemVal === 'string') {
          if (!itemVal.toLowerCase().includes(v.toLowerCase())) return false;
        } else if (typeof v === 'boolean') {
          if (Boolean(itemVal) !== Boolean(v)) return false;
        } else if (typeof v === 'number') {
          if (Number(itemVal) !== Number(v)) return false;
        } else if (Array.isArray(v)) {
          if (!Array.isArray(itemVal) || !v.every(x => itemVal.includes(x))) return false;
        } else if (itemVal !== v) {
          return false;
        }
      }
      return true;
    });
  }

  // Apply search query across textual fields
  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(item => {
      const matchName = (item.name || item.subject || item.title) && String(item.name || item.subject || item.title).toLowerCase().includes(q);
      const matchDesc = item.description && String(item.description).toLowerCase().includes(q);
      const matchLore = item.lore && String(item.lore).toLowerCase().includes(q);
      const matchFaction = item.faction && String(item.faction).toLowerCase().includes(q);
      const matchRole = item.role && String(item.role).toLowerCase().includes(q);
      const matchLocation = (item.location || item.locationName) && String(item.location || item.locationName).toLowerCase().includes(q);
      const matchEffect = item.effect && String(item.effect).toLowerCase().includes(q);
      const matchMessage = item.message && String(item.message).toLowerCase().includes(q);
      const matchId = String(item.id) === q;
      return matchName || matchDesc || matchLore || matchFaction || matchRole || matchLocation || matchEffect || matchMessage || matchId;
    });
  }

  if (typeof limit === 'number' && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

async function getEntity({ type, id, name, campaignId = 1 }) {
  const docs = await readEntities({ type, campaignId });
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    const numId = Number(id);
    const strId = String(id).trim();
    const found = docs.find(d => d.id === numId || String(d.id) === strId || d._id === id || String(d._id) === strId);
    if (found) return found;
  }
  if (name) {
    const cleaned = cleanString(name);
    const exact = docs.find(d => cleanString(d.name || d.subject || d.title) === cleaned || String(d.id) === String(name));
    if (exact) return exact;
    const partial = docs.find(d => {
      const label = cleanString(d.name || d.subject || d.title);
      return label && (label.includes(cleaned) || cleaned.includes(label));
    });
    if (partial) return partial;
  }
  return null;
}

async function deleteEntity({ type, id, campaignId = 1 }) {
  const normalizedType = normalizeEntityType(type);
  if (id === undefined || id === null) {
    throw new Error('deleteEntity requires an "id" property.');
  }

  const numericId = Number(id);
  const strId = String(id).trim();
  const client = await getClient();
  if (!client) throw new Error('Database connection failed. Cannot delete entity.');

  try {
    const mainDb = client.db(mainDbName);
    const playersDb = client.db(playersDbName);
    const campaigns = await mainDb.collection('campaign').find().toArray();
    const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
    const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

    if (normalizedType === 'player') {
      await playersDb.collection(`${prefix}-player`).deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await playersDb.collection('player').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'npc') {
      await playersDb.collection(`${prefix}-npc`).deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await playersDb.collection('npc').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'location') {
      await playersDb.collection(`${prefix}-location`).deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await playersDb.collection('location').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('location').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'shop') {
      await playersDb.collection(`${prefix}-shop`).deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await playersDb.collection('shop').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'bestiary') {
      await mainDb.collection('bestiary').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'session') {
      await mainDb.collection('campaignSession').deleteOne({ campaignId: Number(campaignId), sessionId: numericId });
    } else if (normalizedType === 'letter') {
      await playersDb.collection(`${prefix}-letter`).deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await playersDb.collection('letter').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('letter').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'item') {
      await mainDb.collection('item').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('items').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'weapon') {
      await mainDb.collection('weapon').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('weapons').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'weaponrule') {
      await mainDb.collection('weaponRule').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('weaponRules').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'alteredstate') {
      await mainDb.collection('alteredState').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('status').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else if (normalizedType === 'affliction') {
      await mainDb.collection('affliction').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
      await mainDb.collection('afflictions').deleteOne({ $or: [{ id: numericId }, { id: strId }] });
    } else {
      throw new Error(`Unknown or unsupported entity type for delete: "${type}".`);
    }

    return {
      success: true,
      type: normalizedType,
      id: numericId || strId,
      campaignId: Number(campaignId),
      message: `Successfully deleted ${normalizedType} with ID ${numericId || strId} from database`
    };
  } finally {
    await client.close();
  }
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

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    console.log(`
Nebryss Campaign Session Tool v3.0 (Pure Database Operations)
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

Entity Management (Pure MongoDB Persistence):
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

  if (command === 'get-context') {
    const campaignId = args[1] || 1;
    const ctx = await getCampaignContext(campaignId);
    console.log(JSON.stringify(ctx, null, 2));
  } else if (command === 'list') {
    const campaignId = args[1] || null;
    let format = 'raw';
    if (args.includes('--clean')) format = 'clean';
    else if (args.includes('--expand')) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    console.log(JSON.stringify(sessions, null, 2));
  } else if (command === 'get-latest') {
    const campaignId = args[1] || 1;
    let format = 'raw';
    if (args.includes('--clean')) format = 'clean';
    else if (args.includes('--expand')) format = 'expand';
    const sessions = await listSessions(campaignId, format);
    const latest = sessions.length ? sessions[sessions.length - 1] : null;
    console.log(JSON.stringify(latest, null, 2));
  } else if (command === 'get-entity') {
    const entityParams = { campaignId: 1 };
    let type = args[1];
    let query = args[2];
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) entityParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--type=')) type = arg.substring('--type='.length);
      else if (arg.startsWith('--id=')) entityParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) entityParams.name = arg.substring('--name='.length);
    });
    entityParams.type = type;
    if (query && !query.startsWith('--')) {
      if (/^\d+$/.test(query)) entityParams.id = Number(query);
      else entityParams.name = query;
    }
    const res = await getEntity(entityParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'list-entities' || command === 'read-entities') {
    const queryParams = { campaignId: 1 };
    let type = args[1];
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) queryParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--type=')) type = arg.substring('--type='.length);
      else if (arg.startsWith('--filter=')) queryParams.filter = parseArgJson(arg.substring('--filter='.length));
      else if (arg.startsWith('--search=')) queryParams.search = arg.substring('--search='.length);
      else if (arg.startsWith('--limit=')) queryParams.limit = Number(arg.split('=')[1]);
    });
    queryParams.type = type;
    const res = await readEntities(queryParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'delete-entity' || command.startsWith('delete-')) {
    const deleteParams = { campaignId: 1 };
    let type = command.startsWith('delete-') && command !== 'delete-entity' ? command.substring('delete-'.length) : args[1];
    let idArg = command.startsWith('delete-') && command !== 'delete-entity' ? args[1] : args[2];
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) deleteParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--type=')) type = arg.substring('--type='.length);
      else if (arg.startsWith('--id=')) deleteParams.id = Number(arg.split('=')[1]);
    });
    deleteParams.type = type;
    if (idArg && !idArg.startsWith('--')) {
      deleteParams.id = Number(idArg);
    }
    const res = await deleteEntity(deleteParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'auto-tag') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : 1;
    const context = await getCampaignContext(campaignId);
    let text = '';
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--input=')) text = arg.substring('--input='.length);
    });
    if (!text && args[1] && !args[1].startsWith('--') && args[2]) text = args[2];
    const tagged = autoTagEntities(text, context);
    console.log(tagged);
  } else if (command === 'clean-text') {
    const campaignId = args[1] && !args[1].startsWith('--') ? args[1] : 1;
    const context = await getCampaignContext(campaignId);
    let text = '';
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--input=')) text = arg.substring('--input='.length);
    });
    if (!text && args[1] && !args[1].startsWith('--') && args[2]) text = args[2];
    const clean = toCleanText(text, context);
    console.log(clean);
  } else if (command === 'list-weapons') {
    const query = args[1] || '';
    const results = await listWeapons(query);
    console.log(JSON.stringify(results, null, 2));
  } else if (command === 'calculate-pr') {
    const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();
    let weapons = [];
    let attributes = { Movement: 6, Wounds: 10, Save: 5, APL: 2, body: ['human'] };
    let abilities = [];

    args.slice(1).forEach(arg => {
      if (arg.startsWith('--weapons=')) {
        const rawW = arg.substring('--weapons='.length);
        weapons = rawW.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      if (arg.startsWith('--attributes=')) {
        const parsed = parseArgJson(arg.substring('--attributes='.length));
        if (parsed) attributes = parsed;
      }
      if (arg.startsWith('--abilities=')) {
        const parsed = parseArgJson(arg.substring('--abilities='.length));
        if (parsed && Array.isArray(parsed)) abilities = parsed;
      }
    });

    const validatedWeaponIds = validateWeaponsExist(weapons, allWeapons);
    const prRes = calculatePR({ attributes, weapons: validatedWeaponIds, abilities }, allWeapons, allRules);
    console.log(JSON.stringify(prRes, null, 2));
  } else if (command === 'create-npc') {
    const npcParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) npcParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) npcParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) npcParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) npcParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--role=')) npcParams.role = arg.substring('--role='.length);
      else if (arg.startsWith('--mission=')) npcParams.mission = arg.substring('--mission='.length);
      else if (arg.startsWith('--methods=')) npcParams.methods = arg.substring('--methods='.length);
      else if (arg.startsWith('--personality=')) npcParams.personality = arg.substring('--personality='.length);
      else if (arg.startsWith('--location=')) npcParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--bestiaryId=')) npcParams.bestiaryId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--reputation=')) npcParams.reputation = arg.substring('--reputation='.length);
      else if (arg.startsWith('--backstory=')) npcParams.backstory = arg.substring('--backstory='.length);
      else if (arg.startsWith('--description=')) npcParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--fleetSize=')) npcParams.fleetSize = arg.substring('--fleetSize='.length);
      else if (arg.startsWith('--flagship=')) npcParams.flagship = arg.substring('--flagship='.length);
      else if (arg.startsWith('--tactics=')) npcParams.tactics = arg.substring('--tactics='.length);
      else if (arg.startsWith('--motivations=')) npcParams.motivations = arg.substring('--motivations='.length);
      else if (arg.startsWith('--wargear=')) npcParams.wargear = parseArgJson(arg.substring('--wargear='.length)) || [];
      else if (arg.startsWith('--discovered=')) npcParams.discovered = arg.split('=')[1] === 'true';
    });
    const res = await createNPC(npcParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-npc') {
    const npcParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) npcParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--campaignId=')) npcParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) npcParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) npcParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) npcParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--role=')) npcParams.role = arg.substring('--role='.length);
      else if (arg.startsWith('--mission=')) npcParams.mission = arg.substring('--mission='.length);
      else if (arg.startsWith('--methods=')) npcParams.methods = arg.substring('--methods='.length);
      else if (arg.startsWith('--personality=')) npcParams.personality = arg.substring('--personality='.length);
      else if (arg.startsWith('--location=')) npcParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--bestiaryId=')) npcParams.bestiaryId = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
      else if (arg.startsWith('--reputation=')) npcParams.reputation = arg.substring('--reputation='.length);
      else if (arg.startsWith('--backstory=')) npcParams.backstory = arg.substring('--backstory='.length);
      else if (arg.startsWith('--description=')) npcParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--fleetSize=')) npcParams.fleetSize = arg.substring('--fleetSize='.length);
      else if (arg.startsWith('--flagship=')) npcParams.flagship = arg.substring('--flagship='.length);
      else if (arg.startsWith('--tactics=')) npcParams.tactics = arg.substring('--tactics='.length);
      else if (arg.startsWith('--motivations=')) npcParams.motivations = arg.substring('--motivations='.length);
      else if (arg.startsWith('--wargear=')) npcParams.wargear = parseArgJson(arg.substring('--wargear='.length));
      else if (arg.startsWith('--discovered=')) npcParams.discovered = arg.split('=')[1] === 'true';
    });
    const res = await updateNPC(npcParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-location') {
    const locParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) locParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) locParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) locParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--description=')) locParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--category=')) locParams.category = arg.substring('--category='.length);
      else if (arg.startsWith('--categorySize=')) locParams.categorySize = arg.substring('--categorySize='.length);
      else if (arg.startsWith('--isCapital=')) locParams.isCapital = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--isWorldMap=')) locParams.isWorldMap = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--mapX=')) locParams.mapX = Number(arg.split('=')[1]);
      else if (arg.startsWith('--mapY=')) locParams.mapY = Number(arg.split('=')[1]);
      else if (arg.startsWith('--discovered=')) locParams.discovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--privateNotes=')) locParams.privateNotes = arg.substring('--privateNotes='.length);
      else if (arg.startsWith('--secrets=')) locParams.secrets = parseArgJson(arg.substring('--secrets='.length));
      else if (arg.startsWith('--isSecret=')) locParams.isSecret = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--isSecretRevealed=')) locParams.isSecretRevealed = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--rpgMapLayout=')) locParams.rpgMapLayout = arg.substring('--rpgMapLayout='.length);
      else if (arg.startsWith('--notableFeatures=')) locParams.notableFeatures = parseArgJson(arg.substring('--notableFeatures='.length));
      else if (arg.startsWith('--shops=')) locParams.shops = parseArgJson(arg.substring('--shops='.length));
      else if (arg.startsWith('--imgUrl=')) locParams.imgUrl = arg.substring('--imgUrl='.length);
      else if (arg.startsWith('--thumbnail=')) locParams.thumbnail = arg.substring('--thumbnail='.length);
    });
    const res = await createLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-location') {
    const locParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) locParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--campaignId=')) locParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) locParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) locParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--description=')) locParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--category=')) locParams.category = arg.substring('--category='.length);
      else if (arg.startsWith('--categorySize=')) locParams.categorySize = arg.substring('--categorySize='.length);
      else if (arg.startsWith('--isCapital=')) locParams.isCapital = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--isWorldMap=')) locParams.isWorldMap = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--mapX=')) locParams.mapX = Number(arg.split('=')[1]);
      else if (arg.startsWith('--mapY=')) locParams.mapY = Number(arg.split('=')[1]);
      else if (arg.startsWith('--discovered=')) locParams.discovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--privateNotes=')) locParams.privateNotes = arg.substring('--privateNotes='.length);
      else if (arg.startsWith('--secrets=')) locParams.secrets = parseArgJson(arg.substring('--secrets='.length));
      else if (arg.startsWith('--isSecret=')) locParams.isSecret = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--isSecretRevealed=')) locParams.isSecretRevealed = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--rpgMapLayout=')) locParams.rpgMapLayout = arg.substring('--rpgMapLayout='.length);
      else if (arg.startsWith('--notableFeatures=')) locParams.notableFeatures = parseArgJson(arg.substring('--notableFeatures='.length));
      else if (arg.startsWith('--shops=')) locParams.shops = parseArgJson(arg.substring('--shops='.length));
      else if (arg.startsWith('--imgUrl=')) locParams.imgUrl = arg.substring('--imgUrl='.length);
      else if (arg.startsWith('--thumbnail=')) locParams.thumbnail = arg.substring('--thumbnail='.length);
    });
    const res = await updateLocation(locParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-shop') {
    const shopParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) shopParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) shopParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--owner=')) shopParams.owner = Number(arg.split('=')[1]);
      else if (arg.startsWith('--locationId=')) shopParams.locationId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--locationName=')) shopParams.locationName = arg.substring('--locationName='.length);
      else if (arg.startsWith('--location=')) shopParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--description=')) shopParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--discovered=')) shopParams.discovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--imgUrl=')) shopParams.imgUrl = arg.substring('--imgUrl='.length);
      else if (arg.startsWith('--thumbnail=')) shopParams.thumbnail = arg.substring('--thumbnail='.length);
      else if (arg.startsWith('--categories=')) {
        const raw = arg.substring('--categories='.length);
        shopParams.categories = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--paymentMethod=')) shopParams.paymentMethod = parseArgJson(arg.substring('--paymentMethod='.length));
      else if (arg.startsWith('--items=')) shopParams.items = parseArgJson(arg.substring('--items='.length));
    });
    const res = await createShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-shop') {
    const shopParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) shopParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--campaignId=')) shopParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) shopParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--owner=')) shopParams.owner = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
      else if (arg.startsWith('--locationId=')) shopParams.locationId = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
      else if (arg.startsWith('--locationName=')) shopParams.locationName = arg.substring('--locationName='.length);
      else if (arg.startsWith('--location=')) shopParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--description=')) shopParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--discovered=')) shopParams.discovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--imgUrl=')) shopParams.imgUrl = arg.substring('--imgUrl='.length);
      else if (arg.startsWith('--thumbnail=')) shopParams.thumbnail = arg.substring('--thumbnail='.length);
      else if (arg.startsWith('--categories=')) {
        const raw = arg.substring('--categories='.length);
        shopParams.categories = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--paymentMethod=')) shopParams.paymentMethod = parseArgJson(arg.substring('--paymentMethod='.length));
      else if (arg.startsWith('--items=')) shopParams.items = parseArgJson(arg.substring('--items='.length));
    });
    const res = await updateShop(shopParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-bestiary') {
    const bestiaryParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) bestiaryParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) bestiaryParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) bestiaryParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--weapons=')) {
        const rawW = arg.substring('--weapons='.length);
        bestiaryParams.weapons = rawW.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--attributes=')) bestiaryParams.attributes = parseArgJson(arg.substring('--attributes='.length));
      else if (arg.startsWith('--abilities=')) bestiaryParams.abilities = parseArgJson(arg.substring('--abilities='.length));
      else if (arg.startsWith('--deployables=')) bestiaryParams.deployables = parseArgJson(arg.substring('--deployables='.length));
      else if (arg.startsWith('--isDiscovered=')) bestiaryParams.isDiscovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--pr=')) bestiaryParams.pr = Number(arg.split('=')[1]);
    });
    const res = await createBestiaryEntry(bestiaryParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-bestiary') {
    const bestiaryParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) bestiaryParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) bestiaryParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) bestiaryParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) bestiaryParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--weapons=')) {
        const rawW = arg.substring('--weapons='.length);
        bestiaryParams.weapons = rawW.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--attributes=')) bestiaryParams.attributes = parseArgJson(arg.substring('--attributes='.length));
      else if (arg.startsWith('--abilities=')) bestiaryParams.abilities = parseArgJson(arg.substring('--abilities='.length));
      else if (arg.startsWith('--deployables=')) bestiaryParams.deployables = parseArgJson(arg.substring('--deployables='.length));
      else if (arg.startsWith('--isDiscovered=')) bestiaryParams.isDiscovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--pr=')) bestiaryParams.pr = Number(arg.split('=')[1]);
    });
    const res = await updateBestiaryEntry(bestiaryParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-combat-npc') {
    const combatParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) combatParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) combatParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--faction=')) combatParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) combatParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--role=')) combatParams.role = arg.substring('--role='.length);
      else if (arg.startsWith('--mission=')) combatParams.mission = arg.substring('--mission='.length);
      else if (arg.startsWith('--methods=')) combatParams.methods = arg.substring('--methods='.length);
      else if (arg.startsWith('--personality=')) combatParams.personality = arg.substring('--personality='.length);
      else if (arg.startsWith('--location=')) combatParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--reputation=')) combatParams.reputation = arg.substring('--reputation='.length);
      else if (arg.startsWith('--backstory=')) combatParams.backstory = arg.substring('--backstory='.length);
      else if (arg.startsWith('--description=')) combatParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--fleetSize=')) combatParams.fleetSize = arg.substring('--fleetSize='.length);
      else if (arg.startsWith('--flagship=')) combatParams.flagship = arg.substring('--flagship='.length);
      else if (arg.startsWith('--tactics=')) combatParams.tactics = arg.substring('--tactics='.length);
      else if (arg.startsWith('--motivations=')) combatParams.motivations = arg.substring('--motivations='.length);
      else if (arg.startsWith('--wargear=')) combatParams.wargear = parseArgJson(arg.substring('--wargear='.length)) || [];
      else if (arg.startsWith('--discovered=')) combatParams.discovered = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--weapons=')) {
        const rawW = arg.substring('--weapons='.length);
        combatParams.weapons = rawW.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--attributes=')) combatParams.attributes = parseArgJson(arg.substring('--attributes='.length));
      else if (arg.startsWith('--abilities=')) combatParams.abilities = parseArgJson(arg.substring('--abilities='.length));
      else if (arg.startsWith('--deployables=')) combatParams.deployables = parseArgJson(arg.substring('--deployables='.length));
    });
    const res = await createCombatNPC(combatParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-player') {
    const playerParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) playerParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--campaignId=')) playerParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) playerParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--race=')) playerParams.race = arg.substring('--race='.length);
      else if (arg.startsWith('--origin=')) playerParams.origin = arg.substring('--origin='.length);
      else if (arg.startsWith('--faction=')) playerParams.faction = arg.substring('--faction='.length);
      else if (arg.startsWith('--subgroup=')) playerParams.subgroup = arg.substring('--subgroup='.length);
      else if (arg.startsWith('--role=')) playerParams.role = arg.substring('--role='.length);
      else if (arg.startsWith('--personality=')) playerParams.personality = arg.substring('--personality='.length);
      else if (arg.startsWith('--location=')) playerParams.location = arg.substring('--location='.length);
      else if (arg.startsWith('--reputation=')) playerParams.reputation = arg.substring('--reputation='.length);
      else if (arg.startsWith('--backstory=')) playerParams.backstory = arg.substring('--backstory='.length);
      else if (arg.startsWith('--description=')) playerParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--weapons=')) {
        const rawW = arg.substring('--weapons='.length);
        playerParams.weapons = rawW.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--attributes=')) playerParams.attributes = parseArgJson(arg.substring('--attributes='.length));
      else if (arg.startsWith('--abilities=')) playerParams.abilities = parseArgJson(arg.substring('--abilities='.length));
      else if (arg.startsWith('--progression=')) playerParams.progression = parseArgJson(arg.substring('--progression='.length));
      else if (arg.startsWith('--items=')) playerParams.items = parseArgJson(arg.substring('--items='.length));
      else if (arg.startsWith('--talentPoints=')) playerParams.talentPoints = Number(arg.split('=')[1]);
      else if (arg.startsWith('--digitalMistrals=')) playerParams.digitalMistrals = Number(arg.split('=')[1]);
      else if (arg.startsWith('--physicalMistrals=')) playerParams.physicalMistrals = Number(arg.split('=')[1]);
    });
    const res = await updatePlayer(playerParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-letter') {
    const letterParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) letterParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--subject=')) letterParams.subject = arg.substring('--subject='.length);
      else if (arg.startsWith('--senderId=')) letterParams.senderId = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
      else if (arg.startsWith('--senderName=')) letterParams.senderName = arg.substring('--senderName='.length);
      else if (arg.startsWith('--message=')) letterParams.message = arg.substring('--message='.length);
      else if (arg.startsWith('--date=')) letterParams.date = arg.substring('--date='.length);
      else if (arg.startsWith('--readBy=')) {
        const raw = arg.substring('--readBy='.length);
        letterParams.readBy = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--recipientIds=')) {
        const raw = arg.substring('--recipientIds='.length);
        letterParams.recipientIds = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--targetNames=')) {
        letterParams.targetNames = parseArgJson(arg.substring('--targetNames='.length)) || arg.substring('--targetNames='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
    });
    const res = await createLetter(letterParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-letter') {
    const letterParams = { campaignId: 1 };
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) letterParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--campaignId=')) letterParams.campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--subject=')) letterParams.subject = arg.substring('--subject='.length);
      else if (arg.startsWith('--senderId=')) letterParams.senderId = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
      else if (arg.startsWith('--senderName=')) letterParams.senderName = arg.substring('--senderName='.length);
      else if (arg.startsWith('--message=')) letterParams.message = arg.substring('--message='.length);
      else if (arg.startsWith('--date=')) letterParams.date = arg.substring('--date='.length);
      else if (arg.startsWith('--readBy=')) {
        const raw = arg.substring('--readBy='.length);
        letterParams.readBy = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--recipientIds=')) {
        const raw = arg.substring('--recipientIds='.length);
        letterParams.recipientIds = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      }
      else if (arg.startsWith('--targetNames=')) {
        letterParams.targetNames = parseArgJson(arg.substring('--targetNames='.length)) || arg.substring('--targetNames='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
      else if (arg.startsWith('--isDeleted=')) letterParams.isDeleted = arg.split('=')[1] === 'true';
    });
    const res = await updateLetter(letterParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-item') {
    const itemParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) itemParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--price=')) itemParams.price = Number(arg.split('=')[1]);
      else if (arg.startsWith('--description=')) itemParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--type=')) itemParams.type = arg.substring('--type='.length);
      else if (arg.startsWith('--subtype=')) itemParams.subtype = arg.substring('--subtype='.length);
      else if (arg.startsWith('--raceReq=')) itemParams.raceReq = arg.substring('--raceReq='.length);
      else if (arg.startsWith('--quantity=')) itemParams.quantity = Number(arg.split('=')[1]);
      else if (arg.startsWith('--isEquippable=')) itemParams.isEquippable = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--statModifications=')) itemParams.statModifications = parseArgJson(arg.substring('--statModifications='.length));
    });
    const res = await createItem(itemParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-item') {
    const itemParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) itemParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) itemParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--price=')) itemParams.price = Number(arg.split('=')[1]);
      else if (arg.startsWith('--description=')) itemParams.description = arg.substring('--description='.length);
      else if (arg.startsWith('--type=')) itemParams.type = arg.substring('--type='.length);
      else if (arg.startsWith('--subtype=')) itemParams.subtype = arg.substring('--subtype='.length);
      else if (arg.startsWith('--raceReq=')) itemParams.raceReq = arg.substring('--raceReq='.length);
      else if (arg.startsWith('--quantity=')) itemParams.quantity = Number(arg.split('=')[1]);
      else if (arg.startsWith('--isEquippable=')) itemParams.isEquippable = arg.split('=')[1] === 'true';
      else if (arg.startsWith('--statModifications=')) itemParams.statModifications = parseArgJson(arg.substring('--statModifications='.length));
    });
    const res = await updateItem(itemParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-weapon') {
    const weaponParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) weaponParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--price=')) weaponParams.price = Number(arg.split('=')[1]);
      else if (arg.startsWith('--profiles=')) weaponParams.profiles = parseArgJson(arg.substring('--profiles='.length));
    });
    const res = await createWeapon(weaponParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-weapon') {
    const weaponParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) weaponParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) weaponParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--price=')) weaponParams.price = Number(arg.split('=')[1]);
      else if (arg.startsWith('--profiles=')) weaponParams.profiles = parseArgJson(arg.substring('--profiles='.length));
    });
    const res = await updateWeapon(weaponParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-weapon-rule') {
    const ruleParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) ruleParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) ruleParams.effect = arg.substring('--effect='.length);
      else if (arg.startsWith('--prModifier=')) ruleParams.prModifier = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
    });
    const res = await createWeaponRule(ruleParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-weapon-rule') {
    const ruleParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) ruleParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) ruleParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) ruleParams.effect = arg.substring('--effect='.length);
      else if (arg.startsWith('--prModifier=')) ruleParams.prModifier = arg.split('=')[1] === 'null' ? null : Number(arg.split('=')[1]);
    });
    const res = await updateWeaponRule(ruleParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-altered-state') {
    const stateParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) stateParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) stateParams.effect = arg.substring('--effect='.length);
    });
    const res = await createAlteredState(stateParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-altered-state') {
    const stateParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) stateParams.id = Number(arg.split('=')[1]);
      else if (arg.startsWith('--name=')) stateParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) stateParams.effect = arg.substring('--effect='.length);
    });
    const res = await updateAlteredState(stateParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'create-affliction') {
    const affParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--name=')) affParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) affParams.effect = arg.substring('--effect='.length);
      else if (arg.startsWith('--treatment=')) affParams.treatment = arg.substring('--treatment='.length);
      else if (arg.startsWith('--toHeal=')) affParams.toHeal = Number(arg.split('=')[1]);
      else if (arg.startsWith('--progress=')) affParams.progress = Number(arg.split('=')[1]);
      else if (arg.startsWith('--statModifications=')) affParams.statModifications = parseArgJson(arg.substring('--statModifications='.length));
    });
    const res = await createAffliction(affParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'update-affliction') {
    const affParams = {};
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--id=')) affParams.id = arg.split('=')[1];
      else if (arg.startsWith('--name=')) affParams.name = arg.substring('--name='.length);
      else if (arg.startsWith('--effect=')) affParams.effect = arg.substring('--effect='.length);
      else if (arg.startsWith('--treatment=')) affParams.treatment = arg.substring('--treatment='.length);
      else if (arg.startsWith('--toHeal=')) affParams.toHeal = Number(arg.split('=')[1]);
      else if (arg.startsWith('--progress=')) affParams.progress = Number(arg.split('=')[1]);
      else if (arg.startsWith('--statModifications=')) affParams.statModifications = parseArgJson(arg.substring('--statModifications='.length));
    });
    const res = await updateAffliction(affParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'save') {
    let campaignId = 1;
    let sessionId = 1;
    let content = '';
    let conclussion = '';
    let playerVisibleBranches = [];
    let autoTag = true;

    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--sessionId=')) sessionId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--content=')) content = arg.substring('--content='.length);
      else if (arg.startsWith('--conclussion=')) conclussion = arg.substring('--conclussion='.length);
      else if (arg.startsWith('--playerVisibleBranches=')) {
        playerVisibleBranches = arg.substring('--playerVisibleBranches='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
      else if (arg.startsWith('--branches=')) {
        playerVisibleBranches = arg.substring('--branches='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
      else if (arg === '--no-auto-tag') {
        autoTag = false;
      }
    });

    const res = await saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches, autoTag });
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'finalize') {
    let campaignId = 1;
    let sessionId = 1;
    let conclussion = '';
    let playerVisibleBranches = undefined;
    let autoTag = true;

    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) campaignId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--sessionId=')) sessionId = Number(arg.split('=')[1]);
      else if (arg.startsWith('--conclussion=')) conclussion = arg.substring('--conclussion='.length);
      else if (arg.startsWith('--playerVisibleBranches=')) {
        playerVisibleBranches = arg.substring('--playerVisibleBranches='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
      else if (arg.startsWith('--branches=')) {
        playerVisibleBranches = arg.substring('--branches='.length).split(',').map(s => s.trim()).filter(Boolean);
      }
      else if (arg === '--no-auto-tag') {
        autoTag = false;
      }
    });

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
