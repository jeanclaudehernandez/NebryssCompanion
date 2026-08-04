const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const { setupWebSocketServer } = require('./websocket-server');

const app = express();
const server = http.createServer(app);
const { broadcastDataUpdate } = setupWebSocketServer(server);

app.use(cors());
app.use(express.json());

function notifyChange(entity, action, data, campaign) {
  try {
    broadcastDataUpdate(entity, action, data, campaign);
  } catch (err) {
    console.error('Error broadcasting update:', err);
  }
}

function getCampaignCollectionName(campaign, defaultCollection) {
  if (!campaign) return defaultCollection;
  const prefix = campaign.prefix || (campaign.playersCollectionName ? campaign.playersCollectionName.replace(/-player$/, '') : '');
  if (prefix && String(prefix).trim()) {
    return `${String(prefix).trim()}-${defaultCollection}`;
  }
  if (campaign.playersCollectionName && defaultCollection === 'player') {
    return String(campaign.playersCollectionName).trim();
  }
  return defaultCollection;
}

function extractCampaign(req) {
  if (req.body && req.body.campaign) {
    return req.body.campaign;
  }
  if (req.query && req.query.campaign) {
    try {
      return typeof req.query.campaign === 'string' ? JSON.parse(req.query.campaign) : req.query.campaign;
    } catch (e) {
      return null;
    }
  }
  if (req.headers && req.headers['x-campaign']) {
    try {
      return JSON.parse(req.headers['x-campaign']);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function extractPayloadAndCampaign(req) {
  const campaign = extractCampaign(req);
  let payload = req.body;
  if (req.body && typeof req.body === 'object' && 'payload' in req.body) {
    payload = req.body.payload;
  }
  return { payload, campaign };
}

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NebryssCompanion';
const mainDbName = process.env.MONGODB_DB_MAIN || process.env.MONGODB_DB_NAME || 'test';
const playersDbName = process.env.MONGODB_DB_PLAYERS || process.env.MONGODB_PLAYERS_DB_NAME || 'players';

// Default to 100% Local PC JSON Database mode if remote MongoDB Atlas is configured or local mode is active
let isUsingLocalJsonFallback = true;
if (mongoUri && (mongoUri.includes('127.0.0.1') || mongoUri.includes('localhost'))) {
  isUsingLocalJsonFallback = false;
}

const assetsDir = path.join(__dirname, '../src/assets');

async function getDatabases() {
  if (isUsingLocalJsonFallback) {
    return null;
  }

  if (cachedClient && cachedMainDb && cachedPlayersDb) {
    return { mainDb: cachedMainDb, playersDb: cachedPlayersDb };
  }

  try {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();

    cachedClient = client;
    cachedMainDb = client.db(mainDbName);
    cachedPlayersDb = client.db(playersDbName);
    console.log('[Database] Connected successfully to local MongoDB instance!');

    return { mainDb: cachedMainDb, playersDb: cachedPlayersDb };
  } catch (err) {
    console.warn('[Database] Local MongoDB connection unavailable. Switching to Local PC Filesystem Database (JSON)...');
    isUsingLocalJsonFallback = true;
    return null;
  }
}

// Maps prefixed campaign collection names back to their base JSON asset filename
const COLLECTION_TO_JSON_FILE = {
  'campaign': 'campaigns',
  'player': 'players',
  'location': 'locations',
  'npc': 'npcs',
  'shop': 'shops',
  'lore': 'lore',
  'bestiary': 'bestiary',
  'weapon': 'weapons',
  'weaponRules': 'weaponRules',
  'weaponRule': 'weaponRules',
  'item': 'items',
  'items': 'items',
  'itemCategory': 'itemCategories',
  'talent': 'talents',
  'mistEffect': 'mistEffects',
  'mistEffects': 'mistEffects',
  'alteredState': 'alteredStates',
  'status': 'alteredStates',      // DataService calls /api/status
  'terrain': 'terrainRules',
  'terrainRule': 'terrainRules',
  'terrains': 'terrainRules',
  'affliction': 'afflictions',
  'afflictions': 'afflictions',
  'letter': 'letters',
  'letters': 'letters',
};

function resolveLocalJsonFile(collectionName) {
  // Strip campaign prefix (e.g. 'nebryss-voss-succession-location' -> 'location')
  const baseName = collectionName.includes('-') 
    ? collectionName.split('-').pop() 
    : collectionName;
  const mapped = COLLECTION_TO_JSON_FILE[baseName] || COLLECTION_TO_JSON_FILE[collectionName] || collectionName;
  return path.join(assetsDir, `${mapped}.json`);
}

async function fetchCollection(db, collectionName) {
  if (isUsingLocalJsonFallback || !db) {
    const filePath = resolveLocalJsonFile(collectionName);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        // Handle wrapped formats like { items: [...] } or { locations: [...] }
        const arr = Array.isArray(parsed) ? parsed : (parsed.items || parsed.locations || parsed.locations || [parsed]);
        return arr.filter(doc => !doc.isDeleted);
      } catch (e) {
        console.error(`[LocalDB] Error reading ${filePath}:`, e);
      }
    }
    return [];
  }

  const collection = db.collection(collectionName);
  const documents = await collection.find({ isDeleted: { $ne: true } }).toArray();
  return documents;
}

async function saveToLocalJson(collectionName, documents) {
  const filePath = resolveLocalJsonFile(collectionName);
  try {
    let toSave = documents;
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        const key = Object.keys(parsed)[0];
        if (key && Array.isArray(parsed[key])) {
          parsed[key] = documents;
          toSave = parsed;
        }
      }
    }
    fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (e) {
    console.error(`[LocalDB] Error writing ${filePath}:`, e);
  }
}

