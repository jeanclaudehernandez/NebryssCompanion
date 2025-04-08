const fs = require('fs');

// Read the bestiary file
const bestiary = JSON.parse(fs.readFileSync('./bestiary.json', 'utf8'));

// Group by faction
const factionMap = {};

bestiary.forEach(entry => {
  if (!factionMap[entry.faction]) {
    factionMap[entry.faction] = [];
  }
  factionMap[entry.faction].push(entry);
});

// Write each faction to a separate file
Object.keys(factionMap).forEach(faction => {
  const filename = `./bestiaryFiles/${faction.replace(/\s+/g, '')}Bestiary.json`;
  fs.writeFileSync(filename, JSON.stringify(factionMap[faction], null, 2));
  console.log(`Created ${filename} with ${factionMap[faction].length} entries`);
});

console.log('Splitting complete. Total factions:', Object.keys(factionMap).length); 