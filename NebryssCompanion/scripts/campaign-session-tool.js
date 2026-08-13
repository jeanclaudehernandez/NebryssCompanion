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

function writeJsonFallback(filename, data) {
  const localPath = path.join(localDbDir, filename);
  const assetPath = path.join(assetsDir, filename);
  const jsonStr = JSON.stringify(data, null, 2);
  try {
    if (!fs.existsSync(path.dirname(localPath))) fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, jsonStr, 'utf8');
  } catch (e) {}
  try {
    if (!fs.existsSync(path.dirname(assetPath))) fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, jsonStr, 'utf8');
  } catch (e) {}
}

const ENTITY_REGEX = /@(player|npc|location|shop|bestiary)\[([^\]]+)\]/g;

function cleanString(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
  let list = [];
  if (type === 'player') list = context.players || [];
  else if (type === 'npc') list = context.npcs || [];
  else if (type === 'location') list = context.locations || [];
  else if (type === 'shop') list = context.shops || [];
  else if (type === 'bestiary') list = context.bestiary || [];

  const exact = list.find(item => cleanString(item.name) === cleaned || String(item.id) === raw);
  if (exact) return exact.id;

  const partial = list.find(item => cleanString(item.name).includes(cleaned) || cleaned.includes(cleanString(item.name)));
  if (partial) return partial.id;

  return raw;
}

function findEntityName(type, id, context) {
  let list = [];
  if (type === 'player') list = context.players || [];
  else if (type === 'npc') list = context.npcs || [];
  else if (type === 'location') list = context.locations || [];
  else if (type === 'shop') list = context.shops || [];
  else if (type === 'bestiary') list = context.bestiary || [];

  const found = list.find(item => String(item.id) === String(id));
  return found ? found.name : null;
}

function normalizeToIdTags(text, context) {
  if (!text) return '';
  return text.replace(ENTITY_REGEX, (match, type, content) => {
    const id = findEntityId(type, content, context);
    return `@${type}[${id}]`;
  });
}

function expandToDisplayTags(text, context) {
  if (!text) return '';
  return text.replace(ENTITY_REGEX, (match, type, content) => {
    const raw = String(content).trim();
    if (/^\d+$/.test(raw)) {
      const name = findEntityName(type, Number(raw), context);
      return name ? `@${type}[${raw}: ${name}]` : match;
    }
    return match;
  });
}

function toCleanText(text, context) {
  if (!text) return '';
  return text.replace(ENTITY_REGEX, (match, type, content) => {
    const raw = String(content).trim();
    let name = null;
    if (/^\d+$/.test(raw)) {
      name = findEntityName(type, Number(raw), context);
    } else if (raw.includes(':')) {
      const parts = raw.split(':');
      name = parts.slice(1).join(':').trim();
    } else {
      const id = findEntityId(type, raw, context);
      name = findEntityName(type, id, context) || raw;
    }
    return name || match;
  });
}

