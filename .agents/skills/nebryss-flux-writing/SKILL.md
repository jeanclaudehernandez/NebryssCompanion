---
name: Nebryss FLUX Prompt Writing
description: Companion to the Nebryss FLUX Prompt Designer (read that first; always read this one for every image prompt). Explains in detail how to write the FLUX prompt itself - the order of its parts, how verbose to be (about 150-300 words describing every visible part with its colour, material and condition), the writing rules, how to describe two or more figures so stacked LoRAs do not leak details onto each other (and the Fix later line when they do), how to prompt the 40k battle scenes and Hive city streets LoRAs, and two full worked examples (a single portrait and a two-figure duel).
---

# FLUX prompts: how to write them

## Prompt order
One paragraph of plain descriptive English, usually **150-300 words** (the studio accepts up to 4,000 characters). Write it in this order:
1. **Trigger phrases** from the designer's LoRA table, exactly as written (the style's first).
2. **Who**: role and rank, sex, age, build and size (a Space Marine is a giant next to a human), face and hair, or the helmet instead (its shape, colour, eye lenses and their glow, crest, horns, plumes, damage), and the expression or body language.
3. **What they wear, part by part**: the chest plate and its emblem, the shoulder pads (trim, spikes, chapter or legion symbol), the arms and gauntlets, the belt and what hangs from it, the legs and boots, any cape, tabard, robes or purity seals. For each part give the colour, the material (ceramite, brass, gold, leather, rusted iron, chitin) and its condition (polished, battered, scorched, blood-spattered).
4. **What they hold and do**: every weapon by name and look (size, colour, glow, teeth, energy), which hand holds it and how, the pose and the action ("bringing a chainaxe down in both hands", "thrusting a power sword forward").
5. **Where**: the ground under them (rubble, mud, skulls, cathedral floor), the near background and the far background (ruined gothic spires, burning hab-blocks, stained-glass windows, ash wastes, voidship bridge, swamp), and the weather.
6. **Light and atmosphere**: the light source and its colour ("lit from the side by orange firelight", "cold blue moonlight from a broken window"), and what hangs in the air (smoke, embers, fog, rain, sparks, dust).
7. **Framing**: full body, waist-up or close-up; the camera angle (low angle, eye level, three-quarter view, side view); wide shot for scenes.
8. **No medium**: the studio adds the hand-drawn look to every picture by itself, so leave out medium words (digital painting, oil painting, film still, 3D render...) and never write the hand-drawn trigger.

## Be verbose
Whatever the prompt leaves out, FLUX or the LoRA fills in with its own guess, often a detail from another faction (a loyalist eagle on a Chaos marine, a medieval knight instead of a Custodian). So describe every visible part, give each part its colour, and repeat the faction's look in your own words even though the trigger phrase already names it. One sentence per figure or part reads better than a long list of commas.

## Rules
- FLUX reads natural sentences. No tag soup, no (word:1.3) weights, no "masterpiece, best quality, 8k", no negative prompts (the studio ignores negatives).
- Say what you want, never what you do not want ("clean-shaven", not "no beard"; "a brass Khorne star on his chest", not "no aquila").
- Short text in the picture works only in quotes: a banner reading "NEBRYSS".
- For a group of the same kind, give a count and one shared description, then describe the leader on their own ("three Ork boyz charging behind a huge warboss in mega armour").
- Keep the campaign's lore: Nebryss is Warhammer 40,000, grimdark and gothic.

## Two or more figures (a duel, a squad facing an enemy)
- Use landscape size, and describe each figure in its own sentences, starting with where it stands: "On the left, ...", "On the right, ...", "In the background, ...".
- Repeat the colours on every part of each figure ("his red gauntlets", "her black armoured boots"), and give each figure its own emblem ("a white aquila on his chest", "a brass eight-pointed Khorne star on his chest plate").
- Then say how they interact and where their weapons meet ("the chainaxe and the power sword clash between them in a burst of sparks").
- Stacked subject LoRAs leak details onto each other (tested: the Ultramarines LoRA put a gold Imperial eagle and a blue gauntlet on a Khorne marine). Under **Fix later**, name the part to repaint with the studio's Fix an area using only that figure's LoRA, with a prompt that describes only that part (imagedetails explains). Per-region LoRAs while generating are not available.

## Scene LoRAs
- **40k battle scenes**: name both sides with their colours and gear ("blue Ultramarines Space Marines with boltguns fighting red Khorne Chaos Space Marines with chainaxes"), what each side is doing (charging, firing, holding a barricade), the place (ruined gothic city, cratered battlefield, frozen ruin, burning hive), the vehicles ("Imperial Guard tanks with long cannons"), and the effects: smoke, fire, explosions, muzzle flashes, las-bolts, banners. End with "wide shot". Without the sides named it mixes random factions.
- **Hive city streets**: describe the street from near to far: the pavement and gutters, the stalls, pipes and cables, the gothic facades with statues and aquilas, the towering hab-spires and the smog above, the crowd or the emptiness, and the light (neon, sodium lamps, shafts of light through smog).

## Examples
Examples only, not campaign data.

**One figure.** User: "hand-drawn portrait of this Inquisitor NPC"; get_entity returned: female, scarred, red hair, Ordo Hereticus, carapace armour, plasma pistol. Guides read: imagewriting, imageimperium, imagedetails.

- **LoRAs**: Inquisitors
- **Size**: portrait 832x1216
- **Prompt**:
```
1nq40k, a Warhammer 40,000 Inquisitor, a stern woman in her forties with a lean, hard face, short copper-red hair swept back from her forehead and a pale scar running from her left eyebrow down across her cheek, her green eyes narrowed in suspicion. She wears black carapace armour with polished gold trim: a moulded breastplate with a silver Ordo Hereticus rosette at its centre, layered shoulder plates edged in gold, a high armoured collar, black leather gauntlets and a belt hung with purity seals of red wax and cream parchment. A heavy crimson cape falls from her shoulders to the floor. In her right hand she raises a plasma pistol whose coils glow bright blue-white, the barrel pointed past the viewer. She stands in the nave of a burning gothic cathedral, broken pews and fallen statues behind her and tall stained-glass windows glowing above, lit from the side by orange firelight with drifting smoke and embers in the air, waist-up shot, low angle
```

**Two figures.** User: "an Ultramarine fighting a Khorne Chaos Space Marine". Guides read: imagewriting, imageimperium, imagechaosxenos.

- **LoRAs**: Space Marines (Ultramarines), Chaos
- **Size**: landscape 1216x832
- **Prompt**:
```
UltraM40k, a space marine, ch40s40k, a Chaos Space Marine, two armoured giants locked in brutal melee combat in the ruins of a burning gothic cathedral. On the left, a loyal Ultramarines Space Marine in deep blue power armour with gold trim and a white aquila on the chest, a blue full-face helmet with glowing green eye lenses and a red crest, blue gauntlets, a torn blue cape, thrusting a crackling blue power sword. On the right, a hulking traitor Khorne Berserker in blood-red and dark brass power armour with jagged spikes on his shoulder pads, a brass eight-pointed Khorne star on his chest plate, red gauntlets, a snarling helmet with two large curved black horns and glowing red eyes, bloody skulls chained to his belt, swinging a roaring chainaxe with a toothed chain blade. The chainaxe and the power sword clash between them in a burst of sparks. Shattered stained-glass windows, drifting embers and smoke behind them, lit by orange firelight, dynamic action, wide shot, low angle, digital painting
```
- **Fix later**: if the Khorne marine gets an Imperial eagle or blue gauntlets, repaint his chest or hands with Fix an area and only the Chaos LoRA.
