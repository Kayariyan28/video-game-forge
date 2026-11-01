/* Video Game Forge engine.
   Plays any game described by game.json: AI-generated video clips are the picture, this runtime is the game.
   Each state plays one clip and offers inputs (optionally inside time windows), a timing ring (qte),
   clickable hotspots, choice menus, spawning targets and timers. Actions change variables, cut to other
   states, show HUD feedback and end the game. See references/game-json.md in the skill for the schema. */
'use strict';

const $ = (s) => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.round(rnd(a, b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (v) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);
// An action list may be written as a state id ("hall"), one action (["add","alert",30]) or a list of actions.
const OPS = new Set(['goto', 'end', 'results', 'set', 'add', 'if', 'random', 'banner', 'tag', 'num', 'sub', 'sfx', 'flash', 'shake', 'sparks', 'music', 'mood', 'intensity', 'hitstop', 'objective', 'class', 'cooldown']);
const asList = (v) => (v == null ? [] : typeof v === 'string' ? [['goto', v]] : typeof v[0] === 'string' && OPS.has(v[0]) ? [v] : v);
const stage = $('#stage'), shaker = $('#shaker'), fx = $('#fx'), ctx = fx.getContext('2d'), hud = $('#hud');
let GAME = null;

// ---------------------------------------------------------------- expressions & text
const exprCache = {};
function evalExpr(src, vars) {
  if (src === true || src == null) return true;
  if (typeof src === 'number') return src;
  if (!exprCache[src]) {
    if (!/^[\w\s.<>=!&|()+\-*/%'"?:—]+$/.test(src)) throw new Error('Unsupported expression: ' + src);
    const js = src.replace(/("[^"]*"|'[^']*')|\b([A-Za-z_]\w*)\b/g, (m, str, id) => (str ? str : ['true', 'false', 'null'].includes(id) ? id : `v[${JSON.stringify(id)}]`));
    exprCache[src] = new Function('v', `return (${js});`);
  }
  return exprCache[src](vars);
}
const fmt = (s) => (s == null ? '' : String(s).replace(/\{(\w+)\}/g, (m, k) => { const v = E.scope()[k]; return v == null ? '' : typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : v; }));
const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const KEYNAMES = { Space: 'Space', Enter: 'Enter', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'Shift', Escape: 'Esc', Click: 'Click' };
const keyLabel = (k) => String(k).split('|').map((c) => KEYNAMES[c] || c.replace(/^Key|^Digit/, '')).join(' / ');
const keyMatch = (spec, code) => String(spec).split('|').includes(code);

// ---------------------------------------------------------------- audio: synth score (mood presets) + effects
const MOODS = {
  tense:  { tempo: 92, roots: [41.2, 41.2, 32.7, 36.7], arp: [1, 2, 1.5, 2, 3, 2, 1.5, 2], lead: 'square', leadVol: 0.03, bass: 'sawtooth', kick: 4, snare: [4], hat: true, pad: true },
  sneaky: { tempo: 112, roots: [55, 55, 49, 46.25], arp: [2, 0, 3, 0, 2.4, 0, 4, 3], lead: 'triangle', leadVol: 0.05, bass: 'triangle', walk: [1, 1.19, 1.5, 1.33], kick: 8, snare: [], snap: [4, 12], hat: false, pad: false, swing: 0.16 },
  cozy:   { tempo: 84, roots: [65.4, 49, 55, 43.65], arp: [2, 2.5, 3, 4, 3, 2.5, 2, 0], lead: 'sine', leadVol: 0.05, bass: 'sine', kick: 16, snare: [], hat: false, pad: true },
  upbeat: { tempo: 124, roots: [55, 43.65, 49, 41.2], arp: [2, 3, 4, 3, 5, 4, 3, 4], lead: 'square', leadVol: 0.03, bass: 'sawtooth', kick: 4, snare: [4], hat: true, pad: false },
};
const Audio = {
  ctx: null, master: null, music: null, sfx: null, muted: false, step: 0, nextT: 0, intensity: 0, mood: MOODS.tense, at: null,
  lvl: { from: 0, to: 0, t0: 0, t1: 0 },
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
    const n = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.nextT = this.ctx.currentTime + 0.1;
  },
  setMood(name) { this.mood = MOODS[name] || this.mood; },
  now() { return this.at != null ? this.at : this.ctx.currentTime; },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; Director.applyVolume(); },
  musicLevel(v, t = 1.2) {
    if (!this.ctx) return;
    const now = this.now(), L = this.lvl, k = L.t1 > L.t0 ? clamp((now - L.t0) / (L.t1 - L.t0), 0, 1) : 1, cur = L.from + (L.to - L.from) * k;
    const g = this.music.gain; g.cancelScheduledValues(now); g.setValueAtTime(cur, now); g.linearRampToValueAtTime(v, now + t);
    Object.assign(L, { from: cur, to: v, t0: now, t1: now + t });
  },
  env(node, t, a, peak, dec) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); },
  osc(type, f, t, dur, peak, dest, f2) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); this.env(g, t, 0.005, peak, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); },
  noiseHit(t, dur, peak, freq, q, dest, type = 'bandpass') { const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = this.ctx.createGain(); this.env(g, t, 0.002, peak, dur); s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); },
  // effects (all callable from game.json with ["sfx", name])
  shot() { if (!this.ctx) return; const t = this.now(); this.noiseHit(t, 0.12, 0.7, 1800, 0.7, this.sfx); this.osc('sine', 140, t, 0.12, 0.6, this.sfx, 40); },
  ping() { if (!this.ctx) return; const t = this.now(); this.osc('triangle', rnd(1700, 2300), t, 0.09, 0.18, this.sfx, 900); },
  crit() { if (!this.ctx) return; const t = this.now(); this.osc('square', 880, t, 0.08, 0.12, this.sfx); this.osc('square', 1320, t + 0.06, 0.12, 0.12, this.sfx); this.noiseHit(t, 0.25, 0.5, 4000, 1, this.sfx); },
  thud(big = 1) { if (!this.ctx) return; const t = this.now(); this.osc('sine', 90 * big, t, 0.35, 0.9, this.sfx, 30); this.noiseHit(t, 0.3, 0.5, 300, 0.8, this.sfx, 'lowpass'); },
  click() { if (!this.ctx) return; const t = this.now(); this.noiseHit(t, 0.03, 0.4, 3000, 2, this.sfx); },
  whoosh() { if (!this.ctx) return; const t = this.now(); const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.35); const g = this.ctx.createGain(); this.env(g, t, 0.08, 0.35, 0.35); s.connect(f).connect(g).connect(this.sfx); s.start(t); s.stop(t + 0.6); },
  chime() { if (!this.ctx) return; const t = this.now(); [784, 1175, 1568].forEach((f, i) => this.osc('sine', f, t + i * 0.05, 0.5, 0.18, this.sfx)); },
  pickup() { if (!this.ctx) return; const t = this.now(); this.osc('triangle', 660, t, 0.1, 0.2, this.sfx); this.osc('triangle', 990, t + 0.08, 0.18, 0.2, this.sfx); },
  alarm() { if (!this.ctx) return; const t = this.now(); for (let i = 0; i < 3; i++) this.osc('sawtooth', 520, t + i * 0.16, 0.1, 0.12, this.sfx, 380); },
  fail() { if (!this.ctx) return; const t = this.now(); this.osc('square', 300, t, 0.14, 0.12, this.sfx, 200); this.osc('square', 200, t + 0.13, 0.25, 0.12, this.sfx, 120); },
  tick() { if (!this.ctx) return; const t = this.now(); this.osc('square', 1500, t, 0.03, 0.08, this.sfx); },
  spawn() { if (!this.ctx) return; const t = this.now(); this.osc('sine', 600, t, 0.12, 0.08, this.sfx, 1200); },
  pumpUntil(T) {
    const m = this.mood, spb = 60 / (m.tempo + this.intensity * 18) / 4;
    while (this.nextT < T) {
      const s = this.step % 64, t = this.nextT + (s % 2 && m.swing ? m.swing * spb : 0), r = m.roots[Math.floor(s / 16) % 4];
      if (s % m.kick === 0) this.osc('sine', 150, t, 0.28, 0.85, this.music, 38);
      if (m.snare.includes(s % 8)) this.noiseHit(t, 0.16, 0.35 + this.intensity * 0.2, 1800, 0.6, this.music);
      if (m.snap && m.snap.includes(s % 16)) this.noiseHit(t, 0.05, 0.35, 2600, 4, this.music);
      if (m.hat && s % 2 === 1) this.noiseHit(t, 0.03, 0.12, 8000, 1, this.music, 'highpass');
      if (m.walk) { if (s % 4 === 0) this.bass(r * 2 * m.walk[(s / 4) % 4], t, spb * 3.2, m.bass); }
      else this.bass(r * 2 * (s % 4 === 2 ? 1.5 : 1), t, spb * 0.9, m.bass);
      const a = m.arp[s % 8]; if (a && s % 2 === 0) this.lead(r * 4 * a, t, spb * 1.6, m.leadVol + this.intensity * 0.02, m.lead);
      if (m.pad && s % 16 === 0) this.pad(r * 4, t, spb * 16);
      this.step++; this.nextT += spb;
    }
  },
  pump() { if (this.ctx) this.pumpUntil(this.ctx.currentTime + 0.25); },
  bass(f, t, d, type) { const o = this.ctx.createOscillator(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(900 + this.intensity * 900, t); fl.frequency.exponentialRampToValueAtTime(140, t + d); fl.Q.value = 6; this.env(g, t, 0.005, 0.32, d); o.connect(fl).connect(g).connect(this.music); o.start(t); o.stop(t + d + 0.05); },
  lead(f, t, d, v, type) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f; this.env(g, t, 0.01, v, d); o.connect(g).connect(this.music); o.start(t); o.stop(t + d + 0.05); },
  pad(f, t, d) { [1, 1.5, 2.0, 2.52].forEach((k) => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f * k; o.detune.value = rnd(-12, 12); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100; o.connect(fl).connect(g).connect(this.music); o.start(t); o.stop(t + d + 0.1); }); },
};

