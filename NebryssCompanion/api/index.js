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

createCollectionRoute('/api/weapon', {
  usePlayersDb: false,
  collectionName: 'weapon',
});

createCollectionRoute('/api/item', {
  usePlayersDb: false,
  collectionName: 'item',
});

createCollectionRoute('/api/weaponRule', {
  usePlayersDb: false,
  collectionName: 'weaponRule',
});

createCollectionRoute('/api/bestiary', {
  usePlayersDb: false,
  collectionName: 'bestiary',
});

createCollectionRoute('/api/shop', {
  usePlayersDb: false,
  collectionName: 'shop',
});

createCollectionRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createCollectionRoute('/api/npc', {
  usePlayersDb: false,
  collectionName: 'npc',
});

createCollectionRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});

createCollectionRoute('/api/locations', {
  usePlayersDb: false,
  collectionName: 'location',
});

createCollectionRoute('/api/talent', {
  usePlayersDb: false,
  collectionName: 'talent',
});

createCollectionRoute('/api/status', {
  usePlayersDb: false,
  collectionName: 'status',
});

createCollectionRoute('/api/mistEffect', {
  usePlayersDb: false,
  collectionName: 'mistEffect',
});

createCollectionRoute('/api/terrainRule', {
  usePlayersDb: false,
  collectionName: 'terrainRule',
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  process.stdout.write(`API server listening on port ${port}\n`);
});

