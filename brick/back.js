/*
 * brick/back.js — flip the console over.
 * The corner key turns the whole handheld around to its back: a battery door printed with an About panel and a
 * link to the author's blog (so nobody is sent anywhere by accident), and behind the door two AA cells you can
 * take out and put back. With a cell missing the console is dead until they are back in.
 */
(function () {
  'use strict';
  const C = window.BrickConsole, api = C && C.api;
  if (!api) return;
  const $ = s => document.querySelector(s);
  const front = $('#device'), back = $('#back'), door = $('#bk-door'), hint = $('#bk-hint');
  if (!front || !back) return;
  const bats = Array.prototype.slice.call(document.querySelectorAll('.bk-bat'));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HALF = 260;                                   // ms per half-turn
  let side = 'front', busy = false;

  function show(el, on) {
    el.style.visibility = on ? 'visible' : 'hidden';
    el.setAttribute('aria-hidden', String(!on));
    el.querySelectorAll('button, a').forEach(b => { b.tabIndex = on ? 0 : -1; });
  }
  show(back, false);

  function closeDoor() { door.classList.remove('open'); }
  function flip(to) {
    if (busy || side === to) return;
    busy = true;
    api.pauseIfPlaying();
    closeDoor();
    const from = to === 'back' ? front : back, dest = to === 'back' ? back : front;
    const done = () => { side = to; busy = false; (to === 'back' ? $('#bk-open') : $('#flip-open')).focus({ preventScroll: true }); };
    if (reduce) { show(from, false); show(dest, true); dest.style.setProperty('--ry', '0deg'); return done(); }
    from.style.transition = 'transform ' + HALF + 'ms ease-in';
    from.style.setProperty('--ry', '90deg');
    setTimeout(() => {
      show(from, false); from.style.transition = 'none'; from.style.setProperty('--ry', '0deg');
      show(dest, true); dest.style.transition = 'none'; dest.style.setProperty('--ry', '-90deg');
      void dest.offsetWidth;                                                         // commit the start angle
      dest.style.transition = 'transform ' + HALF + 'ms ease-out'; dest.style.setProperty('--ry', '0deg');
      setTimeout(() => { dest.style.transition = ''; done(); }, HALF + 20);
    }, HALF + 10);
    api.Sound.unlock(); api.Sound.fx('click'); api.Haptic.key('fn');
  }

  $('#flip-open').addEventListener('click', () => flip('back'));
  $('#flip-back').addEventListener('click', () => flip('front'));

  /* the battery door */
  $('#bk-open').addEventListener('click', () => { door.classList.add('open'); api.Sound.fx('thunk'); api.Haptic.fx('land'); });
  $('#bk-close').addEventListener('click', () => { closeDoor(); api.Sound.fx('thunk'); api.Haptic.fx('land'); });

  /* the cells: out = the console is dead */
  function refresh() {
    const n = bats.filter(b => !b.classList.contains('out')).length;
    api.setBatteries(n === 2);
    hint.textContent = n === 2 ? 'Tap a battery to take it out.' : n === 0 ? 'No batteries: the console is dead. Tap them to put them back.' : 'One cell is not enough. Tap the other one.';
  }
  bats.forEach(b => b.addEventListener('click', () => {
    api.Sound.unlock();
    const out = b.classList.toggle('out');
    b.setAttribute('aria-label', 'AA battery ' + (+b.dataset.i + 1) + ', tap to ' + (out ? 'put back' : 'remove'));
    api.Sound.fx(out ? 'thunk' : 'click'); api.Haptic.key('fn');
    refresh();
  }));

  /* while the back is showing, keys must not drive the (hidden) console; Esc turns it back */
  window.addEventListener('keydown', e => {
    if (side !== 'back' && !(busy && to_back_pending())) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); flip('front'); return; }
    e.stopImmediatePropagation();
  }, true);
  function to_back_pending() { return back.style.visibility === 'visible'; }

  window.BrickBack = { flip, get side() { return side; } };
})();
