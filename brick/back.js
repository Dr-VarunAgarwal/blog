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

  const bay = $('#bk-bay');
  function closeDoor() { door.classList.remove('open'); bay.classList.remove('peek'); }
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
  $('#bk-open').addEventListener('click', () => { door.classList.add('open'); bay.classList.add('peek'); api.Sound.fx('thunk'); api.Haptic.fx('land'); });
  $('#bk-close').addEventListener('click', () => { closeDoor(); api.Sound.fx('thunk'); api.Haptic.fx('land'); });

  /* easter egg: the little note in the bay says something different each time you tap it */
  const NOTES = [['9999 in 1*', '*12, honestly'], ['Inspected by', 'No. 7'], ['Do not eat', 'the batteries'], ['Mind the spring', 'it bites'], ['Level 11?', 'there is no level 11'], ['Have you tried', 'turning it off and on?'], ['Made with love', 'and 2 x AA']];
  let noteI = 0;
  $('#bk-note').addEventListener('click', () => {
    noteI = (noteI + 1) % NOTES.length;
    const n = $('#bk-note'); n.innerHTML = NOTES[noteI][0] + '<small>' + NOTES[noteI][1] + '</small>';
    api.Sound.unlock(); api.Sound.fx('tick'); api.Haptic.key('key');
  });

  /* the cells: out = the console is dead */
  function refresh() {
    const n = bats.filter(b => !b.classList.contains('out')).length;
    api.setBatteries(n === 2);
    hint.textContent = n === 2 ? 'Tap a battery to take it out.' : n === 0 ? 'No batteries: the console is dead. Tap them to put them back.' : 'One cell is not enough. Tap the other one.';
  }
  bats.forEach(b => b.addEventListener('click', () => {
    api.Sound.unlock();
    const out = b.classList.toggle('out');
    const slot = document.querySelectorAll('.bk-slot')[+b.dataset.i]; if (slot) slot.classList.toggle('empty', out);
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
