const path = require('path');
const fs = require('fs');

function loadJson(relPath) {
  const p = path.resolve(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const weapons = loadJson('src/assets/weapons.json');
const weaponRules = loadJson('src/assets/weaponRules.json');

function getWeaponById(id) {
  return weapons.find(w => w.id === id);
}

function getRuleById(id) {
  return weaponRules.find(r => r.id === id);
}

function numberOrZero(x) {
  return typeof x === 'number' && !Number.isNaN(x) ? x : 0;
}

function calculatePR(entry) {
  const { Movement, Wounds, Save, APL } = entry.attributes;
  const basePR = (Wounds * 2.2) + ((6 - Save) * 7) + (Movement * 4) + (APL * 6);

  let weaponThreat = 0;
  if (Array.isArray(entry.weapons)) {
    for (const wid of entry.weapons) {
      const w = getWeaponById(wid);
      if (!w || !Array.isArray(w.profiles)) continue;
      for (const profile of w.profiles) {
        const attacks = numberOrZero(profile.attacks);
        const minDamage = numberOrZero(profile?.damage?.min);
        const ws = numberOrZero(profile.ws);
        const threatFromStats = attacks * minDamage * (7 - ws);
        let rulesSum = 0;
        if (Array.isArray(profile.specialRules)) {
          for (const r of profile.specialRules) {
            const ruleDef = getRuleById(r.ruleId);
            if (ruleDef && typeof ruleDef.prModifier === 'number') {
              rulesSum += ruleDef.prModifier;
            }
          }
        }
        const totalThreat = threatFromStats + rulesSum;
        if (totalThreat > weaponThreat) weaponThreat = totalThreat;
      }
    }
  }

  let abilityScore = 0;
  if (Array.isArray(entry.abilities)) {
    for (const ab of entry.abilities) {
      if (typeof ab.prModifier === 'number') abilityScore += ab.prModifier;
    }
  }

  const total = Math.round(basePR + weaponThreat + abilityScore);
  return { total, basePR, weaponThreat, abilityScore };
}

function runForFile(fileRel) {
  const bestiary = loadJson(fileRel);
  const results = [];
  for (const entry of bestiary) {
    const calc = calculatePR(entry);
    const current = entry.pr;
    results.push({
      id: entry.id,
      name: entry.name,
      currentPR: current,
      calculatedPR: calc.total,
      valid: current === calc.total,
      breakdown: calc
    });
  }

  const mismatches = results.filter(r => !r.valid);
  const summary = {
    total: results.length,
    valid: results.length - mismatches.length,
    invalid: mismatches.length
  };

  console.log(`PR Validation: ${fileRel}`);
  console.log(`Total: ${summary.total} | Valid: ${summary.valid} | Invalid: ${summary.invalid}`);
  if (mismatches.length) {
    console.log('\nMismatches:');
    for (const r of mismatches) {
      const b = r.breakdown;
      console.log(`- [${r.id}] ${r.name}: current=${r.currentPR} calculated=${r.calculatedPR}`);
      console.log(`    base=${b.basePR.toFixed(2)} weaponThreat=${b.weaponThreat.toFixed(2)} abilityScore=${b.abilityScore.toFixed(2)}`);
    }
  }
}

function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    runForFile('src/assets/bestiaryFiles/NebryssianLiberationRepublicBestiary.json');
  } else {
    for (const fileRel of args) {
      runForFile(fileRel);
      console.log('');
    }
  }
}

run();
