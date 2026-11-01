#!/usr/bin/env node
// Video Game Forge — clip analysis for tuning a game.json.
//   node analyze.mjs sheet  <clip.mp4> [--fps 4] [--out sheet.jpg]      contact sheet with a timestamp on every tile
//   node analyze.mjs bars   <clip.mp4|dir>                                 baked letterbox bars (top/bottom %) per clip
//   node analyze.mjs seam   <clip.mp4|dir>                                 loop seam: difference between first and last frame
//   node analyze.mjs curve  <clip.mp4> --roi x,y,w,h [--channel red|luma|redness] [--fps 15] [--thresh auto]
//        prints a per-frame metric inside a normalised region and the time windows where it is low/high:
//        use it to measure "lasers off", "guard facing away", "light on" windows for inputs[].windows.
//   node analyze.mjs speech <clip.mp4|dir>                                 when voices start/stop, for subtitle times (subs)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i < 0 ? d : rest[i + 1]; };
const ff = (args, binary = false) => { const r = spawnSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 1 << 30, encoding: binary ? 'buffer' : 'utf8' }); if (r.status) throw new Error(String(r.stderr)); return r.stdout; };
const probe = (f) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', f], { encoding: 'utf8' }).stdout);
const clips = (t) => (fs.statSync(t).isDirectory() ? fs.readdirSync(t).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).sort().map((f) => path.join(t, f)) : [t]);
const gray = (f, ss, w = 160, h = 90) => ff([...(ss === 'end' ? ['-sseof', '-0.2'] : ['-ss', String(ss)]), '-i', f, '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], true).subarray(-w * h);

if (cmd === 'sheet') {
  const fps = +opt('fps', 4), out = opt('out', target.replace(/\.\w+$/, '_sheet.jpg')), dur = +probe(target).format.duration, n = Math.ceil(dur * fps), cols = 6;
  const tile = `tile=${cols}x${Math.ceil(n / cols)}`;
  try { ff(['-y', '-i', target, '-vf', `fps=${fps},scale=320:-2,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,${tile}`, '-frames:v', '1', out]); }
  catch { ff(['-y', '-i', target, '-vf', `fps=${fps},scale=320:-2,${tile}`, '-frames:v', '1', out]); } // ffmpeg built without drawtext
  console.log(`${out}  (${n} tiles at ${fps} fps, ${dur.toFixed(2)}s; reading order left→right, top→bottom, tile k = ${(1 / fps).toFixed(3)}·k s)`);
} else if (cmd === 'bars') {
  for (const f of clips(target)) {
    const dur = +probe(f).format.duration; let top = 0, bot = 0;
    for (const k of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const b = gray(f, dur * k), rows = [...Array(90).keys()].map((y) => b.subarray(y * 160, y * 160 + 160).reduce((s, v) => s + v, 0) / 160);
      top = Math.max(top, rows.findIndex((v) => v > 14)); bot = Math.max(bot, [...rows].reverse().findIndex((v) => v > 14));
    }
    console.log(`${path.basename(f).padEnd(28)} top ${(top / 90 * 100).toFixed(1)}%  bottom ${(bot / 90 * 100).toFixed(1)}%${top + bot ? '  ← cover with cinematic bars or crop' : ''}`);
  }
} else if (cmd === 'seam') {
  for (const f of clips(target)) {
    const a = gray(f, 0), b = gray(f, 'end');
    let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    const score = d / a.length;
    console.log(`${path.basename(f).padEnd(28)} seam diff ${score.toFixed(1)}  ${score < 6 ? 'loops cleanly' : score < 14 ? 'small jump at the loop point' : 'visible jump: not a clean loop'}`);
  }
} else if (cmd === 'curve') {
  const [x, y, w, h] = opt('roi', '0,0,1,1').split(',').map(Number), ch = opt('channel', 'luma'), fps = +opt('fps', 15);
  const { streams: [s] } = probe(target), W = 128, H = 72;
  const raw = ff(['-i', target, '-vf', `fps=${fps},crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'], true);
  const frame = W * H * 3, vals = [];
  for (let o = 0; o + frame <= raw.length; o += frame) {
    let r = 0, g = 0, b = 0; for (let i = o; i < o + frame; i += 3) { r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; }
    const n = W * H; r /= n; g /= n; b /= n;
    vals.push(ch === 'red' ? r : ch === 'redness' ? r - (g + b) / 2 : ch === 'blue' ? b : 0.299 * r + 0.587 * g + 0.114 * b);
  }
  const lo = Math.min(...vals), hi = Math.max(...vals), th = opt('thresh', 'auto') === 'auto' ? (lo + hi) / 2 : +opt('thresh');
  console.log(`${path.basename(target)} ${ch} in roi ${x},${y},${w},${h}: min ${lo.toFixed(1)} max ${hi.toFixed(1)} threshold ${th.toFixed(1)}  (${s.width}x${s.height})`);
  const bar = (v) => '█'.repeat(Math.round((v - lo) / (hi - lo || 1) * 30));
  vals.forEach((v, i) => console.log(`${(i / fps).toFixed(2).padStart(6)}s ${v.toFixed(1).padStart(7)} ${v < th ? 'low ' : 'HIGH'} ${bar(v)}`));
  const win = (pred) => { const out = []; let a = null; vals.forEach((v, i) => { const t = i / fps; if (pred(v) && a == null) a = t; if (!pred(v) && a != null) { out.push([a, t]); a = null; } }); if (a != null) out.push([a, vals.length / fps]); return out.map(([p, q]) => `[${p.toFixed(2)}, ${q.toFixed(2)}]`).join(' '); };
  console.log(`low windows:  ${win((v) => v < th)}\nhigh windows: ${win((v) => v >= th)}`);
} else if (cmd === 'speech') {
  for (const f of clips(target)) {
    const r = spawnSync('ffmpeg', ['-i', f, '-af', 'highpass=f=250,lowpass=f=3500,silencedetect=n=-32dB:d=0.2', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const dur = +probe(f).format.duration, starts = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]), ends = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    // voiced spans are the gaps between silences
    const voiced = []; let t = 0;
    starts.forEach((s, i) => { if (s - t > 0.15) voiced.push([t, s]); t = ends[i] ?? dur; });
    if (dur - t > 0.15) voiced.push([t, dur]);
    console.log(`${path.basename(f).padEnd(28)} sound at ${voiced.map(([a, b]) => `${a.toFixed(2)}–${b.toFixed(2)}s`).join(', ') || 'none'}`);
  }
} else {
  console.log('usage: analyze.mjs sheet|bars|seam|curve|speech <clip|dir> [options]   (see header)');
}
