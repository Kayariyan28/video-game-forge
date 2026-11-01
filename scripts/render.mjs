#!/usr/bin/env node
// Video Game Forge — deterministic gameplay render (not a screen recording).
// Drives the game in headless Chrome on a virtual clock, plays the route in game.json → demo, captures every
// frame and pipes it into ffmpeg; then writes the frame log and the offline-rendered score for mix.mjs.
//   node render.mjs --url http://localhost:8080/ --out ../exports/demo [--scale 3 (4K) | 2 (1440p) | 1.5 (1080p)] [--fps 30] [--dry] [--max 600]
//   --chrome <path> overrides the browser (needs H.264 support: Google Chrome, not Chromium).
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SCALE = +arg('scale', 3), FPS = +arg('fps', 30), DRY = !!arg('dry', false), MAX = +arg('max', 600);
const OUT = path.resolve(arg('out', 'exports/demo'));
const URL = String(arg('url', 'http://localhost:8080/')).replace(/\/?$/, '/') + `?render=1&fps=${FPS}`;
const CHROME = arg('chrome', process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 0, defaultViewport: { width: 1280, height: 720, deviceScaleFactor: SCALE },
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) console.error('[console]', m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__R && window.__R.ready', { timeout: 180000 });
const cdp = await page.createCDPSession();
// headless ignores the viewport's scale factor for raw captures, so pin the device metrics explicitly
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: SCALE, mobile: false });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));

let ff = null;
if (!DRY) {
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.2', '-movflags', '+faststart', OUT + '_video.mp4'],
  { stdio: ['pipe', 'inherit', 'inherit'] });
}
const write = (buf) => new Promise((ok) => (ff.stdin.write(buf) ? ok() : ff.stdin.once('drain', ok)));
const t0 = Date.now(); let frame = 0, done = false, lastState = '';
while (!done && frame < MAX * FPS) {
  done = await page.evaluate(() => window.__R.step());
  if (!DRY) { const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 }); await write(Buffer.from(data, 'base64')); }
  frame++;
  if (frame % FPS === 0) {
    const st = await page.evaluate(() => `${E.mode}/${E.id || '-'}`);
    if (st !== lastState || frame % (FPS * 10) === 0) console.log(`t=${(frame / FPS).toFixed(1)}s  ${st}  (${(frame / ((Date.now() - t0) / 1000)).toFixed(1)} fps render)`);
    lastState = st;
  }
}
const dur = frame / FPS;
console.log(`captured ${frame} frames = ${dur.toFixed(2)}s in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
if (ff) { ff.stdin.end(); await new Promise((ok) => ff.on('close', ok)); }
const log = await page.evaluate(() => ({ frames: window.__R.frames, events: window.__R.events, clips: GAME.clips, title: GAME.meta.title, credit: GAME.meta.credit }));
fs.writeFileSync(OUT + '_log.json', JSON.stringify({ fps: FPS, duration: dur, ...log }));
const chunks = await page.evaluate((d) => window.__R.renderAudio(d), dur + 0.5);
fs.writeFileSync(OUT + '_synth.wav', Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64'))));
console.log('wrote', OUT + '_log.json', OUT + '_synth.wav');
await browser.close();
