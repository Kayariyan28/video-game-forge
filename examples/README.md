# Examples

Both games were built with this skill and run on the same, unmodified `engine/`. Use them as templates.

## nightpaws.game.json: stealth heist (stylized 3D)
- **17 clips:** 4 seamless loops (hall, junction, lasers, vault) plus actions, reactions and endings.
- **Mechanics:**
  - Timing windows inside loops: the guard looks away 0–2.1 s and 4.45–6.1 s; the lasers are off 2.05–2.8 s. Both were measured with `analyze.mjs curve`.
  - A route choice, two QTEs (hold in a sneeze; fire the grapple with `continue`), and an inventory hotspot (donut) that changes the vault outcome via `if`.
  - An alert meter with a "busted" rule, and three endings with ranks.
- **Cost on the provider used:** ≈1,370 credits (Wan 3.0 720p with sound; Nano Banana Pro and GPT-image keyframes and sheets).

## dustfall.game.json: boss fight (cinematic photoreal)
- **16 clips:** 1 idle loop, 3 ability clips, 2 attack wind-ups each with a success and a hit outcome, phase 2, finisher, and two endings.
- **Mechanics:**
  - Spawning weak-point targets with hit and crit damage numbers (`{last}`).
  - Cooldown abilities, and an ultimate gated by `if: heat>=100`.
  - A random boss-attack timer feeding QTE wind-ups.
  - State-scoped rules: phase 2 at 50% HP, and the finisher at 0, both waiting for the idle state.
  - A slowed-down finish state with a visor hotspot.
- **Cost:** ≈1,370 credits.

## starter.game.json
The smallest complete game: an intro, one windowed loop, success and fail clips, a risk meter, and two endings. `scripts/new-game.sh` copies it into a new folder.
