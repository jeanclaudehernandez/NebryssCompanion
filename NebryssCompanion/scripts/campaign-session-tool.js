const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Load environment variables (.env or .env.duckdns)
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

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NebryssCompanion';
const mainDbName = process.env.MONGODB_DB_MAIN || 'Nebryss-assets';
const playersDbName = process.env.MONGODB_DB_PLAYERS || 'NebryssCampaignAssets';

const assetsDir = path.join(__dirname, '../src/assets');
const localDbDir = path.join(__dirname, '../local-db');

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
  try { fs.writeFileSync(localPath, jsonStr, 'utf8'); } catch (e) {}
  try { fs.writeFileSync(assetPath, jsonStr, 'utf8'); } catch (e) {}
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
      const campaign = campaigns.find(c => c.id === Number(campaignId)) || campaigns[0];
      const prefix = campaign ? (campaign.prefix || campaign.name) : 'nebryss-voss-succession';

      sessions = await mainDb.collection('campaignSession').find({
        $or: [{ campaignId: Number(campaignId) }, { campaignId: String(campaignId) }]
      }).sort({ sessionId: 1 }).toArray();

      if (sessions.length === 0) {
        sessions = await mainDb.collection('campaignSession').find().sort({ sessionId: 1 }).toArray();
      }

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
    shops: shops.map(s => ({ id: s.id, name: s.name, locationName: s.locationName, owner: s.owner })),
    bestiary: bestiary.map(b => ({ id: b.id, name: b.name, faction: b.faction, pr: b.pr, weapons: b.weapons })),
    weapons: weapons.map(w => ({ id: w.id, name: w.name, price: w.price, profiles: w.profiles })),
    weaponRules: weaponRules.map(r => ({ id: r.id, name: r.name, effect: r.effect, prModifier: r.prModifier }))
  };

  return context;
}

async function listSessions(campaignId, expandDisplay = false) {
  const context = await getCampaignContext(campaignId || 1);
  let sessions = context.sessions;
  if (expandDisplay) {
    sessions = sessions.map(s => ({
      ...s,
      displayContent: expandToDisplayTags(s.content, context),
      displayConclussion: expandToDisplayTags(s.conclussion, context)
    }));
  }
  return sessions;
}

async function saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches }) {
  const context = await getCampaignContext(campaignId);
  const normalizedContent = normalizeToIdTags(content || '', context);
  const normalizedConclussion = normalizeToIdTags(conclussion || '', context);

  const branchesArray = Array.isArray(playerVisibleBranches)
    ? playerVisibleBranches
    : (typeof playerVisibleBranches === 'string'
      ? playerVisibleBranches.split(',').map(s => s.trim()).filter(Boolean)
      : []);

  const client = await getClient();
  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: normalizedContent,
    conclussion: normalizedConclussion,
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
  writeJsonFallback('campaignSessions.json', allJson);

  return {
    ...sessionDoc,
    displayContent: expandToDisplayTags(normalizedContent, context),
    displayConclussion: expandToDisplayTags(normalizedConclussion, context)
  };
}

async function finalizeSession({ campaignId, sessionId, conclussion, playerVisibleBranches }) {
  const context = await getCampaignContext(campaignId);
  const normalizedConclussion = normalizeToIdTags(conclussion || '', context);

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
        const updateFields = { conclussion: normalizedConclussion };
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
    allJson[idx].conclussion = normalizedConclussion;
    if (branchesArray !== undefined) {
      allJson[idx].playerVisibleBranches = branchesArray;
    }
    writeJsonFallback('campaignSessions.json', allJson);
    if (!updated) updated = allJson[idx];
  }

  if (updated) {
    updated.displayConclussion = expandToDisplayTags(normalizedConclussion, context);
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
    discovered = false
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
      const campaign = campaigns.find(c => c.id === Number(campaignId)) || campaigns[0];
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
    discovered: !!discovered
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
    isDiscovered = false,
    pr = null
  } = bestiaryData;

  if (!name || !faction) {
    throw new Error('Bestiary entry requires at least "name" and "faction".');
  }

  const { weapons: allWeapons, weaponRules: allRules } = await getAllWeaponsAndRules();

  // STRICT CHECK: Ensure every weapon ID exists in weapons compendium
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

  // Calculate PR automatically using validate_pr formula
  const prBreakdown = calculatePR({
    attributes: finalAttributes,
    weapons: validatedWeaponIds,
    abilities: Array.isArray(abilities) ? abilities : []
  }, allWeapons, allRules);

  const finalPR = (typeof pr === 'number' && pr > 0) ? pr : prBreakdown.total;

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
    isDiscovered: !!isDiscovered
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
    discovered = false,
    attributes = {},
    weapons = [],
    abilities = [],
    deployables = []
  } = combatData;

  // 1. Create Bestiary entry first (which strictly validates existing weapons and calculates PR)
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

  // 2. Create NPC entry linked to bestiaryId
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

