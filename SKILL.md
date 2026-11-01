---
name: video-game-forge
description: Design and build small playable browser games (or rapid game-concept prototypes) whose graphics are AI-generated images and video clips, using whichever image/video provider the user chooses (any MCP server or API). Covers concept → state graph → consistent cast and keyframes → video clips as game states → a data-driven engine (game.json) with timing windows, reaction rings, hotspots, choices, targets, meters, endings → playtest → optional deterministic 4K gameplay render. Use when the user wants to "make a game from AI video", "turn generated clips into something playable", prototype a game idea with video models, build an FMV / interactive-video / cinematic mini-game, or reuse this workflow with a different model provider.
---

# Video Game Forge

AI video models render the world; a small engine makes it playable. Each **game state is one clip** (idle loops, actions, reactions, cutscenes, endings). The engine cuts between clips on player input and draws live gameplay on top: timing windows, reaction rings, clickable hotspots, choices, targets, meters, HUD, sound. Everything game-specific lives in one `game.json`, so a new game is mostly design + assets + data.

Proven on two very different games built with this exact workflow (see `examples/`): a boss fight (aim, abilities, dodge/counter reactions, phase 2) and a stealth heist (timing windows inside loops, route choice, inventory hotspot, alert meter, three endings).

## Ground rules
- **The user picks the providers.** Never assume a brand. Detect what's available, then ask (Phase 0).
- **Spend nothing without a quote and a yes.** Give a credit/cost estimate per phase before generating; get explicit approval; track spend against it.
- **Original IP only.** Characters may be *inspired* by a reference style, never copies of existing characters, brands, or real people.
- **Credit line:** ask the user how the game should be credited (e.g. "Built & designed by <name>") and put it in `meta.credit`.
- Work in phases; show the user each phase's output (cast sheets, keyframes, clips) before building on it.

## Phase 0 — Choose providers (always ask)
1. Inventory what this session can use:
   - MCP tools whose names/descriptions mention image or video generation (text-to-image, image edit with references, image-to-video, first/last frame).
   - API keys present in the environment (check names only, never print values).
   See `references/providers.md` for what to look for and how to judge each provider.
2. Ask the user (AskUserQuestion) for: **image provider/model**, **video provider/model**, and whether clips should have **generated sound**. Recommend from what's available, with reasons (reference-image support, first+last frame support, price, max duration, audio).
3. Confirm the **capability checklist** (providers.md §Capabilities). If the video model has no last-frame input, plan loops with the fallbacks there.
4. Record choices in `assets/manifest.json` (`providers`, then one entry per generated asset with model, prompt, inputs, output, cost).

## Phase 1 — Concept & design (no spending)
Interview briefly: genre/fantasy, tone, art style, session length (1–3 min is the sweet spot), platform (desktop / touch), budget, credit line. Then produce a one-page design and get approval:
- **Core loop** in one sentence and the **mechanics** it uses, picked from `references/design-patterns.md` (timing windows, reaction rings, hotspots, choices, targets, cooldown abilities, meters/rules, random timers).
- **State graph**: every state, its clip, how you get in and out (a mermaid graph is ideal).
- **Shot list**: one row per clip, with id, type (`loop` | `action` | `reaction` | `cutscene` | `ending`), seconds, first/last-frame plan, what must happen *when* (that becomes your timing data), sound/dialogue.
- **Variables, rules, endings, rank.**
- **Budget**: images + video seconds × provider price.
Typical size: 10–17 clips, 3–8 s each.

## Phase 2 — Assets (spend, in waves, each approved)
Follow `references/asset-prompting.md`. Order matters:
1. **Style bible + reference sheets.** One sheet per character, one plate per location. Re-use their exact descriptions everywhere. If a model's safety filter rejects a sheet, retry with softer wording and/or another model; don't stop.
2. **Keyframes: one still per state**, generated *from the sheets as references*. Review them all as a contact sheet before any video. This is where consistency is won.
3. **Clips: image-to-video from each keyframe.** Idle loops use the same image as first *and* last frame. Write loop prompts so the gameplay timing is visible (e.g. "the guard walks away, turns to face the camera, turns back"). Prompts describe motion + camera + sound only; the keyframe already fixes look.
4. Save full-quality originals to `assets/source/`; never edit them in place.

## Phase 3 — Assemble
1. Scaffold: `scripts/new-game.sh <folder>` copies the engine (`index.html`, `engine.css`, `engine.js`, `render/hooks.js`), a starter `game.json` and `assets/{source,video,img}` + `manifest.json`. Do this at the start of Phase 2 so assets land in place.
2. Encode clips: `scripts/prep-clips.sh assets/source assets/video 720` (16:9 H.264, short GOP, silent track added if missing).
3. Measure, don't guess (`scripts/analyze.mjs`; details in `references/tuning-and-testing.md`):
   - `bars`: baked letterbox; the engine's cinematic bars hide up to 12.6%.
   - `seam`: loop cleanliness.
   - `sheet`: contact sheets to read when things happen.
   - `curve --roi …`: per-frame pixel metric to measure timing windows (lasers off, guard facing away).
   - `speech`: subtitle times.
   - Hotspot and target positions come from the keyframe in normalised 0–1 coordinates.
4. Write `game.json`. The schema and every action are in `references/game-json.md`; start from `examples/nightpaws.game.json` or `examples/dustfall.game.json`.

## Phase 4 — Playtest (verify, then report)
Serve the folder (`python3 -m http.server`) and open it in the browser. For every branch:
- Drive it with `handleKey(code)`, `E.click(x, y)` and `E.run(stateId)` in the console.
- Assert the state sequence, the variables and the ending.
- Screenshot the key states.

Then add a `demo` route to `game.json` and run `node scripts/render.mjs --dry --scale 1`. The autopilot must reach the results screen; if a step never becomes possible it is skipped after 20 s and logged. Fix what you find before showing the user. Say plainly what was and wasn't verified (e.g. generated dialogue not checked by ear).

## Phase 5 — Showcase (optional)
- `scripts/render.mjs` + `scripts/mix.mjs`: a real frame-by-frame gameplay video at 4K/1440p/1080p (not a screen recording), with the clips' own audio plus the engine score.
- Ideas for reels, carousels and post copy are in `references/showcase.md`.

## Files
- `engine/`: the runtime template (no build step, no dependencies; Google Fonts optional).
- `scripts/`: `prep-clips.sh`, `analyze.mjs`, `render.mjs`, `mix.mjs`, plus `package.json` (`npm i` installs puppeteer-core for render).
- `references/`: `providers.md`, `design-patterns.md`, `asset-prompting.md`, `game-json.md`, `tuning-and-testing.md`, `showcase.md`.
- `examples/`: the two shipped games' `game.json` files with notes.

Requirements: Node 18+, ffmpeg/ffprobe, Python 3 (static server) and, for rendering, Google Chrome (H.264).
