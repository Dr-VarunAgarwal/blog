/*
 * brick/games.js — the cartridges.
 *
 * Every game draws into the same 10×20 monochrome grid the real handheld had.
 * The console (engine.js) hands each game a tiny API `g`:
 *
 *   g.set(x,y,v)   v: 1 = lit, 2 = blinking     g.clear()     g.get(x,y)
 *   g.n            4×4 "next" box (Uint8Array)  g.lives(n)    show n bricks in it
 *   g.add(n)       add to score                 g.rnd(n)      0..n-1
 *   g.speed/level  chosen on the title screen   g.setSpeed(n) show a new speed
 *   g.held(btn)    is a button down right now   g.sfx(name)   g.over()
 *
 * A game is `make(g)` -> { update(dt), press(btn, isRepeat), draw(), repeat? }.
 * draw() rebuilds the grid from state every frame, so games never have to
 * erase anything. `repeat: { left: [delayMs, rateMs] }` = auto-repeat while held.
 */
(function () {
  'use strict';

  const W = 10, H = 20;

  /* ---------- tiny helpers ---------- */
  const Tick = ms => ({
    ms, a: 0,
    step(dt) { this.a += dt; if (this.a >= this.ms) { this.a -= this.ms; if (this.a > this.ms) this.a = 0; return true; } return false; },
    reset() { this.a = 0; }
  });
  const sprite = (g, x, y, rows, v = 1) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') g.set(x + i, y + j, v); });
  const tri = (t, period, max) => { const p = (t % period) / period; return Math.round((p < .5 ? p * 2 : 2 - p * 2) * max); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shuffle = (a, g) => { for (let i = a.length - 1; i > 0; i--) { const j = g.rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hbar = (g, x, y, w, v = 1) => { for (let i = 0; i < w; i++) g.set(x + i, y, v); };

  /* =====================================================================
   * 1. BRICK FALL (falling-block puzzle)
   * ===================================================================== */
  const SHAPES = [
    { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },   // I
    { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },   // O
    { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },   // T
    { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },   // S
    { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },   // Z
    { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },   // J
    { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] }    // L
  ];
  const ROT = SHAPES.map(s => {
    const r = [s.c];
    for (let i = 1; i < 4; i++) r.push(r[i - 1].map(([x, y]) => [s.n - 1 - y, x]));
    return r;
  });
  const GRAV = [800, 680, 560, 460, 370, 290, 220, 160, 110, 75];

  function tetris(g) {
    const board = new Uint8Array(W * H);
    const base = g.speed;
    let bag = [], cur = null, clearing = null, dead = false, lines = 0;
    const drop = Tick(GRAV[g.speed - 1]);

    const take = () => { if (!bag.length) bag = shuffle([0, 1, 2, 3, 4, 5, 6], g); return bag.pop(); };
    let nxt = take();

    // "level" = rows of garbage to dig through
    for (let i = 0; i < Math.min(g.level - 1, 9); i++) {
      const y = H - 1 - i, hole = g.rnd(W);
      for (let x = 0; x < W; x++) board[y * W + x] = (x !== hole && g.rnd(100) < 62) ? 1 : 0;
    }

    const fits = (t, r, x, y) => {
      for (const [cx, cy] of ROT[t][r]) {
        const px = x + cx, py = y + cy;
        if (px < 0 || px >= W || py < 0 || py >= H || board[py * W + px]) return false;
      }
      return true;
    };
    const move = (dx, dy) => {
      if (fits(cur.t, cur.r, cur.x + dx, cur.y + dy)) { cur.x += dx; cur.y += dy; return true; }
      return false;
    };
    function showNext() {
      g.n.fill(0);
      const c = ROT[nxt][0];
      const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const ox = ((4 - (maxx - minx + 1)) >> 1) - minx, oy = ((4 - (maxy - miny + 1)) >> 1) - miny;
      for (const [cx, cy] of c) g.n[(cy + oy) * 4 + cx + ox] = 1;
    }
    function spawn() {
      const t = nxt; nxt = take();
      cur = { t, r: 0, x: (W - SHAPES[t].n) >> 1, y: t === 0 ? -1 : 0 };
      showNext();
      if (!fits(cur.t, 0, cur.x, cur.y)) { dead = true; g.over(); }
    }
    function lock() {
      for (const [cx, cy] of ROT[cur.t][cur.r]) board[(cur.y + cy) * W + cur.x + cx] = 1;
      const rows = [];
      for (let y = 0; y < H; y++) { let full = true; for (let x = 0; x < W; x++) if (!board[y * W + x]) { full = false; break; } if (full) rows.push(y); }
      if (rows.length) {
        clearing = { rows, t: 0 }; cur = null;
        lines += rows.length;
        g.add([0, 100, 300, 700, 1500][rows.length]);
        g.sfx(rows.length === 4 ? 'tetris' : 'line');
        const sp = Math.min(10, base + Math.floor(lines / 10));
        if (sp > g.speed) { g.setSpeed(sp); drop.ms = GRAV[sp - 1]; }
      } else { g.sfx('land'); spawn(); }
    }
    function rotate() {
      const nr = (cur.r + 1) % 4;
      for (const k of [0, -1, 1, -2, 2]) {
        if (fits(cur.t, nr, cur.x + k, cur.y)) { cur.r = nr; cur.x += k; g.sfx('rot'); return; }
      }
    }
    spawn();

    return {
      music: true,
      repeat: { left: [160, 55], right: [160, 55], down: [130, 40] },
      update(dt) {
        if (dead) return;
        if (clearing) {
          clearing.t += dt;
          if (clearing.t >= 380) {
            for (const y of clearing.rows) {
              for (let yy = y; yy > 0; yy--) for (let x = 0; x < W; x++) board[yy * W + x] = board[(yy - 1) * W + x];
              for (let x = 0; x < W; x++) board[x] = 0;
            }
            clearing = null; spawn();
          }
          return;
        }
        if (drop.step(dt) && !move(0, 1)) lock();
      },
      press(btn) {
        if (dead || clearing || !cur) return;
        if (btn === 'left') { if (move(-1, 0)) g.sfx('move'); }
        else if (btn === 'right') { if (move(1, 0)) g.sfx('move'); }
        else if (btn === 'down') { if (move(0, 1)) { g.add(1); drop.reset(); } }
        else if (btn === 'up') { let n = 0; while (move(0, 1)) n++; g.add(2 * n); lock(); }
        else if (btn === 'rotate') rotate();
      },
      draw() {
        g.f.set(board);
        if (clearing && ((clearing.t / 95) | 0) % 2 === 0) for (const y of clearing.rows) for (let x = 0; x < W; x++) g.f[y * W + x] = 0;
        if (cur) for (const [cx, cy] of ROT[cur.t][cur.r]) g.set(cur.x + cx, cur.y + cy, 1);
      }
    };
  }

  function attractTetris(g, t) {
    const pile = ['XXX.XXXX.X', 'XXXXXXXX.X', 'X.XXXXXXXX'];
    pile.forEach((r, j) => { for (let i = 0; i < W; i++) if (r[i] === 'X') g.set(i, 17 + j); });
    const shapes = [['.X.', 'XXX'], ['XX.', '.XX'], ['XXXX'], ['X..', 'XXX'], ['XX', 'XX'], ['..X', 'XXX']];
    const cyc = Math.floor(t / 2400), ph = (t % 2400) / 2400;
    const s = shapes[cyc % shapes.length];
    const y = Math.min(15, Math.floor(ph * 22) - 3);
    sprite(g, (cyc * 3 + 1) % (W - s[0].length + 1), y, s);
  }

  /* =====================================================================
   * 2 & 11. SNAKE  (walls / wrap-around)
   * ===================================================================== */
  const SNAKE_MS = [320, 280, 240, 205, 175, 150, 125, 105, 85, 70];
  function snake(g, wrap) {
    const body = [{ x: 5, y: 14 }, { x: 5, y: 15 }, { x: 5, y: 16 }];
    let dir = { x: 0, y: -1 }, q = [], food = null, dead = 0, eaten = 0;
    const walls = new Set();
    const tk = Tick(SNAKE_MS[g.speed - 1]);
    const key = (x, y) => y * W + x;
    const onBody = (x, y, skipTail) => body.some((s, i) => !(skipTail && i === body.length - 1) && s.x === x && s.y === y);

    for (let i = 0, n = (g.level - 1) * 2; i < n; i++) {
      const x = g.rnd(W), y = g.rnd(H);
      if (x >= 3 && x <= 7 && y >= 8) continue;      // keep the start area clear
      walls.add(key(x, y));
    }
    function place() {
      for (let tries = 0; tries < 500; tries++) {
        const x = g.rnd(W), y = g.rnd(H);
        if (!onBody(x, y) && !walls.has(key(x, y))) { food = { x, y }; return; }
      }
      food = null;
    }
    place();

    function step() {
      if (q.length) dir = q.shift();
      let nx = body[0].x + dir.x, ny = body[0].y + dir.y;
      if (wrap) { nx = (nx + W) % W; ny = (ny + H) % H; }
      else if (nx < 0 || nx >= W || ny < 0 || ny >= H) return die();
      const eat = food && nx === food.x && ny === food.y;
      if (walls.has(key(nx, ny)) || onBody(nx, ny, !eat)) return die();
      body.unshift({ x: nx, y: ny });
      if (eat) {
        g.add(10 + g.speed); g.sfx('eat'); eaten++; place();
        if (eaten % 5 === 0 && g.speed < 10) { g.setSpeed(g.speed + 1); g.sfx('level'); }
      } else body.pop();
    }
    function die() { dead = 1; g.sfx('crash'); }

    return {
      repeat: {},
      update(dt) {
        if (dead) { dead += dt; if (dead > 1000) g.over(); return; }
        tk.ms = SNAKE_MS[g.speed - 1] * (g.held('rotate') ? .5 : 1);
        if (tk.step(dt)) step();
      },
      press(btn) {
        const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[btn];
        if (!v || dead) return;
        const last = q.length ? q[q.length - 1] : dir;
        if ((v[0] === -last.x && v[1] === -last.y) || (v[0] === last.x && v[1] === last.y)) return;
        if (q.length < 2) q.push({ x: v[0], y: v[1] });
      },
      draw() {
        walls.forEach(k => { g.f[k] = 1; });
        if (!dead || ((dead / 150) | 0) % 2 === 0) body.forEach(s => g.set(s.x, s.y, 1));
        if (food) g.set(food.x, food.y, 2);
      }
    };
  }
  function attractSnake(g, t) {
    const path = [];
    for (let x = 1; x <= 8; x++) path.push([x, 5]);
    for (let y = 6; y <= 14; y++) path.push([8, y]);
    for (let x = 7; x >= 1; x--) path.push([x, 14]);
    for (let y = 13; y >= 6; y--) path.push([1, y]);
    const idx = Math.floor(t / 110);
    for (let i = 0; i < 7; i++) { const p = path[((idx - i) % path.length + path.length) % path.length]; g.set(p[0], p[1]); }
    g.set(4 + (Math.floor(t / 900) % 2), 10, 2);
  }

  /* =====================================================================
   * 3. ROAD RACER (racing)
   * ===================================================================== */
  const CAR = ['.X.', 'XXX', '.X.', 'X.X'];
  const RACE_MS = [140, 120, 105, 90, 78, 68, 58, 50, 43, 37];
  const CAR2 = ['XX', 'XX', 'XX', 'XX'];                          // slim car for the three-lane road
  function racing(g, lanes) {
    const three = lanes === 3;
    const LX = three ? [1, 4, 7] : [1, 6], PY = 16, body = three ? CAR2 : CAR;
    let lane = three ? 1 : 0, off = 0, cars = [], gap = 6, passed = 0, crash = 0;
    let nextLanes = [g.rnd(lanes || 2)];
    const tk = Tick(RACE_MS[g.speed - 1]);

    const hit = () => cars.some(c => c.lane === lane && c.y + 3 >= PY && c.y <= PY + 3);
    const wreck = () => { crash = 1; g.sfx('crash'); };
    // How long until the *next* car spawns, and in which lane(s). A car is 4 rows long, so when the
    // next car is in another lane the gap must cover its body (8 rows) plus a human reaction
    // window (~330 ms at the current speed) per lane to cross - otherwise there is literally no time to switch.
    // On the three-lane road, higher levels sometimes send two cars side by side, always leaving one lane open.
    function plan(prev) {
      const reaction = Math.ceil(330 / RACE_MS[g.speed - 1]);
      if (three) {
        const pair = g.rnd(100) < 8 + g.level * 5;
        const open = g.rnd(3);
        nextLanes = pair ? [0, 1, 2].filter(l => l !== open) : [g.rnd(3)];
        const dist = Math.max.apply(null, nextLanes.map(l => Math.abs(l - prev)).concat(pair ? [2] : [0]));
        gap = (dist ? 8 + reaction * dist : 5) + g.rnd(Math.max(1, 8 - (g.level >> 1)));
        return;
      }
      nextLanes = [g.rnd(2)];
      gap = (nextLanes[0] === prev ? 5 : 8 + reaction) + g.rnd(Math.max(1, 8 - (g.level >> 1)));
    }
    plan(lane);

    return {
      repeat: three ? { left: [190, 120], right: [190, 120] } : {},
      update(dt) {
        if (crash) { crash += dt; if (crash > 1200) g.over(); return; }
        tk.ms = RACE_MS[g.speed - 1] * ((g.held('up') || g.held('rotate')) ? .55 : 1);
        if (!tk.step(dt)) return;
        off = (off + 1) & 3;
        cars.forEach(c => c.y++);
        if (--gap <= 0) { const ls = nextLanes.slice(); ls.forEach(l => cars.push({ lane: l, y: -4 })); plan(ls[ls.length - 1]); }
        cars = cars.filter(c => {
          if (c.y <= H - 1) return true;
          passed++; g.add(10);
          if (passed % 10 === 0 && g.speed < 10) { g.setSpeed(g.speed + 1); g.sfx('level'); }
          return false;
        });
        if (hit()) wreck();
      },
      press(btn) {
        if (crash) return;
        if (three) {
          if (btn === 'left' && lane > 0) { lane--; g.sfx('move'); }
          else if (btn === 'right' && lane < 2) { lane++; g.sfx('move'); }
        } else if (btn === 'left' && lane !== 0) { lane = 0; g.sfx('move'); }
        else if (btn === 'right' && lane !== 1) { lane = 1; g.sfx('move'); }
        if (hit()) wreck();
      },
      draw() {
        for (let y = 0; y < H; y++) if (((y + off) & 3) !== 3) { g.set(0, y); g.set(W - 1, y); }
        cars.forEach(c => sprite(g, LX[c.lane], c.y, body));
        sprite(g, LX[lane], PY, body, crash && ((crash / 120) | 0) % 2 ? 0 : 1);
      }
    };
  }
  function attractRacing3(g, t) {
    const off = Math.floor(t / 90) & 3;
    for (let y = 0; y < H; y++) if (((y + off) & 3) !== 3) { g.set(0, y); g.set(W - 1, y); }
    const cyc = Math.floor(t / 2600);
    sprite(g, 1, ((Math.floor(t / 90) + 6) % 28) - 6, CAR2);
    sprite(g, 7, ((Math.floor(t / 90) + 18) % 30) - 6, CAR2);
    sprite(g, 4, ((Math.floor(t / 90) + 27) % 32) - 6, CAR2);
    sprite(g, [1, 4, 7][cyc % 3], 16, CAR2);
  }
  function attractRacing(g, t) {
    const off = Math.floor(t / 90) & 3;
    for (let y = 0; y < H; y++) if (((y + off) & 3) !== 3) { g.set(0, y); g.set(W - 1, y); }
    const cyc = Math.floor(t / 2600);
    sprite(g, 1, ((Math.floor(t / 90) + 8) % 28) - 6, CAR);
    sprite(g, 6, ((Math.floor(t / 90) + 20 * (cyc & 1)) % 30) - 6, CAR);
    sprite(g, (cyc % 2) ? 1 : 6, 16, CAR);
  }

  /* =====================================================================
   * 4. TANK BATTLE
   * ===================================================================== */
  const TSH = [
    [[0, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1]],     // up
    [[-1, -1], [0, -1], [0, 0], [1, 0], [-1, 1], [0, 1]],    // right
    [[-1, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],    // down
    [[0, -1], [1, -1], [-1, 0], [0, 0], [0, 1], [1, 1]]      // left
  ];
  const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const TANK_MS = [520, 470, 420, 380, 340, 300, 270, 240, 210, 180];

  function tanks(g) {
    const walls = new Uint8Array(W * H);
    let player = null, enemies = [], bullets = [], lives = 3, stage = 0;
    let spawnLeft = 0, dying = 0, inv = 0, clearT = 0, fireCd = 0;
    const spawnT = Tick(1800), bt = Tick(50);

    const inTank = (t, x, y) => TSH[t.d].some(([a, b]) => t.x + a === x && t.y + b === y);
    function free(x, y, d, self) {
      if (x < 1 || x > W - 2 || y < 1 || y > H - 2) return false;
      for (const [a, b] of TSH[d]) if (walls[(y + b) * W + x + a]) return false;
      if (player && player !== self && !dying && Math.abs(player.x - x) <= 2 && Math.abs(player.y - y) <= 2) return false;
      for (const e of enemies) if (e !== self && Math.abs(e.x - x) <= 2 && Math.abs(e.y - y) <= 2) return false;
      return true;
    }
    function layout() {
      walls.fill(0);
      for (let i = 0, n = 9 + g.level; i < n; i++) {
        const len = 2 + g.rnd(2), horiz = g.rnd(2) === 0;
        const x = g.rnd(W), y = 5 + g.rnd(9);
        for (let k = 0; k < len; k++) { const px = horiz ? x + k : x, py = horiz ? y : y + k; if (px < W && py < 15) walls[py * W + px] = 1; }
      }
      for (let y = 15; y < H; y++) for (let x = 2; x <= 7; x++) walls[y * W + x] = 0;   // player's yard
    }
    function respawn() { player = { x: 4, y: 17, d: 0 }; inv = 1600; }
    function newStage() {
      stage++; layout(); enemies = []; bullets = [];
      spawnLeft = 6 + g.level; spawnT.a = 1000;
      respawn();
    }
    function fire(t, own) {
      const [dx, dy] = DV[t.d];
      bullets.push({ x: t.x + dx, y: t.y + dy, dx, dy, own });
      if (own === 'p') g.sfx('shoot');
    }
    function hurt() {
      dying = 1; bullets = []; g.sfx('crash'); lives--; g.lives(lives);
    }
    function think(e) {
      let d = e.d;
      const ahead = () => free(e.x + DV[d][0], e.y + DV[d][1], d, e);
      if (g.rnd(100) < 30 || !ahead()) {
        const cand = [], tx = player ? player.x : 4, ty = player ? player.y : 18;
        if (ty > e.y) cand.push(2, 2);
        if (tx < e.x) cand.push(3);
        if (tx > e.x) cand.push(1);
        cand.push(g.rnd(4));
        d = cand[g.rnd(cand.length)];
      }
      const nx = e.x + DV[d][0], ny = e.y + DV[d][1];
      if (free(nx, ny, d, e)) { e.d = d; e.x = nx; e.y = ny; }
      if (g.rnd(100) < 10 && bullets.filter(b => b.own === 'e').length < 3) fire(e, 'e');
    }
    // does the barrel point straight at the player with no wall in between?
    function aimed(e) {
      if (!player || dying) return false;
      const [dx, dy] = DV[e.d];
      for (let x = e.x + dx * 2, y = e.y + dy * 2; x >= 0 && x < W && y >= 0 && y < H; x += dx, y += dy) {
        if (walls[y * W + x]) return false;
        if (inTank(player, x, y)) return true;
      }
      return false;
    }
    // turn to face a player who is lined up on the same row or column and clear of walls
    function lineUp(e) {
      if (!player || dying) return;
      for (let d = 0; d < 4; d++) {
        const o = e.d; e.d = d;
        if (aimed(e)) { if (!free(e.x, e.y, d, e)) e.d = o; return; }
        e.d = o;
      }
    }
    function stepBullets() {
      for (const b of bullets) {
        b.x += b.dx; b.y += b.dy;
        if (b.x < 0 || b.x >= W || b.y < 0 || b.y >= H) { b.dead = true; continue; }
        if (walls[b.y * W + b.x]) { walls[b.y * W + b.x] = 0; b.dead = true; g.sfx('hit'); continue; }
        if (b.own === 'p') {
          const e = enemies.find(t => inTank(t, b.x, b.y));
          if (e) { e.dead = true; b.dead = true; g.add(100); g.sfx('boom'); }
        } else if (player && !dying && inv <= 0 && inTank(player, b.x, b.y)) { b.dead = true; hurt(); }
      }
      for (let i = 0; i < bullets.length; i++) for (let j = i + 1; j < bullets.length; j++) {
        const a = bullets[i], c = bullets[j];
        if (a.own !== c.own && a.x === c.x && a.y === c.y) a.dead = c.dead = true;
      }
      bullets = bullets.filter(b => !b.dead);
      enemies = enemies.filter(e => !e.dead);
    }

    g.lives(lives);
    newStage();

    return {
      repeat: { up: [150, 90], down: [150, 90], left: [150, 90], right: [150, 90], rotate: [260, 260] },
      update(dt) {
        if (inv > 0) inv -= dt;
        fireCd -= dt;
        if (dying) {
          dying += dt;
          if (dying > 900) { dying = 0; if (lives <= 0) { player = null; g.over(); } else respawn(); }
          return;
        }
        if (clearT) { clearT += dt; if (clearT > 1300) { clearT = 0; g.add(300); if (g.speed < 10) g.setSpeed(g.speed + 1); newStage(); } return; }
        if (spawnLeft > 0 && enemies.length < 2 + (stage > 2 ? 1 : 0) && spawnT.step(dt)) {
          const x = [1, 4, 8][g.rnd(3)], e = { x, y: 1, d: 2, mt: Tick(TANK_MS[g.speed - 1]) };
          if (free(x, 1, 2, e)) { enemies.push(e); spawnLeft--; }
        }
        for (const e of enemies) {
          e.mt.ms = TANK_MS[g.speed - 1];
          e.fc = (e.fc || 0) - dt;
          if (e.mt.step(dt)) think(e);
          if (e.fc <= 0 && inv <= 0) {                                   // spotted you: face you and shoot
            if (!aimed(e)) lineUp(e);
            if (aimed(e) && bullets.filter(b => b.own === 'e').length < 3) { fire(e, 'e'); e.fc = 900 - g.speed * 40; }
          }
        }
        if (bt.step(dt)) stepBullets();
        if (!spawnLeft && !enemies.length && !clearT) { clearT = 1; g.sfx('win'); }
      },
      press(btn) {
        if (dying || !player || clearT) return;
        if (btn === 'rotate') {
          if (fireCd <= 0 && bullets.filter(b => b.own === 'p').length < 2) { fire(player, 'p'); fireCd = 200; }
          return;
        }
        const d = { up: 0, right: 1, down: 2, left: 3 }[btn];
        const nx = player.x + DV[d][0], ny = player.y + DV[d][1];
        if (free(nx, ny, d, player)) { player.d = d; player.x = nx; player.y = ny; }
        else if (free(player.x, player.y, d, player)) player.d = d;
      },
      draw() {
        g.f.set(walls);
        enemies.forEach(e => TSH[e.d].forEach(([a, b]) => g.set(e.x + a, e.y + b, 1)));
        if (player) {
          const vis = dying ? ((dying / 100) | 0) % 2 === 0 : (inv > 0 ? ((inv / 120) | 0) % 2 === 0 : true);
          if (vis) TSH[player.d].forEach(([a, b]) => g.set(player.x + a, player.y + b, 1));
        }
        bullets.forEach(b => g.set(b.x, b.y, 1));
        if (clearT && ((clearT / 160) | 0) % 2) g.f.fill(0);
      }
    };
  }
  function attractTanks(g, t) {
    for (let x = 2; x <= 7; x++) { g.set(x, 4); g.set(x, 5); }
    const cyc = Math.floor(t / 2800), cx = 1 + (cyc % 2 ? tri(t, 5600, 7) : 8 - tri(t, 5600, 7));
    TSH[0].forEach(([a, b]) => g.set(clamp(cx, 1, 8) + a, 16 + b));
    const by = 14 - (Math.floor(t / 55) % 14);
    if (by > 5 || ((t / 120) | 0) % 2) g.set(clamp(cx, 1, 8), by);
    TSH[2].forEach(([a, b]) => g.set(5 + a + (cyc % 2), 1 + b));
  }

  /* =====================================================================
   * 5. BRICK BREAKER
   * ===================================================================== */
  const BALL_MS = [170, 150, 130, 112, 96, 82, 70, 60, 52, 45];
  function breakout(g) {
    const bricks = new Uint8Array(W * H);
    let px = 3, ball = { x: 4, y: H - 2, dx: 1, dy: -1 }, stuck = true, lives = 3, remaining = 0, stageT = 0;
    const tk = Tick(BALL_MS[g.speed - 1]);
    const brick = (x, y) => (x < 0 || x >= W || y < 0 || y >= H) ? 0 : bricks[y * W + x];
    const kill = (x, y) => { bricks[y * W + x] = 0; remaining--; g.add(10); g.sfx('brick'); };

    function fill() {
      bricks.fill(0); remaining = 0;
      const rows = Math.min(8, 3 + ((g.level - 1) >> 1) + Math.floor(stageNo / 2));
      for (let y = 1; y <= rows; y++) for (let x = 0; x < W; x++) { bricks[y * W + x] = 1; remaining++; }
    }
    let stageNo = 0;
    fill();
    const reset = () => { stuck = true; ball = { x: px + 1, y: H - 2, dx: g.rnd(2) ? 1 : -1, dy: -1 }; };
    g.lives(lives);

    function step() {
      let { x, y, dx, dy } = ball;
      let nx = x + dx, ny = y + dy;
      // Side walls: the ball slides one tick along the wall before turning. That detunes the
      // wall-to-wall cycle from the floor-to-ceiling one, so the ball does not return to the
      // same column forever (otherwise whole areas of the wall are unreachable).
      if (nx < 0 || nx >= W) { dx = -dx; nx = x; }
      if (ny < 0) { dy = 1; ny = y + dy; }
      if (dy > 0 && ny === H - 1 && nx >= px - 1 && nx <= px + 3) {            // paddle (corners count)
        const rel = nx - px;
        dy = -1;
        dx = rel <= 0 ? -1 : rel >= 2 ? 1 : (dx || (g.rnd(2) ? 1 : -1));
        g.sfx('bounce');
        nx = x + dx; ny = y + dy;
        if (nx < 0 || nx >= W) { dx = -dx; nx = x; }
      }
      const a = brick(nx, y), b = brick(x, ny), c = brick(nx, ny);
      if (a || b || c) {
        if (a && b) { kill(nx, y); kill(x, ny); dx = -dx; dy = -dy; }
        else if (a) { kill(nx, y); dx = -dx; }
        else if (b) { kill(x, ny); dy = -dy; }
        else { kill(nx, ny); dx = -dx; dy = -dy; }
        ball = { x, y, dx, dy };
        if (!remaining) { stageT = 1; g.sfx('win'); }
        return;
      }
      if (ny >= H) {
        lives--; g.lives(lives); g.sfx('miss');
        if (lives <= 0) g.over(); else reset();
        return;
      }
      ball = { x: nx, y: ny, dx, dy };
    }

    return {
      repeat: { left: [140, 45], right: [140, 45] },
      update(dt) {
        if (stageT) {
          stageT += dt;
          if (stageT > 1200) { stageT = 0; stageNo++; if (g.speed < 10) g.setSpeed(g.speed + 1); fill(); reset(); }
          return;
        }
        if (stuck) { ball.x = px + 1; return; }
        tk.ms = BALL_MS[g.speed - 1];
        if (tk.step(dt)) step();
      },
      press(btn) {
        if (stageT) return;
        if (btn === 'left' && px > 0) px--;
        else if (btn === 'right' && px < W - 3) px++;
        else if ((btn === 'rotate' || btn === 'up') && stuck) { stuck = false; tk.reset(); g.sfx('bounce'); }
        if (stuck) ball.x = px + 1;
      },
      draw() {
        g.f.set(bricks);
        hbar(g, px, H - 1, 3);
        if (!stageT || ((stageT / 140) | 0) % 2) g.set(ball.x, ball.y, stuck ? 2 : 1);
      }
    };
  }
  function attractBreakout(g, t) {
    for (let y = 2; y <= 4; y++) for (let x = 0; x < W; x++) if (((x + y) & 1) || y === 2) g.set(x, y);
    const bx = tri(t, 3000, 9), by = 6 + tri(t, 1700, 12);
    g.set(bx, by);
    hbar(g, clamp(bx - 1, 0, 7), 19, 3);
  }

  /* =====================================================================
   * 6. STAR SHOOTER
   * ===================================================================== */
  const INV_MS = [700, 620, 540, 470, 400, 340, 290, 240, 200, 160];
  function shooter(g) {
    let px = 3, inv = [], dir = 1, shots = [], eshots = [], lives = 3, wave = 0, total = 1;
    let hurtT = 0, cd = 0, waveT = 0;
    const mv = Tick(600), st = Tick(36), est = Tick(95), fireT = Tick(900);

    function spawnWave() {
      inv = []; dir = 1; shots = []; eshots = [];
      const rows = 3, y0 = Math.min(wave, 4);
      for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) inv.push({ x: 1 + c * 2, y: y0 + r * 2 });
      total = inv.length;
    }
    const at = (x, y) => inv.findIndex(i => i.x === x && i.y === y);
    function resolve() {
      for (const s of shots) {
        const k = at(s.x, s.y);
        if (k >= 0) { inv.splice(k, 1); s.dead = true; g.add(10); g.sfx('boom'); }
      }
      shots = shots.filter(s => !s.dead);
      for (const e of eshots) {
        if (!hurtT && ((e.y === H - 2 && e.x === px + 1) || (e.y === H - 1 && e.x >= px && e.x <= px + 2))) { e.dead = true; hurt(); }
      }
      eshots = eshots.filter(e => !e.dead);
    }
    function hurt() { lives--; g.lives(lives); g.sfx('crash'); hurtT = 1; eshots = []; }
    g.lives(lives);
    spawnWave();

    return {
      repeat: { left: [150, 50], right: [150, 50], rotate: [240, 240], up: [240, 240] },
      update(dt) {
        cd -= dt;
        if (hurtT) { hurtT += dt; if (hurtT > 1000) { hurtT = 0; if (lives <= 0) g.over(); } return; }
        if (waveT) { waveT += dt; if (waveT > 1200) { waveT = 0; wave++; if (g.speed < 10) g.setSpeed(g.speed + 1); spawnWave(); } return; }

        mv.ms = INV_MS[g.speed - 1] * (.3 + .7 * inv.length / total);
        if (mv.step(dt)) {
          const edge = inv.some(i => i.x + dir < 0 || i.x + dir >= W);
          if (edge) { inv.forEach(i => i.y++); dir = -dir; } else inv.forEach(i => i.x += dir);
          g.sfx('tick');
          if (inv.some(i => i.y >= H - 3)) { lives = 0; g.lives(0); hurtT = 1; g.sfx('crash'); }
          resolve();
        }
        if (st.step(dt)) {
          shots.forEach(s => s.y--);
          shots = shots.filter(s => s.y >= 0);
          resolve();
        }
        if (est.step(dt)) { eshots.forEach(e => e.y++); eshots = eshots.filter(e => e.y < H); resolve(); }
        fireT.ms = Math.max(350, 1000 - g.speed * 55 - wave * 30);
        if (fireT.step(dt) && inv.length) {
          const cols = {};
          inv.forEach(i => { if (!cols[i.x] || i.y > cols[i.x].y) cols[i.x] = i; });
          const keys = Object.keys(cols), s = cols[keys[g.rnd(keys.length)]];
          eshots.push({ x: s.x, y: s.y + 1 });
        }
        if (!inv.length) { waveT = 1; g.add(200); g.sfx('win'); }
      },
      press(btn) {
        if (hurtT || waveT) return;
        if (btn === 'left' && px > 0) px--;
        else if (btn === 'right' && px < W - 3) px++;
        else if ((btn === 'rotate' || btn === 'up') && cd <= 0 && shots.length < 3) {
          shots.push({ x: px + 1, y: H - 3 }); cd = 150; g.sfx('shoot'); resolve();
        }
      },
      draw() {
        inv.forEach(i => g.set(i.x, i.y, 1));
        shots.forEach(s => g.set(s.x, s.y, 1));
        eshots.forEach(e => g.set(e.x, e.y, 2));
        if (!hurtT || ((hurtT / 100) | 0) % 2 === 0) { g.set(px + 1, H - 2); hbar(g, px, H - 1, 3); }
        if (waveT && ((waveT / 160) | 0) % 2) g.f.fill(0);
      }
    };
  }
  function attractShooter(g, t) {
    const off = tri(t, 3200, 3), row = Math.floor(t / 3200) % 3;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) g.set(1 + c * 2 + off - 1, 2 + r * 2 + row);
    const sx = tri(t, 4400, 7);
    g.set(sx + 1, 18); hbar(g, sx, 19, 3);
    const by = 17 - (Math.floor(t / 50) % 16);
    g.set(sx + 1, by);
  }

  /* =====================================================================
   * 7. HOPPER (Frogger)
   * ===================================================================== */
  const LANES = [18, 17, 16, 15, 13, 12, 11, 10, 9, 7, 6, 5, 4, 3];
  const HOP_MS = [520, 460, 400, 350, 305, 265, 230, 200, 175, 150];
  function frogger(g) {
    let fx = 4, fy = H - 1, lives = 3, dead = 0, crossings = 0, flash = 0;
    const maxLen = g.level > 5 ? 3 : 2;
    function gen() {
      const pat = new Uint8Array(W);
      let used = 0, pos = g.rnd(W);
      for (; ;) {
        const len = 1 + g.rnd(maxLen), gap = 2 + g.rnd(3);
        if (used + len + 2 > W) break;
        for (let i = 0; i < len; i++) pat[(pos + i) % W] = 1;
        pos += len + gap; used += len + gap;
      }
      return pat;
    }
    const lanes = LANES.map((y, i) => ({ y, dir: i % 2 ? 1 : -1, pat: gen(), t: Tick(500), mul: .75 + Math.random() * .6 }));
    const laneAt = y => lanes.find(l => l.y === y);
    const danger = () => { const l = laneAt(fy); return !!(l && l.pat[fx]); };
    function die() { dead = 1; g.sfx('crash'); lives--; g.lives(lives); }
    g.lives(lives);

    return {
      repeat: { up: [220, 130], down: [220, 130], left: [220, 110], right: [220, 110] },
      update(dt) {
        if (dead) { dead += dt; if (dead > 900) { dead = 0; if (lives <= 0) g.over(); else { fx = 4; fy = H - 1; } } return; }
        if (flash) { flash += dt; if (flash > 500) { flash = 0; fx = 4; fy = H - 1; } return; }
        for (const l of lanes) {
          l.t.ms = HOP_MS[g.speed - 1] * l.mul;
          if (l.t.step(dt)) {
            const n = new Uint8Array(W);
            for (let i = 0; i < W; i++) if (l.pat[i]) n[(i + l.dir + W) % W] = 1;
            l.pat = n;
            if (fy === l.y && l.pat[fx]) { die(); return; }
          }
        }
      },
      press(btn) {
        if (dead || flash) return;
        if (btn === 'up' && fy > 0) fy--;
        else if (btn === 'down' && fy < H - 1) fy++;
        else if (btn === 'left' && fx > 0) fx--;
        else if (btn === 'right' && fx < W - 1) fx++;
        else return;
        g.sfx('hop');
        if (danger()) { die(); return; }
        if (fy === 0) {
          crossings++; g.add(100); g.sfx('win'); flash = 1;
          if (crossings % 2 === 0 && g.speed < 10) g.setSpeed(g.speed + 1);
        }
      },
      draw() {
        lanes.forEach(l => { for (let x = 0; x < W; x++) if (l.pat[x]) g.set(x, l.y, 1); });
        if (dead ? ((dead / 100) | 0) % 2 === 0 : true) g.set(fx, fy, flash ? 1 : 2);
      }
    };
  }
  function attractFrogger(g, t) {
    [[6, 1], [8, -1], [10, 1], [12, -1]].forEach(([y, d], i) => {
      const s = Math.floor(t / (170 + i * 40)) * d;
      for (let x = 0; x < W; x++) if ((((x + s) % 5) + 5) % 5 < 2) g.set(x, y);
    });
    g.set(5, 19 - (Math.floor(t / 420) % 17), 2);
  }

  /* =====================================================================
   * 8 & 12. PING-PONG  /  SQUASH
   * ===================================================================== */
  const PONG_MS = [150, 132, 116, 100, 88, 78, 68, 58, 50, 43];
  function pong(g, squash) {
    let px = 3, cx = 3, lives = 3, hits = 0, err = 0, serveT = 800, ball;
    const tk = Tick(PONG_MS[g.speed - 1]), ct = Tick(200);

    function serve() {
      ball = { x: 1 + g.rnd(W - 2), y: squash ? 3 : (H >> 1), dx: g.rnd(2) ? 1 : -1, dy: 1 };
      serveT = 800;
    }
    const jitter = () => { const r = Math.max(0, Math.round((11 - g.level) / 3)); err = g.rnd(2 * r + 1) - r; };
    function deflect(nx, y, dx, dir, padX) {
      const rel = nx - padX, ox = ball.x;
      dx = rel <= 0 ? -1 : rel >= 2 ? 1 : (dx || (g.rnd(2) ? 1 : -1));
      let x2 = ox + dx;
      if (x2 < 0 || x2 >= W) { dx = -dx; x2 = ox + dx; }
      ball = { x: x2, y: y + dir, dx, dy: dir };
    }
    function step() {
      let { x, y, dx, dy } = ball;
      let nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W) { dx = -dx; nx = x + dx; }
      ball = { x, y, dx, dy };
      if (dy > 0 && ny === H - 1 && nx >= px - 1 && nx <= px + 3) {
        g.sfx('bounce'); jitter(); hits++;
        if (squash) { g.add(10); if (hits % 6 === 0 && g.speed < 10) { g.setSpeed(g.speed + 1); g.sfx('level'); } }
        deflect(nx, y, dx, -1, px); return;
      }
      if (!squash && dy < 0 && ny === 0 && nx >= cx - 1 && nx <= cx + 3) {
        g.sfx('bounce'); deflect(nx, y, dx, 1, cx); return;
      }
      if (squash && ny < 0) { g.sfx('bounce'); ball = { x: nx, y: y + 1, dx, dy: 1 }; return; }
      if (ny >= H) {
        lives--; g.lives(lives); g.sfx('miss');
        if (lives <= 0) g.over(); else serve();
        return;
      }
      if (!squash && ny < 0) {
        g.add(100); g.sfx('win'); hits++;
        if (hits % 3 === 0 && g.speed < 10) { g.setSpeed(g.speed + 1); g.sfx('level'); }
        serve(); return;
      }
      ball = { x: nx, y: ny, dx, dy };
    }
    g.lives(lives);
    serve();

    return {
      repeat: { left: [130, 42], right: [130, 42] },
      update(dt) {
        if (serveT > 0) { serveT -= dt; return; }
        tk.ms = PONG_MS[g.speed - 1];
        ct.ms = tk.ms * (1.5 - .04 * g.level);
        if (!squash && ct.step(dt)) {
          const want = (ball.dy < 0 || ball.y < 8) ? clamp(ball.x - 1 + err, 0, W - 3) : 3;
          if (cx < want) cx++; else if (cx > want) cx--;
        }
        if (tk.step(dt)) step();
      },
      press(btn) {
        if (btn === 'left' && px > 0) px--;
        else if (btn === 'right' && px < W - 3) px++;
      },
      draw() {
        hbar(g, px, H - 1, 3);
        if (!squash) hbar(g, cx, 0, 3);
        g.set(ball.x, ball.y, serveT > 0 ? 2 : 1);
      }
    };
  }
  function attractPong(g, t) {
    const bx = tri(t, 1700, 9), by = 1 + tri(t, 2300, 17);
    g.set(bx, by);
    hbar(g, clamp(bx - 1 + (Math.floor(t / 1000) % 2), 0, 7), 19, 3);
    hbar(g, clamp(bx - 1, 0, 7), 0, 3);
  }
  function attractSquash(g, t) {
    for (let x = 0; x < W; x++) g.set(x, 1);
    const bx = tri(t, 1900, 9), by = 3 + tri(t, 1500, 15);
    g.set(bx, by);
    hbar(g, clamp(bx - 1, 0, 7), 19, 3);
  }

  /* =====================================================================
   * 9. BLOCK TOWER (stacking)
   * ===================================================================== */
  const STACK_MS = [130, 115, 100, 88, 76, 66, 57, 49, 42, 36];
  function stacker(g) {
    const W0 = [4, 4, 4, 3, 3, 3, 3, 2, 2, 2][g.level - 1];
    let rows = [], w = W0, bar = { x: 0, dir: 1 }, falls = [], fail = 0, win = 0;
    const tk = Tick(100), ft = Tick(70);

    const launch = () => { bar.x = g.rnd(2) ? 0 : W - w; bar.dir = bar.x === 0 ? 1 : -1; };
    launch();

    function lock() {
      const y = H - 1 - rows.length, x0 = bar.x, x1 = bar.x + w;
      if (rows.length) {
        const p = rows[rows.length - 1], a = Math.max(x0, p.x), b = Math.min(x1, p.x + p.w);
        if (b <= a) { fail = 1; falls.push({ x: x0, w, y }); g.sfx('crash'); return; }
        if (x0 < a) falls.push({ x: x0, w: a - x0, y });
        if (x1 > b) falls.push({ x: b, w: x1 - b, y });
        g.sfx(b - a === w ? 'perfect' : 'cut');
        w = b - a; bar.x = a;
      } else g.sfx('perfect');
      rows.push({ x: bar.x, w });
      g.add(5 * rows.length * (W0 < 4 ? 2 : 1));
      if (rows.length >= H) { win = 1; g.add(500); g.sfx('win'); return; }
      launch();
    }

    return {
      repeat: {},
      update(dt) {
        if (ft.step(dt)) { falls.forEach(f => f.y++); falls = falls.filter(f => f.y < H); }
        if (fail) { fail += dt; if (fail > 1100) g.over(); return; }
        if (win) {
          win += dt;
          if (win > 1600) { win = 0; rows = []; w = W0; if (g.speed < 10) g.setSpeed(g.speed + 1); launch(); }
          return;
        }
        tk.ms = Math.max(26, STACK_MS[g.speed - 1] * (1 - .025 * rows.length));
        if (tk.step(dt)) {
          bar.x += bar.dir;
          if (bar.x <= 0) { bar.x = 0; bar.dir = 1; }
          if (bar.x + w >= W) { bar.x = W - w; bar.dir = -1; }
        }
      },
      press(btn) {
        if (fail || win || btn === 'left' || btn === 'right') return;
        lock();
      },
      draw() {
        rows.forEach((r, i) => hbar(g, r.x, H - 1 - i, r.w));
        falls.forEach(f => hbar(g, f.x, f.y, f.w, 2));
        if (!win && !fail) hbar(g, bar.x, H - 1 - rows.length, w);
        if (win && ((win / 160) | 0) % 2) g.f.fill(0);
      }
    };
  }
  function attractStacker(g, t) {
    [[3, 4], [3, 4], [4, 3], [4, 3], [4, 2], [4, 2]].forEach(([x, w], i) => hbar(g, x, 19 - i, w));
    const w = 2, x = tri(t, 1500, W - w);
    hbar(g, x, 13, w);
  }

  /* =====================================================================
   * 10. METEOR DODGE
   * ===================================================================== */
  const ROCK_MS = [260, 230, 200, 175, 150, 130, 112, 96, 82, 70];
  function dodge(g) {
    let px = 4, py = H - 2, rocks = [], gap = 3, passed = 0, dead = 0;
    const tk = Tick(ROCK_MS[g.speed - 1]);
    const hit = () => rocks.some(r => px >= r.x && px < r.x + 2 && py >= r.y && py < r.y + 2);
    const crash = () => { dead = 1; g.sfx('crash'); };

    return {
      repeat: { up: [150, 70], down: [150, 70], left: [150, 70], right: [150, 70] },
      update(dt) {
        if (dead) { dead += dt; if (dead > 1000) g.over(); return; }
        tk.ms = ROCK_MS[g.speed - 1];
        if (!tk.step(dt)) return;
        rocks.forEach(r => r.y++);
        if (--gap <= 0) {
          const x = g.rnd(W - 1);
          rocks.push({ x, y: -2 });
          if (g.level >= 4 && g.rnd(2)) {
            const x2 = g.rnd(W - 1);
            if (Math.abs(x2 - x) >= 3) rocks.push({ x: x2, y: -2 });
          }
          gap = 3 + g.rnd(Math.max(1, 6 - (g.level >> 1)));
        }
        rocks = rocks.filter(r => {
          if (r.y < H) return true;
          passed++; g.add(5);
          if (passed % 10 === 0 && g.speed < 10) { g.setSpeed(g.speed + 1); g.sfx('level'); }
          return false;
        });
        if (hit()) crash();
      },
      press(btn) {
        if (dead) return;
        if (btn === 'left' && px > 0) px--;
        else if (btn === 'right' && px < W - 1) px++;
        else if (btn === 'up' && py > 0) py--;
        else if (btn === 'down' && py < H - 1) py++;
        else return;
        if (hit()) crash();
      },
      draw() {
        rocks.forEach(r => { g.set(r.x, r.y); g.set(r.x + 1, r.y); g.set(r.x, r.y + 1); g.set(r.x + 1, r.y + 1); });
        if (!dead || ((dead / 100) | 0) % 2 === 0) g.set(px, py, 2);
      }
    };
  }
  function attractDodge(g, t) {
    [[1, 0], [5, 7], [8, 13]].forEach(([x, o]) => {
      const y = ((Math.floor(t / 90) + o * 2) % 26) - 3;
      g.set(x, y); g.set(x + 1, y); g.set(x, y + 1); g.set(x + 1, y + 1);
    });
    g.set(tri(t, 3000, 9), 18, 2);
  }

  /* ---------- the cartridge list (order = game number on the title screen) ---------- */
  window.BRICK_GAMES = [
    { id: 'tetris',   name: 'Brick Fall',     make: tetris,                       attract: attractTetris },
    { id: 'snake',    name: 'Snake',          make: g => snake(g, false),         attract: attractSnake },
    { id: 'racing',   name: 'Road Racer',   make: g => racing(g, 2),            attract: attractRacing },
    { id: 'tanks',    name: 'Tank Battle',    make: tanks,                        attract: attractTanks },
    { id: 'breakout', name: 'Brick Breaker',  make: breakout,                     attract: attractBreakout },
    { id: 'shooter',  name: 'Star Shooter',   make: shooter,                      attract: attractShooter },
    { id: 'frogger',  name: 'Hopper',         make: frogger,                      attract: attractFrogger },
    { id: 'pong',     name: 'Ping-Pong',      make: g => pong(g, false),          attract: attractPong },
    { id: 'stacker',  name: 'Block Tower',        make: stacker,                      attract: attractStacker },
    { id: 'dodge',    name: 'Meteor Dodge',   make: dodge,                        attract: attractDodge },
    { id: 'snake2',   name: 'Snake II (wrap)', make: g => snake(g, true),         attract: attractSnake },
    { id: 'squash',   name: 'Squash',         make: g => pong(g, true),           attract: attractSquash },
    { id: 'racing3',  name: 'Highway (3 lanes)', make: g => racing(g, 3),         attract: attractRacing3 }
  ];
})();
