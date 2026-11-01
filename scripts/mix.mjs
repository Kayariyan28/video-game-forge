#!/usr/bin/env node
// Video Game Forge — soundtrack mixer for render.mjs output.
// Rebuilds each clip's own audio exactly where (and how fast) it played, mixes it with the offline-rendered
// score + effects, loudness-normalises, and muxes onto the captured video.
//   node mix.mjs --game <game dir> --out <same --out as render.mjs>
// Clip audio is read from assets/source/<name> when that full-quality file exists, else from the clip's src.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GAME_DIR = path.resolve(arg('game', '.')), OUT = path.resolve(arg('out', 'exports/demo'));
const { fps, duration, frames, clips, title, credit } = JSON.parse(fs.readFileSync(OUT + '_log.json', 'utf8'));
const DT = 1 / fps;
const srcFor = (id) => { const s = path.join(GAME_DIR, clips[id].src), hq = path.join(GAME_DIR, 'assets/source', path.basename(s)); return fs.existsSync(hq) ? hq : s; };

// continuous playback runs: frame i shows clip time vt and covers [i/fps, (i+1)/fps)
const segs = []; let s = null;
for (const f of frames) {
  const playing = f.on && f.clip && !['title', 'briefing'].includes(f.st);
  if (s && playing && s.clip === f.clip && Math.abs(f.vt - (s.vt1 + DT * f.rate)) < 0.02 && s.rate === f.rate && s.vol === f.vol) { s.vt1 = f.vt; s.n++; continue; }
  if (s) segs.push(s);
  s = playing ? { clip: f.clip, tl: f.i / fps, vt0: f.vt, vt1: f.vt, n: 1, rate: f.rate, vol: f.vol } : null;
}
if (s) segs.push(s);
console.log(`${segs.length} clip-audio segments`);

// One seeked input per segment: splitting one input and trimming the branches makes ffmpeg end the whole graph
// as soon as the first branch finishes. Every stem is padded to full length before mixing for the same reason.
const tempo = (r) => { const o = []; let x = r; while (x < 0.5) { o.push('atempo=0.5'); x /= 0.5; } while (x > 2) { o.push('atempo=2'); x /= 2; } if (Math.abs(x - 1) > 1e-3) o.push(`atempo=${x.toFixed(4)}`); return o; };
const pad = `apad=whole_dur=${(duration + 1).toFixed(3)}`, inputs = [], lines = [];
segs.forEach((g, k) => {
  inputs.push('-ss', g.vt0.toFixed(4), '-t', (g.n * DT * g.rate).toFixed(4), '-i', srcFor(g.clip));
  const d = Math.round(g.tl * 1000);
  lines.push(`[${k}:a]aresample=48000,${[...tempo(g.rate), 'afade=t=in:d=0.012', `afade=t=out:st=${Math.max(0, g.n * DT - 0.02).toFixed(4)}:d=0.02`, `volume=${g.vol}`, `adelay=${d}|${d}`, pad].join(',')}[s${k}]`);
});
lines.push(`[${segs.length}:a]aresample=48000,volume=0.8,${pad}[syn]`);
lines.push(`${segs.map((_, k) => `[s${k}]`).join('')}[syn]amix=inputs=${segs.length + 1}:normalize=0:dropout_transition=0,atrim=duration=${duration.toFixed(3)},loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000[mix]`);
fs.writeFileSync(OUT + '_mix.txt', lines.join(';\n'));

// newer ffmpeg (7+) reads filter scripts with -/filter_complex; older builds use -filter_complex_script
const v = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).stdout.match(/version n?(\d+)/), major = v ? +v[1] : 7;
const fc = major >= 7 ? ['-/filter_complex', OUT + '_mix.txt'] : ['-filter_complex_script', OUT + '_mix.txt'];
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-i', OUT + '_synth.wav', ...fc, '-map', '[mix]', '-c:a', 'pcm_s16le', OUT + '_audio.wav'], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
if (fs.existsSync(OUT + '_video.mp4')) {
  const meta = ['-metadata', `title=${title} — gameplay`, ...(credit ? ['-metadata', `artist=${credit}`, '-metadata', `comment=Built and designed by ${credit}`] : [])];
  const m = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT + '_video.mp4', '-i', OUT + '_audio.wav', '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', ...meta, OUT + '.mp4'], { stdio: 'inherit' });
  if (m.status) process.exit(m.status);
  for (const f of ['_video.mp4', '_audio.wav', '_synth.wav']) fs.rmSync(OUT + f, { force: true });
  console.log('wrote', OUT + '.mp4');
}