function createUpdateRoute(routePath, options) {
  const { usePlayersDb, collectionName } = options;

  app.put(routePath, async (req, res) => {
    const { payload: item, campaign } = extractPayloadAndCampaign(req);

    if (!item || typeof item.id === 'undefined') {
      return res.status(400).json({ error: 'id is required in request body' });
    }

    if (item._id) { delete item._id; }

    try {
      const dbs = await getDatabases();
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;

      if (!dbs) {
        // Local JSON fallback: read, update, write
        const docs = await fetchCollection(null, targetCollection);
        const idx = docs.findIndex(d => String(d.id) === String(item.id));
        if (idx !== -1) { docs[idx] = item; } else { docs.push(item); }
        await saveToLocalJson(targetCollection, docs);
        notifyChange(collectionName, 'update', item, campaign);
        return res.json(item);
      }

      const db = usePlayersDb ? dbs.playersDb : dbs.mainDb;
      const collection = db.collection(targetCollection);
      let query = { id: item.id };
      if (!isNaN(Number(item.id))) {
        query = { id: { $in: [item.id, Number(item.id), String(item.id)] } };
      }
      await collection.replaceOne(query, item, { upsert: true });
      notifyChange(collectionName, 'update', item, campaign);
      res.json(item);
    } catch (error) {
      console.error(`[API] Error updating ${collectionName}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createInsertRoute(routePath, options) {
  const { usePlayersDb, collectionName } = options;

  app.post(routePath, async (req, res) => {
    const { payload: item, campaign } = extractPayloadAndCampaign(req);

    if (!item) {
      return res.status(400).json({ error: 'Request body is required' });
    }
    if (item._id) { delete item._id; }

    try {
      const dbs = await getDatabases();
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;

      if (!dbs) {
        // Local JSON fallback
        const docs = await fetchCollection(null, targetCollection);
        if (typeof item.id === 'undefined' || item.id === 0) {
          const maxId = docs.reduce((m, d) => (typeof d.id === 'number' && d.id > m ? d.id : m), 0);
          item.id = maxId + 1;
        } else if (docs.find(d => String(d.id) === String(item.id))) {
          return res.status(409).json({ error: 'Item with this id already exists' });
        }
        docs.push(item);
        await saveToLocalJson(targetCollection, docs);
        notifyChange(collectionName, 'create', item, campaign);
        return res.status(201).json(item);
      }

      const db = usePlayersDb ? dbs.playersDb : dbs.mainDb;
      const collection = db.collection(targetCollection);

      if (typeof item.id === 'undefined' || item.id === 0) {
        const lastItem = await collection.find().sort({ id: -1 }).limit(1).toArray();
        if (lastItem.length === 0) {
          item.id = 1;
        } else {
          const lastId = lastItem[0].id;
          if (typeof lastId === 'number') {
            item.id = lastId + 1;
          } else {
            return res.status(400).json({ error: 'id is required for this collection' });
          }
        }
      } else {
        const existing = await collection.findOne({ id: item.id });
        if (existing) {
          return res.status(409).json({ error: 'Item with this id already exists' });
        }
      }

      await collection.insertOne(item);
      notifyChange(collectionName, 'create', item, campaign);
      res.status(201).json(item);
    } catch (error) {
      console.error(`[API] Error inserting ${collectionName}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createDeleteRoute(routePath, options) {
  const { usePlayersDb, collectionName } = options;

  app.delete(`${routePath}/:id`, async (req, res) => {
    const idParam = req.params.id;
    const campaign = extractCampaign(req);

    if (!idParam) {
      return res.status(400).json({ error: 'id is required' });
    }

    try {
      const dbs = await getDatabases();
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;

      if (!dbs) {
        // Local JSON fallback: soft-delete
        const docs = await fetchCollection(null, targetCollection);
        const idx = docs.findIndex(d => String(d.id) === String(idParam));
        if (idx === -1) return res.status(404).json({ error: 'Item not found' });
        docs[idx].isDeleted = true;
        await saveToLocalJson(targetCollection, docs);
        notifyChange(collectionName, 'delete', { id: idParam }, campaign);
        return res.json({ success: true, id: idParam });
      }

      const db = usePlayersDb ? dbs.playersDb : dbs.mainDb;
      const collection = db.collection(targetCollection);
      let query = { id: idParam };
      if (!isNaN(Number(idParam))) {
        query = { id: { $in: [idParam, Number(idParam)] } };
      }
      const result = await collection.updateOne(query, { $set: { isDeleted: true } });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      notifyChange(collectionName, 'delete', { id: idParam }, campaign);
      res.json({ success: true, id: idParam });
    } catch (error) {
      console.error(`[API] Error deleting ${collectionName}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createCollectionRoute(routePath, options) {
  const { usePlayersDb, collectionName } = options;

  app.get(routePath, async (req, res) => {
    try {
      const campaign = extractCampaign(req);
      const dbs = await getDatabases();
      const db = dbs ? (usePlayersDb ? dbs.playersDb : dbs.mainDb) : null;
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;
      const documents = await fetchCollection(db, targetCollection);
      res.json(documents);
    } catch (error) {
      console.error(`[API] Error fetching ${collectionName}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

createCollectionRoute('/api/campaign', {
  usePlayersDb: false,
  collectionName: 'campaign',
});

createUpdateRoute('/api/campaign', {
  usePlayersDb: false,
  collectionName: 'campaign',
});

app.post('/api/campaign', async (req, res) => {
  const { payload: item, campaign } = extractPayloadAndCampaign(req);

  if (!item || !item.name) {
    return res.status(400).json({ error: 'Campaign name is required' });
  }

  if (item._id) { delete item._id; }

  const campaignPrefix = item.prefix || item.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  item.prefix = campaignPrefix;

  try {
    const dbs = await getDatabases();

    if (!dbs) {
      // Local JSON fallback
      const docs = await fetchCollection(null, 'campaign');
      if (typeof item.id === 'undefined' || item.id === 0) {
        const maxId = docs.reduce((m, d) => (typeof d.id === 'number' && d.id > m ? d.id : m), 0);
        item.id = maxId + 1;
      } else if (docs.find(d => String(d.id) === String(item.id))) {
        return res.status(409).json({ error: 'Campaign with this id already exists' });
      }
      docs.push(item);
      await saveToLocalJson('campaign', docs);
      notifyChange('campaign', 'create', item, campaign);
      return res.status(201).json(item);
    }

    const collection = dbs.mainDb.collection('campaign');

    if (typeof item.id === 'undefined' || item.id === 0) {
      const lastItem = await collection.find().sort({ id: -1 }).limit(1).toArray();
      if (lastItem.length === 0) {
        item.id = 1;
      } else {
        const lastId = lastItem[0].id;
        if (typeof lastId === 'number') {
          item.id = lastId + 1;
        } else {
          return res.status(400).json({ error: 'id is required for this collection' });
        }
      }
    } else {
      const existing = await collection.findOne({ id: item.id });
      if (existing) {
        return res.status(409).json({ error: 'Campaign with this id already exists' });
      }
    }

    const collectionsToCreate = [
      `${campaignPrefix}-player`,
      `${campaignPrefix}-shop`,
      `${campaignPrefix}-location`,
      `${campaignPrefix}-npc`
    ];

    for (const targetColl of collectionsToCreate) {
      const existingCollections = await dbs.playersDb.listCollections({ name: targetColl }).toArray();
      if (existingCollections.length === 0) {
        await dbs.playersDb.createCollection(targetColl);
        console.log(`[API] Created collection '${targetColl}' in playersDb for campaign '${item.name}'`);
      }
    }

    await collection.insertOne(item);
    notifyChange('campaign', 'create', item, campaign);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

createDeleteRoute('/api/campaign', {
  usePlayersDb: false,
  collectionName: 'campaign',
});

createCollectionRoute('/api/player', {
  usePlayersDb: true,
  collectionName: 'player',
});

app.put('/api/player', async (req, res) => {
  const { payload: player, campaign } = extractPayloadAndCampaign(req);

  if (!player || typeof player.id === 'undefined') {
    return res.status(400).json({ error: 'Player id is required in request body' });
  }

  if (player._id) { delete player._id; }

  const targetCollection = getCampaignCollectionName(campaign, 'player');

  try {
    const dbs = await getDatabases();

    if (!dbs) {
      const docs = await fetchCollection(null, targetCollection);
      const idx = docs.findIndex(d => String(d.id) === String(player.id));
      if (idx !== -1) { docs[idx] = player; } else { docs.push(player); }
      await saveToLocalJson(targetCollection, docs);
      notifyChange('player', 'update', player, campaign);
      return res.json(player);
    }

    const collection = dbs.playersDb.collection(targetCollection);
    let query = { id: player.id };
    if (!isNaN(Number(player.id))) {
      query = { id: { $in: [player.id, Number(player.id), String(player.id)] } };
    }
    await collection.replaceOne(query, player, { upsert: true });
    notifyChange('player', 'update', player, campaign);
    res.json(player);
  } catch (error) {
    console.error(`[API] Error updating player in collection '${targetCollection}':`, error);
    res.status(500).json({ error: error.message || error });
  }
});

createInsertRoute('/api/player', {
  usePlayersDb: true,
  collectionName: 'player',
});

createDeleteRoute('/api/player', {
  usePlayersDb: true,
  collectionName: 'player',
});

createCollectionRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createUpdateRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createInsertRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createDeleteRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createCollectionRoute('/api/item', {
  usePlayersDb: false,
  collectionName: 'item',
});

createUpdateRoute('/api/item', {
  usePlayersDb: false,
  collectionName: 'item',
});

createInsertRoute('/api/item', {
  usePlayersDb: false,
  collectionName: 'item',
});

createDeleteRoute('/api/item', {
  usePlayersDb: false,
  collectionName: 'item',
});

createCollectionRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createUpdateRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createInsertRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createDeleteRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createCollectionRoute('/api/bestiary', {
  usePlayersDb: false,
  collectionName: 'bestiary',
});

createUpdateRoute('/api/bestiary', {
  usePlayersDb: false,
  collectionName: 'bestiary',
});

createInsertRoute('/api/bestiary', {
  usePlayersDb: false,
  collectionName: 'bestiary',
});

createDeleteRoute('/api/bestiary', {
  usePlayersDb: false,
  collectionName: 'bestiary',
});

createCollectionRoute('/api/shop', {
  usePlayersDb: true,
  collectionName: 'shop',
});

createUpdateRoute('/api/shop', {
  usePlayersDb: true,
  collectionName: 'shop',
});

createInsertRoute('/api/shop', {
  usePlayersDb: true,
  collectionName: 'shop',
});

createDeleteRoute('/api/shop', {
  usePlayersDb: true,
  collectionName: 'shop',
});

createCollectionRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createUpdateRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createInsertRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createDeleteRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createCollectionRoute('/api/npc', {
  usePlayersDb: true,
  collectionName: 'npc',
});

createUpdateRoute('/api/npc', {
  usePlayersDb: true,
  collectionName: 'npc',
});

createInsertRoute('/api/npc', {
  usePlayersDb: true,
  collectionName: 'npc',
});

createDeleteRoute('/api/npc', {
  usePlayersDb: true,
  collectionName: 'npc',
});

createCollectionRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});

createUpdateRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});

createInsertRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});

createDeleteRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});



createCollectionRoute('/api/locations', {
  usePlayersDb: true,
  collectionName: 'location',
});

createUpdateRoute('/api/locations', {
  usePlayersDb: true,
  collectionName: 'location',
});

createInsertRoute('/api/locations', {
  usePlayersDb: true,
  collectionName: 'location',
});

createDeleteRoute('/api/locations', {
  usePlayersDb: true,
  collectionName: 'location',
});

createCollectionRoute('/api/talent', {
  usePlayersDb: false,
  collectionName: 'talent',
});

createUpdateRoute('/api/talent', {
  usePlayersDb: false,
  collectionName: 'talent',
});

createInsertRoute('/api/talent', {
  usePlayersDb: false,
  collectionName: 'talent',
});

createDeleteRoute('/api/talent', {
  usePlayersDb: false,
  collectionName: 'talent',
});

createCollectionRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createUpdateRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createInsertRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createDeleteRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createCollectionRoute('/api/mistEffect', {
  usePlayersDb: false,
  collectionName: 'mistEffect',
});

createUpdateRoute('/api/mistEffect', {
  usePlayersDb: false,
  collectionName: 'mistEffect',
});

createInsertRoute('/api/mistEffect', {
  usePlayersDb: false,
  collectionName: 'mistEffect',
});

createDeleteRoute('/api/mistEffect', {
  usePlayersDb: false,
  collectionName: 'mistEffect',
});

createCollectionRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

createUpdateRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

createInsertRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

createDeleteRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

createCollectionRoute('/api/afflictions', {
  usePlayersDb: false,
  collectionName: 'affliction',
});

createUpdateRoute('/api/afflictions', {
  usePlayersDb: false,
  collectionName: 'affliction',
});

createInsertRoute('/api/afflictions', {
  usePlayersDb: false,
  collectionName: 'affliction',
});

createDeleteRoute('/api/afflictions', {
  usePlayersDb: false,
  collectionName: 'affliction',
});

createCollectionRoute('/api/letter', {
  usePlayersDb: false,
  collectionName: 'letters',
});

createUpdateRoute('/api/letter', {
  usePlayersDb: false,
  collectionName: 'letters',
});

createInsertRoute('/api/letter', {
  usePlayersDb: false,
  collectionName: 'letters',
});

createDeleteRoute('/api/letter', {
  usePlayersDb: false,
  collectionName: 'letters',
});

app.post('/api/letter/:id/read', async (req, res) => {
  const idParam = req.params.id;
  const { playerId } = req.body ?? {};

  if (!idParam) {
    return res.status(400).json({ error: 'Letter id is required' });
  }

  if (typeof playerId !== 'number') {
    return res.status(400).json({ error: 'playerId must be a number' });
  }

  try {
    const dbs = await getDatabases();

    if (!dbs) {
      // Local JSON fallback
      const docs = await fetchCollection(null, 'letters');
      const idx = docs.findIndex(d => String(d.id) === String(idParam) && !d.isDeleted);
      if (idx === -1) return res.status(404).json({ error: 'Letter not found' });
      if (!docs[idx].readBy) { docs[idx].readBy = []; }
      if (!docs[idx].readBy.includes(playerId)) { docs[idx].readBy.push(playerId); }
      await saveToLocalJson('letters', docs);
      notifyChange('letters', 'update', docs[idx]);
      return res.json(docs[idx]);
    }

    const collection = dbs.mainDb.collection('letters');
    const query = {
      id: { $in: [idParam, Number(idParam)] },
      isDeleted: { $ne: true }
    };
    const updateResult = await collection.updateOne(query, { $addToSet: { readBy: playerId } });
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }
    const updatedLetter = await collection.findOne(query);
    notifyChange('letters', 'update', updatedLetter);
    res.json(updatedLetter);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const staticPath = path.join(__dirname, '../dist/nebryss-companion/browser');
const indexHtmlPath = path.join(staticPath, 'index.html');

if (fs.existsSync(staticPath)) {
  // Serve all static assets (JS, CSS, images) with caching — but NOT index.html
  app.use(express.static(staticPath, {
    maxAge: '7d',
    etag: true,
    index: false  // disable auto-serving index.html so our handler runs first
  }));

  // Serve index.html dynamically, injecting runtime config based on request host
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }

    if (!fs.existsSync(indexHtmlPath)) {
      return res.status(404).send('index.html not found. Run npm run build first.');
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
      const origin = `${protocol}://${host}`;
      const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://${host}/ws`;
      const apiUrl = `${origin}/api`;

      let html = fs.readFileSync(indexHtmlPath, 'utf8');

      // Inject runtime config script right after <head>
      const configScript = `<script>
  window.API_URL = "${apiUrl}";
  window.WS_URL  = "${wsUrl}";
</script>`;

      html = html.replace('<head>', `<head>\n  ${configScript}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store'); // never cache index.html
      res.send(html);
    } catch (err) {
      console.error('[API] Error serving index.html:', err);
      res.sendFile(indexHtmlPath);
    }
  });

  console.log(`[API] Serving static Angular app from ${staticPath}`);
  console.log('[API] Runtime config (API_URL + WS_URL) injected dynamically per request host.');
}

const port = process.env.PORT || 8080;

server.listen(port, () => {
  process.stdout.write(`API & WebSocket server listening on port ${port}\n`);
});

