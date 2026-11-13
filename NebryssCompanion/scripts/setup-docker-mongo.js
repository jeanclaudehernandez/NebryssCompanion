const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { MongoClient } = require('mongodb');

const CONTAINER_NAME = 'nebryss-mongodb';
const MONGO_PORT = 27017;
const VOLUME_NAME = 'nebryss_mongodb_data';
const MONGO_IMAGE = 'mongo:latest';

function findDockerExecutable() {
  const candidates = [
    'C:\\Users\\Jean\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const binDir = path.dirname(candidate);
      const currentPath = process.env.PATH || process.env.Path || '';
      if (!currentPath.includes(binDir)) {
        const updatedPath = `${binDir};${currentPath}`;
        process.env.PATH = updatedPath;
        process.env.Path = updatedPath;
      }
      return candidate;
    }
  }
  return 'docker';
}

function findDockerDesktopGui() {
  const candidates = [
    'C:\\Users\\Jean\\AppData\\Local\\Programs\\DockerDesktop\\Docker Desktop.exe',
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isDockerDaemonRunning(dockerExe) {
  const res = spawnSync(dockerExe, ['info'], { stdio: 'ignore' });
  return res.status === 0;
}

async function ensureDockerDaemon(dockerExe) {
  if (isDockerDaemonRunning(dockerExe)) {
    console.log('[Docker] Docker daemon is running.');
    return;
  }

  const desktopExe = findDockerDesktopGui();
  if (desktopExe) {
    console.log(`[Docker] Docker daemon is not running. Launching Docker Desktop (${desktopExe})...`);
    const child = spawn(desktopExe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
  } else {
    console.log('[Docker] Waiting for Docker daemon to start...');
  }

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (isDockerDaemonRunning(dockerExe)) {
      console.log('[Docker] Docker daemon is now ready!');
      return;
    }
    process.stdout.write('.');
  }
  console.log('');
  throw new Error('Docker daemon did not become ready in time. Please ensure Docker Desktop is open.');
}

function ensureMongoContainer(dockerExe) {
  const checkExisting = spawnSync(
    dockerExe,
    ['ps', '-a', '--filter', `name=^${CONTAINER_NAME}$`, '--format', '{{.Names}}'],
    { encoding: 'utf8' }
  );

  const existingName = (checkExisting.stdout || '').trim();
  if (existingName === CONTAINER_NAME) {
    console.log(`[Docker] Container '${CONTAINER_NAME}' already exists. Starting it...`);
    const startRes = spawnSync(dockerExe, ['start', CONTAINER_NAME], { stdio: 'inherit' });
    if (startRes.status !== 0) {
      throw new Error(`Failed to start existing container '${CONTAINER_NAME}'.`);
    }
    return;
  }

  console.log(`[Docker] Creating and starting MongoDB container '${CONTAINER_NAME}' on port ${MONGO_PORT}...`);
  const runRes = spawnSync(
    dockerExe,
    [
      'run',
      '-d',
      '--name', CONTAINER_NAME,
      '--restart', 'unless-stopped',
      '-p', `${MONGO_PORT}:27017`,
      '-v', `${VOLUME_NAME}:/data/db`,
      MONGO_IMAGE
    ],
    { stdio: 'inherit' }
  );

  if (runRes.status !== 0) {
    throw new Error(`Failed to create container '${CONTAINER_NAME}'.`);
  }
}

async function waitForMongoReady() {
  const uri = `mongodb://127.0.0.1:${MONGO_PORT}/admin`;
  console.log(`[Mongo] Waiting for MongoDB container on 127.0.0.1:${MONGO_PORT} to accept connections...`);

  for (let i = 0; i < 30; i++) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      await client.close();
      console.log('[Mongo] MongoDB is ready and accepting connections!\n');
      return;
    } catch (e) {
      try { await client.close(); } catch (_) {}
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error('MongoDB container started, but did not respond on port 27017 in time.');
}

async function main() {
  console.log('====================================================');
  console.log('  NebryssCompanion - Docker MongoDB Setup & Restore');
  console.log('====================================================');

  const dockerExe = findDockerExecutable();
  await ensureDockerDaemon(dockerExe);
  ensureMongoContainer(dockerExe);
  await waitForMongoReady();

  const backupScript = path.join(__dirname, 'db-backup.js');
  const importRes = spawnSync(process.execPath, [backupScript, 'import'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  if (importRes.status !== 0) {
    process.exit(importRes.status || 1);
  }
}

main().catch(err => {
  console.error('\n[Error]', err.message);
  process.exit(1);
});

