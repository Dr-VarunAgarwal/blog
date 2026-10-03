/*
 * brick/welcome.js — first-run welcome, in three little acts:
 *   1. put the batteries in (tap each AA; the cover clicks shut)
 *   2. choose your console (ready-made skins only; everything else lives in Settings)
 *   3. a short guided tour on the real console: ON/OFF, title screen (game / speed / level), START, PAUSE
 * Shown once; "Replay the welcome tour" in Settings > Help (or ?welcome in the URL) runs it again.
 */
(function () {
  'use strict';
  const C = window.BrickConsole, api = C && C.api;
  if (!api) return;
  const { STATE } = api;
  const store = api.store;

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  let overlay = null, coach = null, hl = [], active = false;

  /* ---------------------------------- act 1: batteries ---------------------------------- */
  function batteries(next) {
    const s = el('div', 'wl-step');
    s.innerHTML =
      '<div class="wl-kicker">Pocket Brick Game</div>' +
      '<h1>Let&rsquo;s power it up</h1>' +
      '<p class="wl-sub" id="wl-msg">Every handheld starts the same way. Tap each battery to put it in.</p>' +
      '<div class="wl-stage">' +
      '  <div class="wl-back"><div class="wl-bay"><div class="wl-slot"><i>+</i><i>&minus;</i></div><div class="wl-slot"><i>+</i><i>&minus;</i></div></div>' +
      '    <div class="wl-cover"><em></em><em></em><em></em></div></div>' +
      '  <button type="button" class="wl-bat" data-i="0" aria-label="AA battery 1"><i class="nub"></i><i class="band"></i><b>AA</b></button>' +
      '  <button type="button" class="wl-bat" data-i="1" aria-label="AA battery 2"><i class="nub"></i><i class="band"></i><b>AA</b></button>' +
      '</div>' +
      '<button type="button" class="wl-next" disabled>Continue</button>';
    const msg = s.querySelector('#wl-msg'), btn = s.querySelector('.wl-next');
    let n = 0;
    s.querySelectorAll('.wl-bat').forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('in')) return;
      api.Sound.unlock();
      b.dataset.slot = n++; b.classList.add('in');
      api.Sound.fx('click'); api.Haptic.key('fn');
      if (n === 2) {
        msg.textContent = 'Both in. Now the cover…';
        setTimeout(() => {
          s.classList.add('closed'); api.Sound.fx('thunk'); api.Haptic.fx('land');
          msg.textContent = 'Click. It’s alive.';
          btn.disabled = false; btn.focus();
        }, 700);
      } else msg.textContent = 'One more.';
    }));
    btn.addEventListener('click', next);
    return s;
  }

  /* ------------------------------- act 2: choose your console ------------------------------- */
  function chooser(next) {
    const s = el('div', 'wl-step');
    s.innerHTML =
      '<div class="wl-kicker">Step 2 of 3</div><h1>Choose your console</h1>' +
      '<p class="wl-sub">Tap the one you like. You can change anything later in Settings (the gear).</p>' +
      '<div class="wl-skins" role="listbox" aria-label="Consoles"></div>' +
      '<button type="button" class="wl-next">Continue</button>';
    const track = s.querySelector('.wl-skins');
    const mark = i => track.querySelectorAll('.wl-skin').forEach((c, k) => c.setAttribute('aria-pressed', String(k === i)));
    api.SKINS.forEach((sk, i) => {
      const c = el('button', 'wl-skin'); c.type = 'button'; c.setAttribute('role', 'option'); c.setAttribute('aria-label', sk.name + ' ' + sk.sub);
      c.appendChild(api.skinPreview(i, .32));
      c.insertAdjacentHTML('beforeend', '<b>' + sk.name + '</b><small>' + sk.sub + '</small>');
      c.addEventListener('click', () => { api.applySkin(i); mark(i); api.Sound.fx('tick'); api.Haptic.key('key'); });
      track.appendChild(c);
    });
    s.querySelector('.wl-next').addEventListener('click', next);
    s._show = () => {
      const i = api.currentSkinIndex(); mark(i);
      const c = track.children[i]; track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2 });
    };
    return s;
  }

  /* --------------------------------- act 3: the guided tour --------------------------------- */
  const q = sel => document.querySelector(sel);
  function highlight(sel) {
    hl.forEach(x => x.classList.remove('coach-hl')); hl = [];
    document.querySelectorAll(sel).forEach(x => { x.classList.add('coach-hl'); hl.push(x); });
  }
  function menuHelp() {
    return api.menuMode() === 'orig'
      ? 'LEFT = <b>level</b> &nbsp; RIGHT = <b>speed</b> &nbsp; DOWN = next <b>game</b> &nbsp; UP = previous game'
      : 'LEFT / RIGHT = <b>game</b> &nbsp; UP / DOWN = <b>speed</b> &nbsp; ROTATE = <b>level</b>';
  }
  const TOUR = [
    { target: '#device .fn[data-btn="power"] i', text: () => 'Press <b>ON/OFF</b> to switch it on.', done: () => api.state !== STATE.OFF },
    { target: '#device #dpad .key', text: () => 'This is the title screen. Choose a game, speed and level with the D-pad.<div class="coach-keys">' + menuHelp() + '</div>', button: 'Got it' },
    { target: '#device .fn[data-btn="sp"] i', text: () => 'Press <b>S/P</b> (start / pause) to begin the game.', done: () => api.state === STATE.PLAY },
    { target: '#device .fn[data-btn="sp"] i', text: () => 'Press <b>S/P</b> again to pause. Once more to carry on.', done: () => api.state === STATE.PAUSE },
    { target: '#device .fn[data-btn="reset"] i', text: () => '<b>RESET</b> takes you back to the title screen, <b>SOUND</b> mutes it. That&rsquo;s everything. Have fun!', button: 'Start playing' }
  ];
  let step = -1;

  function placeCoach() {
    const t = hl[0]; if (!t || !coach) return;
    const r = t.getBoundingClientRect();
    coach.classList.toggle('top', r.top > innerHeight * .5);
  }
  function showStep(i) {
    step = i;
    if (i >= TOUR.length) return finish();
    const s = TOUR[i];
    highlight(s.target);
    coach.querySelector('.coach-text').innerHTML = s.text();
    const b = coach.querySelector('.coach-next');
    b.hidden = !s.button; b.textContent = s.button || '';
    coach.querySelector('.coach-dots').innerHTML = TOUR.map((_, k) => '<i' + (k === i ? ' class="on"' : '') + '></i>').join('');
    placeCoach();
    if (s.done && s.done()) setTimeout(() => step === i && showStep(i + 1), 300);
  }
  function onState(st) {
    if (!active || step < 0 || step >= TOUR.length) return;
    if (st === STATE.OVER && step < TOUR.length - 1) return showStep(TOUR.length - 1);     // game ended on its own: wrap up
    const s = TOUR[step];
    if (s.done && s.done()) setTimeout(() => step === TOUR.indexOf(s) && showStep(step + 1), 450);
  }
  function startTour() {
    coach = el('div', 'coach', '<div class="coach-text"></div><div class="coach-row"><div class="coach-dots"></div><button type="button" class="coach-skip">Skip tour</button><button type="button" class="coach-next" hidden></button></div>');
    document.body.appendChild(coach);
    coach.querySelector('.coach-skip').addEventListener('click', finish);
    coach.querySelector('.coach-next').addEventListener('click', () => showStep(step + 1));
    window.addEventListener('resize', placeCoach);
    showStep(0);
  }

  /* ------------------------------------- flow control ------------------------------------- */
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function finish() {
    active = false; step = -1;
    hl.forEach(x => x.classList.remove('coach-hl')); hl = [];
    if (coach) { coach.remove(); coach = null; }
    close(); store.set('welcomed', true);
  }
  // The batteries + console-chooser intro is parked for now: first thing a visitor sees is just the flashing ON/OFF key.
  // Add ?welcome=full to the URL to see the long version.
  const FULL_INTRO = /[?&]welcome=full/.test(location.search);

  function start(replay) {
    if (active) return;
    active = true;
    api.setBatteries(true);
    if (api.state !== STATE.OFF) { C.press('power'); C.unpress('power'); }                  // replay starts from "off"
    if (!FULL_INTRO) { startTour(); return; }
    overlay = el('div', 'wl'); overlay.id = 'welcome'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Welcome');
    const skip = el('button', 'wl-skip', 'Skip'); skip.type = 'button'; skip.addEventListener('click', finish);
    overlay.appendChild(skip);
    const go = node => { overlay.querySelectorAll('.wl-step').forEach(n => n.remove()); overlay.appendChild(node); if (node._show) node._show(); };
    const act2 = chooser(() => { close(); startTour(); });
    go(batteries(() => go(act2)));
    document.body.appendChild(overlay);
  }

  api.on('state', onState);
  api.on('menu', () => { /* menu changes are free play; the "Got it" button moves on */ });
  window.BrickWelcome = { start };

  if (!store.get('welcomed') || /[?&]welcome\b/.test(location.search)) start();
})();
