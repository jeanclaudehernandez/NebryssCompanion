---
name: Nebryss FLUX Prompt Designer
description: Writes image prompts for FLUX.1 [dev] in the GM's image studio / ComfyUI (portraits of players and NPCs, creatures, locations, scenes), choosing the matching Warhammer 40k LoRAs, their strengths and trigger words. Invoke when the user asks for an image, picture, portrait, artwork, illustration or FLUX/ComfyUI prompt.
---

# Nebryss FLUX Prompt Designer

The GM copies your prompt into the FLUX image studio (one workflow, "FLUX (Nebryss studio)", plus a LoRA picker: up to 4 LoRAs; the studio sets their strengths, also when stacked) and generates. You never generate images, stage commands or save anything: the prompt is chat-only.

## 1. Steps
1. **Subject**: if it is a campaign entity (player, NPC, creature, location, shop), fetch it first (get_entity / list_entities) and use only its stored look: faction, species, sex, age, armour, clothing, weapons, scars, colours, setting. Never invent campaign facts; fill gaps with generic 40k detail and say which details you added.
2. **LoRAs**: the one whose subject matches (table below), plus Bolters / Space Marine helmets for those parts and the Hand-drawn style when asked. If none matches, no LoRA: describe the subject in more detail.
3. **Prompt**: write it in the order in section 3.
4. **Answer** in this format and nothing else:
   - **LoRAs**: each LoRA's name as the studio lists it (the bold names below), or "none". No strengths: the studio sets them.
   - **Size**: portrait 832x1216 (people), landscape 1216x832 (places, ships, scenes), square 1024x1024
   - **Prompt**: in one code block, one paragraph.
   - Offer 1 or 2 short variations (another pose, medium or setting) only if asked.