// ---------------------------------------------------------------- clip director: one <video> per clip, instant cuts
const Director = {
  els: {}, cur: null, curId: null, cues: [], onEnd: null, videoVol: 1,
  async preload(onProgress) {
    const ids = Object.keys(GAME.clips), queue = ids.slice(), holder = $('#videos'); let done = 0;
    const fetchBlob = async (url) => {
      for (let i = 0; ; i++) {
        const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 20000);
        try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('missing ' + url); return await r.blob(); }
        catch (e) { if (i >= 2) throw e; } finally { clearTimeout(timer); }
      }
    };
    const load = async (id) => {
      const c = GAME.clips[id], v = document.createElement('video');
      v.src = URL.createObjectURL(await fetchBlob(c.src)); v.preload = 'auto'; v.playsInline = true; v.loop = !!c.loop; v.muted = true;
      holder.appendChild(v); this.els[id] = v;
      await new Promise((ok) => { if (v.readyState >= 2) ok(); else { v.addEventListener('loadeddata', ok, { once: true }); setTimeout(ok, 4000); } });
      onProgress(++done / ids.length);
    };
    await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) await load(queue.shift()); }));
  },
  unlock() { Object.values(this.els).forEach((v) => { v.muted = false; v.play().then(() => { if (v !== this.cur) v.pause(); }).catch(() => {}); }); },
  applyVolume() { Object.values(this.els).forEach((v) => { v.muted = Audio.muted; v.volume = this.videoVol; }); },
  play(id, { cues = [], onEnd = null, rate = 1 } = {}) {
    const v = this.els[id], prev = this.cur;
    if (!v) throw new Error('Unknown clip: ' + id);
    v.currentTime = 0; v.playbackRate = rate; v.volume = this.videoVol; v.muted = Audio.muted; v.classList.add('on'); v.play().catch(() => {});
    if (prev && prev !== v) { prev.classList.remove('on'); prev.pause(); }
    this.cur = v; this.curId = id; this.onEnd = onEnd;
    this.cues = cues.map((c) => ({ ...c, fired: false })).sort((a, b) => a.t - b.t);
  },
  pause() { this.cur && this.cur.pause(); },
  resume() { this.cur && this.cur.play().catch(() => {}); },
  time() { return this.cur ? this.cur.currentTime : 0; },
  update() {
    const v = this.cur; if (!v) return;
    const t = v.currentTime;
    for (const c of this.cues) if (!c.fired && t >= c.t) { c.fired = true; c.fn(); }
    if (v.loop) { if (this.lastT != null && t < this.lastT - 0.5) this.cues.forEach((c) => { c.fired = false; }); this.lastT = t; return; }
    this.lastT = null;
    if (v.ended || (v.duration && t >= v.duration - 0.04)) { const cb = this.onEnd; this.onEnd = null; if (cb) cb(); }
  },
};

