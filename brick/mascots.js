/*
 * brick/mascots.js — the little cartoon figure in the LCD side panel.
 *
 * Each mascot has four poses, like the real units: two "running" frames (shown alternately, faster at higher
 * speeds), an idle pose (paused) and a knocked-out pose (game over = the idle pose upside down, eyes shut).
 * Sprites are drawn as 14x14 pixel grids ('X' = lit). Heads are shared-body cartoon faces so adding a new
 * character is just one 10x7 head: 'e' = eye (a hole when awake, filled when asleep), 'm' = mouth (a hole).
 */
(function () {
  'use strict';

  const BODY = {
    a: ['.X..XXXXXX..X.', '..X.XXXXXX.X..', '...XXXXXXXX...', '....XXXXXX....', '....XXXXXX....', '...XX....XX...', '..XX......XX..'],
    b: ['....XXXXXX....', '...XXXXXXXX...', '..X.XXXXXX.X..', '..X.XXXXXX.X..', '....XXXXXX....', '.....XX.XX....', '.....XX.XX....'],
    idle: ['....XXXXXX....', '...XXXXXXXX...', '...XXXXXXXX...', '....XXXXXX....', '....XXXXXX....', '....XX..XX....', '....XX..XX....']
  };

  // head: 10 wide x 7 tall. deco: [bodyRow, col, 'X' | '.'] touches (tails, chest panels) applied to every pose.
  const HEADS = {
    cat:   { head: ['XX......XX', 'XXX....XXX', 'XXXXXXXXXX', 'XXeXXXXeXX', 'XXXXmmXXXX', '.XXXXXXXX.', '..XXXXXX..'], deco: [[2, 13, 'X'], [3, 13, 'X'], [4, 13, 'X'], [4, 12, 'X']] },
    robot: { head: ['....XX....', '....XX....', '.XXXXXXXX.', '.XeXXXXeX.', '.XXXXXXXX.', '.XXmmmmXX.', '.XXXXXXXX.'], deco: [[3, 6, '.'], [3, 7, '.'], [4, 6, '.'], [4, 7, '.']] },
    alien: { head: ['.X......X.', '..X....X..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXeeXXeeXX', 'XXXXXXXXXX', '.XXXmmXXX.'], deco: [[3, 6, '.'], [4, 7, '.']] },
    dog:   { head: ['.XXXXXXXX.', 'XXXXXXXXXX', 'XXeXXXXeXX', 'XX.XXXX.XX', 'XX.XmmX.XX', '.XXXXXXXX.', '..XXXXXX..'], deco: [[3, 13, 'X'], [4, 12, 'X'], [4, 13, 'X']] },
    kid:   { head: ['.X.XXXX.X.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'X..XXXX..X', 'XeeXXXXeeX', 'X.XXmmXX.X', '.XXXXXXXX.'], deco: [[3, 6, '.'], [3, 7, '.'], [4, 6, '.'], [4, 7, '.']] },
    bunny: { head: ['.XX....XX.', '.XX....XX.', '.XXXXXXXX.', 'XXeXXXXeXX', 'XXXXmmXXXX', '.XXXXXXXX.', '..XXXXXX..'], deco: [[5, 12, 'X'], [5, 13, 'X'], [6, 12, 'X'], [6, 13, 'X']] }
  };

  // the original brick buddy / jumping-jack (12x12), kept as one of the cast
  const JUMPER = {
    a: ['....XXXX....', '...XXXXXX...', '...XXXXXX...', '....XXXX....', '..XXXXXXXX..', '.X.XXXXXX.X.', 'X..XXXXXX..X', '...XXXXXX...', '...XX..XX...', '..XX....XX..', '.XX......XX.', 'XX........XX'],
    b: ['....XXXX....', '...XXXXXX...', '...XXXXXX...', '....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '..X.XXXX.X..', '..X.XXXX.X..', '....XXXX....', '....XX.XX...', '....XX.XX...', '...XXX.XXX..']
  };

  // butterfly: its own sprite (wings open / wings up / folded), not the head-and-body template
  const BUTTERFLY = {
    a: ['....X....X....', '.....X..X.....', '......XX......', 'XXX..XXXX..XXX', 'XXXXXXXXXXXXXX', 'XX.XXXXXXXX.XX', 'XXXXXXXXXXXXXX', '.XXXX.XX.XXXX.', '..XXXXXXXXXX..', '..XXX.XX.XXX..', '...XX.XX.XX...', '....X.XX.X....'],
    b: ['....X....X....', '.....X..X.....', '......XX......', '..XX..XX..XX..', '.XXXX.XX.XXXX.', '.XXXX.XX.XXXX.', '..XXXXXXXXXX..', '...XX.XX.XX...', '...XXXXXXXX...', '....XXXXXX....', '.....X..X.....', '......XX......'],
    idle: ['....X....X....', '.....X..X.....', '......XX......', '.....XXXX.....', '....XXXXXX....', '....XXXXXX....', '....XXXXXX....', '.....XXXX.....', '.....XXXX.....', '......XX......', '......XX......', '......XX......']
  };

  const flipV = rows => rows.slice().reverse();

  function compose(def, bodyKey, asleep) {
    const h = def.head.map(r => '..' + r.replace(/e/g, asleep ? 'X' : '.').replace(/m/g, '.') + '..');
    const body = BODY[bodyKey].map(r => r.split(''));
    (def.deco || []).forEach(([r, c, v]) => { body[r][c] = v; });
    return h.concat(body.map(r => r.join('')));
  }
  function fromHead(id, name) {
    const d = HEADS[id];
    return { id, name, a: compose(d, 'a', false), b: compose(d, 'b', false), idle: compose(d, 'idle', false), over: flipV(compose(d, 'idle', true)) };
  }

  window.BRICK_MASCOTS = [
    { id: 'jumper', name: 'Jumper', a: JUMPER.a, b: JUMPER.b, idle: JUMPER.b, over: flipV(JUMPER.b) },
    fromHead('cat', 'Cat'),
    fromHead('robot', 'Robot'),
    fromHead('alien', 'Alien'),
    fromHead('dog', 'Pup'),
    fromHead('bunny', 'Bunny'),
    fromHead('kid', 'Kid'),
    { id: 'butterfly', name: 'Butterfly', a: BUTTERFLY.a, b: BUTTERFLY.b, idle: BUTTERFLY.idle, over: flipV(BUTTERFLY.idle) }
  ];
})();
