const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const directoriesToOptimize = [
  path.join(__dirname, '../../assets'),
  path.join(__dirname, '../src/assets')
];

async function optimizeImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return;
  // Don't re-optimize files that already have a webp pair
  const webpPath = filePath.substring(0, filePath.lastIndexOf('.')) + '.webp';
  if (fs.existsSync(webpPath)) return;

  const stats = fs.statSync(filePath);
  // Only optimize files > 300 KB
  if (stats.size < 300 * 1024) return;

  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  try {
    const metadata = await sharp(filePath).metadata();
    await sharp(filePath)
      .webp({ quality: 85 })
      .toFile(webpPath);

    const newStats = fs.statSync(webpPath);
    const newSizeMB = (newStats.size / (1024 * 1024)).toFixed(2);
    console.log(`[Optimized] ${path.basename(filePath)} (${sizeMB} MB -> ${newSizeMB} MB WebP) [Resolution: ${metadata.width}x${metadata.height}]`);
  } catch (err) {
    console.error(`Error optimizing ${filePath}:`, err.message);
  }
}

async function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(fullPath);
    } else if (entry.isFile()) {
      await optimizeImage(fullPath);
    }
  }
}

async function run() {
  console.log('====================================================');
  console.log('  NebryssCompanion - Image Optimization Suite');
  console.log('====================================================');
  for (const dir of directoriesToOptimize) {
    await scanDirectory(dir);
  }
  console.log('====================================================');
  console.log('  Optimization complete!');
  console.log('====================================================');
}

run();
