/*
 * brick/engine.js — the handheld itself.
 * LCD renderer (cells + 7-segment digits + ghost segments), sound, input,
 * and the console state machine: OFF -> BOOT -> MENU -> PLAY <-> PAUSE -> OVER -> MENU.
 */
(function () {
  'use strict';

  /* Self-heal: if the browser served an old stylesheet next to this script (stale HTTP/service-worker cache),
     drop every cache and reload once, so a half-updated page never stays on screen. */
  const BUILD = '6';
  // Escape hatch: open /brick/?reset once to wipe this site's service worker and caches, then land on a clean page.
  if (/[?&]reset\b/.test(location.search)) {
    const regs = navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve();
    Promise.resolve(regs).then(() => (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : null))
      .catch(() => { }).then(() => location.replace(location.pathname + '?v=' + Date.now()));
    return;
  }
  try {
    const seen = getComputedStyle(document.documentElement).getPropertyValue('--build').replace(/["'\s]/g, '');
    if (seen !== BUILD && !sessionStorage.getItem('brick.healed')) {
      sessionStorage.setItem('brick.healed', '1');
      const regs = navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve();
      Promise.resolve(regs).then(() => (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : null))
        .catch(() => { }).then(() => location.reload());
      return;
    }
  } catch (_) { /* storage blocked: carry on */ }


  const W = 10, H = 20, N = W * H;
  const GAMES = window.BRICK_GAMES;
  const $ = s => document.querySelector(s);

  /* ============================== storage ============================== */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('brick.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('brick.' + k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } }
  };

  /* ================================ sound ================================ */
  const Sound = (function () {
    let ctx = null, master = null, noiseBuf = null, enabled = store.get('sound', true);
    let timer = null, idx = 0, nextT = 0, beat = .3;
    const lastFx = {};

    function unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = .16; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    }
    function tone(freq, dur, o) {
      if (!enabled || !ctx) return;
      o = o || {};
      const t = ctx.currentTime + (o.at || 0);
      const osc = ctx.createOscillator(), gn = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const v = (o.vol == null ? 1 : o.vol) * .5;
      gn.gain.setValueAtTime(.0001, t);
      gn.gain.linearRampToValueAtTime(v, t + .004);
      gn.gain.setValueAtTime(v, t + dur * .7);
      gn.gain.linearRampToValueAtTime(.0001, t + dur);
      osc.connect(gn); gn.connect(master);
      osc.start(t); osc.stop(t + dur + .03);
    }
    function noise(dur, o) {
      if (!enabled || !ctx) return;
      o = o || {};
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = o.f || 1800;
      gn.gain.setValueAtTime((o.vol || .6) * .6, t);
      gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(f); f.connect(gn); gn.connect(master);
      src.start(t); src.stop(t + dur + .02);
    }
    function seq(notes, o) {
      let at = 0;
      notes.forEach(n => { tone(n[0], n[1], Object.assign({ at }, o)); at += n[1] * 1.05; });
    }
    const FX = {
      tick: () => tone(1200, .022, { vol: .45 }),
      move: () => tone(330, .02, { vol: .35 }),
      rot: () => tone(520, .035, { vol: .45 }),
      land: () => tone(140, .06, { vol: .8 }),
      line: () => seq([[660, .07], [880, .07], [1100, .1]]),
      tetris: () => seq([[523, .06], [659, .06], [784, .06], [1046, .16]]),
      level: () => seq([[784, .06], [988, .06], [1319, .1]]),
      eat: () => seq([[880, .04], [1320, .05]]),
      crash: () => { noise(.5, { vol: .9 }); tone(130, .45, { to: 40, type: 'sawtooth' }); },
      boom: () => noise(.2, { vol: .7 }),
      hit: () => noise(.05, { vol: .45, f: 3000 }),
      shoot: () => tone(900, .07, { to: 300, vol: .45 }),
      bounce: () => tone(440, .04),
      brick: () => tone(780, .04),
      hop: () => tone(620, .03, { vol: .5 }),
      cut: () => tone(210, .08),
      perfect: () => tone(900, .06),
      miss: () => tone(320, .35, { to: 90, type: 'sawtooth', vol: .8 }),
      win: () => seq([[659, .08], [784, .08], [988, .08], [1319, .2]]),
      start: () => seq([[523, .09], [659, .09], [784, .09], [1046, .2]]),
      over: () => seq([[392, .2], [330, .2], [262, .2], [196, .5]], { type: 'sawtooth', vol: .8 }),
      boot: () => seq([[880, .08], [1760, .12]])
    };
    // Korobeiniki — public-domain Russian folk tune (note, beats)
    const TUNE = [
      [659, 1], [494, .5], [523, .5], [587, 1], [523, .5], [494, .5], [440, 1], [440, .5], [523, .5], [659, 1], [587, .5], [523, .5],
      [494, 1.5], [523, .5], [587, 1], [659, 1], [523, 1], [440, 1], [440, 1], [0, 1],
      [587, 1.5], [698, .5], [880, 1], [784, .5], [698, .5], [659, 1.5], [523, .5], [659, 1], [587, .5], [523, .5],
      [494, 1], [494, .5], [523, .5], [587, 1], [659, 1], [523, 1], [440, 1], [440, 1], [0, 1]
    ];
    function pump() {
      if (!ctx) return;
      while (nextT < ctx.currentTime + .35) {
        const n = TUNE[idx], d = n[1] * beat;
        if (n[0]) tone(n[0], d * .85, { at: Math.max(0, nextT - ctx.currentTime), vol: .3 });
        nextT += d; idx = (idx + 1) % TUNE.length;
      }
    }
    return {
      unlock,
      get enabled() { return enabled; },
      set(v) { enabled = !!v; store.set('sound', enabled); if (!enabled) this.stopMusic(); },
      fx(name) {
        if (!enabled || !ctx || !FX[name]) return;
        const now = performance.now();
        if (now - (lastFx[name] || 0) < 25) return;
        lastFx[name] = now; FX[name]();
      },
      startMusic(speed) {
        this.stopMusic();
        if (!enabled || !ctx) return;
        beat = .36 - (speed || 1) * .012; idx = 0; nextT = ctx.currentTime + .15;
        timer = setInterval(pump, 80); pump();
      },
      setTempo(speed) { beat = .36 - speed * .012; },
      stopMusic() { if (timer) { clearInterval(timer); timer = null; } }
    };
  })();

  /* ============================ console state ============================ */
  const OFF = 0, BOOT = 1, MENU = 2, PLAY = 3, PAUSE = 4, OVER = 5;
  let state = OFF, clock = 0, stateT = 0;
  let sel = store.get('sel', { game: 0, speed: 1, level: 1 });
  if (!sel || typeof sel.game !== 'number' || sel.game >= GAMES.length) sel = { game: 0, speed: 1, level: 1 };
  let hiAll = store.get('hi', {});
  let game = null, def = null, startDelay = 0, newHi = false;

  const g = {
    W, H, f: new Uint8Array(N), n: new Uint8Array(16),
    score: 0, speed: 1, level: 1,
    set(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < H) this.f[y * W + x] = v === undefined ? 1 : v; },
    get(x, y) { return (x < 0 || x >= W || y < 0 || y >= H) ? 0 : this.f[y * W + x]; },
    clear() { this.f.fill(0); },
    add(v) { this.score = Math.min(999999, this.score + v); },
    rnd(n) { return Math.floor(Math.random() * n); },
    setSpeed(s) { this.speed = Math.max(1, Math.min(10, s)); if (game && game.music) Sound.setTempo(this.speed); },
    lives(n) { this.n.fill(0); for (let i = 0; i < Math.min(n, 12); i++) this.n[4 + i] = 1; },
    held(b) { return !!held[b]; },
    sfx(name) { Sound.fx(name); },
    over() { if (state === PLAY) gameOver(); }
  };

  /* ------------------------------ transitions ------------------------------ */
  function setState(s) { state = s; stateT = 0; }

  function powerToggle() {
    if (state === OFF) {
      Sound.unlock();
      g.clear(); g.n.fill(0); g.score = 0;
      setState(BOOT); Sound.fx('boot');
    } else {
      Sound.stopMusic(); game = null; setState(OFF); releaseAll();
    }
    document.body.classList.toggle('is-on', state !== OFF);
  }
  function toMenu() {
    Sound.stopMusic(); game = null; def = null;
    g.clear(); g.n.fill(0); g.score = 0; newHi = false;
    setState(MENU);
    showName();
  }
  function startGame() {
    def = GAMES[sel.game];
    g.clear(); g.n.fill(0); g.score = 0; g.speed = sel.speed; g.level = sel.level;
    newHi = false;
    game = def.make(g);
    startDelay = 750;
    setState(PLAY);
    Sound.fx('start');
    if (game.music) setTimeout(() => { if (state === PLAY && game && game.music) Sound.startMusic(g.speed); }, 750);
  }
  function gameOver() {
    const k = def.id, prev = hiAll[k] || 0;
    if (g.score > prev) { hiAll[k] = g.score; store.set('hi', hiAll); newHi = g.score > 0; }
    Sound.stopMusic(); Sound.fx('over');
    setState(OVER);
  }
  function togglePause() {
    if (state === PLAY && startDelay <= 0) { setState(PAUSE); Sound.stopMusic(); releaseAll(); }
    else if (state === PAUSE) { setState(PLAY); if (game && game.music) Sound.startMusic(g.speed); }
  }

  /* ---------------------------------- input ---------------------------------- */
  const held = { left: 0, right: 0, up: 0, down: 0, rotate: 0 };
  const nextRep = {};
  const MENU_REP = [330, 110];

  function releaseAll() {
    for (const b in held) if (held[b]) { held[b] = 0; if (game && game.release) game.release(b); }
  }

  function dispatch(btn, isRepeat) {
    if (state === MENU) {
      if (menuMode() === 'orig') {            // as printed on the real units: LEFT level, RIGHT speed, DOWN game
        if (btn === 'left') sel.level = sel.level % 10 + 1;
        else if (btn === 'right') sel.speed = sel.speed % 10 + 1;
        else if (btn === 'down') sel.game = (sel.game + 1) % GAMES.length;
        else if (btn === 'up') sel.game = (sel.game + GAMES.length - 1) % GAMES.length;
        else return;
      } else {                                // quick: LEFT/RIGHT game, UP/DOWN speed, ROTATE level
        if (btn === 'left') sel.game = (sel.game + GAMES.length - 1) % GAMES.length;
        else if (btn === 'right') sel.game = (sel.game + 1) % GAMES.length;
        else if (btn === 'up') sel.speed = sel.speed % 10 + 1;
        else if (btn === 'down') sel.speed = (sel.speed + 8) % 10 + 1;
        else if (btn === 'rotate') { if (isRepeat) return; sel.level = sel.level % 10 + 1; }
      }
      Sound.fx('tick'); store.set('sel', sel); showName();
    } else if (state === PLAY && startDelay <= 0 && game && game.press) {
      game.press(btn, !!isRepeat);
    }
  }

  function btnDown(btn) {
    Sound.unlock();
    if (btn === 'power') { if (state === OFF && window.__brickFsOnPower) window.__brickFsOnPower(); return powerToggle(); }
    if (state === OFF) return;
    if (btn === 'sound') {
      Sound.set(!Sound.enabled);
      if (Sound.enabled) { Sound.fx('tick'); if (state === PLAY && game && game.music) Sound.startMusic(g.speed); }
      return;
    }
    if (btn === 'reset') { releaseAll(); return toMenu(); }
    if (btn === 'sp') {
      if (state === MENU) startGame();
      else if (state === PLAY || state === PAUSE) togglePause();
      else if (state === OVER) toMenu();
      else if (state === BOOT) toMenu();
      return;
    }
    if (!(btn in held) || held[btn]) return;
    held[btn] = clock || 1;
    const cfg = state === MENU ? MENU_REP : (game && game.repeat && game.repeat[btn]);
    nextRep[btn] = clock + (cfg ? cfg[0] : 0);
    if (state === OVER && stateT > 900) return toMenu();
    if (state === PAUSE) return;
    if (navigator.vibrate && Sound.enabled && state === PLAY) navigator.vibrate(6);
    dispatch(btn, false);
  }
  function btnUp(btn) {
    if (!(btn in held) || !held[btn]) return;
    held[btn] = 0;
    if (game && game.release) game.release(btn);
  }

  /* ----------------------- on-screen buttons (touch / mouse) ----------------------- */
  const counts = {};
  const press = b => { counts[b] = (counts[b] || 0) + 1; if (counts[b] === 1) { btnDown(b); lit(b, true); } };
  const unpress = b => { if (!counts[b]) return; counts[b]--; if (counts[b] === 0) { btnUp(b); lit(b, false); } };
  function lit(b, on) {
    document.querySelectorAll('[data-btn="' + b + '"], [data-dir="' + b + '"]').forEach(el => el.classList.toggle('pressed', on));
  }

  document.querySelectorAll('button[data-btn]').forEach(el => {
    const b = el.dataset.btn;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      press(b);
      el._on = true;
    });
    const up = e => { if (el._on) { el._on = false; unpress(b); } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }); // keyboard handled globally
  });

  // The D-pad is one touch surface: slide a thumb between arrows like a real rocker.
  (function dpad() {
    const el = $('#dpad');
    const ptrs = new Map();
    const DIRS = ['up', 'right', 'down', 'left'];
    function dirsAt(e) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy), s = r.width / 2;
      if (dist < s * .16 || dist > s * 1.35) return new Set();
      const a = Math.atan2(dy, dx) * 180 / Math.PI;           // 0 = right, 90 = down
      const out = new Set();
      const test = (center, name) => { let d = Math.abs(((a - center + 540) % 360) - 180); if (d <= 52) out.add(name); };
      test(-90, 'up'); test(0, 'right'); test(90, 'down'); test(180, 'left');
      return out;
    }
    function apply(id, next) {
      const prev = ptrs.get(id) || new Set();
      DIRS.forEach(d => { if (prev.has(d) && !next.has(d)) unpress(d); });
      DIRS.forEach(d => { if (!prev.has(d) && next.has(d)) press(d); });
      ptrs.set(id, next);
    }
    el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } apply(e.pointerId, dirsAt(e)); });
    el.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) apply(e.pointerId, dirsAt(e)); });
    const end = e => { if (ptrs.has(e.pointerId)) { apply(e.pointerId, new Set()); ptrs.delete(e.pointerId); } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  })();

  /* ---------------------------------- keyboard ---------------------------------- */
  const KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'rotate', z: 'rotate', Z: 'rotate', x: 'rotate', X: 'rotate', k: 'rotate', K: 'rotate',
    Enter: 'sp', p: 'sp', P: 'sp', m: 'sound', M: 'sound', r: 'reset', R: 'reset', o: 'power', O: 'power', Escape: 'power'
  };
  const FN_KEYS = new Set(['power', 'sound', 'reset', 'sp']);
  const kdown = {};
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (helpOpen()) { if (e.key === 'Escape') toggleHelp(false); return; }
    const b = KEYS[e.key];
    if (!b) return;
    e.preventDefault();
    if (e.repeat || kdown[e.key]) return;
    kdown[e.key] = b;
    if (FN_KEYS.has(b)) { btnDown(b); lit(b, true); setTimeout(() => lit(b, false), 110); }   // one-shot taps
    else press(b);
  });
  window.addEventListener('keyup', e => {
    const b = kdown[e.key];
    if (!b) return;
    delete kdown[e.key];
    if (!FN_KEYS.has(b)) unpress(b);
  });
  window.addEventListener('blur', () => {
    Object.keys(kdown).forEach(k => { unpress(kdown[k]); delete kdown[k]; });
    if (state === PLAY && startDelay <= 0) togglePause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === PLAY && startDelay <= 0) togglePause(); });

  /* ============================== LCD rendering ============================== */
  const PALETTES = [
    { name: 'CLASSIC', bg: '#c9cdbd', ink: '#141912', ghost: 'rgba(30,38,24,.085)', soft: 'rgba(20,25,18,.55)' },
    { name: 'MOSS',    bg: '#a8b98b', ink: '#18240f', ghost: 'rgba(24,36,15,.10)',  soft: 'rgba(24,36,15,.55)' },
    { name: 'AMBER',   bg: '#d3c58e', ink: '#2b2208', ghost: 'rgba(43,34,8,.09)',   soft: 'rgba(43,34,8,.55)' },
    { name: 'OLIVE',   bg: '#6c7955', ink: '#0d1109', ghost: 'rgba(8,12,4,.15)',    soft: 'rgba(8,12,4,.6)' }
  ];
  let palIdx = store.get('pal', 0) % PALETTES.length;

  const cv = $('#lcd'), ctx = cv.getContext('2d');
  // Two LCD shapes. "classic" has wide cells and a roomy side panel; "tall" (the blue unit) has square cells and a
  // narrow panel, so the panel is drawn in the same coordinates and just scaled down (ps) into its slot (px, py).
  const PROFILES = {
    classic: { LW: 250, LH: 260, CW: 13.2, CH: 12.2, ps: 1,   px: 150, py: 0 },
    tall:    { LW: 228, LH: 281, CW: 13.2, CH: 13.2, ps: .78, px: 150, py: 5 }
  };
  let PF = PROFILES.classic;
  const FX0 = 8, FY0 = 8;                                         // playfield origin
  const PCX = 197.5;                                              // panel centre x (in panel coordinates)

  function cell(x, y, w, h, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.min(w, h) * .115;
    ctx.strokeRect(x + w * .09, y + h * .09, w * .82, h * .82);
    ctx.fillRect(x + w * .27, y + h * .27, w * .46, h * .46);
  }

  // 7-segment digit, slightly italic like the real LCD
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function polyH(x0, x1, y, t) { ctx.moveTo(x0, y); ctx.lineTo(x0 + t / 2, y - t / 2); ctx.lineTo(x1 - t / 2, y - t / 2); ctx.lineTo(x1, y); ctx.lineTo(x1 - t / 2, y + t / 2); ctx.lineTo(x0 + t / 2, y + t / 2); ctx.closePath(); }
  function polyV(x, y0, y1, t) { ctx.moveTo(x, y0); ctx.lineTo(x + t / 2, y0 + t / 2); ctx.lineTo(x + t / 2, y1 - t / 2); ctx.lineTo(x, y1); ctx.lineTo(x - t / 2, y1 - t / 2); ctx.lineTo(x - t / 2, y0 + t / 2); ctx.closePath(); }
  function digit(ch, x, y, w, h, t, onCol, offCol) {
    const lit = (ch >= '0' && ch <= '9') ? SEG[ch] : '';
    const hh = t / 2, gp = t * .5, mid = h / 2;
    const paths = {
      a: () => polyH(hh + gp, w - hh - gp, hh, t), g: () => polyH(hh + gp, w - hh - gp, mid, t), d: () => polyH(hh + gp, w - hh - gp, h - hh, t),
      f: () => polyV(hh, hh + gp, mid - gp, t), b: () => polyV(w - hh, hh + gp, mid - gp, t),
      e: () => polyV(hh, mid + gp, h - hh - gp, t), c: () => polyV(w - hh, mid + gp, h - hh - gp, t)
    };
    ctx.save();
    ctx.transform(1, 0, -.15, 1, x + h * .15, y);
    ctx.beginPath(); 'abcdefg'.split('').forEach(k => { if (!lit.includes(k)) paths[k](); });
    ctx.fillStyle = offCol; ctx.fill();
    ctx.beginPath(); lit.split('').forEach(k => paths[k]());
    ctx.fillStyle = onCol; ctx.fill();
    ctx.restore();
  }
  function number(str, x, y, w, h, t, gap, on, off) {
    for (let i = 0; i < str.length; i++) digit(str[i], x + i * (w + gap), y, w, h, t, on, off);
  }
  const pad = (v, n, z) => { let s = String(v); if (s.length > n) s = s.slice(-n); return s.padStart(n, z ? '0' : ' '); };

  // the little guy on the panel
  const GUY = [
    ['....XXXX....', '...XXXXXX...', '...XXXXXX...', '....XXXX....', '..XXXXXXXX..', '.X.XXXXXX.X.', 'X..XXXXXX..X', '...XXXXXX...', '...XX..XX...', '..XX....XX..', '.XX......XX.', 'XX........XX'],
    ['....XXXX....', '...XXXXXX...', '...XXXXXX...', '....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '..X.XXXX.X..', '..X.XXXX.X..', '....XXXX....', '....XX.XX...', '....XX.XX...', '...XXX.XXX..']
  ];
  function guy(frame, color) {
    const s = 3.5, x0 = PCX - 21, y0 = 157;
    ctx.fillStyle = color;
    GUY[frame].forEach((row, j) => { for (let i = 0; i < 12; i++) if (row[i] === 'X') ctx.fillRect(x0 + i * s, y0 + j * s, s - .55, s - .55); });
  }

  function label(txt, x, y, color, size, align) {
    ctx.font = '700 ' + (size || 7) + 'px "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }

  function render() {
    const P = PALETTES[palIdx];
    const CW = PF.CW, CH = PF.CH;
    const sx = cv.width / PF.LW, sy = cv.height / PF.LH;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, PF.LW, PF.LH);
    if (state === OFF) return;

    const boot = state === BOOT;
    const blink = ((clock / 260) | 0) % 2 === 0;
    const slow = ((clock / 500) | 0) % 2 === 0;
    const f = frameField();

    // field frame
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4;
    ctx.strokeRect(5.7, 5.7, W * CW + 5.6, H * CH + 5.6);

    // cells: ghost grid, then shadow, then ink
    const isOn = i => boot || f[i] === 1 || (f[i] === 2 && blink);
    for (let i = 0; i < N; i++) if (!isOn(i)) cell(FX0 + (i % W) * CW, FY0 + ((i / W) | 0) * CH, CW, CH, P.ghost);
    ctx.save(); ctx.translate(1.1, 1.1);
    for (let i = 0; i < N; i++) if (isOn(i)) cell(FX0 + (i % W) * CW, FY0 + ((i / W) | 0) * CH, CW, CH, 'rgba(0,0,0,.14)');
    ctx.restore();
    for (let i = 0; i < N; i++) if (isOn(i)) cell(FX0 + (i % W) * CW, FY0 + ((i / W) | 0) * CH, CW, CH, P.ink);

    /* ---- side panel (drawn in classic coordinates, scaled into place) ---- */
    ctx.save(); ctx.translate(PF.px, PF.py); ctx.scale(PF.ps, PF.ps); ctx.translate(-150, 0);
    const hiVal = hiAll[GAMES[state === MENU || !def ? sel.game : GAMES.indexOf(def)].id] || 0;
    const showScore = state === MENU ? '    ' + pad(sel.game + 1, 2, true) : pad(g.score, 6, false);
    label('HI-SCORE', 154, 14, P.soft, 6.5, 'left');
    number(boot ? '888888' : (state === OVER && newHi && !slow ? '      ' : pad(hiVal, 6, false)), 176, 18, 9, 14, 2.2, 2.6, P.ink, P.ghost);
    number(boot ? '888888' : (state === OVER && !slow && g.score > 0 ? '      ' : showScore), 157.5, 40, 12.5, 24, 3.2, 2.3, P.ink, P.ghost);
    label(state === MENU ? 'GAME' : 'SCORE', PCX, 74, P.soft, 7);

    // "next" box
    const bx = PCX - 18.4, by = 80, mw = 9.2, mh = 8.6;
    ctx.strokeStyle = P.soft; ctx.lineWidth = 1; ctx.strokeRect(bx - 2.5, by - 2.5, mw * 4 + 5, mh * 4 + 5);
    for (let i = 0; i < 16; i++) {
      const on = boot || g.n[i] === 1;
      cell(bx + (i % 4) * mw, by + ((i / 4) | 0) * mh, mw, mh, on ? P.ink : P.ghost);
    }

    // speed / level
    const spd = state === MENU ? sel.speed : g.speed, lvl = state === MENU ? sel.level : g.level;
    number(boot ? '88' : pad(spd, 2, false), PCX - 8 - 20.4, 124, 9, 15, 2.2, 2.4, P.ink, P.ghost);
    number(boot ? '88' : pad(lvl, 2, false), PCX + 8, 124, 9, 15, 2.2, 2.4, P.ink, P.ghost);
    ctx.fillStyle = P.soft; ctx.fillRect(PCX - 3, 130.5, 6, 2);
    label('SPEED/LEVEL', PCX, 151, P.soft, 6.5);

    // mascot
    guy(0, P.ghost);
    if (boot) guy(0, P.ink);
    else if (state === PLAY || state === MENU) {
      const rate = state === MENU ? 420 : 520 - (g.speed - 1) * 38;
      guy(((clock / rate) | 0) % 2, P.ink);
    } else if (state === PAUSE || state === OVER) guy(1, P.ink);

    // status icons
    const pauseOn = boot || (state === PAUSE && blink);
    ctx.fillStyle = pauseOn ? P.ink : P.ghost;
    ctx.fillRect(154, 207, 3, 9); ctx.fillRect(159.5, 207, 3, 9);
    label('PAUSE', 166, 215, pauseOn ? P.ink : P.ghost, 7.5, 'left');
    label('GAME OVER', PCX, 240, (boot || (state === OVER && slow)) ? P.ink : P.ghost, 9);
    drawSpeaker(231, 211, boot || Sound.enabled ? P.ink : P.ghost);
    ctx.restore();
  }
  function drawSpeaker(x, y, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 2); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x + 1, y - 5.5); ctx.lineTo(x + 1, y + 5.5); ctx.lineTo(x - 3, y + 2); ctx.lineTo(x - 6, y + 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 1, y, 4, -.9, .9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 1, y, 7, -.9, .9); ctx.stroke();
  }

  /* what the playfield shows in each state */
  const view = new Uint8Array(N);
  function frameField() {
    if (state === MENU) {
      view.fill(0);
      const was = g.f; g.f = view;
      GAMES[sel.game].attract(g, stateT);
      g.f = was;
      return view;
    }
    if (state === PLAY || state === PAUSE) {
      if (game) { g.clear(); game.draw(); }
      return g.f;
    }
    if (state === OVER) {
      // classic fill-up then wipe-down, then a blank field
      const t = stateT, step = 38;
      view.set(g.f);
      if (t < H * step) {
        const k = Math.floor(t / step) + 1;
        for (let y = H - k; y < H; y++) for (let x = 0; x < W; x++) view[y * W + x] = 1;
        return view;
      }
      const k = Math.floor((t - H * step) / step) + 1;
      if (k < H + 1) {
        view.fill(0);
        for (let y = Math.min(k, H); y < H; y++) for (let x = 0; x < W; x++) view[y * W + x] = 1;
        return view;
      }
      view.fill(0); return view;
    }
    return g.f;
  }

  /* ============================== main loop ============================== */
  let last = performance.now();
  function advance(dt) {
    clock += dt; stateT += dt;
    if (state === BOOT) { if (stateT > 1100) toMenu(); }
    else if (state === MENU) repeats();
    else if (state === PLAY) {
      if (startDelay > 0) startDelay -= dt;
      else { repeats(); if (game) game.update(dt); }
    }
  }
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    advance(dt);
    render();
    requestAnimationFrame(frame);
  }
  function repeats() {
    const menu = state === MENU;
    for (const b in held) {
      if (!held[b]) continue;
      const cfg = menu ? MENU_REP : (game && game.repeat && game.repeat[b]);
      if (!cfg) continue;
      if (clock >= nextRep[b]) { nextRep[b] = clock + cfg[1]; dispatch(b, true); }
    }
  }

  /* ============================ DOM chrome ============================ */
  const labelEl = $('#label');
  let nameTimer = null;
  const defaultLabel = () => ({ a: 'CLASSIC', c: 'SUPER' }[look.layout] || '');
  function showName() {
    labelEl.textContent = GAMES[sel.game].name.toUpperCase();
    labelEl.classList.add('named');
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => { labelEl.textContent = defaultLabel(); labelEl.classList.remove('named'); }, 2200);
  }
  labelEl.addEventListener('click', () => { setTint((palIdx + 1) % PALETTES.length); Sound.unlock(); Sound.fx('tick'); });
  function setTint(i) { palIdx = i; store.set('pal', palIdx); applyPalette(); renderSheet(); }
  function applyPalette() {
    document.documentElement.style.setProperty('--lcd-bg', PALETTES[palIdx].bg);
  }
  applyPalette();

  // help sheet
  const help = $('#help');
  const helpOpen = () => !help.hidden;
  function toggleHelp(v) { help.hidden = !(v === undefined ? help.hidden : v); }
  $('#help-open').addEventListener('click', () => { toggleHelp(true); if (window.__brickRenderFs) window.__brickRenderFs(); });
  $('#help-close').addEventListener('click', () => toggleHelp(false));
  help.addEventListener('click', e => { if (e.target === help) toggleHelp(false); });
  $('#help-games').innerHTML = GAMES.map((d, i) => '<li><b>' + String(i + 1).padStart(2, '0') + '</b> ' + d.name + '</li>').join('');
  $('#help-games-n').textContent = GAMES.length;

  // fit the whole handheld to the viewport
  const device = $('#device');
  const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
  const probe = $('#stage');
  function fit() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    // keep clear of the notch / status bar / home indicator when the page draws edge to edge
    const cs = getComputedStyle(probe);
    const inT = parseFloat(cs.paddingTop) || 0, inB = parseFloat(cs.paddingBottom) || 0, inL = parseFloat(cs.paddingLeft) || 0, inR = parseFloat(cs.paddingRight) || 0;
    const aw = vw - inL - inR, ah = vh - inT - inB;
    const land = vw > vh * 1.2 && (coarse.matches || /[?&]land\b/.test(location.search));
    device.classList.toggle('land', land);
    const DW = land ? 800 : 360, DH = land ? 380 : ({ a: 760, b: 760, c: 600, d: 690 }[look.layout] || 760);
    const s = Math.min(aw / DW, ah / DH, 1.6);
    device.style.left = (inL + aw / 2) + 'px';
    device.style.top = (inT + ah / 2) + 'px';
    device.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  /* ------------------------------ full screen ------------------------------ */
  // Android / desktop browsers allow it from a tap. iPhone Safari does not (only the installed home-screen app is bar-free).
  const fsRoot = document.documentElement;
  const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let wantFs = !!store.get('fs', false);
  function enterFs() {
    if (!fsEnabled || isFs()) return;
    const req = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
    try { const p = req.call(fsRoot, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => { }); } catch (_) { /* needs a user gesture */ }
  }
  function exitFs() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (isFs() && ex) { try { const p = ex.call(document); if (p && p.catch) p.catch(() => { }); } catch (_) { /* ignore */ } }
  }
  function renderFs() {
    const row = $('#fs-row');
    row.hidden = !fsEnabled;
    $('#fs-note').hidden = fsEnabled;
    row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.fs === '1') === isFs())));
  }
  $('#fs-pick').addEventListener('click', e => {
    const b = e.target.closest('button[data-fs]'); if (!b) return;
    wantFs = b.dataset.fs === '1'; store.set('fs', wantFs);
    if (wantFs) enterFs(); else exitFs();
    setTimeout(renderFs, 150);
  });
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { renderFs(); fit(); }));
  window.__brickFsOnPower = () => { if (wantFs) enterFs(); };
  window.__brickRenderFs = renderFs;

  /* ------------------ console look: layout + colour ------------------ */
  const COLOURS = [
    { id: 'black',  name: 'Black',  body: '#17171a', key: '#f5d31c', ink: '#f1f1f1', decal: '#d9dce0', alt: '#f5d31c' },
    { id: 'yellow', name: 'Yellow', body: '#f4c60f', key: '#fbfbf8', ink: '#1b1a14', decal: '#fff6dc', alt: '#b3430d' },
    { id: 'red',    name: 'Red',    body: '#d63a30', key: '#fbfbf8', ink: '#ffffff', decal: '#ffd9d4', alt: '#ffe08a' },
    { id: 'blue',   name: 'Blue',   body: '#2f6fd8', key: '#fbfbf8', ink: '#ffffff', decal: '#d3e3ff', alt: '#ffe08a' },
    { id: 'green',  name: 'Green',  body: '#2f9d5c', key: '#fbfbf8', ink: '#ffffff', decal: '#d6f3e0', alt: '#ffe08a' },
    { id: 'pink',   name: 'Pink',   body: '#f08cb8', key: '#fbfbf8', ink: '#3b1427', decal: '#fff0f6', alt: '#a3174f' },
    { id: 'purple', name: 'Purple', body: '#6b50c9', key: '#f5d31c', ink: '#ffffff', decal: '#e1d9ff', alt: '#f5d31c' },
    { id: 'white',  name: 'White',  body: '#e9e9e4', key: '#d63a30', ink: '#222222', decal: '#a9aeb4', alt: '#d63a30' },
    { id: 'gray',   name: 'Smoke',  body: '#4b4e55', key: '#f5d31c', ink: '#f1f1f1', decal: '#c9ccd1', alt: '#f5d31c' },
    { id: 'cream',  name: 'Cream',  body: '#efe7d2', key: '#f6c80f', ink: '#1f2c63', decal: '#3d63c9', alt: '#c2410c' },
    { id: 'royal',  name: 'Royal',  body: '#2f5fb8', key: '#f7d51d', ink: '#ffffff', decal: '#e8f0ff', alt: '#f7d51d' }
  ];
  const DEFAULT_COLOUR = { a: 'black', b: 'yellow', c: 'royal', d: 'black' };            // what each shell wears until you pick
  const hex = c => { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); };
  const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = c => { const [r, g, b] = hex(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };

  let look = store.get('look', null) || {};
  look = { layout: 'abcd'.includes(look.layout) && look.layout ? look.layout : 'a', colour: look.colour || null, custom: look.custom || null, menu: look.menu === 'orig' || look.menu === 'quick' ? look.menu : null };
  const menuMode = () => look.menu || ((look.layout === 'c' || look.layout === 'd') ? 'orig' : 'quick');

  function currentColour() {
    if (look.colour === 'custom' && look.custom) {          // any body colour: pick readable keys and print colour
      const l = lum(look.custom);
      return { body: look.custom, key: l < .2 ? '#f5d31c' : '#fbfbf8', ink: l > .5 ? '#1b1a14' : '#f4f4f0', decal: l < .2 ? '#d9dce0' : mix(look.custom, l > .5 ? '#000' : '#fff', .7), alt: l < .2 ? '#f5d31c' : (l > .5 ? '#9a3412' : '#ffe08a') };
    }
    return COLOURS.find(c => c.id === (look.colour || DEFAULT_COLOUR[look.layout])) || COLOURS[0];
  }
  function applyLook() {
    const c = currentColour(), root = document.documentElement.style, light = lum(c.body) > .2;
    const vars = {
      '--body': c.body, '--body-hi': mix(c.body, '#ffffff', light ? .22 : .13), '--body-lo': mix(c.body, '#000000', .55),
      '--key': c.key, '--key-rim': mix(c.key, '#000000', .16), '--key-side': mix(c.key, '#000000', .48),
      '--ink': c.ink, '--decal': c.decal
    };
    vars['--alt'] = c.alt || c.key;
    for (const k in vars) root.setProperty(k, vars[k]);
    device.dataset.layout = look.layout;
    document.documentElement.dataset.layout = look.layout;
    PF = (look.layout === 'c' || look.layout === 'd') ? PROFILES.tall : PROFILES.classic;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', (look.layout === 'c' || look.layout === 'd') ? c.body : '#0d0d0f');
    if (!labelEl.classList.contains('named')) labelEl.textContent = defaultLabel();
    store.set('look', look);
    renderSheet();
    fit();
  }

  /* picker UI inside the sheet */
  const swatchBox = $('#colour-pick'), tintBox = $('#tint-pick'), layoutBox = $('#layout-pick'), menuBox = $('#menu-pick');
  swatchBox.innerHTML = COLOURS.map(c => '<button type="button" data-colour="' + c.id + '" aria-label="' + c.name + '" title="' + c.name + '" style="background:' + c.body + '"></button>').join('') +
    '<label title="Pick any colour" aria-label="Custom colour"><input type="color" id="colour-custom" value="#2f6fd8"></label>';
  tintBox.innerHTML = PALETTES.map((p, i) => '<button type="button" data-tint="' + i + '">' + p.name[0] + p.name.slice(1).toLowerCase() + '</button>').join('');
  swatchBox.addEventListener('click', e => {
    const b = e.target.closest('button[data-colour]'); if (!b) return;
    look.colour = b.dataset.colour; applyLook();
  });
  $('#colour-custom').addEventListener('input', e => { look.colour = 'custom'; look.custom = e.target.value; applyLook(); });
  tintBox.addEventListener('click', e => { const b = e.target.closest('button[data-tint]'); if (b) setTint(+b.dataset.tint); });
  menuBox.addEventListener('click', e => { const b = e.target.closest('button[data-menu]'); if (b) { look.menu = b.dataset.menu; applyLook(); } });
  layoutBox.addEventListener('click', e => {
    const b = e.target.closest('button[data-layout]'); if (!b) return;
    look.layout = b.dataset.layout; applyLook();
  });
  function renderSheet() {
    const cur = look.colour || DEFAULT_COLOUR[look.layout];
    swatchBox.querySelectorAll('button[data-colour]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.colour === cur)));
    swatchBox.querySelector('label').classList.toggle('on', cur === 'custom');
    tintBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.tint === palIdx)));
    layoutBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layout === look.layout)));
    menuBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.menu === menuMode())));
  }
  applyLook();
  /* tetromino-outline decals for the Super layout (generic block shapes, drawn here so there is nothing to download) */
  (function buildDecals() {
    const PIECES = {
      I: [[0, 0], [1, 0], [2, 0], [3, 0]], O: [[0, 0], [1, 0], [0, 1], [1, 1]], T: [[0, 0], [1, 0], [2, 0], [1, 1]],
      S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]]
    };
    const cols = { dl: 'LSTOJIZ', dr: 'OZJTISL' }, u = 8.6, NS = 'http://www.w3.org/2000/svg';
    Object.keys(cols).forEach(cls => {
      const svg = document.querySelector('.decals.' + cls);
      svg.setAttribute('viewBox', '0 0 36 312');
      cols[cls].split('').forEach((k, i) => {
        const cells = PIECES[k], w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
        const ox = (36 - w * u) / 2, oy = 8 + i * 44 + (36 - h * u) / 2 - 4;
        cells.forEach(([cx, cy]) => {
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', ox + cx * u + .9); r.setAttribute('y', oy + cy * u + .9); r.setAttribute('width', u - 1.8); r.setAttribute('height', u - 1.8);
          r.setAttribute('rx', 1.2); r.setAttribute('fill', 'none'); r.setAttribute('stroke', 'currentColor'); r.setAttribute('stroke-width', 1.7);
          svg.appendChild(r);
        });
      });
    });
  })();
  fit();
  requestAnimationFrame(frame);

  // keep iOS from zooming/scrolling the game
  ['gesturestart', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('touchmove', e => { if (!help.contains(e.target)) e.preventDefault(); }, { passive: false });

  // offline support
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  // handy for testing / tinkering from the console
  window.BrickConsole = { g, press, unpress, advance, render, GAMES, get state() { return state; }, get game() { return game; }, sel, hi: hiAll };
})();
