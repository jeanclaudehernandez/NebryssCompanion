---
name: Nebryss FLUX Details and Style
description: Companion to the Nebryss FLUX Prompt Designer (read that first). Explains in detail how to use the detail LoRAs (Bolters for boltguns, bolt pistols, bolt rifles and heavy bolters; Space Marine helmets for helmeted close-ups) in an image prompt (the hand-drawn look is added to every picture by the studio, never by the prompt), how to describe each weapon and helmet so the LoRA draws it correctly, and how to write a prompt for the studio's Fix an area, which repaints one painted part of a finished picture (a gun, a helmet, a chest emblem, a gauntlet) with only the LoRA that part needs.
---

# FLUX prompts: detail and style LoRAs

Detail and style LoRAs are stacked on a subject LoRA; the studio lowers the strengths itself. Describe the detailed part as verbosely as the rest of the prompt: its shape, size, colours, materials, markings and how it is held or worn.

**Bolters** (detail), trigger `b0ltg4n, a Warhammer 40,000 boltgun` (or bolt pistol, bolt rifle, heavy bolter): add it whenever a boltgun or bolt pistol is visible, or FLUX draws a modern assault rifle. Name the variant, then describe it: a thick boxy body, a short heavy barrel with a muzzle brake, a curved or straight box magazine, its colour (black, gunmetal, chapter colours) and decorations (a gold aquila on the side, purity seals, a skull on the stock), and how it is held ("holding a black boltgun with a gold aquila across his chest with both hands", "firing a bolt pistol one-handed, muzzle flash at the barrel").

**Space Marine helmets** (detail), trigger `sm4h3lm, a Space Marine helmet`: Mk X helmets, Chaplain skull helmets, captain crests and laurels, any chapter colours. Add it for helmeted marines in close-ups and waist-up shots; it has little effect in full-body shots. Describe the helmet part by part: its colour and trim, the shape of the faceplate and breathing grille, the eye lenses and their glow colour, any crest, plume, laurel wreath or skull, the emblem on the brow, and battle damage ("a white helmet with dark blue trim, a silver skull on the brow, glowing red eye lenses, scratched paint and a cracked left lens").

**The hand-drawn look** is on every picture: the studio adds its LoRA and trigger by itself after the GM sends the request. Never list it among the LoRAs and never write its trigger; no medium at the end either (no "digital painting"), since that style draws the ink outlines and flat colours. Still describe the subject, setting and colours in full detail.

**Fix an area**: the GM paints over one part of a finished picture in the studio, picks the LoRAs for that part, and repaints only it; everything outside the painted area stays the same. Use it to:
- add a detail LoRA to just one part (a gun or a helmet), at about 0.6-0.75 Change;
- correct a detail that leaked from another figure when two subject LoRAs were stacked (an Imperial eagle on a Chaos marine's chest, a blue gauntlet on a red marine), with only that figure's LoRA, at about 0.85 Change.

The prompt for a fix describes only what should be in the painted area, in detail, starting with that LoRA's trigger ("ch40s40k, a Chaos Space Marine, the chest plate of a Khorne Berserker in blood-red power armour, a large brass eight-pointed Khorne star emblem in the centre of the chest, spiked dark brass trim, battered red ceramite, lit by orange firelight, digital painting"). Never write an instruction ("fix", "remove", "same as before").
