# game.json reference

One file describes the whole game. Top level:
`meta`, `clips`, `vars`, `hud`, `controls`, `rules`, `states`, `endings`, `rank`, `results`, `demo`.
Coordinates are normalised to the 16:9 stage (0–1, origin top-left). Times inside a state are **clip seconds**.

## meta
```json
{ "title": "NIGHT PAWS", "subtitle": "The Moonstone Caper", "kicker": "small caps line", "blurb": "title-page paragraph",
  "credit": "K28", "start": "intro", "mood": "sneaky", "musicLevel": 0.4, "playVolume": 0.85, "motes": 9,
  "titleImage": "assets/img/k02.jpg",
  "theme": { "accent": "#ff5a6e", "accent2": "#5ee0ff", "mote": "190,220,255" },
  "briefing": { "kicker": "", "heading": "HTML allowed<br>two lines", "text": "", "image": "assets/img/k12.jpg" } }
```
- `mood` sets the synth score: `tense` | `sneaky` | `cozy` | `upbeat`.
- `musicLevel` is the score volume during play (0–1).
- `playVolume` is the clip audio level in interactive states. Cutscenes play at 1.
- Each `theme` key becomes a CSS variable (`--accent`, …). `mote` is the RGB of the ambient particles.
- `credit` appears on the title, briefing, HUD and results as "Built & designed by …".

## clips
`"id": { "src": "assets/video/x.mp4", "loop": true, "subs": [[t, "Who", "Line"]] }`. Loops must be seamless (`analyze.mjs seam`).

## vars
`"alert": { "init": 0, "min": 0, "max": 100 }` or a plain value: `"donut": 0`, `"route": "—"`.

Expressions can also use these built-ins:
- `time` (seconds played)
- `inputs`, `fails`, `perfects`, `successes`

## hud
```json
{ "rooms": ["Roof", "Hall", "Fork", ["Vent", "Lasers"], "Vault"],
  "meters": [{ "var": "alert", "label": "Alert", "max": 100, "hot": true }],
  "items": [{ "var": "donut", "icon": "🍩", "label": "Donut" }],
  "readouts": [["Alert", "alert"], ["Time", "time"]],
  "dial": { "var": "alert", "label": "Alert", "max": 100, "hot": "alert>=60" } }
```
- `rooms` draws the map card. A nested array is a set of parallel alternatives. States name their room with `room`.
- `items` shows a chip while the var is truthy.
- `readouts` and `dial` take expressions.

## controls
`[{ "key": "Space", "label": "Sneak", "desc": "…" }]` lists the controls on the briefing page and creates the touch buttons. Keys use `KeyboardEvent.code` (`Space`, `KeyF`, `ArrowLeft`, …). Join alternatives with `|`. `Click` is a label only.

## states
A state plays one clip and may offer interaction:

| field | meaning |
|---|---|
| `clip` | clip id (required) |
| `room`, `objective` | HUD map and objective line (the objective persists until changed) |
| `enter` | actions on entry |
| `next` | actions when a non-loop clip ends (string = goto) |
| `cues` | `[{ "t": 1.2, "do": [actions] }]` at clip times (re-fire each loop) |
| `subs` | `[[t, "Who", "Line"]]` subtitles |
| `banner` | `["Title", "sub", "danger"/"good"/""]` on entry |
| `inputs` | keys; optional time windows (below) |
| `choices` | a menu; the first is highlighted (below) |
| `hotspots` | clickable objects (below) |
| `spawn` | targets that appear and expire (below) |
| `timers` | `[{ "after": 6 | [5, 8], "every": [4, 6]?, "do": [actions] }]` in seconds of play |
| `qte` | timing ring (below) |
| `skippable` | hold Enter to run `next` (cutscenes) |
| `bars`, `hud` | override letterbox / HUD visibility |
| `rate`, `volume` | clip playback rate and volume |

**Mode.** A state with `inputs`/`choices`/`hotspots`/`spawn` is interactive: no letterbox, full HUD. A state with only a `qte` gets letterbox plus HUD. Anything else is a cutscene: letterbox, HUD hidden unless `"hud": true`.

**inputs**
```json
{ "key": "Space", "label": "Sneak across", "hint": "only while he looks away",
  "windows": [[0, 2.1], [4.45, 6.1]], "safe": "Looking away — go", "danger": "Watching — stay hidden",
  "ok": "hall_sneak", "fail": "hall_spotted", "cooldown": 6, "if": "ammo>0", "denied": "Out of ammo" }
```
- Without `windows`, any press is `ok`.
- With `windows`, the HUD shows a live safe/danger pill and the control lights up inside the window.
- `cooldown` draws a ring on the control.