// ---------------------------------------------------------------- HUD
const RING = 2 * Math.PI * 19, DIAL = 2 * Math.PI * 80;
const Hud = {
  subTimer: null,
  build() {
    const H = GAME.hud || {};
    const meters = (H.meters || []).map((m) => `<div class="slider ${m.hot ? 'hot' : ''}"><div class="line"><i data-m="${m.var}"></i></div><span>${m.label}</span></div>`).join('');
    $('#meters').innerHTML = `<div class="items" id="items"></div>${meters}`;
    $('#readouts').innerHTML = (H.readouts || []).map(([l, e]) => `<div><span>${l}</span><b data-r="${e}">—</b></div>`).join('') +
      `<span class="credit-line">${GAME.meta.credit ? 'Built &amp; designed by ' + GAME.meta.credit : ''}</span>`;
    $('#dial').classList.toggle('hidden', !H.dial);
    if (H.dial) $('#dialLbl').textContent = H.dial.label;
    $('#rooms').innerHTML = (H.rooms || []).map((r) => (Array.isArray(r)
      ? `<div class="room alt"><div class="split">${r.map((x) => `<div class="room" data-room="${x}"><i></i><span>${x}</span></div>`).join('')}</div></div>`
      : `<div class="room" data-room="${r}"><i></i><span>${r}</span></div>`)).join('');
    $('#mapcard').classList.toggle('hidden', !(H.rooms || []).length);
  },
  state(def) {
    $('#objText').textContent = fmt(def.objective || E.objective || '');
    if (def.objective) E.objective = def.objective;
    const rows = [];
    (def.inputs || []).forEach((p, i) => rows.push({ id: 'in' + i, key: keyLabel(p.key), label: p.label, sub: p.hint || '', ring: !!p.cooldown }));
    (def.choices || []).forEach((c) => rows.push({ key: keyLabel(c.key), label: c.label, sub: c.sub || '' }));
    if (def.qte) rows.push({ key: keyLabel(def.qte.key), label: def.qte.label || 'React', sub: 'as the ring closes' });
    if (def.hotspots) rows.push({ key: '◎', label: 'Click', sub: def.hotspots.map((h) => h.label).join(' · ') });
    if (def.spawn) rows.push({ key: '◎', label: def.spawn.label || 'Shoot targets', sub: def.spawn.sub || 'click as they open' });
    $('#nav').innerHTML = `<div class="navrow head"><span class="ico">‹</span><span>${GAME.meta.title} <em>/ ${E.room || ''}</em></span></div>` +
      rows.map((r) => `<div class="navrow" ${r.id ? `id="nav-${r.id}"` : ''}><span class="ico">${r.ring ? '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19"/></svg>' : ''}<b>${r.key}</b></span><span>${r.label}<em>${r.sub}</em></span></div>`).join('');
    // choice menu: the inverted row is the default pick
    const ch = def.choices;
    $('#menu').innerHTML = ch ? `<div class="menu">${ch.map((c, i) => `<button class="mi ${i === 0 ? 'sel' : ''}" data-choice="${i}"><span>${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}</span><kbd>${keyLabel(c.key)}</kbd></button>`).join('')}${def.menuHint ? `<div class="hint">${def.menuHint}</div>` : ''}</div>` : '';
    $('#menu').querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); E.choose(+b.dataset.choice); }));
    document.querySelectorAll('.room').forEach((el) => { const id = el.dataset.room; el.classList.toggle('now', id === E.room); el.classList.toggle('done', E.roomsSeen.has(id) && id !== E.room); });
    $('#roomName').textContent = E.room || '';
  },
  update() {
    const H = GAME.hud || {}, S = E.scope();
    (H.meters || []).forEach((m) => { const el = document.querySelector(`[data-m="${m.var}"]`); if (el) el.style.width = clamp((S[m.var] || 0) / (m.max || 100), 0, 1) * 100 + '%'; });
    $('#items').innerHTML = (H.items || []).filter((it) => S[it.var]).map((it) => `<div class="item"><b>${it.icon || '◆'}</b>${it.label}${S[it.var] > 1 ? ' ×' + S[it.var] : ''}</div>`).join('');
    document.querySelectorAll('[data-r]').forEach((el) => { const e = el.dataset.r, v = e === 'time' ? fmtTime(E.time) : evalExpr(e, S); el.textContent = typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : v; });
    if (H.dial) { const v = S[H.dial.var] || 0; $('#dialNum').textContent = Math.round(v); $('#dialFill').style.strokeDashoffset = DIAL * (1 - clamp(v / (H.dial.max || 100), 0, 1)); $('#dial').classList.toggle('hot', H.dial.hot ? evalExpr(H.dial.hot, S) : false); }
    $('#timer').textContent = fmtTime(E.time);
    const def = E.st; if (!def) return;
    (def.inputs || []).forEach((p, i) => {
      const row = $('#nav-in' + i); if (!row) return;
      const cd = E.cds[p.key] || 0, ok = (!p.if || evalExpr(p.if, S)) && cd <= 0, inWin = E.inWindow(p);
      row.classList.toggle('off', !ok); row.classList.toggle('go', ok && !!p.windows && inWin); row.classList.toggle('on', ok);
      const c = row.querySelector('circle'); if (c) c.style.strokeDashoffset = RING * clamp(cd / (p.cooldown || 1), 0, 1);
    });
    const w = (def.inputs || []).find((p) => p.windows);
    const pill = $('#windowPill'); pill.classList.toggle('hidden', !w || E.mode !== 'play');
    if (w) { const safe = E.inWindow(w); pill.classList.toggle('safe', safe); pill.textContent = safe ? (w.safe || 'Go') : (w.danger || 'Wait'); }
  },
  banner(text, sub = '', cls = '') { $('#banner').innerHTML = `<div class="bn ${cls}"><h3>${text}</h3>${sub ? `<small>${sub}</small>` : ''}</div>`; Audio.whoosh(); },
  sub(who, text) { clearTimeout(this.subTimer); $('#subs').innerHTML = `<div class="sub"><span class="who">${who}</span><span>${text}</span></div>`; this.subTimer = setTimeout(() => { $('#subs').innerHTML = ''; }, 2600); },
  tag(text, cls = '', x = 0.5, y = 0.42) { const d = document.createElement('div'); d.className = 'tag ' + cls; d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; d.textContent = text; $('#tags').appendChild(d); setTimeout(() => d.remove(), 1150); },
  num(x, y, value, label = '', cls = '') { const d = document.createElement('div'); d.className = 'num ' + cls; d.style.left = x * 100 + '%'; d.style.top = y * 100 + '%'; d.innerHTML = `${value}${label ? `<i>${label}</i>` : ''}`; $('#nums').appendChild(d); setTimeout(() => d.remove(), 1000); },
};

