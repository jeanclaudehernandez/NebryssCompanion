const fs = require('fs');
const path = require('path');
const { MongoClient, BSON } = require('mongodb');
const EJSON = BSON.EJSON;

// Load environment variables (.env preferred, fallback to .env.duckdns)
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
const mainDbName = process.env.MONGODB_DB_MAIN || process.env.MONGODB_DB_NAME || 'Nebryss-assets';
const playersDbName = process.env.MONGODB_DB_PLAYERS || process.env.MONGODB_PLAYERS_DB_NAME || 'NebryssCampaignAssets';

const backupRootDir = path.join(__dirname, '../db-backup');
const systemDatabases = new Set(['admin', 'config', 'local']);

async function exportDatabase() {
  console.log('====================================================');
  console.log('  NebryssCompanion - MongoDB Backup Export');
  console.log('====================================================');

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log(`[Mongo] Connected to ${mongoUri.replace(/:[^:@]+@/, ':****@')}\n`);

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    // Ensure both mainDbName and playersDbName + any non-system DBs are included
    const targetDbNames = new Set([mainDbName, playersDbName]);
    for (const dbInfo of databases) {
      if (!systemDatabases.has(dbInfo.name)) {
        targetDbNames.add(dbInfo.name);
      }
    }

    if (!fs.existsSync(backupRootDir)) {
      fs.mkdirSync(backupRootDir, { recursive: true });
    }

    const manifest = {
      exportedAt: new Date().toISOString(),
      databases: {}
    };

    for (const dbName of targetDbNames) {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      if (collections.length === 0) continue;

      const dbDir = path.join(backupRootDir, dbName);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Clean old json files in dbDir that no longer exist in DB
      const currentColNames = new Set(collections.map(c => `${c.name}.json`));
      for (const existingFile of fs.readdirSync(dbDir)) {
        if (existingFile.endsWith('.json') && !currentColNames.has(existingFile)) {
          fs.unlinkSync(path.join(dbDir, existingFile));
        }
      }

      manifest.databases[dbName] = [];

      for (const colInfo of collections.sort((a, b) => a.name.localeCompare(b.name))) {
        const colName = colInfo.name;
        const docs = await db.collection(colName).find({}).toArray();
        const filePath = path.join(dbDir, `${colName}.json`);

        // Serialize using Extended JSON (relaxed) to preserve ObjectId / Date types cleanly
        const serialized = EJSON.stringify(docs, null, 2, { relaxed: true });
        fs.writeFileSync(filePath, serialized, 'utf8');

        manifest.databases[dbName].push({
          collection: colName,
          count: docs.length
        });
        console.log(`[Export] ${dbName}.${colName} -> ${docs.length} documents saved to db-backup/${dbName}/${colName}.json`);
      }
    }

    fs.writeFileSync(
      path.join(backupRootDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    console.log('\n====================================================');
    console.log('  ✅ MONGODB BACKUP EXPORT COMPLETE!');
    console.log(`  📁 Saved to: ${backupRootDir}`);
    console.log('====================================================');
  } catch (err) {
    console.error('[Error] Failed to export MongoDB collections:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

async function importDatabase() {
  console.log('====================================================');
  console.log('  NebryssCompanion - MongoDB Backup Restore / Import');
  console.log('====================================================');

  if (!fs.existsSync(backupRootDir)) {
    console.error(`[Error] Backup folder not found at ${backupRootDir}`);
    process.exit(1);
  }

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log(`[Mongo] Connected to ${mongoUri.replace(/:[^:@]+@/, ':****@')}\n`);

    const entries = fs.readdirSync(backupRootDir, { withFileTypes: true });
    const dbDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dbName of dbDirs) {
      const dbDir = path.join(backupRootDir, dbName);
      const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.json')).sort();
      const db = client.db(dbName);

      for (const file of files) {
        const colName = file.replace(/\.json$/, '');
        const filePath = path.join(dbDir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const docs = EJSON.parse(raw);

        const collection = db.collection(colName);
        await collection.deleteMany({});
        if (Array.isArray(docs) && docs.length > 0) {
          await collection.insertMany(docs);
        }
        console.log(`[Import] ${dbName}.${colName} <- Restored ${Array.isArray(docs) ? docs.length : 0} documents.`);
      }
    }

    console.log('\n====================================================');
    console.log('  ✅ MONGODB BACKUP IMPORT COMPLETE!');
    console.log('====================================================');
  } catch (err) {
    console.error('[Error] Failed to import MongoDB collections:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

const mode = process.argv[2] || 'export';
if (mode === 'import' || mode === 'restore') {
  importDatabase();
} else {
  exportDatabase();
}
