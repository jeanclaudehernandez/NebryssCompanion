---
name: Nebryss FLUX Ships
description: Companion to the Nebryss FLUX Prompt Designer (read that first). Explains in detail how to prompt the Mist ships LoRA (wooden flying sailing ships above the mist: hull, sails, the three tested wing styles, propellers, balloons, and jet engines placed on the stern) and the Voidships LoRA (gothic Imperial warships in space: prow, spires, gun decks, lance batteries, fleet battles), including the wording that works, the words to avoid, framing, and when to add parts afterwards with Fix an area.
---

# FLUX prompts: ships

Ships use landscape size (1216x832). Describe the ship as verbosely as a figure: the hull's shape, wood or metal and colour, the decks and railings, the figurehead or prow, the masts and sails, the lanterns and banners, then the sky or space around it, the light and the framing.

## Mist ships (`m1stsh1p, a flying ship`)
Wooden flying sailing ships above the mist. Name the hull (wooden galleon, sleek or round), the sails and their colour, and the sky it flies through (sea of mist, clouds, rock spires, sunset). Wings and engines appear only when the prompt says how they are built; the trigger alone gives a galleon in the sky.

Wings, pick one style:
- Fish-fin: "large swept-back fin wings on both sides of the stern like a flying fish's, thin curved spines with translucent copper membrane and a scalloped trailing edge, a row of smaller spiny fins along the bottom of the hull".
- Bat: "wide bat-like wings of dark wooden ribs with weathered canvas stretched between them, spread flat to the sides".
- Fan fins: "rows of small cream folding-fan fins along the lower hull, pleated like paper fans on thin wooden ribs, angled down and back".

Other ways to fly: spinning propellers on short iron struts, a ribbed balloon envelope above the deck, glowing blue crystal energy around the hull.

Jet engines (never say "turbines": FLUX draws odd drums on poles): "two slim brass-clad jet engines mounted high on the sides of the stern, one on each side of the hull just below the rear deck rail, parallel to the hull and pointing backwards, round fan intake at the front and a glowing blue exhaust at the back". Never compare them to an airliner or airplane: that adds airplane wings.

Wings and engines in one prompt place the engines less exactly. Then suggest generating the ship with wings first and adding the engines with the studio's Fix an area on the stern, with only the engine sentence as the prompt (Change about 0.75).

Framing: "side view" or "three-quarter view from slightly behind" to show the stern; FLUX often turns the ship towards the camera anyway.

## Voidships (`40k-battleship, a gothic Imperial battleship`)
Gothic Imperial warships in space: name the prow (armoured ram, golden aquila), the cathedral-like spires and towers along the hull, the gun decks and lance batteries, the colour of the hull, and the scene (orbit over a planet, nebula, a fleet battle with lance beams and explosions).
