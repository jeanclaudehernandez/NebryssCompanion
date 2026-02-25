const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGODB_URI;
const mainDbName = process.env.MONGODB_DB_MAIN;
const playersDbName = process.env.MONGODB_DB_PLAYERS;

if (!mongoUri || !mainDbName || !playersDbName) {
  throw new Error('Missing MongoDB configuration environment variables');
}

const client = new MongoClient(mongoUri);

let mainDb;
let playersDb;

async function getDatabases() {
  if (!mainDb || !playersDb) {
    await client.connect();
    mainDb = client.db(mainDbName);
    playersDb = client.db(playersDbName);
  }
  return { mainDb, playersDb };
}

async function fetchCollection(db, collectionName) {
  const collection = db.collection(collectionName);
  const documents = await collection.find({}).toArray();
  return documents;
}

function createUpdateRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.put(path, async (req, res) => {
    const item = req.body;

    if (!item || typeof item.id === 'undefined') {
      return res.status(400).json({ error: 'id is required in request body' });
    }

    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const collection = db.collection(collectionName);

      const result = await collection.replaceOne(
        { id: item.id },
        item
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.json(item);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

function createCollectionRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.get(path, async (req, res) => {
    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const documents = await fetchCollection(db, collectionName);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

createCollectionRoute('/api/player', {
  usePlayersDb: true,
  collectionName: 'player',
});

app.put('/api/player', async (req, res) => {
  const player = req.body;

  if (!player || typeof player.id === 'undefined') {
    return res.status(400).json({ error: 'Player id is required in request body' });
  }

  try {
    const { playersDb } = await getDatabases();
    const collection = playersDb.collection('player');

    const result = await collection.replaceOne(
      { id: player.id },
      player
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(player);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

createCollectionRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createUpdateRoute('/api/weapon', {
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

createCollectionRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createUpdateRoute('/api/weaponRule', {
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

createCollectionRoute('/api/shop', {
  usePlayersDb: false,
  collectionName: 'shop',
});

createUpdateRoute('/api/shop', {
  usePlayersDb: false,
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

createCollectionRoute('/api/npc', {
  usePlayersDb: false,
  collectionName: 'npc',
});

createUpdateRoute('/api/npc', {
  usePlayersDb: false,
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

createCollectionRoute('/api/locations', {
  usePlayersDb: false,
  collectionName: 'location',
});

createUpdateRoute('/api/locations', {
  usePlayersDb: false,
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

createCollectionRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createUpdateRoute('/api/status', {
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

createCollectionRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

createUpdateRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  process.stdout.write(`API server listening on port ${port}\n`);
});
