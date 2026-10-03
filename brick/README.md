# Brick Game

A rebuild of the 1990s "9999 in 1" pocket brick handheld. Plain HTML/CSS/JS, no build step,
installable as an offline PWA. Lives at `/brick/`.

| file | what it is |
| --- | --- |
| `index.html`, `brick.css` | the device shell (fixed 360×760 portrait box / 800×380 landscape box, scaled to fit) |
| `engine.js` | the console: LCD renderer (cells + 7-segment digits), sound, input, power/menu/pause/game-over |
| `games.js` | the cartridges (each draws into the same 10×20 grid) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | offline + install-to-home-screen |

## Adding a game

Append to `window.BRICK_GAMES` at the bottom of `games.js`:

```js
{ id: 'mygame', name: 'My Game', make: g => ({
    update(dt) { /* advance state; call g.over() when dead */ },
    press(btn, isRepeat) { /* 'left' 'right' 'up' 'down' 'rotate' */ },
    draw() { g.set(x, y, 1); /* 1 = lit, 2 = blinking */ },
    repeat: { left: [160, 55] }          // optional: [delay, rate] auto-repeat while held
  }), attract(g, t) { /* title-screen animation at time t ms */ } }
```

The game number on the title screen is its position in the list. `g` also gives you
`g.add(points)`, `g.speed`/`g.level` (chosen on the title screen), `g.setSpeed(n)`,
`g.lives(n)`, `g.rnd(n)`, `g.held(btn)` and `g.sfx(name)` - see the header of `games.js`.

High scores, sound, last selection and LCD tint are saved in `localStorage` (`brick.*`).
When you change any file, bump `VERSION` in `sw.js` so installed copies refresh.

## Credits

- The glossy epoxy chip visible through the **Clear** shell (embedded in `pcb.svg`) is cropped from the public-domain (CC0) photograph "MARIO CHIP 1 COB.jpg" by Furrtek on Wikimedia Commons. Only the black epoxy blob is used; the rest of the board, parts and silkscreen in `pcb.svg` are drawn for this project.
- Orbitron (Self-hosted, SIL Open Font License 1.1): `fonts/OFL-orbitron.txt`.
