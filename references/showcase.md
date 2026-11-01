# Showcase: gameplay video and social cut-downs

## Real-render gameplay video (not a screen recording)
```bash
cd scripts && npm i                                   # once: puppeteer-core
node render.mjs --url http://localhost:8080/ --scale 3 --out ../exports/Game_Gameplay_4K      # 3 = 4K, 2 = 1440p, 1.5 = 1080p
node mix.mjs --game .. --out ../exports/Game_Gameplay_4K
```
- Headless Chrome runs the game on a virtual clock, plays `game.json → demo`, seeks every clip to the exact frame, steps CSS animations and timers, and captures each frame to ffmpeg (about 10 fps capture at 4K).
- `mix.mjs` lays each clip's own audio back exactly where and how fast it played, adds the offline-rendered score and effects, and normalises to -14 LUFS.
- **4K note:** the UI renders natively at 4K, but footage is the clips' resolution scaled up. For true 4K footage, upscale the source clips first (a provider upscaler), point `src` at them, and render. Ask the user before paying for it.
- **Platforms:** the H.264 master (~40 Mbps at 4K) is too big for some uploads. Make a 1080p H.264 copy for X and LinkedIn (X limit 512 MB and 2:20) and an HEVC copy for sharing.

## Cut-downs
- **9:16 Reel or Short (30–45 s):**
  - Pick 8–12 beats: the hook first, then one beat per mechanic, the finisher or ending, then an end card.
  - Square-crop each 4K beat from inside the cinematic bars (y 12.6%–87.4%) and place it on a 1080×1920 canvas.
  - Put caption layers (HTML rendered to transparent PNG with headless Chrome) above and below, then concat with the master's audio.
- **Carousel (4:5, 1080×1350):** hook frame, cast sheets, keyframe grid, the state graph ("clips become states"), HUD over gameplay, learnings, and credit.
- **Post copy:** frame it as the build or experiment ("AI video renders the world, code makes it playable"), give the stack honestly, ask a question, credit the maker. Don't claim more than was built.