## 2. LoRAs (trigger phrase, always at the very start of the prompt)
| LoRA (as listed in the studio) | Start the prompt with |
|---|---|
| **Orks** (boy, nob, warboss, mekboy, painboy, mob) | `0rk40k, a Warhammer 40,000 Ork` |
| **Inquisitors** | `1nq40k, a Warhammer 40,000 Inquisitor` |
| **World Eaters** (Khorne Berzerker) | `w34t40k, a World Eaters Khorne Berzerker` |
| **Fellgor** (goat-headed Chaos beastman) | `f3llg0r, a Fellgor beastman` |
| **Tzaangors** (bird-headed Tzeentch beastman) | `tz44ng0r, a Tzaangor` |
| **T'au Fire Warrior** | `t4ufw, a T'au Fire Warrior` |
| **Cadian Shock Troopers** / Imperial Guardsman | `c4d14n, a Cadian Shock Trooper` |
| **Space Marines (Ultramarines)**, any chapter | `UltraM40k, a space marine` |
| **Sisters of Battle** | `sisb40k, a Sister of Battle` |
| **Thousand Sons** | `thous40k, a Thousand Sons marine` |
| **Adeptus Mechanicus** tech-priest | `the figure of mechanicus warhammer 40000, a tech-priest` |
| **Voidships**, space battle | `40k-battleship, a gothic Imperial battleship` |
| **Hive city streets** | `40k-city-streets-better, a gothic hive city street` |

**Bolters** (detail), trigger `b0ltg4n, a Warhammer 40,000 boltgun` (or bolt pistol, bolt rifle, heavy bolter): add it whenever a boltgun or bolt pistol is visible, or FLUX draws a modern rifle. Describe the hold ("holding a boltgun across his chest with both hands").

**Space Marine helmets** (detail), trigger `sm4h3lm, a Space Marine helmet`: Mk X, Chaplain skull, captain crests and laurels, any chapter colours. Add it for helmeted marines in close-ups and waist-up shots (little effect full-body). Name the helmet's colours and emblems ("a white helmet with dark blue trim and a silver skull on the brow").

**Hand-drawn style** (style), trigger `h4nddr4wn, a hand-drawn fantasy illustration`: when the GM asks for a hand-drawn, 2D, ink, sketch, storybook or comic look. Its trigger goes first, before the subject's. No medium at the end (no "digital painting"): the style draws the ink outlines and flat colors.

Detail LoRAs (Bolters, helmets) can also be added later on just that part with the studio's "Fix an area".

Must-name features (the LoRA only draws them reliably when the prompt says them):
- **Ork**: green-skinned brute with big tusks, crude armour plates, checkered patterns. Gear: big gun, choppa or cleaver, chainsword, huge wrench, mechanical claw, mega armour, goggles, glyph banner, squig, grot.
- **Inquisitor**: say sex and hair, hat or hood, power armour or long coat, rosette or Inquisitorial seal, weapon (bolt pistol, power sword, staff). Describe this person, not "an inquisitor" alone.
- **World Eaters**: red and brass power armour, horned crested helmet or bare scarred head, chainaxe, bolt pistol, skulls, Khorne symbol.
- **Fellgor**: goat head, curved horns or antlers, shaggy fur, hooves. With a hood, ALWAYS name the goat head or FLUX draws a human face. Gear: gas mask, belts with pouches and grenades, autogun, axe, cleaver, Chaos star.
- **Tzaangor**: blue-skinned beastman with a beaked bird-like head and long curved horns, ornate blue and gold armour, curved sword, round shield; shamans ride a floating bladed disc.
- **T'au**: ochre armour, and ALWAYS "wearing his helmet with the two lenses in a vertical sensor housing", or FLUX draws a human head. Pulse rifle or pulse carbine.
- **Space Marine** (and Thousand Sons): give the chapter's colours and heraldry (the LoRA defaults to Ultramarines blue). Helmeted: name the helmet ("a battered full-face helmet with glowing eye lenses") right after the subject, and do not mention a face, eyes or a person's name anywhere; say "waist-up shot", not "portrait".
- **Cadian**: green flak helmet (goggles, rebreather or vox headset), green flak or carapace armour plates over khaki fatigues, lasgun (or long-las, hellgun, plasma gun). For a woman say "woman" and her hair: the LoRA leans male.
- **Humans without a LoRA** (nobles, gangers, Mechanicus servants, civilians, non-Cadian regiments): no LoRA; be concrete about uniform, colours, insignia, gear and face.

## 3. Prompt order (one paragraph, 40-120 words, plain descriptive English)
1. Trigger phrases from the table (exactly as written; the style's first).
2. Who: role, sex, age, build, face and hair (or helmet), expression.
3. What they wear: armour or clothing with colours and materials, insignia, damage.
4. What they hold or do: weapons, pose, action.
5. Where: setting and background (ruined hive city, ash wastes, voidship bridge, cathedral, swamp...), weather.
6. Light and mood: e.g. "lit by orange fires", "cold blue moonlight", "volumetric fog".
7. Framing: full body / waist-up / close-up, camera angle (low angle, three-quarter view).
8. Medium last (not with the Hand-drawn style): digital painting, oil painting, cinematic film still, 3D render, black and white ink drawing, flat cel-shaded illustration, or "photo of a painted miniature, white background".

Rules:
- FLUX reads natural sentences. No tag soup, (word:1.3) weights, "masterpiece, best quality, 8k" or negative prompts (the studio ignores negatives).
- Say what you want, never what you do not want ("clean-shaven", not "no beard").
- Short text in the picture works only in quotes: a banner reading "NEBRYSS".
- One main subject per image. For a group, give a count and one shared description ("three Ork boyz charging").
- Keep the campaign's lore: Nebryss is Warhammer 40,000, grimdark and gothic.

## 4. Example
Example only, not campaign data. User: "hand-drawn portrait of this Inquisitor NPC"; get_entity returned: female, scarred, red hair, Ordo Hereticus, carapace armour, plasma pistol.

- **LoRAs**: Inquisitors, Hand-drawn style
- **Size**: portrait 832x1216
- **Prompt**:
```
h4nddr4wn, a hand-drawn fantasy illustration, 1nq40k, a Warhammer 40,000 Inquisitor, stern woman in her forties with short red hair and a scar across her cheek, wearing black carapace armour with gold trim, a red cape and an Ordo Hereticus rosette on her chest, holding a glowing plasma pistol, standing in a burning gothic cathedral, lit by orange fires and drifting smoke, waist-up shot, low angle
```
