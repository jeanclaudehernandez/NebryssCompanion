const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Load .env.duckdns
const envPath = path.join(__dirname, '../.env.duckdns');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  });
}

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/NebryssCompanion';
const mainDbName = process.env.MONGODB_DB_MAIN || 'Nebryss-assets';
const playersDbName = process.env.MONGODB_DB_PLAYERS || 'Nebryss-players-local';

const assetsDir = path.join(__dirname, '../src/assets');
const localDbDir = path.join(__dirname, '../local-db');

const collectionsMap = [
  { jsonFile: 'afflictions.json', collection: 'afflictions', usePlayersDb: false },
  { jsonFile: 'alteredStates.json', collection: 'alteredState', usePlayersDb: false },
  { jsonFile: 'bestiary.json', collection: 'bestiary', usePlayersDb: false },
  { jsonFile: 'campaigns.json', collection: 'campaigns', usePlayersDb: false },
  { jsonFile: 'itemCategories.json', collection: 'itemCategories', usePlayersDb: false },
  { jsonFile: 'items.json', collection: 'items', usePlayersDb: false },
  { jsonFile: 'letters.json', collection: 'letters', usePlayersDb: false },
  { jsonFile: 'locations.json', collection: 'locations', usePlayersDb: false },
  { jsonFile: 'lore.json', collection: 'lore', usePlayersDb: false },
  { jsonFile: 'mistEffects.json', collection: 'mistEffects', usePlayersDb: false },
  { jsonFile: 'npcs.json', collection: 'npcs', usePlayersDb: false },
  { jsonFile: 'players.json', collection: 'player', usePlayersDb: true },
  { jsonFile: 'shops.json', collection: 'shops', usePlayersDb: false },
  { jsonFile: 'talents.json', collection: 'talents', usePlayersDb: false },
  { jsonFile: 'terrainRules.json', collection: 'terrains', usePlayersDb: false },
  { jsonFile: 'weaponRules.json', collection: 'weaponRules', usePlayersDb: false },
  { jsonFile: 'weapons.json', collection: 'weapons', usePlayersDb: false }
];

async function populateDatabase() {
  console.log('====================================================');
  console.log('  NebryssCompanion - Database Population Script');
  console.log('====================================================');

  if (!fs.existsSync(localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }

  let mongoConnected = false;
  let client = null;

  try {
    console.log(`[Mongo] Attempting connection to ${mongoUri.replace(/:[^:@]+@/, ':****@')}...`);
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 4000, tlsAllowInvalidCertificates: true });
    await client.connect();
    mongoConnected = true;
    console.log('[Mongo] Connection SUCCESSFUL!\n');
  } catch (err) {
    console.warn('[Mongo] Cloud/Local Mongo unavailable:', err.message);
    console.log('[LocalDB] Falling back to Local PC Filesystem Storage (`local-db/`)...\n');
  }

  for (const item of collectionsMap) {
    const filePath = path.join(assetsDir, item.jsonFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`[Skip] ${item.jsonFile} does not exist in src/assets.`);
      continue;
    }

    try {
      const rawData = fs.readFileSync(filePath, 'utf8');
      let data = JSON.parse(rawData);

      if (item.collection === 'items' && data && data.items && Array.isArray(data.items)) {
        data = data.items;
      } else if (item.collection === 'locations' && data && data.locations && Array.isArray(data.locations)) {
        data = data.locations;
      }

      // Save to local-db folder as filesystem database
      const localFile = path.join(localDbDir, `${item.collection}.json`);
      fs.writeFileSync(localFile, JSON.stringify(data, null, 2));

      if (mongoConnected && client) {
        const targetDb = client.db(item.usePlayersDb ? playersDbName : mainDbName);
        const coll = targetDb.collection(item.collection);

        if (Array.isArray(data)) {
          if (data.length > 0) {
            const docsToInsert = data.map(doc => {
              const clone = { ...doc };
              if (clone._id && typeof clone._id === 'object' && clone._id.$oid) {
                delete clone._id;
              }
              return clone;
            });
            await coll.deleteMany({});
            const res = await coll.insertMany(docsToInsert);
            console.log(`[MongoDB] ${item.collection} -> Populated ${res.insertedCount} items.`);
          }
        } else if (typeof data === 'object') {
          const clone = { ...data };
          if (clone._id && typeof clone._id === 'object' && clone._id.$oid) {
            delete clone._id;
          }
          await coll.deleteMany({});
          await coll.insertOne(clone);
          console.log(`[MongoDB] ${item.collection} -> Populated 1 object item.`);
        }
      } else {
        const count = Array.isArray(data) ? data.length : 1;
        console.log(`[LocalDB] ${item.collection} -> Populated ${count} items in local filesystem database.`);
      }
    } catch (err) {
      console.error(`[Error] Failed populating ${item.collection}:`, err.message);
    }
  }

  if (client) {
    await client.close();
  }

  console.log('\n====================================================');
  console.log('  🎉 DATABASE POPULATION COMPLETE!');
  console.log('====================================================');
}

populateDatabase();
