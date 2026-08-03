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
  const documents = await collection.find({ isDeleted: { $ne: true } }).toArray();
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

      if (item._id) {
        delete item._id;
      }

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

function createInsertRoute(path, options) {
  const { usePlayersDb, collectionName } = options;

  app.post(path, async (req, res) => {
    const item = req.body;

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
      const collection = db.collection(collectionName);

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
    
    if (!idParam) {
      return res.status(400).json({ error: 'id is required' });
    }

    try {
      const { mainDb, playersDb } = await getDatabases();
      const db = usePlayersDb ? playersDb : mainDb;
      const collection = db.collection(collectionName);
      
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
    res.status(500).json({ error: error });
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
  usePlayersDb: false,
  collectionName: 'shop',
});

createUpdateRoute('/api/shop', {
  usePlayersDb: false,
  collectionName: 'shop',
});

createInsertRoute('/api/shop', {
  usePlayersDb: false,
  collectionName: 'shop',
});

createDeleteRoute('/api/shop', {
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

createInsertRoute('/api/itemCategory', {
  usePlayersDb: false,
  collectionName: 'itemCategory',
});

createDeleteRoute('/api/itemCategory', {
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

createInsertRoute('/api/npc', {
  usePlayersDb: false,
  collectionName: 'npc',
});

createDeleteRoute('/api/npc', {
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

createInsertRoute('/api/lore', {
  usePlayersDb: false,
  collectionName: 'lore',
});

createDeleteRoute('/api/lore', {
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

createInsertRoute('/api/locations', {
  usePlayersDb: false,
  collectionName: 'location',
});

createDeleteRoute('/api/locations', {
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
    res.json(updatedLetter);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  process.stdout.write(`API server listening on port ${port}\n`);
});
