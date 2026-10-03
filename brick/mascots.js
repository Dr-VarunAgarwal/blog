/*
 * brick/mascots.js — the little cartoon figure in the LCD side panel.
 *
 * Each mascot has four poses, like the real units: two "running" frames (shown alternately, faster at higher
 * speeds), an idle pose (paused) and a knocked-out pose (game over = the idle pose upside down, eyes shut).
 * Sprites are drawn as up-to-14x14 pixel grids ('X' = lit). 'e' marks an eye (a hole when awake, lit when asleep)
 * and 'm' a mouth (a hole). Every character has its own silhouette: some run side-on (cat, pup, bunny, fish),
 * some face you (robot, alien, ghost, penguin, rocket, kid).
 */
(function () {
  'use strict';

  const mir = rows => rows.map(r => r + [...r].reverse().join(''));
  const put = (rows, edits) => { const o = rows.map(r => r.split('')); edits.forEach(([r, c, ch]) => { o[r][c] = ch; }); return o.map(r => r.join('')); };
  const set = (rows, from, newRows) => { const o = rows.slice(); newRows.forEach((r, i) => { o[from + i] = r; }); return o; };
  const flipV = rows => rows.slice().reverse();


  const ROBOT = ["......XX......", "......XX......", "..XXXXXXXXXX..", "..XXeeXXeeXX..", "..XXXXXXXXXX..", "..XXmXmXmXXX..", "....XXXXXX....", ".XXXXXXXXXXXX.", ".XXXXXmmXXXXX.", ".XXXXXXXXXXXX.", "..XXXXXXXXXX..", "....XXXXXX....", "...XX....XX...", "..XXX....XXX.."];
  const ALIEN = mir(["..X....", "...X...", "..XXXXX", ".XXXXXX", "XXeeXXX", "XXXXXXX", "XXXXXXm", ".XXXXXX", "..XXXXX", "..X.X..", ".X...X.", "X.....X"]);
  const GHOST = mir(["....XXX", "..XXXXX", ".XXXXXX", ".XeeXXX", ".XeeXXX", "XXXXXXX", "XXXXXXm", "XXXXXXm", "XXXXXXX", "XXXXXXX", "XX.XXX.", "X..XX.."]);
  const PENG = ["....XXXXXX....", "...XXXXXXXX...", "...XeXXXXeX...", "....XXmmXX....", "..XXXXXXXXXX..", ".XXXXXmmXXXXX.", "XXXXXmmmmXXXXX", "XXXXXmmmmXXXXX", ".XXXXmmmmXXXX.", ".XXXXXmmXXXXX.", "..XXXXXXXXXX..", "...XXXXXXXX...", "...XXX..XXX...", "..XXXX..XXXX.."];
  const ROCKET = mir(["......X", "......X", ".....XX", "....XXX", "...XXXX", "...XXXm", "...XXXm", "...XXXX", "..XXXXX", ".XXXXXX", "XXX.XXX", "XX..XXX", ".....XX", "......X"]);
  const KID = ["..X.X.XX.X.X..", "..XXXXXXXXXX..", "..XXXXXXXXXX..", "..XXXXXXXXXX..", "..XeeXXXXeeX..", "..XXXXXXXXXX..", "..XXXXmmXXXX..", "....XXXXXX....", "..XXXXXXXXXX..", ".XXXXXXXXXXXX.", "..XXXXXXXXXX..", "...XXXXXXXX...", "...XXX..XXX...", "..XXX....XXX.."];

  const FISH = ["......XX......", ".....XXXXX....", "X..XXXXXXXXX..", "XX.XXXXXXXXeX.", "XXXXXXXXXXXXXm", "XX.XXXXXXXXXX.", "X..XXXXXXXXX..", ".....XXXXX....", "......XX......"];
  const BUNNY_A = ["........X.X...", "........X.X...", "........XXXXX.", "........XXeXXX", ".....XXXXXXXXm", "..XXXXXXXXXXX.", "XX.XXXXXXXXXX.", "..XXXXXXXXXX..", ".XXX.......XXX", "XX..........XX"];
  const BUNNY_B = ["........X.X...", "........X.X...", "........XXXXX.", "........XXeXXX", ".....XXXXXXXXm", "..XXXXXXXXXXX.", "XX.XXXXXXXXXX.", "..XXXXXXXXXX..", "..XXX....XXX..", "..XXXX..XXXX.."];

  const CAST = [
  { id:'cat', name:'Cat',
   a:["X........X...X","X........XXXXX","XX.......XeXeX",".XXXXXXXXXXXXX","..XXXXXXXXXXX.","..XXXXXXXXX...",".XX.X....X.XX.","XX.........XX."],
   b:["X........X...X","X........XXXXX","XX.......XeXeX",".XXXXXXXXXXXXX","..XXXXXXXXXXX.","..XXXXXXXXX...","..XX......XX..","..XXX....XXX.."] },
  { id:'pup', name:'Pup',
   a:["X........XXXX.","X.......XXXXXX","XX......X.XeXX",".XXXXXXXXXXXXm","..XXXXXXXXXXX.","..XXXXXXXXX...",".XX.X....X.XX.","XX.........XX."],
   b:["X........XXXX.","X.......XXXXXX","XX......X.XeXX",".XXXXXXXXXXXXm","..XXXXXXXXXXX.","..XXXXXXXXX...","..XX......XX..","..XXX....XXX.."] },
  { id:'robot', name:'Robot',
   a: put(ROBOT, [[5,0,'X'],[6,0,'X'],[7,0,'X'],[8,13,'X'],[9,13,'X'],[10,13,'X']]),
   b: put(ROBOT, [[8,0,'X'],[9,0,'X'],[10,0,'X'],[5,13,'X'],[6,13,'X'],[7,13,'X']]),
   idle: put(ROBOT, [[8,0,'X'],[9,0,'X'],[10,0,'X'],[8,13,'X'],[9,13,'X'],[10,13,'X']]) },
  { id:'alien', name:'Alien', a: ALIEN, b: put(ALIEN, [[10,1,'.'],[10,5,'X'],[10,8,'X'],[10,12,'.'],[11,0,'.'],[11,13,'.'],[11,2,'X'],[11,11,'X']]), idle: ALIEN },
  { id:'ghost', name:'Ghost', a: GHOST, b: set(GHOST, 10, ["X.XXX.XXX.XX.X", ".X..XX..XX..X."]), idle: GHOST },
  { id:'penguin', name:'Penguin',
   a: set(PENG, 12, ["..XXX....XXX..", ".XXXX...XXXX.."].slice(0,2)).map((r,i)=>i>=12?r.padEnd(14,'.').slice(0,14):r),
   b: set(PENG, 12, ["...XXX..XXX...", "..XXXX..XXXX.."]),
   idle: PENG },
  { id:'rocket', name:'Rocket', a: ROCKET, b: put(ROCKET, [[12,5,'X'],[12,8,'X'],[13,6,'.'],[13,7,'.']]), idle: ROCKET },
  { id:'kid', name:'Kid',
   a: put(KID, [[10,0,'X'],[9,0,'X'],[11,12,'X'],[11,13,'X'],[10,13,'X']]),
   b: put(KID, [[10,13,'X'],[9,13,'X'],[11,0,'X'],[11,1,'X'],[10,0,'X']]),
   idle: KID },
  { id:'bunny', name:'Bunny', a: BUNNY_A, b: BUNNY_B },
  { id:'fish', name:'Fish', a: FISH, b: set(set(FISH, 2, ["...XXXXXXXXX..", "X..XXXXXXXXeX.", "XXXXXXXXXXXXXm", "XXXXXXXXXXXXX.", "XX.XXXXXXXXX..", "X..XXXXX......".padEnd(14,'.').slice(0,14)]), 3, ["X..XXXXXXXXeX.", "XXXXXXXXXXXXXm", "XXXXXXXXXXXXX.", "XX.XXXXXXXXXX.", "X..XXXXXXXXX.."]) }
  ];
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

  const awake = rows => rows.map(r => r.replace(/[em]/g, '.'));
  const asleep = rows => rows.map(r => r.replace(/e/g, 'X').replace(/m/g, '.'));
  function build(m) {
    const idle = m.idle || m.b;
    return { id: m.id, name: m.name, a: awake(m.a), b: awake(m.b), idle: awake(idle), over: flipV(asleep(idle)) };
  }

  window.BRICK_MASCOTS = [
    { id: 'jumper', name: 'Jumper', a: JUMPER.a, b: JUMPER.b, idle: JUMPER.b, over: flipV(JUMPER.b) }
  ].concat(CAST.map(build), [
    { id: 'butterfly', name: 'Butterfly', a: BUTTERFLY.a, b: BUTTERFLY.b, idle: BUTTERFLY.idle, over: flipV(BUTTERFLY.idle) }
  ]);
})();