function parseArgJson(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      // Fallback for JS object literal syntax or unquoted keys
      return Function(`"use strict"; return (${str});`)();
    } catch (e2) {
      return null;
    }
  }
}

// CLI argument execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Nebryss Campaign Session Tool (Entity ID & Combat NPC Integrated)
Usage:
  node scripts/campaign-session-tool.js get-context [campaignId]
  node scripts/campaign-session-tool.js list [campaignId] [--expand]
  node scripts/campaign-session-tool.js get-latest [campaignId] [--expand]
  node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 --content="..." [--conclussion="..."]
  node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 --conclussion="..."
  node scripts/campaign-session-tool.js parse-tags "<text>" [campaignId]

Weapon Compendium:
  node scripts/campaign-session-tool.js list-weapons [query]
  node scripts/campaign-session-tool.js calculate-pr --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2}' --abilities='[{"name":"X","effect":"Y","prModifier":10}]'

NPC & Bestiary Creation:
  node scripts/campaign-session-tool.js create-npc --campaignId=1 --name="Name" --faction="Faction" [--subgroup="..."] [--role="..."] [--location="..."] [--bestiaryId=12]
  node scripts/campaign-session-tool.js create-bestiary --name="Name" --faction="Faction" --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' [--abilities='[...]']
  node scripts/campaign-session-tool.js create-combat-npc --campaignId=1 --name="Name" --faction="Faction" --weapons="2,31" --attributes='{"Movement":6,"Wounds":12,"Save":4,"APL":2,"body":["human"]}' [--abilities='[...]'] [--role="..."] [--location="..."]
    `);
    process.exit(0);
  }

  if (command === 'get-context') {
    const campaignId = args[1] || 1;
    const ctx = await getCampaignContext(campaignId);
    console.log(JSON.stringify(ctx, null, 2));
  } else if (command === 'list') {
    const campaignId = args[1] || null;
    const expand = args.includes('--expand');
    const sessions = await listSessions(campaignId, expand);
    console.log(JSON.stringify(sessions, null, 2));
  } else if (command === 'get-latest') {
    const campaignId = args[1] || 1;
    const expand = args.includes('--expand');
    const sessions = await listSessions(campaignId, expand);
    const latest = sessions.length ? sessions[sessions.length - 1] : null;
    console.log(JSON.stringify(latest, null, 2));
  } else if (command === 'parse-tags') {
    const campaignId = args[2] || 1;
    const context = await getCampaignContext(campaignId);
    const text = args[1];
    const tags = parseEntities(text, context);
    console.log(JSON.stringify(tags, null, 2));
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
      if (arg.startsWith('--data=')) {
        const parsed = parseArgJson(arg.substring('--data='.length));
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
      else if (arg.startsWith('--data=')) {
        const parsed = parseArgJson(arg.substring('--data='.length));
        if (parsed) Object.assign(npcParams, parsed);
      }
    });

    const res = await createNPC(npcParams);
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
      else if (arg.startsWith('--data=')) {
        const parsed = parseArgJson(arg.substring('--data='.length));
        if (parsed) Object.assign(bestiaryParams, parsed);
      }
    });

    const res = await createBestiaryEntry(bestiaryParams);
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
      else if (arg.startsWith('--data=')) {
        const parsed = parseArgJson(arg.substring('--data='.length));
        if (parsed) Object.assign(combatParams, parsed);
      }
    });

    const res = await createCombatNPC(combatParams);
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'save') {
    let campaignId = 1;
    let sessionId = 1;
    let content = '';
    let conclussion = '';
    let playerVisibleBranches = [];

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
    });

    const res = await saveSession({ campaignId, sessionId, content, conclussion, playerVisibleBranches });
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'finalize') {
    let campaignId = 1;
    let sessionId = 1;
    let conclussion = '';
    let playerVisibleBranches = undefined;

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
    });

    const res = await finalizeSession({ campaignId, sessionId, conclussion, playerVisibleBranches });
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
  ENTITY_REGEX,
  listWeapons,
  calculatePR,
  validateWeaponsExist,
  getAllWeaponsAndRules,
  createNPC,
  createBestiaryEntry,
  createCombatNPC
};
