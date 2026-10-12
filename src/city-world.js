// Shiftwise city — Canvas 2D isometric night renderer. Decorative only; never shows financial data.
// Static objects are cached as sprites at the current scale; vehicles, the wheel and lights draw live.
import {C, ISO, V, EDGE, ROAD, GRID, HALF, BLOCKS, DECK, METRO_Z, RAIL_X, STATION, METRO, FREIGHT, rng, roads, makeCity, makeTraffic, metroAt, metroLength, freightAt, carAt, isWater, zoneOf, blockMin} from './city-model.js';

const canvas = document.querySelector('#cityWorld');
const ctx = canvas && canvas.getContext('2d', {alpha: false});
if (ctx) start();

function start() {
  const INK = {bg: '#0f0f10', land: '#131314', road: '#0c0c0d', pad: '#161617', padEdge: '#2b2b2c', curb: '#202021', dash: '#3a3a3b',
    water: '#09090a', ripple: '#1a1a1c', quay: '#606062', top: '#1b1b1c', left: '#121213', right: '#0e0e0f', edge: '#6f6f71',
    soft: '#3c3c3e', lit: '#f4f4f2', dim: '#1e1e20', white: '#e9e9e7', whiteEdge: '#a9a9a9', tree: '#141415', treeEdge: '#8d8d8f'};
  const city = makeCity(), traffic = makeTraffic(), roadList = roads();
  let W = 1, H = 1, dpr = 1, S = 20, Sd = 20, OX = 0, OY = 0, lw = 1;
  let time = 24, last = null, frame = 0, dirty = true, lastView = '', clockShown = -1;
  let targetRes = 0, zoomSettle = 0, scaleKey = '', spritePixels = 0, now = 0;
  const SPRITE_LIMIT = 22e6;
  // Start just before the inbound metro reaches the station, so a train is in view at launch.

  // ---------- Drawing helpers (P maps world x,y,z -> pixel x,y) ----------
  const path = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
  const fillPoly = (g, pts, fill) => { g.beginPath(); path(g, pts); g.fillStyle = fill; g.fill(); };
  const line = (g, a, b) => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
  function box(g, P, x0, z0, x1, z1, y0, y1, o = {}) {
    const A = P(x0, y1, z0), B = P(x1, y1, z0), K = P(x1, y1, z1), D = P(x0, y1, z1), E = P(x0, y0, z1), F = P(x1, y0, z1), G = P(x1, y0, z0);
    fillPoly(g, [D, K, F, E], o.left || INK.left);
    fillPoly(g, [K, B, G, F], o.right || INK.right);
    fillPoly(g, [A, B, K, D], o.top || INK.top);
    if (o.edge === false) return;
    g.beginPath(); path(g, [A, B, G, F, E, D]); line(g, D, K); line(g, K, B); line(g, K, F);
    g.strokeStyle = o.edge || INK.edge; g.lineWidth = o.lw || lw; g.stroke();
  }
  // Quad on the visible left face (z = zf), u along X.
  const quadL = (g, P, zf, u0, u1, v0, v1) => path(g, [P(u0, v1, zf), P(u1, v1, zf), P(u1, v0, zf), P(u0, v0, zf)]);
  // Quad on the visible right face (x = xf), u along Z.
  const quadR = (g, P, xf, u0, u1, v0, v1) => path(g, [P(xf, v1, u0), P(xf, v1, u1), P(xf, v0, u1), P(xf, v0, u0)]);

  function tree(g, P, t, res) {
    const base = P(t.x, 0, t.z);
    g.strokeStyle = INK.treeEdge; g.lineWidth = lw;
    if (t.kind === 'palm') {
      const top = P(t.x + .12, t.h, t.z);
      g.beginPath(); g.moveTo(base[0], base[1]); g.quadraticCurveTo(base[0] - .05 * res, (base[1] + top[1]) / 2, top[0], top[1]); g.stroke();
      g.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, dx = Math.cos(a) * .55 * res, dy = Math.sin(a) * .28 * res;
        g.moveTo(top[0], top[1]); g.quadraticCurveTo(top[0] + dx * .6, top[1] + dy * .6 - .18 * res, top[0] + dx, top[1] + dy + .12 * res);
      }
      g.stroke(); return;
    }
    const mid = P(t.x, t.h * .42, t.z);
    g.beginPath(); line(g, base, mid); g.stroke();
    g.beginPath();
    if (t.kind === 'cone') {
      const top = P(t.x, t.h, t.z), b = P(t.x, t.h * .3, t.z), w = t.h * .24 * res;
      g.moveTo(top[0], top[1]); g.lineTo(b[0] + w, b[1]); g.quadraticCurveTo(b[0], b[1] + w * .45, b[0] - w, b[1]); g.closePath();
    } else {
      const c = P(t.x, t.h * .7, t.z); g.arc(c[0], c[1], t.h * .27 * res, 0, Math.PI * 2);
    }
    g.fillStyle = INK.tree; g.fill(); g.stroke();
  }

  // Facade windows. `lit` decides each window; unlit windows draw faintly for texture.
  function facade(g, P, b, face, colW, colStep, rowH, rowStep, lit, dimToo) {
    const litPath = new Path2D(), dimPath = new Path2D();
    const from = face === 'L' ? b.x0 : b.z0, to = face === 'L' ? b.x1 : b.z1, cols = Math.max(1, Math.floor((to - from - .2) / colStep));
    const pad = (to - from - cols * colStep + (colStep - colW)) / 2;
    for (let r = 0, y = .45; y + rowH < b.h - .25; r++, y += rowStep) for (let c = 0; c < cols; c++) {
      const u0 = from + pad + c * colStep, u1 = u0 + colW, target = lit(c, r, cols) ? litPath : dimToo ? dimPath : null;
      if (!target) continue;
      const pts = face === 'L' ? [P(u0, y + rowH, b.z1), P(u1, y + rowH, b.z1), P(u1, y, b.z1), P(u0, y, b.z1)] : [P(b.x1, y + rowH, u0), P(b.x1, y + rowH, u1), P(b.x1, y, u1), P(b.x1, y, u0)];
      target.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) target.lineTo(pts[i][0], pts[i][1]); target.closePath();
    }
    if (dimToo) { g.fillStyle = INK.dim; g.fill(dimPath); }
    g.fillStyle = INK.lit; g.fill(litPath);
  }

  function paintBuilding(g, P, b, res) {
    const r = rng(b.seed), {x0, z0, x1, z1, h} = b;
    if (b.style === 'kiosk') { box(g, P, x0, z0, x1, z1, 0, h, {top: INK.white, edge: INK.whiteEdge}); return; }
    // Plinth
    box(g, P, x0 - .12, z0 - .12, x1 + .12, z1 + .12, 0, .12, {top: '#18181a', edge: INK.soft});
    if (b.style === 'warehouse' || b.style === 'shed') {
      box(g, P, x0, z0, x1, z1, .12, h, b.whiteRoof ? {top: INK.white, edge: INK.whiteEdge} : {});
      g.beginPath();
      if (!b.whiteRoof) for (let x = x0 + .3; x < x1 - .1; x += .32) line(g, P(x, h, z0 + .05), P(x, h, z1 - .05));
      g.strokeStyle = INK.soft; g.lineWidth = lw * .8; g.stroke();
      if (b.style === 'warehouse') {
        const stripes = new Path2D(), top = h * .72;
        if (b.stripes) for (let x = x0 + .15; x < x1 - .1; x += .16) { const p = [P(x, top, z1), P(x + .07, top, z1), P(x + .07, .3, z1), P(x, .3, z1)]; stripes.moveTo(...p[0]); p.slice(1).forEach(q => stripes.lineTo(...q)); stripes.closePath(); }
        for (let z = z0 + .5; z < z1 - .6; z += 1.1) { const p = [P(x1, 1.0, z), P(x1, 1.0, z + .7), P(x1, .14, z + .7), P(x1, .14, z)]; stripes.moveTo(...p[0]); p.slice(1).forEach(q => stripes.lineTo(...q)); stripes.closePath(); }
        g.fillStyle = INK.lit; g.fill(stripes);
      } else {
        g.beginPath(); quadL(g, P, z1, x0 + .3, x0 + 1, .14, .8); g.fillStyle = '#2a2a2c'; g.fill();
      }
      return;
    }
    box(g, P, x0, z0, x1, z1, .12, h);
    if (b.style === 'tower') {
      const rate = .18 + r() * .32, rows = [];
      for (let i = 0; i < 60; i++) rows.push(r() < .7 ? 1 : r() < .5 ? 2.2 : .15);
      const stripeCol = r() < .35 ? Math.floor(r() * 4) : -1;
      const lit = (c, row, cols) => c === stripeCol || c === cols - 1 - stripeCol || r() < rate * rows[row % 60];
      facade(g, P, b, 'L', .16, .3, .2, .4, lit, true);
      facade(g, P, b, 'R', .16, .3, .2, .4, lit, true);
    } else if (b.style === 'office') {
      const rate = .3 + r() * .4;
      const lit = (c, row) => ((row * 13 + Math.floor(c / 3) * 7 + b.seed) % 10) / 10 < rate;
      facade(g, P, b, 'L', .3, .3, .12, .42, lit, true);
      facade(g, P, b, 'R', .3, .3, .12, .42, lit, true);
    } else {
      const rate = .2 + r() * .3;
      const lit = () => r() < rate;
      facade(g, P, b, 'L', .18, .44, .22, .52, lit, true);
      facade(g, P, b, 'R', .18, .44, .22, .52, lit, true);
    }
    // Roof: parapet inset, plant and (on tall buildings) a white crown band.
    g.beginPath(); path(g, [P(x0 + .14, h, z0 + .14), P(x1 - .14, h, z0 + .14), P(x1 - .14, h, z1 - .14), P(x0 + .14, h, z1 - .14)]);
    g.strokeStyle = INK.soft; g.lineWidth = lw * .8; g.stroke();
    if (x1 - x0 > 1.4 && z1 - z0 > 1.4) {
      const ux = x0 + .35 + r() * (x1 - x0 - 1.4), uz = z0 + .35 + r() * (z1 - z0 - 1.4);
      box(g, P, ux, uz, ux + .7, uz + .5, h, h + .35 + r() * .3);
      if (h > 6) { g.beginPath(); line(g, P(x1 - .4, h, z0 + .4), P(x1 - .4, h + 1.2, z0 + .4)); g.strokeStyle = INK.edge; g.stroke(); }
    }
    if (b.crown || h > 12) {
      g.beginPath(); quadL(g, P, z1, x0, x1, h - .22, h - .08); quadR(g, P, x1, z0, z1, h - .22, h - .08); g.fillStyle = INK.lit; g.fill();
    }
  }

  function paintGrove(g, P, gr, res) {
    if (gr.paths) {
      g.beginPath(); line(g, P(gr.x0, 0, gr.z0), P(gr.x1, 0, gr.z1)); line(g, P(gr.x1, 0, gr.z0), P(gr.x0, 0, gr.z1));
      g.strokeStyle = '#262628'; g.lineWidth = Math.max(1, .32 * res); g.stroke();
    }
    [...gr.trees].sort((a, b) => a.x + a.z - b.x - b.z).forEach(t => tree(g, P, t, res));
  }

  function paintYard(g, P, y) {
    for (const row of y.rows) for (const s of row.stacks) for (let k = 0; k < s.h; k++) {
      const white = s.tone > .82 && k === s.h - 1;
      box(g, P, s.x, row.z, s.x + 1.05, row.z + .45, k * .42, k * .42 + .4, white ? {top: INK.white, edge: INK.whiteEdge} : {top: s.tone > .5 ? '#202022' : '#18181a'});
    }
  }

  function paintCrane(g, P, c) {
    const x = c.x, legs = [[x - 1.2, 15.2], [x + 1.2, 15.2], [x - 1.2, 16.9], [x + 1.2, 16.9]];
    g.beginPath(); g.strokeStyle = INK.edge; g.lineWidth = lw * 1.2;
    for (const [lx, lz] of legs) line(g, P(lx, 0, lz), P(lx, 4.2, lz));
    line(g, P(x - 1.2, 4.2, 15.2), P(x - 1.2, 4.2, 22)); line(g, P(x + 1.2, 4.2, 15.2), P(x + 1.2, 4.2, 22));
    line(g, P(x - 1.2, 4.6, 14), P(x - 1.2, 4.6, 22)); line(g, P(x + 1.2, 4.6, 14), P(x + 1.2, 4.6, 22));
    for (let z = 14; z <= 22; z += 1) { line(g, P(x - 1.2, 4.2, z), P(x + 1.2, 4.2, z)); line(g, P(x - 1.2, 4.6, z), P(x - 1.2, 4.2, z + 1)); }
    line(g, P(x - 1.2, 2, 15.2), P(x + 1.2, 2, 16.9)); line(g, P(x + 1.2, 2, 15.2), P(x - 1.2, 2, 16.9));
    g.stroke();
    box(g, P, x - .45, 17.6, x + .45, 18.2, 3.6, 4.15, {top: INK.white, edge: INK.whiteEdge});
  }

  function paintShip(g, P, s) {
    box(g, P, s.x0, s.z0, s.x1, s.z1, 0, .7, {top: '#1c1c1e'});
    let k = 0;
    for (let x = s.x0 + 1.8; x < s.x1 - .4; x += 1.1) for (let z = s.z0 + .25; z < s.z1 - .4; z += .55, k++) {
      const h = 1 + (k * 7 % 3);
      for (let i = 0; i < h; i++) box(g, P, x, z, x + 1, z + .5, .7 + i * .38, 1.06 + i * .38, k % 5 === 0 && i === h - 1 ? {top: INK.white, edge: INK.whiteEdge} : {});
    }
    const bx = s.x0 + .3;
    box(g, P, bx, s.z0 + .3, bx + 1.2, s.z1 - .3, .7, 2.4);
    g.beginPath(); for (let y = 1.1; y < 2.3; y += .4) quadL(g, P, s.z1 - .3, bx + .15, bx + 1.05, y, y + .14); g.fillStyle = INK.lit; g.fill();
  }

  function paintPlaza(g, P, p, res) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    g.beginPath(); path(g, [P(p.x0, 0, p.z0), P(p.x1, 0, p.z0), P(p.x1, 0, p.z1), P(p.x0, 0, p.z1)]); g.fillStyle = '#19191b'; g.fill();
    g.beginPath();
    for (const r of [1.2, 2.2]) for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, q = P(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    g.strokeStyle = '#38383a'; g.lineWidth = lw; g.stroke();
  }

  // Elevated metro: deck segments and the station (split so trains sit between platform halves).
  function paintDeck(g, P, s) {
    const {x0, x1} = s, top = DECK, bot = DECK - .3;
    for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) {
      box(g, P, x - .2, -.22, x + .2, .22, 0, bot, {});
      box(g, P, x - .25, -.9, x + .25, .9, bot - .3, bot, {});
    }
    box(g, P, x0, -.86, x1, .86, bot, top, {top: '#19191b'});
    g.beginPath();
    for (const z of [-.5, -.26, .26, .5]) line(g, P(x0, top + .03, z), P(x1, top + .03, z));
    g.strokeStyle = '#8a8a8c'; g.lineWidth = lw * .9; g.stroke();
    g.beginPath(); line(g, P(x0, top + .25, .86), P(x1, top + .25, .86)); line(g, P(x0, top + .25, -.86), P(x1, top + .25, -.86));
    for (let x = x0; x <= x1 + .01; x += .5) { line(g, P(x, top, .86), P(x, top + .25, .86)); }
    g.strokeStyle = INK.soft; g.lineWidth = lw * .7; g.stroke();
  }
  function paintStation(g, P, side) {
    const {x0, x1} = STATION, z0 = side < 0 ? -1.75 : .86, z1 = side < 0 ? -.86 : 1.75, top = DECK + .12;
    box(g, P, x0, z0, x1, z1, DECK - .45, top, {top: '#222224'});
    g.beginPath(); for (let x = x0 + .4; x < x1; x += .8) { const zz = side < 0 ? z0 + .2 : z1 - .2; line(g, P(x, top, zz), P(x, top + 1.3, zz)); }
    g.strokeStyle = INK.edge; g.lineWidth = lw; g.stroke();
    box(g, P, x0 - .1, z0 - .05, x1 + .1, z1 + .05, top + 1.3, top + 1.42, {top: INK.white, edge: INK.whiteEdge});
    g.beginPath(); quadL(g, P, z1 + .05, x0 + .3, x1 - .3, top + 1.31, top + 1.36); g.fillStyle = INK.lit; g.fill();
  }

  // ---------- Static items (sprites) ----------
  const statics = [];
  function item(b, key, paint) {
    const [x0, z0, x1, z1, y0, y1] = b;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [y0, y1]) {
      const u = (x - z) * C, v = (x + z) * ISO - y * V;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const pad = .35;
    statics.push({key, paint, u0: u0 - pad, u1: u1 + pad, v0: v0 - pad, v1: v1 + pad, spr: null, res: 0, used: 0});
  }
  for (const b of city.buildings) item([b.x0 - .15, b.z0 - .15, b.x1 + .15, b.z1 + .15, 0, b.h + 1.6], (b.x0 + b.x1 + b.z0 + b.z1) / 2, (g, P, res) => paintBuilding(g, P, b, res));
  for (const gr of city.groves) item([gr.x0, gr.z0, gr.x1, gr.z1, 0, 2], (gr.x0 + gr.x1 + gr.z0 + gr.z1) / 2, (g, P, res) => paintGrove(g, P, gr, res));
  for (const y of city.yards) item([y.x0, y.z0, y.x1, y.z1, 0, 1.4], (y.x0 + y.x1 + y.z0 + y.z1) / 2, (g, P) => paintYard(g, P, y));
  for (const c of city.cranes) item([c.x - 1.5, 13.8, c.x + 1.5, 22.2, 0, 4.8], c.x + 17, (g, P) => paintCrane(g, P, c));
  for (const p of city.plazas) item([p.x0, p.z0, p.x1, p.z1, 0, .1], (p.x0 + p.z0) - 1, (g, P, res) => paintPlaza(g, P, p, res));
  for (const t of city.palms) item([t.x - .7, t.z - .7, t.x + .7, t.z + .7, 0, t.h + .4], t.x + t.z, (g, P, res) => tree(g, P, {...t, kind: 'palm'}, res));
  const ships = [{x0: -36, z0: 18.6, x1: -24, z1: 20.4}, {x0: -21, z0: 18.6, x1: -12.5, z1: 20.2}];
  for (const s of ships) item([s.x0, s.z0, s.x1, s.z1, 0, 2.6], (s.x0 + s.x1) / 2 + s.z0, (g, P) => paintShip(g, P, s));
  for (let x = -EDGE; x < EDGE; x += 2) {
    const x1 = x + 2, s = {x0: x, x1};
    item([x, -.9, x1, .9, 0, DECK + .3], x + 1, (g, P) => paintDeck(g, P, s));
  }
  item([STATION.x0 - .2, -1.8, STATION.x1 + .2, -.86, DECK - .5, DECK + 1.6], (STATION.x0 + STATION.x1) / 2 - 1.4, (g, P) => paintStation(g, P, -1));
  item([STATION.x0 - .2, .86, STATION.x1 + .2, 1.8, DECK - .5, DECK + 1.6], (STATION.x0 + STATION.x1) / 2 + 1.4, (g, P) => paintStation(g, P, 1));
  const beacons = city.buildings.filter(b => b.h > 11).map((b, i) => ({x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: b.h + .5, phase: i * .73}));

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function buildSprite(it, res) {
    let r = res, w = Math.ceil((it.u1 - it.u0) * r), h = Math.ceil((it.v1 - it.v0) * r);
    const maxSide = 4096; if (w > maxSide || h > maxSide) { r *= maxSide / Math.max(w, h); w = Math.ceil((it.u1 - it.u0) * r); h = Math.ceil((it.v1 - it.v0) * r); }
    const cv = it.spr && it.spr.width === w && it.spr.height === h ? it.spr : makeCanvas(Math.max(1, w), Math.max(1, h));
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.lineJoin = 'round';
    const P = (x, y, z) => [((x - z) * C - it.u0) * r, ((x + z) * ISO - y * V - it.v0) * r];
    const keep = lw; lw = Math.min(2.2, Math.max(.75, r * .034));
    it.paint(g, P, r);
    lw = keep;
    if (it.spr !== cv) { spritePixels -= it.spr ? it.spr.width * it.spr.height : 0; spritePixels += cv.width * cv.height; }
    it.spr = cv; it.res = res;
  }

  // ---------- Live items ----------
  function paintTrainCar(g, P, x0, x1, z, y, lead, dir, white) {
    const zh = .31, h = .66;
    box(g, P, x0, z - zh, x1, z + zh, y, y + h, {top: white ? '#e6e6e4' : '#2a2a2c', left: '#161618', right: '#121214', edge: white ? '#bdbdbd' : INK.edge});
    g.beginPath();
    for (let x = x0 + .18; x < x1 - .25; x += .34) quadL(g, P, z + zh, x, x + .22, y + .3, y + .52);
    if (lead && dir > 0) quadR(g, P, x1, z - zh + .08, z + zh - .08, y + .32, y + .56);
    g.fillStyle = INK.lit; g.fill();
  }
  function paintFreightCar(g, P, z0, z1, x, lead) {
    box(g, P, x - .34, z0, x + .34, z1, .12, .8, {top: '#202022'});
    g.beginPath(); quadR(g, P, x + .34, z0 + .1, z1 - .1, .62, .7); if (lead) quadL(g, P, z1, x - .2, x + .2, .45, .62); g.fillStyle = INK.lit; g.fill();
  }
  function paintCar(g, P, p, car) {
    const along = car.lane.axis === 'x', fwd = car.lane.dir, L = .36, Wd = .17;
    const [x0, x1, z0, z1] = along ? [p.x - L, p.x + L, p.z - Wd, p.z + Wd] : [p.x - Wd, p.x + Wd, p.z - L, p.z + L];
    box(g, P, x0, z0, x1, z1, .06, .26, {top: car.tone > .75 ? '#cfcfcd' : '#262628', edge: '#77777a'});
    if (along) box(g, P, x0 + .16, z0 + .02, x1 - .2, z1 - .02, .26, .4, {top: '#1c1c1e', edge: '#5a5a5c'}); else box(g, P, x0 + .02, z0 + .16, x1 - .02, z1 - .2, .26, .4, {top: '#1c1c1e', edge: '#5a5a5c'});
    g.beginPath();
    // Lights on the visible end: headlights if moving toward the viewer, tail lights otherwise.
    if (along) { quadR(g, P, x1, z0 + .03, z0 + .1, .14, .2); quadR(g, P, x1, z1 - .1, z1 - .03, .14, .2); }
    else { quadL(g, P, z1, x0 + .03, x0 + .1, .14, .2); quadL(g, P, z1, x1 - .1, x1 - .03, .14, .2); }
    g.fillStyle = fwd > 0 ? INK.lit : '#77777a'; g.fill();
  }
  function paintBoat(g, P, b) {
    box(g, P, b.x - .8, b.z - .25, b.x + .8, b.z + .25, 0, .28, {top: '#232325'});
    box(g, P, b.x - .3, b.z - .16, b.x + .25, b.z + .16, .28, .58, {top: INK.white, edge: INK.whiteEdge});
  }
  function paintWheel(g, P, t) {
    const cx = -4, cz = 4.6, hub = 3.9, R = 3.1, n = 18, rot = t * .1;
    g.lineWidth = lw; g.strokeStyle = INK.edge; g.beginPath();
    for (const dz of [-.3, .3]) { line(g, P(cx, hub, cz + dz), P(cx - 1.6, 0, cz + dz * 2.2)); line(g, P(cx, hub, cz + dz), P(cx + 1.6, 0, cz + dz * 2.2)); }
    g.stroke();
    g.beginPath(); g.strokeStyle = '#9a9a9c';
    for (const dz of [-.22, .22]) for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, q = P(cx + Math.cos(a) * R, hub + Math.sin(a) * R, cz + dz); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; line(g, P(cx, hub, cz), P(cx + Math.cos(a) * R, hub + Math.sin(a) * R, cz)); }
    g.stroke();
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * Math.PI * 2, gx = cx + Math.cos(a) * R, gy = hub + Math.sin(a) * R;
      box(g, P, gx - .14, cz - .14, gx + .14, cz + .14, gy - .42, gy - .16, {top: i % 3 ? '#2a2a2c' : INK.white, edge: '#8a8a8c', lw: lw * .8});
    }
    const h = P(cx, hub, cz); g.beginPath(); g.arc(h[0], h[1], Math.max(1.5, .12 * Sd), 0, Math.PI * 2); g.fillStyle = INK.lit; g.fill();
  }

  // ---------- Ground (drawn live: a few large paths) ----------
  function drawGround(P) {
    ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const E = EDGE;
    fillPoly(ctx, [P(-E, 0, -E), P(E, 0, -E), P(E, 0, E), P(-E, 0, E)], INK.road);
    // Block pads
    const pads = new Path2D(), curbs = new Path2D();
    const add = (p, pts) => { p.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) p.lineTo(...pts[i]); p.closePath(); };
    for (let bx = 0; bx < BLOCKS; bx++) for (let bz = 0; bz < BLOCKS; bz++) {
      if (zoneOf(bx, bz) === 'water') continue;
      const x0 = blockMin(bx) + ROAD, z0 = blockMin(bz) + ROAD, x1 = blockMin(bx) + GRID - ROAD, z1 = blockMin(bz) + GRID - ROAD;
      add(pads, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)]);
      add(curbs, [P(x0 + .35, 0, z0 + .35), P(x1 - .35, 0, z0 + .35), P(x1 - .35, 0, z1 - .35), P(x0 + .35, 0, z1 - .35)]);
    }
    ctx.fillStyle = INK.pad; ctx.fill(pads); ctx.strokeStyle = INK.padEdge; ctx.lineWidth = lw; ctx.stroke(pads);
    ctx.strokeStyle = INK.curb; ctx.lineWidth = lw * .8; ctx.stroke(curbs);
    // Water
    const wx = -8 - ROAD, wz = 16 + ROAD;
    fillPoly(ctx, [P(-E, 0, wz), P(wx, 0, wz), P(wx, 0, E), P(-E, 0, E)], INK.water);
    ctx.beginPath(); line(ctx, P(-E, 0, wz), P(wx, 0, wz)); line(ctx, P(wx, 0, wz), P(wx, 0, E)); ctx.strokeStyle = INK.quay; ctx.lineWidth = lw * 1.2; ctx.stroke();
    ctx.beginPath(); const rr = rng(5);
    for (let i = 0; i < 70; i++) { const x = -E + rr() * (E - 10), z = wz + .6 + rr() * (E - wz - 1), l = .4 + rr() * 1.4; line(ctx, P(x, 0, z), P(x + l, 0, z)); }
    ctx.strokeStyle = INK.ripple; ctx.lineWidth = lw; ctx.stroke();
    // Piers
    for (const x of [-30, -18]) { box(ctx, P, x, wz, x + .8, wz + 4.5, -.05, .08, {top: '#1a1a1c', edge: INK.soft}); }
    // Lane dashes
    ctx.beginPath();
    for (const r of roadList) {
      if (r.metro) continue;
      if (r.axis === 'x') line(ctx, P(r.from, 0, r.at), P(r.to, 0, r.at)); else line(ctx, P(r.at, 0, r.from), P(r.at, 0, r.to));
    }
    ctx.setLineDash([.45 * Sd, .55 * Sd]); ctx.strokeStyle = INK.dash; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
    // Crosswalk ticks at intersections
    ctx.beginPath();
    for (let i = 0; i <= BLOCKS; i++) for (let k = 0; k <= BLOCKS; k++) {
      const x = -HALF + GRID * i, z = -HALF + GRID * k; if (isWater(x, z) || x === RAIL_X) continue;
      for (let s = -.6; s <= .61; s += .24) { line(ctx, P(x + s, 0, z - 1.25), P(x + s, 0, z - 1.0)); line(ctx, P(x - 1.25, 0, z + s), P(x - 1.0, 0, z + s)); }
    }
    ctx.strokeStyle = '#2c2c2e'; ctx.lineWidth = lw; ctx.stroke();
    // Rail corridor: ballast, sleepers (dashed thick line) and rails.
    fillPoly(ctx, [P(RAIL_X - ROAD, 0, -E), P(RAIL_X + ROAD, 0, -E), P(RAIL_X + ROAD, 0, E), P(RAIL_X - ROAD, 0, E)], '#141416');
    ctx.beginPath(); for (const x of [RAIL_X - .4, RAIL_X + .4]) line(ctx, P(x, 0, -E), P(x, 0, E));
    ctx.setLineDash([.08 * Sd, .22 * Sd]); ctx.strokeStyle = '#2b2b2d'; ctx.lineWidth = .55 * Sd * .5; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); for (const x of [RAIL_X - .55, RAIL_X - .25, RAIL_X + .25, RAIL_X + .55]) line(ctx, P(x, 0, -E), P(x, 0, E));
    ctx.strokeStyle = '#6a6a6c'; ctx.lineWidth = lw * .8; ctx.stroke();
    // Metro shadow on its avenue
    fillPoly(ctx, [P(-E, 0, -.75), P(E, 0, -.75), P(E, 0, .75), P(-E, 0, .75)], '#09090a');
  }

  // ---------- Frame ----------
  function viewport() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    dirty = true;
  }
  function baseScale() { return Math.max(9, Math.min(24, (W / (2 * C) + H) / 86)); }
  function zoom() { return typeof cityZoom === 'number' ? cityZoom / .86 : 1; }
  function clampPan() {
    if (typeof cityPanX !== 'number') return;
    const mx = Math.max(0, (HALF - 8) * C * S - W / 2), my = Math.max(0, (HALF - 8) * ISO * S - H / 2);
    cityPanX = Math.max(-mx, Math.min(mx, cityPanX)); cityPanY = Math.max(-my, Math.min(my, cityPanY));
  }
  const paused = () => (typeof cityPaused !== 'undefined' && cityPaused) || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const focused = () => !!(document.body && document.body.classList && document.body.classList.contains('city-focus'));

  function draw(budgetEnd) {
    S = baseScale() * zoom(); Sd = S * dpr; lw = Math.min(2.2, Math.max(.75, Sd * .034));
    clampPan();
    const panX = (typeof cityPanX === 'number' ? cityPanX : 0) * dpr, panY = (typeof cityPanY === 'number' ? cityPanY : 0) * dpr;
    const focus = [3.5, 1.2]; // world point near the station that sits at screen centre
    OX = canvas.width / 2 + panX - (focus[0] - focus[1]) * C * Sd;
    OY = canvas.height * .5 + panY - (focus[0] + focus[1]) * ISO * Sd;
    const P = (x, y, z) => [OX + (x - z) * C * Sd, OY + ((x + z) * ISO - y * V) * Sd];
    ctx.lineJoin = 'round';
    drawGround(P);

    // Live items for this frame
    const live = [];
    for (const car of traffic) {
      const p = carAt(car, time); if (isWater(p.x, p.z)) continue;
      const q = P(p.x, 0, p.z); if (q[0] < -Sd || q[0] > canvas.width + Sd || q[1] < -Sd || q[1] > canvas.height + Sd) continue;
      live.push({key: p.x + p.z, draw: () => paintCar(ctx, P, p, car)});
    }
    const len = metroLength(), services = [];
    for (const [dir, phase, z] of [[1, 0, .38], [-1, 23, -.38]]) {
      const m = metroAt(time, dir, phase); services.push({...m, dir, z});
      for (let k = 0; k < METRO.cars; k++) {
        const lead = dir > 0 ? m.front - k * (METRO.car + METRO.gap) : m.front + k * (METRO.car + METRO.gap);
        const x0 = dir > 0 ? lead - METRO.car : lead, x1 = x0 + METRO.car;
        if (x1 < -EDGE - 2 || x0 > EDGE + 2) continue;
        live.push({key: (x0 + x1) / 2 + 2.3, draw: () => paintTrainCar(ctx, P, x0, x1, z, DECK + .05, k === 0, dir, true)});
      }
    }
    const fr = freightAt(time);
    for (let k = 0; k < FREIGHT.cars; k++) {
      const lead = fr.dir > 0 ? fr.front - k * (FREIGHT.car + FREIGHT.gap) : fr.front + k * (FREIGHT.car + FREIGHT.gap);
      const z0 = fr.dir > 0 ? lead - FREIGHT.car : lead, z1 = z0 + FREIGHT.car;
      if (z1 < -EDGE - 2 || z0 > EDGE + 2) continue;
      live.push({key: RAIL_X + (z0 + z1) / 2, draw: () => paintFreightCar(ctx, P, z0, z1, RAIL_X - .4 * fr.dir, k === 0 && fr.dir > 0)});
    }
    for (const [i, z] of [[0, 23.5], [1, 28], [2, 33]]) {
      const span = 30, u = (time * .045 + i * .37) % 2, x = -44 + (u < 1 ? u : 2 - u) * span;
      live.push({key: x + z, draw: () => paintBoat(ctx, P, {x, z})});
    }
    live.push({key: -4 + 4.6, draw: () => paintWheel(ctx, P, time)});

    // Sprites: rebuild at the settled scale within a time budget; draw old sprites scaled meanwhile.
    const all = statics.concat(live).sort((a, b) => a.key - b.key);
    const cw = canvas.width, ch = canvas.height;
    let pending = false;
    for (const it of all) {
      if (it.draw) { it.draw(); continue; }
      const sx0 = OX + it.u0 * Sd, sx1 = OX + it.u1 * Sd, sy0 = OY + it.v0 * Sd, sy1 = OY + it.v1 * Sd;
      if (sx1 < 0 || sx0 > cw || sy1 < 0 || sy0 > ch) continue;
      if (!it.spr || (it.res !== targetRes && targetRes)) {
        if (!it.spr || performance.now() < budgetEnd) buildSprite(it, targetRes || Sd); else pending = true;
      }
      it.used = now;
      ctx.drawImage(it.spr, sx0, sy0, sx1 - sx0, sy1 - sy0);
    }
    if (spritePixels > SPRITE_LIMIT) for (const it of statics) if (it.spr && it.used < now - 3000) { spritePixels -= it.spr.width * it.spr.height; it.spr = null; }

    // Aircraft-warning beacons on the tallest towers.
    ctx.fillStyle = INK.lit;
    for (const b of beacons) {
      const on = (Math.sin(time * 2.4 + b.phase * 5) + 1) / 2; if (on < .35) continue;
      const p = P(b.x, b.y, b.z); ctx.globalAlpha = on; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.2, .07 * Sd), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating tag on the inbound train, shown only when the city itself is in focus.
    if (focused()) {
      const m = services[0], mid = m.front - len / 2;
      if (mid > -EDGE && mid < EDGE) {
        const kmh = Math.round(m.speed * 12), text = m.state === 'doors open' ? `M1 · AT ${STATION.name.toUpperCase()} · DOORS OPEN` : `M1 · TO HARBOR · ${kmh} KM/H`;
        const a = P(mid, DECK + 1, .38), fs = Math.round(10 * dpr);
        ctx.font = `${fs}px "Shiftwise Mono", ui-monospace, monospace`;
        const tw = ctx.measureText(text).width, bx = a[0] - tw / 2 - 8 * dpr, by = a[1] - 40 * dpr;
        ctx.strokeStyle = '#d8d8d6'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], by + 22 * dpr); ctx.stroke();
        ctx.fillStyle = '#0d0d0eee'; ctx.fillRect(bx, by, tw + 16 * dpr, 22 * dpr); ctx.strokeRect(bx + .5, by + .5, tw + 16 * dpr - 1, 22 * dpr - 1);
        ctx.fillStyle = '#f2f2f0'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 8 * dpr, by + 11 * dpr + .5);
      }
    }
    return pending;
  }

  function updateClock() {
    const s = Math.floor(time); if (s === clockShown) return; clockShown = s;
    const el = document.querySelector('#cityClock'); if (!el) return;
    el.textContent = `Fig 1 · ${String(Math.floor(s / 60) % 100).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · night`;
  }

  function tick(t) {
    frame = 0; now = t;
    if (document.hidden) { last = null; return; }
    const stop = paused();
    if (last !== null && !stop) time += Math.min((t - last) / 1000, .05);
    last = t;
    const z = typeof cityZoom === 'number' ? cityZoom : 1, view = [z, typeof cityPanX === 'number' ? cityPanX : 0, typeof cityPanY === 'number' ? cityPanY : 0, W, H].join(), sk = [z, W, H, dpr].join();
    if (view !== lastView) { dirty = true; lastView = view; }
    if (sk !== scaleKey) { if (scaleKey) zoomSettle = t + 220; else targetRes = baseScale() * zoom() * dpr; scaleKey = sk; }
    if (zoomSettle && t >= zoomSettle) { zoomSettle = 0; targetRes = baseScale() * zoom() * dpr; dirty = true; }
    if (!stop || dirty) {
      dirty = draw(performance.now() + 7);
      updateClock();
    }
    frame = requestAnimationFrame(tick);
  }

  // ---------- Interaction (only while the city is in focus) ----------
  const pointers = new Map(); let pinch = null;
  function zoomAt(qx, qy, next) {
    if (typeof cityZoom !== 'number') return;
    const z = Math.max(.55, Math.min(2.2, next)), k = z / cityZoom;
    const cx = qx - W / 2, cy = qy - H / 2;
    cityPanX = cx - (cx - cityPanX) * k; cityPanY = cy - (cy - cityPanY) * k; cityZoom = z;
    document.documentElement.style.setProperty('--city-zoom', z); dirty = true;
  }
  canvas.addEventListener('pointerdown', e => {
    if (!focused()) return;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = {d: Math.hypot(a.x - b.x, a.y - b.y), z: cityZoom}; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (pointers.size === 1) { cityPanX += e.clientX - p.x; cityPanY += e.clientY - p.y; dirty = true; }
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = canvas.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.z * d / Math.max(1, pinch.d));
    }
  });
  for (const n of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(n, e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; });
  canvas.addEventListener('wheel', e => {
    if (!focused()) return; e.preventDefault();
    const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, cityZoom * Math.exp(-e.deltaY * .0015));
  }, {passive: false});
  document.addEventListener('click', () => { dirty = true; });
  window.addEventListener('resize', viewport);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !frame) { last = null; dirty = true; frame = requestAnimationFrame(tick); } });
  viewport();
  frame = requestAnimationFrame(tick);
}