// ---------------------------------------------------------------- effects canvas
const FX = {
  parts: [], rings: [], shake: 0, flashA: 0, mouse: { x: 0.5, y: 0.5, on: false }, muzzle: 0, mote: '255,190,140',
  resize() { const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); fx.width = r.width * dpr; fx.height = r.height * dpr; },
  dust() { this.parts.push({ k: 'dust', x: rnd(-0.1, 1), y: rnd(0, 1), vx: rnd(0.03, 0.12), vy: rnd(-0.01, 0.02), r: rnd(0.6, 2.2), life: rnd(3, 7), t: 0, a: rnd(0.12, 0.4) }); },
  sparks(x, y, n = 18, power = 1, hue = 38) { for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), s = rnd(0.15, 0.7) * power; this.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.1, r: rnd(1, 2.4), life: rnd(0.25, 0.6), t: 0, hue }); } },
  ring(x, y, max = 0.08) { this.rings.push({ x, y, max, life: 0.35, t: 0 }); },
  flash(a = 0.6) { this.flashA = Math.max(this.flashA, a); },
  kick(s = 10) { this.shake = Math.max(this.shake, s); },
  update(dt) {
    this.parts = this.parts.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'spark') { p.vy += 1.4 * dt; p.vx *= 0.96; } return p.t < p.life; });
    this.rings = this.rings.filter((r) => (r.t += dt) < r.life);
    if (Math.random() < dt * (GAME.meta.motes ?? 12)) this.dust();
    this.shake = Math.max(0, this.shake - dt * 40); this.flashA = Math.max(0, this.flashA - dt * 3.2); this.muzzle = Math.max(0, this.muzzle - dt * 12);
    const s = this.shake; shaker.style.transform = s > 0.2 ? `translate(${rnd(-s, s)}px,${rnd(-s, s)}px)` : '';
    $('#flash').style.opacity = this.flashA;
  },
  draw() {
    const W = fx.width, H = fx.height, u = H / 720, hair = Math.max(1, 1.2 * u); ctx.clearRect(0, 0, W, H);
    const dot = (x, y, r = 3) => { ctx.beginPath(); ctx.arc(x, y, r * u, 0, 7); ctx.fill(); };
    const label = (x, y, text, side) => {
      const lx = x + side * 46 * u, ly = y - 18 * u;
      ctx.beginPath(); ctx.moveTo(x + side * 10 * u, y - 8 * u); ctx.lineTo(x + side * 22 * u, ly); ctx.lineTo(lx, ly); ctx.stroke(); dot(lx, ly, 2.2);
      ctx.font = `400 ${10.5 * u}px 'JetBrains Mono',monospace`; ctx.textAlign = side < 0 ? 'right' : 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(text, lx + side * 6 * u, ly - 2 * u);
    };
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const life = 1 - p.t / p.life, x = p.x * W, y = p.y * H;
      if (p.k === 'dust') { ctx.fillStyle = `rgba(${this.mote},${p.a * Math.min(1, p.t * 2) * life})`; ctx.beginPath(); ctx.arc(x, y, p.r * u, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = `hsla(${p.hue},100%,${60 + 30 * life}%,${life})`; ctx.lineWidth = p.r * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * W * 0.03, y - p.vy * H * 0.03); ctx.stroke(); }
    }
    for (const r of this.rings) { const k = r.t / r.life; ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3 * u * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x * W, r.y * H, r.max * H * k, 0, 7); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = hair;
    if (E.mode === 'play') {
      // hotspots: hairline ring, pulsing centre, labelled leader
      for (const h of E.visibleHotspots()) {
        const x = h.x * W, y = h.y * H, R = (h.r || 0.04) * H * (1 + Math.sin(performance.now() / 260) * 0.05), side = h.x < 0.5 ? -1 : 1, locked = h.if && !evalExpr(h.if, E.scope());
        ctx.globalAlpha = locked ? 0.55 : 1; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
        ctx.setLineDash([2 * u, 5 * u]); ctx.beginPath(); ctx.arc(x, y, R * 1.35, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = locked ? '#fff' : `rgba(255,255,255,${0.6 + 0.4 * Math.sin(performance.now() / 180)})`; dot(x, y, 3.2); ctx.fillStyle = '#fff';
        label(x + side * R * 0.7, y - R * 0.6, h.label + (locked && h.lockedLabel ? ' · ' + h.lockedLabel : ''), side); ctx.globalAlpha = 1;
      }
      // spawned targets
      for (const t of E.spawned) {
        const k = t.t / t.life, x = t.x * W, y = t.y * H, R = (0.045 - 0.018 * k) * H, side = t.x < 0.5 ? -1 : 1;
        ctx.globalAlpha = Math.min(1, t.t * 6); ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
        ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(x, y, R + 5 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke(); ctx.lineWidth = hair;
        ctx.fillStyle = 'rgba(255,107,61,.9)'; dot(x, y, 4); ctx.fillStyle = '#fff'; if (t.name) label(x + side * R * 0.7, y - R * 0.7, t.name, side); ctx.globalAlpha = 1;
      }
    }
    // timing ring (qte)
    const q = E.qte;
    if (q && !q.done) {
      const ct = Director.time(), start = q.start ?? q.at - 1.6, k = clamp((q.at - ct) / (q.at - start), 0, 1), off = Math.abs(q.at - ct);
      const cx = (q.x ?? 0.5) * W, cy = (q.y ?? 0.62) * H, base = 0.055 * H;
      ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(cx, cy, base, 0, 7); ctx.stroke();
      ctx.setLineDash([2 * u, 6 * u]); ctx.beginPath(); ctx.arc(cx, cy, base * 1.25, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = off < (q.good ?? 0.4) ? '#fff' : 'rgba(255,107,61,.95)'; ctx.lineWidth = (off < (q.perfect ?? 0.17) ? 5 : 2) * u;
      ctx.beginPath(); ctx.arc(cx, cy, base + k * base * 3, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `500 ${15 * u}px 'Space Grotesk',sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(keyLabel(q.key), cx, cy);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = hair;
    }
    // crosshair while something is clickable
    if (this.mouse.on && E.mode === 'play' && (E.st.hotspots || E.st.spawn)) {
      const x = this.mouse.x * W, y = this.mouse.y * H, r = (11 + this.muzzle * 9) * u;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => { ctx.moveTo(x + a * r * 1.5, y + b * r * 1.5); ctx.lineTo(x + a * r * 2.4, y + b * r * 2.4); });
      ctx.stroke(); dot(x, y, 1.6);
    }
  },
};

// ---------------------------------------------------------------- game state machine
const STOP = Symbol('stop');
const E = {
  vars: {}, id: null, st: null, mode: 'title', t: 0, time: 0, visits: {}, cds: {}, spawned: [], spawnT: 0, timers: [], qte: null,
  room: '', roomsSeen: new Set(), objective: '', endingId: null, fired: new Set(), paused: false, stats: { inputs: 0, ok: 0, fail: 0, perfect: 0 },
  scope() { return { ...this.vars, time: this.time, inputs: this.stats.inputs, fails: this.stats.fail, perfects: this.stats.perfect, successes: this.stats.ok, last: this.last ?? 0 }; },
  reset() {
    this.vars = {}; Object.entries(GAME.vars || {}).forEach(([k, v]) => { this.vars[k] = typeof v === 'object' && v !== null ? v.init : v; });
    Object.assign(this, { t: 0, time: 0, visits: {}, cds: {}, spawned: [], timers: [], qte: null, room: '', objective: '', endingId: null, fired: new Set(), stats: { inputs: 0, ok: 0, fail: 0, perfect: 0 } });
    this.roomsSeen = new Set(); Audio.intensity = 0; stage.className = '';
  },
  enter(id) {
    const def = GAME.states[id]; if (!def) throw new Error('Unknown state: ' + id);
    this.id = id; this.st = def; this.t = 0; this.qte = def.qte ? { ...def.qte, done: false } : null; this.spawned = []; this.spawnT = def.spawn ? pick(def.spawn.first ?? def.spawn.every) : 0;
    this.visits[id] = (this.visits[id] || 0) + 1;
    this.timers = (def.timers || []).map((tm) => ({ left: pick(tm.after), every: tm.every, do: tm.do }));
    if (def.room) { this.room = def.room; this.roomsSeen.add(def.room); }
    const interactive = !!(def.inputs || def.choices || def.hotspots || def.spawn);
    this.mode = interactive || def.qte ? 'play' : 'cine';
    stage.classList.toggle('cine', def.bars ?? !interactive);
    stage.classList.toggle('pointing', !!(def.hotspots || def.spawn));
    hud.classList.toggle('min', def.hud === false || (!interactive && !def.qte && def.hud !== true));
    Director.videoVol = def.volume ?? (interactive ? GAME.meta.playVolume ?? 0.8 : 1);
    const clip = GAME.clips[def.clip];
    const cues = (def.cues || []).map((c) => ({ t: c.t, fn: () => this.run(c.do) }))
      .concat((def.subs || clip.subs || []).map(([t, who, text]) => ({ t, fn: () => Hud.sub(who, fmt(text)) })));
    Director.play(def.clip, { rate: def.rate || 1, cues, onEnd: () => this.clipEnd() });
    if (def.banner) Hud.banner(fmt(def.banner[0]), fmt(def.banner[1] || ''), def.banner[2] || '');
    Hud.state(def); FX.flash(0.18);
    return this.run(def.enter);
  },
  clipEnd() {
    if (this.st.next) return this.run(this.st.next);
    if (this.qte && !this.qte.done) return this.resolveQte('late');
    if (this.endingId) return this.results();
  },
  run(list) {
    for (const a of asList(list)) { if (this.act(a) === STOP) return STOP; }
    return this.checkRules();
  },
  act(a) {
    if (typeof a === 'string') a = ['goto', a];
    const [op, ...p] = a, v = this.vars;
    switch (op) {
      case 'goto': this.enter(p[0]); return STOP;
      case 'end': this.endingId = p[0]; { const e = GAME.endings[p[0]]; if (e.state) this.enter(e.state); else this.results(); } return STOP;
      case 'results': this.results(); return STOP;
      case 'set': v[p[0]] = p[1]; break;
      case 'add': { const m = GAME.vars?.[p[0]], d = Array.isArray(p[1]) ? rint(p[1][0], p[1][1]) : p[1]; v[p[0]] = clamp((v[p[0]] || 0) + d, m?.min ?? -Infinity, m?.max ?? Infinity); this.last = d; break; }
      case 'if': return this.run(evalExpr(p[0], this.scope()) ? p[1] : p[2]);
      case 'random': { const tot = p.reduce((s, [w]) => s + w, 0); let r = Math.random() * tot; for (const [w, acts] of p) { if ((r -= w) <= 0) return this.run(acts); } break; }
      case 'banner': Hud.banner(fmt(p[0]), fmt(p[1] || ''), p[2] || ''); break;
      case 'tag': Hud.tag(fmt(p[0]), p[1] || '', p[2] ?? 0.5, p[3] ?? 0.42); break;
      case 'num': Hud.num(p[2] ?? this.hit?.x ?? 0.5, (p[3] ?? this.hit?.y ?? 0.45) - 0.04, fmt(p[0]), fmt(p[1] || ''), p[4] || ''); break;
      case 'sub': Hud.sub(p[0], fmt(p[1])); break;
      case 'sfx': if (Audio[p[0]]) Audio[p[0]](p[1]); break;
      case 'flash': FX.flash(p[0] ?? 0.5); break;
      case 'shake': FX.kick(p[0] ?? 12); break;
      case 'sparks': FX.sparks(p[0] ?? this.hit?.x ?? 0.5, p[1] ?? this.hit?.y ?? 0.5, p[2] ?? 22, p[3] ?? 1); break;
      case 'music': Audio.musicLevel(p[0], p[1] ?? 1); break;
      case 'mood': Audio.setMood(p[0]); break;
      case 'intensity': Audio.intensity = p[0]; break;
      case 'hitstop': Director.pause(); setTimeout(() => { if (!this.paused) Director.resume(); }, (p[0] ?? 0.1) * 1000); break;
      case 'objective': this.objective = p[0]; $('#objText').textContent = fmt(p[0]); break;
      case 'class': stage.classList.toggle(p[0], p[1] !== false); break;
      case 'cooldown': this.cds[p[0]] = p[1]; break;
      default: console.warn('Unknown action', op);
    }
  },
  checkRules() {
    for (const [i, r] of (GAME.rules || []).entries()) {
      if (this.fired.has(i) && r.once !== false) continue;
      if (r.in && !r.in.includes(this.id)) continue; // e.g. wait for the idle state instead of cutting an action clip
      if (evalExpr(r.when, this.scope())) { this.fired.add(i); if (this.run(r.do) === STOP) return STOP; }
    }
  },
  inWindow(p) { if (!p.windows) return true; const t = Director.time(); return p.windows.some(([a, b]) => t >= a && t <= b); },
  key(code) {
    if (this.mode !== 'play' || this.paused) return;
    const def = this.st, q = this.qte;
    if (q && !q.done && keyMatch(q.key, code)) {
      const t = Director.time(), off = Math.abs(t - q.at);
      return this.resolveQte(off < (q.perfect ?? 0.17) ? 'perfect' : off < (q.good ?? 0.4) ? 'good' : t < q.at ? 'early' : 'late');
    }
    const ci = (def.choices || []).findIndex((c) => keyMatch(c.key, code)); if (ci >= 0) return this.choose(ci);
    for (const p of def.inputs || []) {
      if (!keyMatch(p.key, code)) continue;
      if ((this.cds[p.key] || 0) > 0) { Audio.click(); return; }
      if (p.if && !evalExpr(p.if, this.scope())) { Hud.tag(fmt(p.denied || 'Not yet'), 'bad'); Audio.fail(); return; }
      const ok = this.inWindow(p); this.stats.inputs++; ok ? this.stats.ok++ : this.stats.fail++;
      if (p.cooldown) this.cds[p.key] = p.cooldown;
      return this.run(ok ? p.ok : p.fail ?? p.ok);
    }
  },
  choose(i) { const c = this.st.choices?.[i]; if (c && this.mode === 'play') { Audio.click(); this.run(c.do); } },
  resolveQte(result) {
    const q = this.qte; if (!q || q.done) return; q.done = true; this.stats.inputs++;
    const good = result === 'perfect' || result === 'good';
    if (good) { this.stats.ok++; if (result === 'perfect') this.stats.perfect++; } else this.stats.fail++;
    const word = { perfect: q.perfectText || 'Perfect', good: q.goodText || 'Good', early: 'Too early', late: q.lateText || 'Too late' }[result];
    Hud.tag(word, result === 'perfect' ? 'perfect' : good ? 'good' : 'bad'); good ? (result === 'perfect' ? Audio.chime() : Audio.ping()) : Audio.fail();
    // q.perfect / q.good are tolerances in seconds; q.onPerfect is an optional action list for a perfect hit
    if (q.continue && good) { this.mode = 'cine'; return this.run(result === 'perfect' && q.onPerfect ? q.onPerfect : q.ok); }
    return this.run(result === 'perfect' && q.onPerfect ? q.onPerfect : good ? q.ok : q.fail);
  },
  visibleHotspots() { return (this.st?.hotspots || []).filter((h) => !(h.once !== false && this.vars['_used_' + h.id]) && (!h.show || evalExpr(h.show, this.scope()))); },
  click(x, y) {
    if (this.mode !== 'play' || this.paused) return;
    const def = this.st;
    for (const h of this.visibleHotspots()) {
      if (Math.hypot((x - h.x) * 16 / 9, y - h.y) > (h.r || 0.04) * 1.5) continue;
      if (h.if && !evalExpr(h.if, this.scope())) { this.hit = h; Hud.tag(fmt(h.denied || 'Not yet'), 'bad', h.x, h.y - 0.08); Audio.fail(); return; }
      if (h.once !== false) this.vars['_used_' + h.id] = 1;
      this.hit = h; FX.ring(h.x, h.y); Audio.pickup(); return this.run(h.do);
    }
    if (def.spawn) {
      FX.muzzle = 1; Audio.shot();
      for (let i = this.spawned.length - 1; i >= 0; i--) {
        const t = this.spawned[i], R = (0.045 - 0.018 * (t.t / t.life)) * 1.35, d = Math.hypot((x - t.x) * 16 / 9, y - t.y);
        if (d < R) { this.spawned.splice(i, 1); this.hit = t; FX.sparks(t.x, t.y, 22); FX.ring(t.x, t.y); this.stats.ok++; return this.run(d < R * 0.4 && def.spawn.crit ? def.spawn.crit : def.spawn.hit); }
      }
      if (def.spawn.miss) { this.hit = { x, y }; return this.run(def.spawn.miss); }
    }
  },
  update(dt) {
    if (this.mode === 'title' || this.mode === 'results' || this.paused) return;
    this.time += dt; this.t += dt;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.mode !== 'play') return;
    for (const tm of this.timers.slice()) {
      tm.left -= dt;
      if (tm.left <= 0) { if (tm.every) tm.left = pick(tm.every); else this.timers.splice(this.timers.indexOf(tm), 1); if (this.run(tm.do) === STOP) return; }
    }
    const S = this.st.spawn;
    if (S) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.spawned.length < (S.max || 2)) {
        const p = S.points[rint(0, S.points.length - 1)], j = S.jitter ?? 0.01;
        this.spawned.push({ x: p.x + rnd(-j, j), y: p.y + rnd(-j, j), name: p.name, t: 0, life: S.life || 1.5 }); this.spawnT = pick(S.every); Audio.spawn();
      }
      this.spawned = this.spawned.filter((t) => (t.t += dt) < t.life);
    }
    if (this.qte && !this.qte.done && Director.time() > this.qte.at + (this.qte.good ?? 0.4)) this.resolveQte('late');
  },
  results() {
    this.mode = 'results'; hud.classList.add('hidden'); $('#touch').classList.add('hidden');
    const end = GAME.endings[this.endingId] || {}, S = this.scope();
    const rank = end.win === false ? '—' : ((GAME.rank || []).find(([c]) => evalExpr(c, S)) || [0, ''])[1];
    $('#rTitle').textContent = '↘ ' + (end.title || 'Results').toUpperCase(); $('#rSub').textContent = fmt(end.text || '');
    $('#rRank').textContent = rank; $('#rRank').classList.toggle('hidden', !rank);
    const rows = [['Time', 'time']].concat(GAME.results || []);
    $('#rRows').innerHTML = rows.map(([k, e], i) => { const v = e === 'time' ? fmtTime(S.time) : evalExpr(e, S); return `<div class="r-cell" style="animation-delay:${0.1 + i * 0.07}s"><span>${k}</span><b>${typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : v}</b></div>`; }).join('');
    show('#results', true); Audio.musicLevel(0.3, 1.5);
  },
};

// ---------------------------------------------------------------- screens & input
function show(sel, on) { $(sel).classList.toggle('hidden', !on); }
function setupScreens() {
  const M = GAME.meta, credit = M.credit ? `Built &amp; designed by <b>${M.credit}</b>` : '';
  document.title = M.subtitle ? `${M.title}: ${M.subtitle}` : M.title;
  const root = document.documentElement.style; Object.entries(M.theme || {}).forEach(([k, v]) => root.setProperty('--' + k, v));
  if (M.theme?.mote) FX.mote = M.theme.mote;
  $('#tHead').textContent = '↘ ' + M.title.toUpperCase(); $('#tTitle').textContent = M.subtitle || M.title; $('#tKicker').textContent = M.kicker || '';
  $('#tBlurb').textContent = M.blurb || ''; $('#tCredit').innerHTML = credit; $('#bCredit').innerHTML = credit; $('#rCredit').innerHTML = credit;
  if (M.titleImage) $('#titleBg').style.backgroundImage = `url(${M.titleImage})`;
  const B = M.briefing || {};
  if (B.image || M.titleImage) $('#briefBg').style.backgroundImage = `url(${B.image || M.titleImage})`;
  $('#bKicker').textContent = B.kicker || ''; $('#bHead').innerHTML = B.heading || ''; $('#bText').textContent = B.text || '';
  $('#bControls').innerHTML = (GAME.controls || []).map((c) => `<div class="b-row"><span class="ico"><b>${keyLabel(c.key)}</b></span><div><b>${c.label}</b><em>${c.desc || ''}</em></div></div>`).join('');
  $('#touch').innerHTML = (GAME.controls || []).filter((c) => c.key !== 'Click').map((c) => `<button data-key="${String(c.key).split('|')[0]}">${keyLabel(String(c.key).split('|')[0])}</button>`).join('');
  document.querySelectorAll('#touch button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); E.key(b.dataset.key); }));
  Audio.setMood(M.mood || 'tense');
}
let ready = false;
function begin() {
  if (!ready || E.mode !== 'title') return;
  Audio.init(); Audio.ctx && Audio.ctx.resume(); Director.unlock(); Audio.musicLevel(0.25, 1.5);
  E.mode = 'briefing'; show('#title', false); show('#briefing', true); Audio.whoosh();
}
function startGame() {
  if (E.mode !== 'briefing' && E.mode !== 'results') return;
  show('#briefing', false); show('#results', false); E.reset(); Hud.build(); hud.classList.remove('hidden');
  if (matchMedia('(hover:none)').matches) $('#touch').classList.remove('hidden');
  Audio.musicLevel(GAME.meta.musicLevel ?? 0.45, 1.5); E.enter(GAME.meta.start);
}
function toTitle() { show('#results', false); show('#pause', false); E.paused = false; E.mode = 'title'; hud.classList.add('hidden'); Director.pause(); show('#title', true); }
function setPaused(p) { if (!['play', 'cine'].includes(E.mode)) return; E.paused = p; show('#pause', p); p ? Director.pause() : Director.resume(); if (Audio.ctx) p ? Audio.ctx.suspend() : Audio.ctx.resume(); }
function restart() { show('#pause', false); E.paused = false; if (Audio.ctx) Audio.ctx.resume(); E.mode = 'results'; startGame(); }
const keys = {}; let skipHold = 0;
function handleKey(code) {
  if (E.mode === 'title') { if (code === 'Enter' || code === 'Space') begin(); return; }
  if (E.mode === 'briefing') { if (code === 'Enter' || code === 'Space') startGame(); return; }
  if (code === 'Escape' || code === 'KeyP') return setPaused(!E.paused);
  if (code === 'KeyM') return Audio.setMuted(!Audio.muted);
  E.key(code);
}
addEventListener('keydown', (e) => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (keys[e.code]) return; keys[e.code] = true; if (e.code === 'Enter' && E.mode === 'cine' && E.st?.skippable) return; handleKey(e.code); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const toStage = (e) => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
stage.addEventListener('pointermove', (e) => Object.assign(FX.mouse, toStage(e), { on: true }));
stage.addEventListener('pointerleave', () => { FX.mouse.on = false; });
stage.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const p = toStage(e); Object.assign(FX.mouse, p, { on: true }); E.click(p.x, p.y); });
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { const a = b.dataset.act; if (a === 'resume') setPaused(false); else if (a === 'restart') restart(); else if (a === 'title') toTitle(); else if (a === 'mute') Audio.setMuted(!Audio.muted); }));
$('#startBtn').addEventListener('click', begin);
$('#briefBtn').addEventListener('click', startGame);

// ---------------------------------------------------------------- loop & boot
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!E.paused) {
    Director.update(); E.update(dt); FX.update(dt);
    if (E.mode === 'cine' && E.st?.skippable) {
      skipHold = keys.Enter ? skipHold + dt : 0; $('#skipFill').style.width = clamp(skipHold / 0.8, 0, 1) * 100 + '%';
      if (skipHold > 0.8) { skipHold = 0; E.run(E.st.next); }
    }
    $('#skip').classList.toggle('hidden', !(E.mode === 'cine' && E.st?.skippable));
    if (Audio.ctx) Audio.pump();
  }
  FX.draw();
  if (['play', 'cine'].includes(E.mode)) Hud.update();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => FX.resize());
(async function boot() {
  GAME = await (await fetch('game.json')).json();
  setupScreens(); FX.resize(); for (let i = 0; i < 50; i++) FX.dust();
  requestAnimationFrame(frame);
  try {
    await Director.preload((p) => { $('#loadFill').style.width = p * 100 + '%'; $('#loadTxt').textContent = 'Loading footage ' + Math.round(p * 100) + '%'; });
    ready = true; $('#startBtn').disabled = false; $('#loadTxt').textContent = `${Object.keys(GAME.clips).length} shots ready`;
  } catch (err) { $('#loadTxt').textContent = 'Could not load footage: ' + err.message; console.error(err); }
})();
