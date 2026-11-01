# Changelog

## 1.0.0 — 2026-11-01
First public release. Built and designed by Karan Chandra Dey [K28] — k28art.space.

- **Workflow** (`SKILL.md`): provider choice first (any MCP or API, always asked) → concept and state graph → reference sheets → one keyframe per state → image-to-video clips (seamless loops via first = last frame) → `game.json` → measured tuning → scripted playtest → optional deterministic gameplay render.
- **Engine**: a data-driven runtime for:
  - states-as-clips with timing windows and reaction rings (QTE, including continue-on-success),
  - hotspots with conditions, choice menus, spawning targets with hit/crit,
  - cooldown abilities, random timers, vars/meters/items,
  - state-scoped rules, endings with ranks,
  - a hairline HUD (objective, live safe/danger pill, room map, dial, readouts), four synth-score moods, and a render mode with a seeded autopilot.
- **Scripts**: `new-game.sh`, `prep-clips.sh`, `analyze.mjs` (sheet, bars, seam, curve, speech), `render.mjs` (4K/1440p/1080p frame-by-frame), `mix.mjs` (clip audio + score, -14 LUFS).
- **References**: providers, design patterns, asset prompting, game.json schema, tuning and testing, showcase.
- **Validated on two games**:
  - NIGHT PAWS (stealth heist, stylized 3D, 17 clips),
  - DUSTFALL (boss fight, photoreal, 16 clips).

  Both run on the same, unmodified engine, every branch is tested, and both autopilots reach the results screen.