function autoTagEntities(text, context) {
  if (!text) return '';
  let result = text;

  // First, normalize any existing tag syntax like @player[Wendy] -> @player[1]
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

  // Sort longest names first
  candidates.sort((a, b) => b.name.length - a.name.length);

  // Replace occurrences not already inside a tag
  for (const cand of candidates) {
    if (cand.name.length < 3) continue; // skip too-short names to avoid false positives
    const escapedName = cand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<!@(?:player|npc|location|shop|bestiary)\\[[^\\]]*)(?:^|(?<=[^\\p{L}\\p{N}_]))${escapedName}(?:(?=[^\\p{L}\\p{N}_])|$)`, 'gu');
    result = result.replace(pattern, `@${cand.type}[${cand.id}]`);
  }

  return result;
}

function parseEntities(text, context = null) {
  if (!text) return [];
  const matches = [];
  let match;
  const regex = new RegExp(ENTITY_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const type = match[1];
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
      weaponRules = await mainDb.collection('weaponRule').find().toArray();
    } finally {
      await client.close();
    }
  }
  if (!weapons.length) {
    weapons = readJsonFallback('weapons.json');
  }
  if (!weaponRules.length) {
    weaponRules = readJsonFallback('weaponRules.json');
  }
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

      shops = await playersDb.collection(`${prefix}-shop`).find().toArray();
      if (!shops.length) shops = await playersDb.collection('shop').find().toArray();

      bestiary = await mainDb.collection('bestiary').find().toArray();
      weapons = await mainDb.collection('weapon').find().toArray();
      weaponRules = await mainDb.collection('weaponRule').find().toArray();
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
  }

  if (!weapons.length) weapons = readJsonFallback('weapons.json');
  if (!weaponRules.length) weaponRules = readJsonFallback('weaponRules.json');

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
    weaponRules: weaponRules.map(r => ({ id: r.id, name: r.name, effect: r.effect, prModifier: r.prModifier }))
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
  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: processedContent,
    conclussion: processedConclussion,
    playerVisibleBranches: branchesArray
  };

  let resultDoc = null;

  if (client) {
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
        resultDoc = { ...existing, ...sessionDoc };
      } else {
        const all = await collection.find().toArray();
        const maxId = all.reduce((m, s) => (s.id && typeof s.id === 'number' && s.id > m ? s.id : m), 0);
        sessionDoc.id = maxId + 1;
        const res = await collection.insertOne(sessionDoc);
        resultDoc = { _id: res.insertedId, ...sessionDoc };
      }
    } finally {
      await client.close();
    }
  }

  const allJson = readJsonFallback('campaignSessions.json');
  const idx = allJson.findIndex(s => Number(s.campaignId) === Number(campaignId) && Number(s.sessionId) === Number(sessionId));
  if (idx !== -1) {
    allJson[idx] = { ...allJson[idx], ...sessionDoc };
  } else {
    if (!sessionDoc.id) {
      sessionDoc.id = allJson.reduce((m, s) => (s.id && typeof s.id === 'number' && s.id > m ? s.id : m), 0) + 1;
    }
    allJson.push(sessionDoc);
  }
  writeJsonFallback('campaignSession.json', allJson);
  writeJsonFallback('campaignSessions.json', allJson);

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
  let updated = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const collection = mainDb.collection('campaignSession');
      const query = {
        campaignId: Number(campaignId),
        sessionId: Number(sessionId)
      };
      const existing = await collection.findOne(query);
      if (existing) {
        const updateFields = { conclussion: processedConclussion };
        if (branchesArray !== undefined) {
          updateFields.playerVisibleBranches = branchesArray;
        }
        await collection.updateOne({ _id: existing._id }, { $set: updateFields });
        updated = { ...existing, ...updateFields };
      }
    } finally {
      await client.close();
    }
  }

  const allJson = readJsonFallback('campaignSessions.json');
  const idx = allJson.findIndex(s => Number(s.campaignId) === Number(campaignId) && Number(s.sessionId) === Number(sessionId));
  if (idx !== -1) {
    allJson[idx].conclussion = processedConclussion;
    if (branchesArray !== undefined) {
      allJson[idx].playerVisibleBranches = branchesArray;
    }
    writeJsonFallback('campaignSession.json', allJson);
    writeJsonFallback('campaignSessions.json', allJson);
    if (!updated) updated = allJson[idx];
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
  let prefix = 'nebryss-voss-succession';
  let existingNpcs = [];

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      existingNpcs = await playersDb.collection(`${prefix}-npc`).find().toArray();
      if (!existingNpcs.length) {
        existingNpcs = await playersDb.collection('npc').find().toArray();
      }
    } finally {
      await client.close();
    }
  }

  const jsonNpcs = readJsonFallback('npcs.json');
  const allExisting = [...existingNpcs, ...jsonNpcs];
  const maxId = allExisting.reduce((max, n) => (n && typeof n.id === 'number' && n.id > max ? n.id : max), 0);
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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-npc`).insertOne({ ...npcDoc });
      const genericCol = playersDb.collection('npc');
      const genExists = await genericCol.findOne({ id: newId });
      if (!genExists) {
        await genericCol.insertOne({ ...npcDoc });
      }
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonNpcs.filter(n => n.id !== newId);
  updatedJson.push(npcDoc);
  writeJsonFallback('npc.json', updatedJson);
  writeJsonFallback('npcs.json', updatedJson);

  return {
    ...npcDoc,
    entityTag: `@npc[${npcDoc.id}]`,
    displayTag: `@npc[${npcDoc.id}: ${npcDoc.name}]`
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

  const client = await getClient();
  let existingBestiary = [];
  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      existingBestiary = await mainDb.collection('bestiary').find().toArray();
    } finally {
      await client.close();
    }
  }
  const jsonBestiary = readJsonFallback('bestiary.json');
  const allExisting = [...existingBestiary, ...jsonBestiary];
  const maxId = allExisting.reduce((max, b) => (b && typeof b.id === 'number' && b.id > max ? b.id : max), 0);
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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const mainDb = writeClient.db(mainDbName);
      await mainDb.collection('bestiary').insertOne({ ...bestiaryDoc });
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonBestiary.filter(b => b.id !== newId);
  updatedJson.push(bestiaryDoc);
  writeJsonFallback('bestiary.json', updatedJson);
  writeJsonFallback('bestiaries.json', updatedJson);

  return {
    ...bestiaryDoc,
    prBreakdown,
    entityTag: `@bestiary[${bestiaryDoc.id}]`,
    displayTag: `@bestiary[${bestiaryDoc.id}: ${bestiaryDoc.name}]`
  };
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
    isDiscovered: discovered
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
  let prefix = 'nebryss-voss-succession';
  let existingLocations = [];

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      existingLocations = await playersDb.collection(`${prefix}-location`).find().toArray();
      if (!existingLocations.length) {
        existingLocations = await playersDb.collection('location').find().toArray();
      }
      if (!existingLocations.length) {
        existingLocations = await mainDb.collection('location').find().toArray();
      }
    } finally {
      await client.close();
    }
  }

  const jsonLocations = readJsonFallback('locations.json');
  const allExisting = [...existingLocations, ...jsonLocations];
  const maxId = allExisting.reduce((max, l) => (l && typeof l.id === 'number' && l.id > max ? l.id : max), 0);
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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-location`).insertOne({ ...locationDoc });
      const genericCol = playersDb.collection('location');
      const genExists = await genericCol.findOne({ id: newId });
      if (!genExists) {
        await genericCol.insertOne({ ...locationDoc });
      }
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonLocations.filter(l => l.id !== newId);
  updatedJson.push(locationDoc);
  writeJsonFallback('location.json', updatedJson);
  writeJsonFallback('locations.json', updatedJson);

  return {
    ...locationDoc,
    entityTag: `@location[${locationDoc.id}]`,
    displayTag: `@location[${locationDoc.id}: ${locationDoc.name}]`
  };
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
  let prefix = 'nebryss-voss-succession';
  let existingShops = [];

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      existingShops = await playersDb.collection(`${prefix}-shop`).find().toArray();
      if (!existingShops.length) {
        existingShops = await playersDb.collection('shop').find().toArray();
      }
    } finally {
      await client.close();
    }
  }

  const jsonShops = readJsonFallback('shops.json');
  const allExisting = [...existingShops, ...jsonShops];
  const maxId = allExisting.reduce((max, s) => (s && typeof s.id === 'number' && s.id > max ? s.id : max), 0);
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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-shop`).insertOne({ ...shopDoc });
      const genericCol = playersDb.collection('shop');
      const genExists = await genericCol.findOne({ id: newId });
      if (!genExists) {
        await genericCol.insertOne({ ...shopDoc });
      }
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonShops.filter(s => s.id !== newId);
  updatedJson.push(shopDoc);
  writeJsonFallback('shop.json', updatedJson);
  writeJsonFallback('shops.json', updatedJson);

  return {
    ...shopDoc,
    entityTag: `@shop[${shopDoc.id}]`,
    displayTag: `@shop[${shopDoc.id}: ${shopDoc.name}]`
  };
}

