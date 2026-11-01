#!/usr/bin/env bash
# Video Game Forge — scaffold a new game folder from the engine template.
# usage: new-game.sh <folder>
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; dest="$1"
mkdir -p "$dest"/assets/{source,video,img} "$dest"/exports
cp -R "$here"/engine/* "$dest"/
[ -f "$dest/game.json" ] || cp "$here/examples/starter.game.json" "$dest/game.json"
[ -f "$dest/assets/manifest.json" ] || echo '{ "providers": {}, "assets": [] }' > "$dest/assets/manifest.json"
echo "Scaffolded $dest — put originals in assets/source, then: $here/scripts/prep-clips.sh $dest/assets/source $dest/assets/video"
