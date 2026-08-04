const http = require('http');
const express = require('express');
const cors = require('cors');
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

  if (process.env.WS_SERVER_URL) {
    try {
      const url = `${process.env.WS_SERVER_URL.replace(/\/$/, '')}/broadcast`;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, action, data, campaign })
      }).catch(err => console.error('Error posting to WS_SERVER_URL:', err.message));
    } catch (e) {
      console.error('Failed to dispatch WS broadcast:', e);
    }
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

const mongoUri = process.env.MONGODB_URI;
const mainDbName = process.env.MONGODB_DB_MAIN || process.env.MONGODB_DB_NAME || 'test';
const playersDbName = process.env.MONGODB_DB_PLAYERS || process.env.MONGODB_PLAYERS_DB_NAME || 'players';

let cachedClient = null;
let cachedMainDb = null;
let cachedPlayersDb = null;

async function getDatabases() {
  if (cachedClient && cachedMainDb && cachedPlayersDb) {
    return { mainDb: cachedMainDb, playersDb: cachedPlayersDb };
  }

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  cachedClient = client;
  cachedMainDb = client.db(mainDbName);
  cachedPlayersDb = client.db(playersDbName);

  return { mainDb: cachedMainDb, playersDb: cachedPlayersDb };
}

async function fetchCollection(db, collectionName) {
  const collection = db.collection(collectionName);
  const documents = await collection.find({ isDeleted: { $ne: true } }).toArray();
  return documents;
}

function createUpdateRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.put(path, async (req, res) => {
    const { payload: item, campaign } = extractPayloadAndCampaign(req);

    if (!item || typeof item.id === 'undefined') {
      return res.status(400).json({ error: 'id is required in request body' });
    }

    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;
      const collection = db.collection(targetCollection);

      if (item._id) {
        delete item._id;
      }

      let query = { id: item.id };
      if (!isNaN(Number(item.id))) {
        query = { id: { $in: [item.id, Number(item.id), String(item.id)] } };
      }

      await collection.replaceOne(
        query,
        item,
        { upsert: true }
      );

      notifyChange(collectionName, 'update', item, campaign);
      res.json(item);
    } catch (error) {
      console.error(`[API] Error updating ${collectionName}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createInsertRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.post(path, async (req, res) => {
    const { payload: item, campaign } = extractPayloadAndCampaign(req);

    if (!item) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    // Ensure we don't carry over the _id from a cloned item
    if (item._id) {
      delete item._id;
    }

    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;
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
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createDeleteRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.delete(`${path}/:id`, async (req, res) => {
    const idParam = req.params.id;
    const campaign = extractCampaign(req);

    if (!idParam) {
      return res.status(400).json({ error: 'id is required' });
    }

    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;
      const collection = db.collection(targetCollection);

      let query = { id: idParam };
      // Support numeric IDs if the param looks like a number
      if (!isNaN(Number(idParam))) {
        query = { id: { $in: [idParam, Number(idParam)] } };
      }

      const result = await collection.updateOne(
        query,
        { $set: { isDeleted: true } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      notifyChange(collectionName, 'delete', { id: idParam }, campaign);
      res.json({ success: true, id: idParam });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createCollectionRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.get(path, async (req, res) => {
    try {
      const campaign = extractCampaign(req);
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const targetCollection = (usePlayersDb && campaign) ? getCampaignCollectionName(campaign, collectionName) : collectionName;
      const documents = await fetchCollection(db, targetCollection);
      res.json(documents);
    } catch (error) {
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

  if (item._id) {
    delete item._id;
  }

  try {
    const { mainDb, playersDb } = await getDatabases();
    const collection = mainDb.collection('campaign');

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

    const campaignPrefix = item.prefix || (item.name ? item.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') : '');
    item.prefix = campaignPrefix;

    const collectionsToCreate = [
      `${campaignPrefix}-player`,
      `${campaignPrefix}-shop`,
      `${campaignPrefix}-location`,
      `${campaignPrefix}-npc`
    ];

    for (const targetColl of collectionsToCreate) {
      const existingCollections = await playersDb.listCollections({ name: targetColl }).toArray();
      if (existingCollections.length === 0) {
        await playersDb.createCollection(targetColl);
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

  const targetCollection = getCampaignCollectionName(campaign, 'player');

  try {
    const { playersDb } = await getDatabases();
    const collection = playersDb.collection(targetCollection);

    if (player._id) {
      delete player._id;
    }

    let query = { id: player.id };
    if (!isNaN(Number(player.id))) {
      query = { id: { $in: [player.id, Number(player.id), String(player.id)] } };
    }

    await collection.replaceOne(
      query,
      player,
      { upsert: true }
    );

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
    const { mainDb } = await getDatabases();
    const collection = mainDb.collection('letters');
    const query = {
      id: { $in: [idParam, Number(idParam)] },
      isDeleted: { $ne: true }
    };

    const updateResult = await collection.updateOne(
      query,
      {
        $addToSet: { readBy: playerId }
      }
    );

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

const port = process.env.PORT || 8080;

server.listen(port, () => {
  process.stdout.write(`API & WebSocket server listening on port ${port}\n`);
});
