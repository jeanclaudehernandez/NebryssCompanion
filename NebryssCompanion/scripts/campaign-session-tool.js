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
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2500 });
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
  // Check if already numeric ID
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  // Check if format is "id: name"
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

  // Match exact ID or name
  const exact = list.find(item => cleanString(item.name) === cleaned || String(item.id) === raw);
  if (exact) return exact.id;

  // Match substring
  const partial = list.find(item => cleanString(item.name).includes(cleaned) || cleaned.includes(cleanString(item.name)));
  if (partial) return partial.id;

  return raw; // Fallback to raw if not found
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

async function getCampaignContext(campaignId = 1) {
  const client = await getClient();
  let campaigns = [];
  let sessions = [];
  let players = [];
  let npcs = [];
  let locations = [];
  let shops = [];
  let bestiary = [];

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
  }

  const context = {
    campaignId: Number(campaignId),
    campaigns,
    sessions,
    players: players.map(p => ({ id: p.id, name: p.name, race: p.race, origin: p.origin })),
    npcs: npcs.map(n => ({ id: n.id, name: n.name, faction: n.faction, role: n.role, location: n.location })),
    locations: locations.map(l => ({ id: l.id, name: l.name, faction: l.faction, isCapital: l.isCapital })),
    shops: shops.map(s => ({ id: s.id, name: s.name, locationName: s.locationName, owner: s.owner })),
    bestiary: bestiary.map(b => ({ id: b.id, name: b.name, faction: b.faction, pr: b.pr }))
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

async function saveSession({ campaignId, sessionId, content, conclussion }) {
  const context = await getCampaignContext(campaignId);

  // Normalize all entity references to ID format: @player[1], @npc[12], @location[3], @shop[1], @bestiary[25]
  const normalizedContent = normalizeToIdTags(content || '', context);
  const normalizedConclussion = normalizeToIdTags(conclussion || '', context);

  const client = await getClient();
  const sessionDoc = {
    campaignId: Number(campaignId),
    sessionId: Number(sessionId),
    content: normalizedContent,
    conclussion: normalizedConclussion
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
          { $set: { content: sessionDoc.content, conclussion: sessionDoc.conclussion } }
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

  // Also sync to local JSON
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

async function finalizeSession({ campaignId, sessionId, conclussion }) {
  const context = await getCampaignContext(campaignId);
  const normalizedConclussion = normalizeToIdTags(conclussion || '', context);

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
        await collection.updateOne({ _id: existing._id }, { $set: { conclussion: normalizedConclussion } });
        updated = { ...existing, conclussion: normalizedConclussion };
      }
    } finally {
      await client.close();
    }
  }

  const allJson = readJsonFallback('campaignSessions.json');
  const idx = allJson.findIndex(s => Number(s.campaignId) === Number(campaignId) && Number(s.sessionId) === Number(sessionId));
  if (idx !== -1) {
    allJson[idx].conclussion = normalizedConclussion;
    writeJsonFallback('campaignSessions.json', allJson);
    if (!updated) updated = allJson[idx];
  }

  if (updated) {
    updated.displayConclussion = expandToDisplayTags(normalizedConclussion, context);
  }

  return updated;
}

// CLI argument execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Nebryss Campaign Session Tool (Entity ID Based)
Usage:
  node scripts/campaign-session-tool.js get-context [campaignId]
  node scripts/campaign-session-tool.js list [campaignId] [--expand]
  node scripts/campaign-session-tool.js get-latest [campaignId] [--expand]
  node scripts/campaign-session-tool.js save --campaignId=1 --sessionId=1 --content="..." [--conclussion="..."]
  node scripts/campaign-session-tool.js finalize --campaignId=1 --sessionId=1 --conclussion="..."
  node scripts/campaign-session-tool.js parse-tags "<text>" [campaignId]
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
  } else if (command === 'save') {
    let campaignId = 1;
    let sessionId = 1;
    let content = '';
    let conclussion = '';

    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) campaignId = Number(arg.split('=')[1]);
      if (arg.startsWith('--sessionId=')) sessionId = Number(arg.split('=')[1]);
      if (arg.startsWith('--content=')) content = arg.substring('--content='.length);
      if (arg.startsWith('--conclussion=')) conclussion = arg.substring('--conclussion='.length);
    });

    const res = await saveSession({ campaignId, sessionId, content, conclussion });
    console.log(JSON.stringify(res, null, 2));
  } else if (command === 'finalize') {
    let campaignId = 1;
    let sessionId = 1;
    let conclussion = '';

    args.slice(1).forEach(arg => {
      if (arg.startsWith('--campaignId=')) campaignId = Number(arg.split('=')[1]);
      if (arg.startsWith('--sessionId=')) sessionId = Number(arg.split('=')[1]);
      if (arg.startsWith('--conclussion=')) conclussion = arg.substring('--conclussion='.length);
    });

    const res = await finalizeSession({ campaignId, sessionId, conclussion });
    console.log(JSON.stringify(res, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error in campaign-session-tool:', err);
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
  ENTITY_REGEX
};
