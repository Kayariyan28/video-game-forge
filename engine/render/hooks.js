/* Video Game Forge — render mode (loaded with ?render=1).
   Runs the game on a virtual clock so a headless browser can capture it frame by frame: clips are paused and
   seeked to exact times, timers / CSS animations / performance.now follow the virtual clock, Math.random is
   seeded, every sound is logged for the offline mix, and an autopilot plays the route written in game.json → demo. */
'use strict';
(() => {
  const params = new URLSearchParams(location.search);
  const FPS = +(params.get('fps') || 30), DT = 1 / FPS;
  const R = window.__R = { t: 0, frame: 0, fps: FPS, frames: [], events: [], done: false, ready: false };
  const realRAF = window.requestAnimationFrame.bind(window), realST = window.setTimeout.bind(window);

  let seed = +(params.get('seed') || 2828);
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  HTMLMediaElement.prototype.play = function () { this.__playing = true; return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () { this.__playing = false; };

  // sounds are logged with their time and rendered offline at the end
  const SFX = ['shot', 'ping', 'crit', 'thud', 'click', 'whoosh', 'chime', 'pickup', 'alarm', 'fail', 'tick', 'spawn'];
  const orig = {};
  SFX.forEach((k) => { orig[k] = Audio[k]; Audio[k] = (...a) => R.events.push({ t: R.t, k, a }); });
  orig.musicLevel = Audio.musicLevel; orig.setMood = Audio.setMood;
  Audio.musicLevel = (v, t = 1.2) => R.events.push({ t: R.t, k: 'level', a: [v, t] });
  Audio.setMood = (m) => { R.events.push({ t: R.t, k: 'mood', a: [m] }); orig.setMood.call(Audio, m); };
  Audio.init = () => {}; Audio.pump = () => {};
  let intensity = 0;
  Object.defineProperty(Audio, 'intensity', { configurable: true, get: () => intensity, set: (v) => { intensity = v; R.events.push({ t: R.t, k: 'intensity', a: [v] }); } });

  const timers = []; let tid = 1, loopCb = null;
  function goVirtual() {
    performance.now = () => R.t * 1000;
    window.setTimeout = (fn, ms = 0) => { const id = tid++; timers.push({ id, at: R.t + (ms || 0) / 1000, fn }); return id; };
    window.clearTimeout = (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); };
    window.requestAnimationFrame = (cb) => { loopCb = cb; return 1; };
  }
  const seek = (v, t) => new Promise((ok) => { if (!v) return ok(); if (Math.abs(v.currentTime - t) < 1e-4 && !v.seeking) return ok(); v.addEventListener('seeked', ok, { once: true }); v.currentTime = t; realST(ok, 3000); });
  const settle = (v) => (v && v.seeking ? new Promise((ok) => { v.addEventListener('seeked', ok, { once: true }); realST(ok, 3000); }) : Promise.resolve());

  // a small pointer for menus; the engine's crosshair takes over on clickable states
  const cur = document.createElement('div');
  cur.style.cssText = 'position:absolute;z-index:20;width:1.4em;height:1.4em;margin:-.7em 0 0 -.7em;border:1.5px solid #fff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 .35em rgba(255,255,255,.12)';
  cur.innerHTML = '<i style="position:absolute;left:50%;top:50%;width:.3em;height:.3em;margin:-.15em;border-radius:50%;background:#fff"></i>';
  stage.appendChild(cur);
  const centerOf = (el) => { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: (r.left + r.width / 2 - s.left) / s.width, y: (r.top + r.height / 2 - s.top) / s.height }; };

  // ---- autopilot: game.json → demo = { title, briefing, results, states: { id: [ visit1Steps, visit2Steps, … ] } }
  const B = { x: 0.62, y: 0.78, phase: 'title', t0: 0, plan: null, planFor: null, stepT: 0 };
  const moveTo = (tx, ty, rate) => { B.x += (tx - B.x) * Math.min(1, DT * rate); B.y += (ty - B.y) * Math.min(1, DT * rate); };
  const showCursor = (on) => { cur.style.display = on ? 'block' : 'none'; cur.style.left = B.x * 100 + '%'; cur.style.top = B.y * 100 + '%'; };
  function bot() {
    const D = GAME.demo || {}, since = R.t - B.t0;
    if (B.phase === 'title') { showCursor(true); if (since > 1) { const c = centerOf($('#startBtn')); moveTo(c.x, c.y, 3.2); } if (since > (D.title ?? 4)) { begin(); B.phase = 'briefing'; B.t0 = R.t; } return; }
    if (B.phase === 'briefing') {
      showCursor(true);
      const rows = [...document.querySelectorAll('#bControls .b-row')], k = Math.floor(since / 1.2);
      if (rows[k] && since < (D.briefing ?? 7) - 2) { const c = centerOf(rows[k]); moveTo(c.x - 0.04, c.y, 3); } else { const c = centerOf($('#briefBtn')); moveTo(c.x, c.y, 3.5); }
      if (since > (D.briefing ?? 7)) { startGame(); B.phase = 'game'; B.t0 = R.t; }
      return;
    }
    if (E.mode === 'results') { showCursor(false); if (B.resT == null) B.resT = R.t; if (R.t - B.resT > (D.results ?? 6)) R.done = true; return; }
    const clickable = E.st && (E.st.hotspots || E.st.spawn);
    showCursor(false); FX.mouse.on = !!clickable; FX.mouse.x = B.x; FX.mouse.y = B.y;
    // steps for this visit of this state
    const key = E.id + '#' + E.visits[E.id];
    if (B.planFor !== key) { const all = (D.states || {})[E.id] || []; B.plan = (all[Math.min(E.visits[E.id] - 1, all.length - 1)] || []).map((s) => s.slice()); B.planFor = key; B.stepT = 0; }
    const step = B.plan[0];
    if (clickable && !(step && ['click', 'shoot'].includes(step[0]))) moveTo(0.5 + Math.sin(R.t * 0.7) * 0.05, 0.5 + Math.cos(R.t * 0.9) * 0.05, 1.5);
    if (!step || E.mode !== 'play') return;
    B.stepT += DT;
    const done = () => { B.plan.shift(); B.stepT = 0; };
    if (B.stepT > 20) { console.warn('demo step skipped (never became possible):', JSON.stringify(step), 'in', E.id); return done(); }
    const [op, a, b] = step, t = Director.time();
    if (op === 'wait') { if (B.stepT >= a) done(); return; }
    if (op === 'click') {
      const h = (E.st.hotspots || []).find((x) => x.id === a); if (!h) return done();
      moveTo(h.x, h.y, 5); if (B.stepT > 0.9 && Math.hypot(B.x - h.x, B.y - h.y) < 0.01) { done(); E.click(h.x, h.y); }
      return;
    }
    if (op === 'shoot') { const tg = E.spawned.find((x) => x.t > 0.2); if (tg) { moveTo(tg.x, tg.y, 7.5); if (Math.hypot((B.x - tg.x) * 16 / 9, B.y - tg.y) < 0.012) E.click(tg.x, tg.y); } if (B.stepT >= a) done(); return; }
    if (op === 'choose') { if (B.stepT > (a2(b) ?? 0.4)) { done(); handleKey(a.split('|')[0]); } return; }
    if (op === 'press') {
      const inp = (E.st.inputs || []).find((p) => p.key.split('|').includes(a)), inW = inp ? E.inWindow(inp) : true;
      const ready = b === 'safe' ? inW && (inp?.windows || []).some(([w0, w1]) => t >= w0 + 0.15 && t <= w1 - 0.1) : b === 'danger' ? !inW : true;
      if (ready) { done(); handleKey(a); }
      return;
    }
    if (op === 'qte') {
      const q = E.qte; if (!q || q.done) return done();
      const off = { perfect: -0.03, good: 0.3, early: -0.9, late: 99 }[a] ?? -0.03;
      if (t >= q.at + off) { done(); handleKey(q.key.split('|')[0]); }
    }
  }
  const a2 = (v) => (typeof v === 'number' ? v : null);

  R.step = async () => {
    bot();
    R.t += DT;
    timers.filter((x) => x.at <= R.t + 1e-9).sort((a, b) => a.at - b.at).forEach((d) => { const i = timers.indexOf(d); if (i >= 0) timers.splice(i, 1); d.fn(); });
    const v = Director.cur;
    if (v && v.__playing) { let nt = v.currentTime + DT * v.playbackRate; if (nt >= v.duration - 0.001) nt = v.loop ? nt - v.duration : v.duration - 0.001; await seek(v, nt); }
    if (loopCb) { const cb = loopCb; loopCb = null; last = (R.t - DT) * 1000; cb(R.t * 1000); }
    await settle(Director.cur);
    for (const a of document.getAnimations()) { if (a.__v0 == null) a.__v0 = R.t; a.pause(); a.currentTime = (R.t - a.__v0) * 1000; }
    const c = Director.cur;
    R.frames.push({ i: R.frame, clip: Director.curId, vt: c ? +c.currentTime.toFixed(4) : 0, on: !!(c && c.__playing), rate: c ? c.playbackRate : 1, vol: Director.videoVol, st: E.mode });
    await new Promise((ok) => realRAF(() => realRAF(ok)));
    R.frame++;
    return R.done;
  };

  // offline soundtrack: the engine's own score and effects, rendered on the same timeline
  R.renderAudio = async (dur) => {
    const SR = 48000, ac = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
    SFX.forEach((k) => { Audio[k] = orig[k]; }); Audio.musicLevel = orig.musicLevel; Audio.setMood = orig.setMood;
    Object.defineProperty(Audio, 'intensity', { value: 0, writable: true, configurable: true });
    Audio.ctx = ac;
    Audio.master = ac.createGain(); Audio.master.gain.value = 0.9; Audio.master.connect(ac.destination);
    Audio.music = ac.createGain(); Audio.music.gain.value = 0; Audio.music.connect(Audio.master);
    Audio.sfx = ac.createGain(); Audio.sfx.gain.value = 0.55; Audio.sfx.connect(Audio.master);
    Audio.noise = ac.createBuffer(1, SR, SR); const d = Audio.noise.getChannelData(0); for (let i = 0; i < SR; i++) d[i] = Math.random() * 2 - 1;
    Audio.nextT = 0.05; Audio.step = 0; Audio.lvl = { from: 0, to: 0, t0: 0, t1: 0 }; Audio.setMood(GAME.meta.mood || 'tense');
    for (const e of R.events.slice().sort((a, b) => a.t - b.t)) {
      Audio.pumpUntil(e.t); Audio.at = e.t;
      if (e.k === 'intensity') Audio.intensity = e.a[0]; else if (e.k === 'level') Audio.musicLevel(...e.a); else if (e.k === 'mood') Audio.setMood(...e.a); else Audio[e.k](...e.a);
    }
    Audio.pumpUntil(dur); Audio.at = null;
    const buf = await ac.startRendering(), L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length, bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer);
    const w = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(46 + i * 4, clamp(Rr[i], -1, 1) * 32767, true); }
    const chunks = [], CH = 3 * 1024 * 1024;
    for (let o = 0; o < bytes.length; o += CH) { let s = ''; const part = bytes.subarray(o, o + CH); for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode.apply(null, part.subarray(i, i + 0x8000)); chunks.push(btoa(s)); }
    return chunks;
  };

  (function wait() {
    if (ready && document.fonts.status === 'loaded') { goVirtual(); Audio.musicLevel(0.22, 2); R.ready = true; return; }
    realST(wait, 100);
  })();
})();