**choices**: `{ "key": "KeyA|ArrowLeft", "label": "Air vent", "sub": "Dusty", "do": [actions] }`, plus the state's `menuHint`. Choices also work by click.

**hotspots**: `{ "id": "gem", "x": 0.52, "y": 0.34, "r": 0.05, "label": "MOONSTONE", "do": [...], "if": "key>=1", "denied": "Locked", "show": "expr", "once": true }`
- `once` (default) hides the hotspot after use.
- A failing `if` shows `denied` instead of running `do`.
- Find `x`/`y` on the keyframe.

**spawn**: `{ "points": [{ "x": 0.5, "y": 0.46, "name": "CORE" }], "every": [1.0, 1.6], "life": 1.5, "max": 2, "hit": [...], "crit": [...], "miss": [...] }`
- A click inside the shrinking ring runs `hit`; a click within its inner 40% runs `crit`.
- In those actions, `num` and `sparks` default to the hit position.

**qte**: `{ "key": "KeyF", "label": "Hold it in", "at": 3.2, "start": 1.4, "perfect": 0.18, "good": 0.42, "ok": "vent_hold", "fail": "vent_sneeze", "onPerfect": [...], "continue": false, "x": 0.5, "y": 0.62 }`
- The ring closes at `at`, and the press is judged against `perfect`/`good` (both tolerances in seconds).
- No press by `at + good` counts as a fail.
- With `continue: true`, a success keeps the clip playing (running `ok`), and `next` fires at its end.

## actions
An action list can be a state id string, one action, or a list of actions. Ops:

| op | args |
|---|---|
| `goto` | state (stops the list) |
| `end` | ending id: plays the ending's `state`, then results |
| `results` | show results now |
| `set` / `add` | var, value (`add` clamps to min/max; `[a, b]` adds a random int) |
| `if` | expr, then-actions, else-actions |
| `random` | `[weight, actions]`, … |
| `banner` | text, sub, cls |
| `tag` | text, cls (`good`/`perfect`/`bad`/`item`), x?, y? |
| `num` | value, label, x?, y?, cls (`big`/`bad`) |
| `sub` | who, text |
| `sfx` | `shot` `ping` `crit` `thud` `click` `whoosh` `chime` `pickup` `alarm` `fail` `tick` `spawn` |
| `flash` / `shake` / `sparks` / `hitstop` | amount (`sparks`: x, y, n) |
| `music` / `mood` / `intensity` | level, seconds / preset / 0–1 |
| `objective` / `class` / `cooldown` | text / css class on stage (e.g. `danger`) / key, seconds |

Text fields interpolate `{var}`.

**Expressions** use vars, numbers, quoted strings, `== != < <= > >= && || ! + - * / ? :`.

**Rules** are `[{ "when": "alert>=100", "do": [...], "once": true, "in": ["idle"] }]`. They are checked after every action list (including on state entry). `in` limits a rule to certain states, so it waits instead of cutting an action clip. `{last}` holds the amount of the latest `add`, which is handy for damage numbers.

## endings / rank / results
```json
"endings": { "clean": { "state": "victory", "win": true, "title": "Clean getaway", "text": "…" } },
"rank": [["alert==0", "S"], ["alert<=30", "A"], ["true", "C"]],
"results": [["Alert", "alert"], ["Donut", "donut>=1 ? 'Found' : 'Missed'"]]
```
- `rank` takes the first match and applies to wins only.
- The results page always starts with Time.

## demo (autopilot for render.mjs)
```json
"demo": { "title": 4.2, "briefing": 8, "results": 6.5,
  "states": { "hall": [[["wait", 1.4], ["press", "Space", "danger"]], [["press", "Space", "safe"]]],
              "junction": [[["wait", 1.8], ["choose", "KeyA"]]], "vent": [[["qte", "perfect"]]],
              "vault": [[["click", "gem"]]], "arena": [[["shoot", 8]]] } }
```
- Each state has one step list per visit; the last list repeats.
- `press` takes `safe` | `danger` | `any`.
- `qte` takes `perfect` | `good` | `early` | `late`.
- `shoot` aims at spawned targets for N seconds.
- A step that never becomes possible is skipped after 20 s with a warning.

## Console API (playtesting)
- `E.id`, `E.vars`, `E.mode`
- `E.run('state')`, `handleKey('Space')`, `E.click(x, y)`
- `Director.time()`, `E.inWindow(E.st.inputs[0])`
- `begin()` then `startGame()` to skip the menus.