async function updatePlayer(playerUpdateData) {
  const { id, campaignId = 1, ...updates } = playerUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updatePlayer requires an "id" property to identify the player.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let targetPlayer = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      const col = playersDb.collection(`${prefix}-player`);
      targetPlayer = await col.findOne({ id: numericId });
      if (!targetPlayer) {
        targetPlayer = await playersDb.collection('player').findOne({ id: numericId });
      }
    } finally {
      await client.close();
    }
  }

  const jsonPlayers = readJsonFallback('players.json');
  if (!targetPlayer) {
    targetPlayer = jsonPlayers.find(p => p.id === numericId);
  }

  if (!targetPlayer) {
    throw new Error(`Player with ID ${numericId} not found in database or local storage.`);
  }

  // Merge attributes safely if provided
  let finalAttributes = targetPlayer.attributes;
  if (updates.attributes && typeof updates.attributes === 'object') {
    finalAttributes = {
      ...(targetPlayer.attributes || {}),
      ...updates.attributes
    };
  }

  // Merge progression safely if provided
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

  // Merge weapons if provided
  let finalWeapons = targetPlayer.weapons;
  if (Array.isArray(updates.weapons)) {
    finalWeapons = updates.weapons.map(Number).filter(n => !isNaN(n));
  }

  // Merge items / inventory if provided
  let finalItems = targetPlayer.items;
  if (Array.isArray(updates.items)) {
    finalItems = updates.items;
  }

  // Merge abilities if provided
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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-player`).updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
      await playersDb.collection('player').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    } finally {
      await writeClient.close();
    }
  }

  // Note: Per design constraints, player updates are persisted strictly to MongoDB without modifying local JSON files.

  return {
    ...updatedDoc,
    entityTag: `@player[${updatedDoc.id}]`,
    displayTag: `@player[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function updateNPC(npcUpdateData) {
  const { id, campaignId = 1, ...updates } = npcUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateNPC requires an "id" property to identify the NPC.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let targetNPC = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      const col = playersDb.collection(`${prefix}-npc`);
      targetNPC = await col.findOne({ id: numericId });
      if (!targetNPC) {
        targetNPC = await playersDb.collection('npc').findOne({ id: numericId });
      }
    } finally {
      await client.close();
    }
  }

  const jsonNpcs = readJsonFallback('npcs.json');
  if (!targetNPC) {
    targetNPC = jsonNpcs.find(n => n.id === numericId);
  }

  if (!targetNPC) {
    throw new Error(`NPC with ID ${numericId} not found in database or local storage.`);
  }

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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-npc`).updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
      await playersDb.collection('npc').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonNpcs.filter(n => n.id !== numericId);
  updatedJson.push(updatedDoc);
  writeJsonFallback('npc.json', updatedJson);
  writeJsonFallback('npcs.json', updatedJson);

  return {
    ...updatedDoc,
    entityTag: `@npc[${updatedDoc.id}]`,
    displayTag: `@npc[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function updateLocation(locationUpdateData) {
  const { id, campaignId = 1, ...updates } = locationUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateLocation requires an "id" property to identify the location.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let targetLoc = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      const col = playersDb.collection(`${prefix}-location`);
      targetLoc = await col.findOne({ id: numericId });
      if (!targetLoc) targetLoc = await playersDb.collection('location').findOne({ id: numericId });
      if (!targetLoc) targetLoc = await mainDb.collection('location').findOne({ id: numericId });
    } finally {
      await client.close();
    }
  }

  const jsonLocations = readJsonFallback('locations.json');
  if (!targetLoc) {
    targetLoc = jsonLocations.find(l => l.id === numericId);
  }

  if (!targetLoc) {
    throw new Error(`Location with ID ${numericId} not found in database or local storage.`);
  }

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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-location`).updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
      await playersDb.collection('location').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonLocations.filter(l => l.id !== numericId);
  updatedJson.push(updatedDoc);
  writeJsonFallback('location.json', updatedJson);
  writeJsonFallback('locations.json', updatedJson);

  return {
    ...updatedDoc,
    entityTag: `@location[${updatedDoc.id}]`,
    displayTag: `@location[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function updateShop(shopUpdateData) {
  const { id, campaignId = 1, ...updates } = shopUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateShop requires an "id" property to identify the shop.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let targetShop = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      const col = playersDb.collection(`${prefix}-shop`);
      targetShop = await col.findOne({ id: numericId });
      if (!targetShop) targetShop = await playersDb.collection('shop').findOne({ id: numericId });
    } finally {
      await client.close();
    }
  }

  const jsonShops = readJsonFallback('shops.json');
  if (!targetShop) {
    targetShop = jsonShops.find(s => s.id === numericId);
  }

  if (!targetShop) {
    throw new Error(`Shop with ID ${numericId} not found in database or local storage.`);
  }

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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const playersDb = writeClient.db(playersDbName);
      await playersDb.collection(`${prefix}-shop`).updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
      await playersDb.collection('shop').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonShops.filter(s => s.id !== numericId);
  updatedJson.push(updatedDoc);
  writeJsonFallback('shop.json', updatedJson);
  writeJsonFallback('shops.json', updatedJson);

  return {
    ...updatedDoc,
    entityTag: `@shop[${updatedDoc.id}]`,
    displayTag: `@shop[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function updateBestiaryEntry(bestiaryUpdateData) {
  const { id, ...updates } = bestiaryUpdateData;
  if (id === undefined || id === null) {
    throw new Error('updateBestiaryEntry requires an "id" property to identify the creature.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let targetBestiary = null;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      targetBestiary = await mainDb.collection('bestiary').findOne({ id: numericId });
    } finally {
      await client.close();
    }
  }

  const jsonBestiary = readJsonFallback('bestiary.json');
  if (!targetBestiary) {
    targetBestiary = jsonBestiary.find(b => b.id === numericId);
  }

  if (!targetBestiary) {
    throw new Error(`Bestiary entry with ID ${numericId} not found in database or local storage.`);
  }

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

  const writeClient = await getClient();
  if (writeClient) {
    try {
      const mainDb = writeClient.db(mainDbName);
      await mainDb.collection('bestiary').updateOne({ id: numericId }, { $set: updatedDoc }, { upsert: true });
    } finally {
      await writeClient.close();
    }
  }

  const updatedJson = jsonBestiary.filter(b => b.id !== numericId);
  updatedJson.push(updatedDoc);
  writeJsonFallback('bestiary.json', updatedJson);
  writeJsonFallback('bestiaries.json', updatedJson);

  return {
    ...updatedDoc,
    prBreakdown,
    entityTag: `@bestiary[${updatedDoc.id}]`,
    displayTag: `@bestiary[${updatedDoc.id}: ${updatedDoc.name}]`
  };
}

async function readEntities({ type, campaignId = 1, filter = {}, search = '', limit = null }) {
  const normalizedType = String(type || '').toLowerCase().trim();
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

      if (normalizedType === 'player' || normalizedType === 'players') {
        docs = await playersDb.collection(`${prefix}-player`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('player').find().toArray();
      } else if (normalizedType === 'npc' || normalizedType === 'npcs') {
        docs = await playersDb.collection(`${prefix}-npc`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('npc').find().toArray();
      } else if (normalizedType === 'location' || normalizedType === 'locations') {
        docs = await playersDb.collection(`${prefix}-location`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('location').find().toArray();
      } else if (normalizedType === 'shop' || normalizedType === 'shops') {
        docs = await playersDb.collection(`${prefix}-shop`).find().toArray();
        if (!docs.length) docs = await playersDb.collection('shop').find().toArray();
      } else if (normalizedType === 'bestiary' || normalizedType === 'creature' || normalizedType === 'creatures') {
        docs = await mainDb.collection('bestiary').find().toArray();
      } else if (normalizedType === 'session' || normalizedType === 'sessions' || normalizedType === 'campaignsession') {
        docs = await mainDb.collection('campaignSession').find({ campaignId: Number(campaignId) }).toArray();
      } else if (normalizedType === 'weapon' || normalizedType === 'weapons') {
        docs = await mainDb.collection('weapon').find().toArray();
        if (!docs.length) docs = await mainDb.collection('weapons').find().toArray();
      } else if (normalizedType === 'weaponrule' || normalizedType === 'weaponrules') {
        docs = await mainDb.collection('weaponRule').find().toArray();
        if (!docs.length) docs = await mainDb.collection('weaponRules').find().toArray();
      } else if (normalizedType === 'talent' || normalizedType === 'talents') {
        docs = await mainDb.collection('talent').find().toArray();
        if (!docs.length) docs = await mainDb.collection('talents').find().toArray();
      } else if (normalizedType === 'affliction' || normalizedType === 'afflictions') {
        docs = await mainDb.collection('affliction').find().toArray();
        if (!docs.length) docs = await mainDb.collection('afflictions').find().toArray();
      } else if (normalizedType === 'alteredstate' || normalizedType === 'alteredstates' || normalizedType === 'status') {
        docs = await mainDb.collection('alteredState').find().toArray();
        if (!docs.length) docs = await mainDb.collection('status').find().toArray();
      } else {
        throw new Error(`Unknown entity type "${type}". Allowed types: player, npc, location, shop, bestiary, session, weapon, weaponRule, talent, affliction, alteredState.`);
      }
    } finally {
      await client.close();
    }
  }

  // If no docs from DB, fallback to JSON files
  if (!docs || docs.length === 0) {
    if (normalizedType === 'player' || normalizedType === 'players') {
      docs = readJsonFallback('players.json');
    } else if (normalizedType === 'npc' || normalizedType === 'npcs') {
      docs = readJsonFallback('npcs.json');
    } else if (normalizedType === 'location' || normalizedType === 'locations') {
      docs = readJsonFallback('locations.json');
    } else if (normalizedType === 'shop' || normalizedType === 'shops') {
      docs = readJsonFallback('shops.json');
    } else if (normalizedType === 'bestiary' || normalizedType === 'creature' || normalizedType === 'creatures') {
      docs = readJsonFallback('bestiary.json');
    } else if (normalizedType === 'session' || normalizedType === 'sessions' || normalizedType === 'campaignsession') {
      docs = readJsonFallback('campaignSessions.json').filter(s => Number(s.campaignId) === Number(campaignId));
    } else if (normalizedType === 'weapon' || normalizedType === 'weapons') {
      docs = readJsonFallback('weapons.json');
    } else if (normalizedType === 'weaponrule' || normalizedType === 'weaponrules') {
      docs = readJsonFallback('weaponRules.json');
    } else if (normalizedType === 'talent' || normalizedType === 'talents') {
      docs = readJsonFallback('talents.json');
    } else if (normalizedType === 'affliction' || normalizedType === 'afflictions') {
      docs = readJsonFallback('afflictions.json');
    } else if (normalizedType === 'alteredstate' || normalizedType === 'alteredstates' || normalizedType === 'status') {
      docs = readJsonFallback('alteredStates.json');
    }
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
      const matchName = item.name && String(item.name).toLowerCase().includes(q);
      const matchDesc = item.description && String(item.description).toLowerCase().includes(q);
      const matchLore = item.lore && String(item.lore).toLowerCase().includes(q);
      const matchFaction = item.faction && String(item.faction).toLowerCase().includes(q);
      const matchRole = item.role && String(item.role).toLowerCase().includes(q);
      const matchLocation = (item.location || item.locationName) && String(item.location || item.locationName).toLowerCase().includes(q);
      const matchId = String(item.id) === q;
      return matchName || matchDesc || matchLore || matchFaction || matchRole || matchLocation || matchId;
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
    const exact = docs.find(d => cleanString(d.name) === cleaned || String(d.id) === String(name));
    if (exact) return exact;
    const partial = docs.find(d => cleanString(d.name).includes(cleaned) || cleaned.includes(cleanString(d.name)));
    if (partial) return partial;
  }
  return null;
}

async function deleteEntity({ type, id, campaignId = 1 }) {
  const normalizedType = String(type || '').toLowerCase().trim();
  if (id === undefined || id === null) {
    throw new Error('deleteEntity requires an "id" property.');
  }

  const numericId = Number(id);
  const client = await getClient();
  let prefix = 'nebryss-voss-succession';
  let deletedFromDb = false;

  if (client) {
    try {
      const mainDb = client.db(mainDbName);
      const playersDb = client.db(playersDbName);
      const campaigns = await mainDb.collection('campaign').find().toArray();
      const campaign = campaigns.find(c => c.id === Number(campaignId) || String(c.name).toLowerCase() === String(campaignId).toLowerCase()) || campaigns[0];
      prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      if (normalizedType === 'player') {
        await playersDb.collection(`${prefix}-player`).deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        await playersDb.collection('player').deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        deletedFromDb = true;
      } else if (normalizedType === 'npc') {
        await playersDb.collection(`${prefix}-npc`).deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        await playersDb.collection('npc').deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        deletedFromDb = true;
      } else if (normalizedType === 'location') {
        await playersDb.collection(`${prefix}-location`).deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        await playersDb.collection('location').deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        deletedFromDb = true;
      } else if (normalizedType === 'shop') {
        await playersDb.collection(`${prefix}-shop`).deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        await playersDb.collection('shop').deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        deletedFromDb = true;
      } else if (normalizedType === 'bestiary') {
        await mainDb.collection('bestiary').deleteOne({ $or: [{ id: numericId }, { id: String(numericId) }] });
        deletedFromDb = true;
      } else if (normalizedType === 'session') {
        await mainDb.collection('campaignSession').deleteOne({ campaignId: Number(campaignId), sessionId: numericId });
        deletedFromDb = true;
      } else {
        throw new Error(`Unknown or unsupported entity type for delete: "${type}".`);
      }
    } finally {
      await client.close();
    }
  }

  // For non-player entities, also update local JSON files
  if (normalizedType === 'npc') {
    const jsonDocs = readJsonFallback('npcs.json').filter(n => Number(n.id) !== numericId);
    writeJsonFallback('npc.json', jsonDocs);
    writeJsonFallback('npcs.json', jsonDocs);
  } else if (normalizedType === 'location') {
    const jsonDocs = readJsonFallback('locations.json').filter(l => Number(l.id) !== numericId);
    writeJsonFallback('location.json', jsonDocs);
    writeJsonFallback('locations.json', jsonDocs);
  } else if (normalizedType === 'shop') {
    const jsonDocs = readJsonFallback('shops.json').filter(s => Number(s.id) !== numericId);
    writeJsonFallback('shop.json', jsonDocs);
    writeJsonFallback('shops.json', jsonDocs);
  } else if (normalizedType === 'bestiary') {
    const jsonDocs = readJsonFallback('bestiary.json').filter(b => Number(b.id) !== numericId);
    writeJsonFallback('bestiary.json', jsonDocs);
    writeJsonFallback('bestiaries.json', jsonDocs);
  } else if (normalizedType === 'session') {
    const jsonDocs = readJsonFallback('campaignSessions.json').filter(s => !(Number(s.campaignId) === Number(campaignId) && Number(s.sessionId) === numericId));
    writeJsonFallback('campaignSession.json', jsonDocs);
    writeJsonFallback('campaignSessions.json', jsonDocs);
  }

  return {
    success: true,
    type: normalizedType,
    id: numericId,
    campaignId: Number(campaignId),
    deletedFromDb,
    message: `Successfully deleted ${normalizedType} with ID ${numericId}`
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

function readFileContentSafe(filePath) {
  if (!filePath) return null;
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (fs.existsSync(resolved)) {
    return fs.readFileSync(resolved, 'utf8');
  }
  return null;
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    console.log(`
Nebryss Campaign Session Tool v2.1
Usage:
  node scripts/campaign-session-tool.js get-context [campaignId]
  node scripts/campaign-session-tool.js list [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-latest [campaignId] [--clean | --expand]
  node scripts/campaign-session-tool.js get-entity <player|npc|location|shop|bestiary> [id or name] [--campaignId=1]
  node scripts/campaign-session-tool.js auto-tag [campaignId] [--input="..." | --file="..."]
  node scripts/campaign-session-tool.js clean-text [campaignId] [--input="..." | --file="..."]
  node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 [--content="..." | --content-file="..."] [--conclussion="..." | --conclussion-file="..."] [--branches="..."]
  node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 [--conclussion="..." | --conclussion-file="..."] [--branches="..."]

Weapon Compendium:
  node scripts/campaign-session-tool.js list-weapons [query]
  node scripts/campaign-session-tool.js calculate-pr --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2}' --abilities='[{"name":"X","effect":"Y","prModifier":10}]'

Entity Creation:
  node scripts/campaign-session-tool.js create-npc --campaignId=1 --name="Name" --faction="Faction" [--json-file="..."]
  node scripts/campaign-session-tool.js create-bestiary --name="Name" --faction="Faction" --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' [--json-file="..."]
  node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Name" --faction="Faction" --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' [--json-file="..."]
  node scripts/campaign-session-tool.js create-location --campaignId=1 --name="Location Name" --faction="Faction" --description="Lore" [--json-file="..."]
  node scripts/campaign-session-tool.js create-shop --campaignId=1 --name="Shop Name" --owner=1 --locationId=1 --description="Lore" [--items='[{"id":16,"price":5,"type":"item"}]'] [--json-file="..."]

Entity Updates / Edits:
  node scripts/campaign-session-tool.js update-player --id=1 [--campaignId=1] [--talentPoints=2] [--digitalMistrals=50] [--physicalMistrals=10] [--weapons="23,1"] [--attributes='...'] [--json-file="..."]
  node scripts/campaign-session-tool.js update-npc --id=1 [--campaignId=1] [--name="..."] [--faction="..."] [--role="..."] [--json-file="..."]
  node scripts/campaign-session-tool.js update-location --id=1 [--campaignId=1] [--name="..."] [--description="..."] [--json-file="..."]
  node scripts/campaign-session-tool.js update-shop --id=1 [--campaignId=1] [--name="..."] [--description="..."] [--items='...'] [--json-file="..."]
  node scripts/campaign-session-tool.js update-bestiary --id=1 [--name="..."] [--weapons="2,31"] [--attributes='...'] [--json-file="..."]
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(queryParams, parsed);
      }
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
      else if (arg.startsWith('--file=')) text = readFileContentSafe(arg.substring('--file='.length)) || '';
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
      else if (arg.startsWith('--file=')) text = readFileContentSafe(arg.substring('--file='.length)) || '';
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
      if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) {
          if (parsed.weapons) weapons = parsed.weapons;
          if (parsed.attributes) attributes = parsed.attributes;
          if (parsed.abilities) abilities = parsed.abilities;
        }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(npcParams, parsed);
      }
    });

    const res = await createNPC(npcParams);
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(playerParams, parsed);
      }
    });

    const res = await updatePlayer(playerParams);
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(npcParams, parsed);
      }
    });

    const res = await updateNPC(npcParams);
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(bestiaryParams, parsed);
      }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(bestiaryParams, parsed);
      }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(combatParams, parsed);
      }
    });

    const res = await createCombatNPC(combatParams);
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(locParams, parsed);
      }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(locParams, parsed);
      }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(shopParams, parsed);
      }
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
      else if (arg.startsWith('--json-file=')) {
        const fileContent = readFileContentSafe(arg.substring('--json-file='.length));
        const parsed = parseArgJson(fileContent);
        if (parsed) Object.assign(shopParams, parsed);
      }
    });

    const res = await updateShop(shopParams);
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
      else if (arg.startsWith('--content-file=')) content = readFileContentSafe(arg.substring('--content-file='.length)) || '';
      else if (arg.startsWith('--file=')) {
        const raw = readFileContentSafe(arg.substring('--file='.length)) || '';
        const parsed = parseArgJson(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.campaignId) campaignId = Number(parsed.campaignId);
          if (parsed.sessionId) sessionId = Number(parsed.sessionId);
          if (parsed.content) content = parsed.content;
          if (parsed.conclussion) conclussion = parsed.conclussion;
          if (parsed.playerVisibleBranches) playerVisibleBranches = parsed.playerVisibleBranches;
        } else {
          content = raw;
        }
      }
      else if (arg.startsWith('--conclussion=')) conclussion = arg.substring('--conclussion='.length);
      else if (arg.startsWith('--conclussion-file=')) conclussion = readFileContentSafe(arg.substring('--conclussion-file='.length)) || '';
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
      else if (arg.startsWith('--conclussion-file=')) conclussion = readFileContentSafe(arg.substring('--conclussion-file='.length)) || '';
      else if (arg.startsWith('--file=')) {
        const raw = readFileContentSafe(arg.substring('--file='.length)) || '';
        const parsed = parseArgJson(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.campaignId) campaignId = Number(parsed.campaignId);
          if (parsed.sessionId) sessionId = Number(parsed.sessionId);
          if (parsed.conclussion) conclussion = parsed.conclussion;
          if (parsed.playerVisibleBranches) playerVisibleBranches = parsed.playerVisibleBranches;
        } else {
          conclussion = raw;
        }
      }
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
  getEntity,
  readEntities,
  deleteEntity,
  main
};

