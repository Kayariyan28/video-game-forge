# Asset prompting: consistent cast, keyframes and playable clips

## 1. Style bible (write once, paste everywhere)
- **Render line**: e.g. "high-end stylized 3D animated feature-film still, appealing rounded shapes, detailed soft fur, soft global illumination", or "cinematic AAA game cinematic, photoreal, volumetric haze, anamorphic".
- **Palette and light**: e.g. "cool blue moonlight with warm amber accents".
- **Tail**: "full frame with no letterbox bars. No text, no watermark, no HUD, no extra characters."
- One **locked description per character and location**: material, colour and cut for every garment, plus one distinguishing detail. Re-use it word for word.

## 2. Reference sheets
Use one image per character, in 16:9 split-screen: full body on the left, chest-up on the right, plain studio background, character only. Use one establishing plate per location, empty of characters.

Add "An original character that resembles no existing film or game character." For adults, add "defined adult facial structure, no babyface".

## 3. Keyframes: one still per game state
Template, with the location plate first and characters as references:
> Use image 1 as the location: the same <place, key props>. The <character> from image 2 (exactly the same face, <outfit list>) <pose / action frozen at the start of the clip>. The <character> from image 3 (same …) <…>. <Shot size, angle, lens>. <Style render line>, <palette>. <Tail>.

- **Frame for gameplay.** The thing the player watches must be big and unobstructed: the guard's back, the laser emitters, the boss's chest. Leave room for HUD corners (about 5% top, 15% bottom).
- **Hotspot objects** (items, targets) must be clearly visible, stationary, and not touching the frame edge.
- **Action keyframes** freeze the most readable moment: mid-flip, mid-blast.
- **Review all keyframes as one contact sheet** before any video. Regenerate drifted faces now; it's cheap here and expensive later.

## 4. Clips: motion, camera and sound only
The keyframe already fixes the look. Write the prompt as overview → motion beats in time order → camera → sound → exclusions.

**Seamless idle loop** (first frame = last frame = keyframe). Write the gameplay timing into the motion:
> Seamless patrol loop, camera completely locked. The guard slowly walks away with his back turned, then stops, turns around to face the camera sweeping his flashlight, then turns his back again and walks back to exactly his starting position and pose. The raccoon behind the column ducks out of sight when the guard faces the camera and peeks out when he turns away. Sound: … No background music, no dialogue. No cuts.

> Seamless loop, camera locked. The red laser grid blinks in a steady rhythm: every beam switches fully off for about one second, then snaps back on and stays on until the loop returns to the first frame.

**Reaction wind-up** (for a QTE). Build to one unmistakable beat and end on it:
> …nose twitches faster and faster, head tilts back, mouth opening wider: ah… ah… ahh… The camera slowly pushes in, and the clip ends right before the sneeze.

**Action / outcome.** Say how it ends, so the cut back to the loop isn't jarring:
> …lands softly at the far end, strikes a proud pose, then the lasers snap back on behind him.

**Dialogue.** Keep lines short: `The guard mumbles: "Huh? Must be the donuts again."` Masks and helmets hide lip-sync issues.

**Sound.** List concrete effects. Write **"No background music."** so the engine's score sits underneath cleanly.

**Duration.** 3 s for wind-ups and stings, 4 s for actions and loops, 5–8 s for intro and ending cutscenes.

## 5. Moderation and retries
- Heists, weapons and violence can trip filters. Soften the wording ("playful sneaky raccoon", "cartel enforcer" → "armored enforcer"), avoid gore, and keep it family-friendly.
- If an image model blocks a request, retry the same prompt on another model. If a video model blocks a request, simplify the action description.
- Failed generations are usually uncharged. Tell the user anyway.

## 6. Cost tips
- Sheets and keyframes are about 10–20% of the budget, and they decide quality. Don't skimp.
- Prefer several short clips over one long one. Generate 720p for the game and upscale only showcase picks.
- Re-use one clip for several states where the meaning allows (a "hit" clip after either attack).
