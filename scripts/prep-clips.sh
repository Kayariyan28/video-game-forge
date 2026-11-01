#!/usr/bin/env bash
# Video Game Forge — encode generated clips for the browser engine.
# usage: prep-clips.sh <source_dir> <out_dir> [height=720]
# Keeps the full-quality sources untouched; writes 16:9 H.264 + AAC with a short GOP so cuts and seeks are instant.
set -euo pipefail
src="$1"; out="$2"; h="${3:-720}"; w=$(( h * 16 / 9 ))
mkdir -p "$out"
for f in "$src"/*.mp4 "$src"/*.mov "$src"/*.webm; do
  [ -e "$f" ] || continue
  n=$(basename "${f%.*}").mp4
  ffmpeg -v error -y -i "$f" -vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1" \
    -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -g 15 -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$out/$n" &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 0.2; done
done
wait
# clips generated without sound still need a (silent) audio track so the mixer can treat every clip alike
for f in "$out"/*.mp4; do
  if [ -z "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$f")" ]; then
    ffmpeg -v error -y -i "$f" -f lavfi -i anullsrc=r=48000:cl=stereo -shortest -c:v copy -c:a aac "$f.tmp.mp4" && mv "$f.tmp.mp4" "$f"
  fi
done
du -sh "$out"
