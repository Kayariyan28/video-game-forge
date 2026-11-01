# Tuning and testing

## Measure the clips (`scripts/analyze.mjs`)
```bash
node analyze.mjs bars   assets/source            # baked letterbox per clip (engine bars hide up to 12.6%)
node analyze.mjs seam   assets/source            # loops: "loops cleanly" < 6, visible jump > 14
node analyze.mjs sheet  assets/source/hall.mp4 --fps 4 --out /tmp/hall.jpg   # read with your image viewer
node analyze.mjs curve  assets/source/lasers.mp4 --roi 0.45,0.2,0.4,0.35 --channel redness
node analyze.mjs speech assets/source            # voiced spans, for subs
```
- **Timing windows.** Choose a region where the cue changes pixels:
  - a laser grid: `redness`
  - a flashlight turning toward the camera: `luma`
  - a light switching on: `luma`/`blue`

  `curve` prints low/high windows. Then **shrink each window by about 0.1–0.2 s at both ends** so it's fair. If no pixel metric works, read the contact sheet: at 4 fps, tile k is k × 0.25 s.
- **QTE `at`**: the frame where the beat lands (peak of the wind-up), from the sheet. Use `start` about 1.5 s earlier.
- **Cues** (damage numbers, shakes, sparks): the frame of each impact or muzzle flash in action clips.
- **Hotspots**: measure on the keyframe image. Make `r` 0.04–0.06, and use larger for touch.
- **Subtitles**: the start of the voiced span from `speech`. Generated lines may not match the prompt word for word. Say so if nobody has listened.

## Engine checks (in the browser console, no clicking needed)
```js
begin(); startGame(); E.run('hall');                       // skip menus, jump to a state
handleKey('Space'); E.click(0.81, 0.775); E.vars;          // act and inspect
```
For each branch, script it with a small `waitFor` helper and assert the sequence:
- every state's success and failure,
- every rule (meter to max → ending),
- every ending → results title and rank,
- a QTE with no input (late → fail).

In a background tab the browser throttles `requestAnimationFrame`, so play-time counters can read low. That's expected; the transitions still validate.

## Visual checks
Take screenshots of:
- title and briefing,
- one interactive state per mechanic (window pill, choice menu, hotspot, QTE ring, targets),
- a cutscene with bars,
- the results page.

Look for:
- HUD overlapping the subject,
- unreadable text on bright footage (`#grade` darkens the edges),
- hotspot rings not sitting on their objects.

## Autopilot dry run
```bash
node render.mjs --url http://localhost:8080/ --dry --scale 1 --max 300 --out exports/dry
```
- Prints the state trace. It must reach `results/`.
- Pick a demo route that **shows every mechanic once**, including one failure.
- It is deterministic: Math.random is seeded, and `?seed=` changes it.

## Known pitfalls (both shipped games hit these)
- A video model may add **letterbox bars partway through a clip**. Let cutscenes use the engine bars, and crop in any vertical cut-downs.
- **Serving 16+ large clips in parallel** from a simple static server can hang one request. The engine loads four at a time with retries.
- Some ffmpeg builds lack `drawtext`: `analyze.mjs` falls back to unlabelled sheets. ffmpeg 7+ needs `-/filter_complex` for script files: `mix.mjs` detects this.
- Trimming split branches in one ffmpeg graph ends the graph early. `mix.mjs` uses one seeked input per segment.
- Headless Chrome ignores the viewport scale factor for raw captures. `render.mjs` pins device metrics.
