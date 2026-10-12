// Shiftwise city — Canvas 2D isometric night renderer in thin grey line art. Decorative only; never shows financial data.
// Static objects are cached as sprites at the current scale; vehicles, trains, the windmill and lights draw live.
import {C, ISO, V, EDGE, ROAD, GRID, HALF, BLOCKS, DECK, RAIL_X, STOPS, METRO, FREIGHT, GORGE, WORLD, rng, roads, makeCity, makeTraffic, metroAt, metroCycle, metroLength, freightAt, carAt, isWater, zoneOf, blockMin, rimX} from './city-model.js';

const canvas = document.querySelector('#cityWorld');
const ctx = canvas && canvas.getContext('2d', {alpha: false});
if (ctx) start();

function start() {
  // Palette sampled to match the reference look: near-black ground, charcoal faces, mid-grey hairlines, sparse white light.
  const INK = {bg: '#0b0c0f', land: '#151619', road: '#121316', pad: '#161618', padEdge: '#25262a', dash: '#2f3034',
    water: '#0b0c0f', ripple: '#16171b', quay: '#3a3b40', top: '#141416', left: '#121214', right: '#0f1012', edge: '#45464b',
    soft: '#2a2b2f', faint: '#1d1e22', lit: '#e7e7e3', litSoft: '#a9aaac', dim: '#1b1c1f', white: '#e2e2df', whiteEdge: '#9c9da0',
    tree: '#131416', treeEdge: '#55565c', field: '#17181b', furrow: '#27282d', track: '#2c2d31', gorge: '#08090b', cliff: '#0f1013', strata: '#24252a'};
  const city = makeCity(), traffic = makeTraffic(), roadList = roads();
  let W = 1, H = 1, dpr = 1, S = 16, Sd = 16, OX = 0, OY = 0, lw = 1;
  let time = 30, last = null, frame = 0, dirty = true, lastView = '', clockShown = -1;
  let targetRes = 0, zoomSettle = 0, scaleKey = '', spritePixels = 0, now = 0;
  const SPRITE_LIMIT = 22e6;

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
  const quadL = (g, P, zf, u0, u1, v0, v1) => path(g, [P(u0, v1, zf), P(u1, v1, zf), P(u1, v0, zf), P(u0, v0, zf)]);
  const quadR = (g, P, xf, u0, u1, v0, v1) => path(g, [P(xf, v1, u0), P(xf, v1, u1), P(xf, v0, u1), P(xf, v0, u0)]);

  function tree(g, P, t, res) {
    const base = P(t.x, 0, t.z);
    g.strokeStyle = INK.treeEdge; g.lineWidth = lw * .85;
    if (t.kind === 'palm') {
      const top = P(t.x + .1, t.h, t.z - .05);
      g.beginPath(); g.moveTo(base[0], base[1]); g.quadraticCurveTo(base[0] - .06 * res, (base[1] + top[1]) / 2, top[0], top[1]); g.stroke();
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + .3, dx = Math.cos(a) * .5 * res, dy = Math.sin(a) * .22 * res;
        g.moveTo(top[0], top[1]); g.quadraticCurveTo(top[0] + dx * .55, top[1] + dy * .55 - .16 * res, top[0] + dx, top[1] + dy + .14 * res);
      }
      g.stroke(); return;
    }
    const mid = P(t.x, t.h * .4, t.z);
    g.beginPath(); line(g, base, mid); g.stroke();
    g.beginPath();
    if (t.kind === 'cone') {
      const top = P(t.x, t.h, t.z), b = P(t.x, t.h * .32, t.z), w = t.h * .22 * res;
      g.moveTo(top[0], top[1]); g.lineTo(b[0] + w, b[1]); g.quadraticCurveTo(b[0], b[1] + w * .4, b[0] - w, b[1]); g.closePath();
    } else {
      const c = P(t.x, t.h * .7, t.z); g.arc(c[0], c[1], t.h * .25 * res, 0, Math.PI * 2);
    }
    g.fillStyle = INK.tree; g.fill(); g.stroke();
  }

  // Facade windows on the two visible faces. `lit` picks each window; others draw faintly.
  function facade(g, P, b, face, colW, colStep, rowH, rowStep, lit, y0 = .4, color = INK.lit) {
    const litPath = new Path2D(), dimPath = new Path2D();
    const from = face === 'L' ? b.x0 : b.z0, to = face === 'L' ? b.x1 : b.z1, cols = Math.max(1, Math.floor((to - from - .2) / colStep));
    const pad = (to - from - cols * colStep + (colStep - colW)) / 2;
    for (let r = 0, y = y0; y + rowH < b.h - .2; r++, y += rowStep) for (let c = 0; c < cols; c++) {
      const u0 = from + pad + c * colStep, u1 = u0 + colW, target = lit(c, r, cols) ? litPath : dimPath;
      const pts = face === 'L' ? [P(u0, y + rowH, b.z1), P(u1, y + rowH, b.z1), P(u1, y, b.z1), P(u0, y, b.z1)] : [P(b.x1, y + rowH, u0), P(b.x1, y + rowH, u1), P(b.x1, y, u1), P(b.x1, y, u0)];
      target.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) target.lineTo(pts[i][0], pts[i][1]); target.closePath();
    }
    g.fillStyle = INK.dim; g.fill(dimPath);
    g.fillStyle = color; g.fill(litPath);
  }
  function floorLines(g, P, b, step) {
    g.beginPath();
    for (let y = step; y < b.h - .1; y += step) { line(g, P(b.x0, y, b.z1), P(b.x1, y, b.z1)); line(g, P(b.x1, y, b.z1), P(b.x1, y, b.z0)); }
    g.strokeStyle = INK.soft; g.lineWidth = lw * .7; g.stroke();
  }
  function roofDetail(g, P, b, r) {
    const {x0, z0, x1, z1, h} = b;
    g.beginPath(); path(g, [P(x0 + .14, h, z0 + .14), P(x1 - .14, h, z0 + .14), P(x1 - .14, h, z1 - .14), P(x0 + .14, h, z1 - .14)]);
    g.strokeStyle = INK.soft; g.lineWidth = lw * .7; g.stroke();
    if (x1 - x0 > 1.6 && z1 - z0 > 1.6) {
      const ux = x0 + .4 + r() * (x1 - x0 - 1.6), uz = z0 + .4 + r() * (z1 - z0 - 1.6);
      box(g, P, ux, uz, ux + .8, uz + .55, h, h + .3 + r() * .25);
      if (r() < .5) { const vx = x0 + .3 + r() * (x1 - x0 - 1), vz = z0 + .3 + r() * (z1 - z0 - 1); box(g, P, vx, vz, vx + .45, vz + .45, h, h + .2); }
    }
  }
  function gable(g, P, b, roofH, roofTop) {
    const {x0, z0, x1, z1, h} = b, top = h + roofH;
    if (b.ridge === 'x') {
      const zm = (z0 + z1) / 2;
      fillPoly(g, [P(x0, h, z0), P(x1, h, z0), P(x1, top, zm), P(x0, top, zm)], '#18191c');
      fillPoly(g, [P(x1, h, z0), P(x1, top, zm), P(x1, h, z1)], INK.right); // gable end
      fillPoly(g, [P(x0, h, z1), P(x1, h, z1), P(x1, top, zm), P(x0, top, zm)], roofTop);
      g.beginPath(); path(g, [P(x0, h, z1), P(x1, h, z1), P(x1, top, zm), P(x0, top, zm)]); line(g, P(x1, h, z0), P(x1, top, zm));
      line(g, P(x0, top, zm), P(x0, h, z0)); line(g, P(x0, h, z0), P(x1, h, z0));
    } else {
      const xm = (x0 + x1) / 2;
      fillPoly(g, [P(x0, h, z0), P(x0, h, z1), P(xm, top, z1), P(xm, top, z0)], '#18191c');
      fillPoly(g, [P(x0, h, z1), P(xm, top, z1), P(x1, h, z1)], INK.left);
      fillPoly(g, [P(x1, h, z0), P(x1, h, z1), P(xm, top, z1), P(xm, top, z0)], roofTop);
      g.beginPath(); path(g, [P(x1, h, z0), P(x1, h, z1), P(xm, top, z1), P(xm, top, z0)]); line(g, P(x0, h, z1), P(xm, top, z1));
      line(g, P(xm, top, z0), P(x0, h, z0)); line(g, P(x0, h, z0), P(x1, h, z0));
    }
    g.strokeStyle = INK.edge; g.lineWidth = lw; g.stroke();
  }
  function cylinder(g, P, cx, cz, rad, y0, y1, res) {
    const a = P(cx, y0, cz), b = P(cx, y1, cz), rx = rad * C * 2 * res / 2 * 1.15, ry = rx * .58;
    g.beginPath(); g.moveTo(a[0] - rx, b[1]); g.lineTo(a[0] - rx, a[1]); g.ellipse(a[0], a[1], rx, ry, 0, Math.PI, 0, true); g.lineTo(a[0] + rx, b[1]); g.closePath();
    g.fillStyle = INK.left; g.fill(); g.strokeStyle = INK.edge; g.lineWidth = lw; g.stroke();
    g.beginPath(); for (let y = y0 + .6; y < y1; y += .6) { const q = P(cx, y, cz); g.moveTo(q[0] + rx, q[1]); g.ellipse(q[0], q[1], rx, ry, 0, 0, Math.PI); }
    g.strokeStyle = INK.soft; g.stroke();
    g.beginPath(); g.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI * 2); g.fillStyle = INK.top; g.fill(); g.strokeStyle = INK.edge; g.stroke();
    g.beginPath(); g.moveTo(b[0] - rx, b[1]); g.quadraticCurveTo(b[0], b[1] - rx * 1.3, b[0] + rx, b[1]); g.fillStyle = INK.top; g.fill(); g.stroke();
  }

  function paintBuilding(g, P, b, res) {
    const r = rng(b.seed), {x0, z0, x1, z1, h} = b;
    if (b.style === 'kiosk') { box(g, P, x0, z0, x1, z1, 0, h, {top: INK.white, edge: INK.whiteEdge}); return; }
    if (b.style === 'house' || b.style === 'barn') {
      box(g, P, x0, z0, x1, z1, 0, h);
      g.beginPath();
      if (b.style === 'house') { if (r() < .7) quadL(g, P, z1, x0 + .3, x0 + .55, .35, .6); if (r() < .5) quadR(g, P, x1, z0 + .4, z0 + .65, .35, .6); g.fillStyle = INK.lit; g.fill(); }
      else { quadL(g, P, z1, (x0 + x1) / 2 - .4, (x0 + x1) / 2 + .4, 0, h * .7); g.strokeStyle = INK.edge; g.lineWidth = lw * .8; g.stroke(); }
      gable(g, P, b, b.style === 'barn' ? .9 : .6, b.style === 'barn' ? '#1a1b1e' : INK.top);
      return;
    }
    if (b.style === 'silo') { cylinder(g, P, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, 0, h, res); return; }
    if (b.style === 'warehouse' || b.style === 'shed') {
      box(g, P, x0, z0, x1, z1, 0, h, b.whiteRoof ? {top: INK.white, edge: INK.whiteEdge} : {});
      if (b.saw) {
        g.beginPath();
        for (let x = x0; x < x1 - .1; x += .7) { const xe = Math.min(x1, x + .7); path(g, [P(x, h, z1), P(xe, h + .45, z1), P(xe, h, z1)]); line(g, P(xe, h + .45, z1), P(xe, h + .45, z0)); }
        g.fillStyle = INK.top; g.fill(); g.strokeStyle = INK.edge; g.lineWidth = lw * .8; g.stroke();
      } else if (!b.whiteRoof) {
        g.beginPath(); for (let x = x0 + .35; x < x1 - .1; x += .35) line(g, P(x, h, z0 + .05), P(x, h, z1 - .05));
        g.strokeStyle = INK.soft; g.lineWidth = lw * .7; g.stroke();
      } else {
        g.beginPath(); for (let x = x0 + .8; x < x1 - .4; x += 1.6) line(g, P(x, h, (z0 + z1) / 2 - .2), P(x + .9, h, (z0 + z1) / 2 - .2));
        g.strokeStyle = INK.whiteEdge; g.lineWidth = lw; g.stroke();
      }
      const doors = new Path2D();
      for (let x = x0 + .4; x < x1 - .5; x += 1.2) { const p = [P(x, .75, z1), P(x + .6, .75, z1), P(x + .6, 0, z1), P(x, 0, z1)]; doors.moveTo(...p[0]); p.slice(1).forEach(q => doors.lineTo(...q)); doors.closePath(); }
      g.fillStyle = b.whiteRoof ? '#26272b' : INK.faint; g.fill(doors);
      return;
    }
    box(g, P, x0, z0, x1, z1, 0, h);
    if (b.style === 'slab') {
      const rate = .3 + r() * .3;
      const lit = () => r() < rate;
      facade(g, P, b, 'L', .1, .24, .1, .3, lit, .35, '#d9d9d5');
      facade(g, P, b, 'R', .1, .24, .1, .3, lit, .35, '#d9d9d5');
    } else if (b.style === 'office') {
      floorLines(g, P, b, .42);
      const rate = .12 + r() * .2;
      facade(g, P, b, 'L', .2, .34, .14, .42, () => r() < rate, .62);
      facade(g, P, b, 'R', .2, .34, .14, .42, () => r() < rate, .62);
      if (r() < .35) { g.beginPath(); quadL(g, P, z1, x0, x1, 0, .36); quadR(g, P, x1, z0, z1, 0, .36); g.fillStyle = INK.white; g.fill(); }
    } else if (b.style === 'glass') {
      const rate = .2 + r() * .2, clusters = [];
      for (let i = 0; i < 6; i++) clusters.push([Math.floor(r() * 30), Math.floor(r() * 12)]);
      const lit = (c, row) => r() < rate || clusters.some(([cr, cc]) => Math.abs(cr - row) < 3 && Math.abs(cc - c) < 2);
      facade(g, P, b, 'L', .12, .2, .16, .28, lit, .4);
      facade(g, P, b, 'R', .12, .2, .16, .28, lit, .4);
      if (b.chamfer) { box(g, P, x0 + .3, z0 + .3, x1 - .3, z1 - .3, h, h + .5, {top: INK.white, edge: INK.whiteEdge}); return; }
    } else if (b.style === 'terminal') {
      // Long low hall: perforated roof and a strip of lit glazing.
      const dots = new Path2D(), dr = Math.max(.6, .045 * res);
      for (let x = x0 + .25; x < x1 - .15; x += .22) for (let z = z0 + .25; z < z1 - .15; z += .3) { const q = P(x, h, z); dots.moveTo(q[0] + dr, q[1]); dots.arc(q[0], q[1], dr, 0, Math.PI * 2); }
      g.fillStyle = '#5c5d61'; g.fill(dots);
      g.beginPath(); quadL(g, P, z1, x0 + .3, x1 - .3, .35, .62); g.fillStyle = INK.litSoft; g.fill();
      g.beginPath(); for (let x = x0 + .4; x < x1 - .3; x += .45) line(g, P(x, .35, z1), P(x, .62, z1)); g.strokeStyle = INK.left; g.lineWidth = lw; g.stroke();
      return;
    }
    roofDetail(g, P, b, r);
  }

  function paintGrove(g, P, gr, res) { [...gr.trees].sort((a, b) => a.x + a.z - b.x - b.z).forEach(t => tree(g, P, t, res)); }

  function paintYard(g, P, y) {
    for (const row of y.rows) for (const s of row.stacks) for (let k = 0; k < s.h; k++) {
      const white = s.tone > .8 && k === s.h - 1, mid = s.tone > .55 && s.tone <= .8;
      box(g, P, s.x, row.z, s.x + 1.05, row.z + .45, k * .4, k * .4 + .38, white ? {top: INK.white, edge: INK.whiteEdge} : {top: mid ? '#25262a' : '#18191c', lw: lw * .8});
    }
  }

  function paintCrane(g, P, c) {
    const x = c.x, legs = [[x - 1.2, 15.2], [x + 1.2, 15.2], [x - 1.2, 16.9], [x + 1.2, 16.9]];
    g.beginPath(); g.strokeStyle = '#55565b'; g.lineWidth = lw;
    for (const [lx, lz] of legs) line(g, P(lx, 0, lz), P(lx, 4.6, lz));
    for (const dx of [-1.2, 1.2]) {
      line(g, P(x + dx, 4.6, 13.4), P(x + dx, 4.6, 23)); line(g, P(x + dx, 5.1, 13.4), P(x + dx, 5.1, 23));
      for (let z = 13.4; z < 23; z += .8) { line(g, P(x + dx, 4.6, z), P(x + dx, 5.1, z + .4)); line(g, P(x + dx, 5.1, z + .4), P(x + dx, 4.6, z + .8)); }
      line(g, P(x + dx, 0, 15.2), P(x + dx, 3, 16.9)); line(g, P(x + dx, 0, 16.9), P(x + dx, 3, 15.2));
    }
    for (let z = 13.4; z <= 23; z += 1.6) line(g, P(x - 1.2, 4.6, z), P(x + 1.2, 4.6, z));
    line(g, P(x, 5.1, 15.2), P(x, 7, 15.6)); line(g, P(x, 7, 15.6), P(x - 1.2, 5.1, 23)); line(g, P(x, 7, 15.6), P(x + 1.2, 5.1, 23));
    g.stroke();
    box(g, P, x - .5, 17.8, x + .5, 18.4, 3.9, 4.55, {top: INK.white, edge: INK.whiteEdge});
  }

  function paintShip(g, P, s) {
    box(g, P, s.x0, s.z0, s.x1, s.z1, 0, .6, {top: '#18191c'});
    let k = 0;
    for (let x = s.x0 + 2; x < s.x1 - .5; x += 1.1) for (let z = s.z0 + .25; z < s.z1 - .4; z += .52, k++) {
      const h = 1 + (k * 7 % 3);
      for (let i = 0; i < h; i++) box(g, P, x, z, x + 1, z + .48, .6 + i * .36, .94 + i * .36, k % 5 === 0 && i === h - 1 ? {top: INK.white, edge: INK.whiteEdge} : {lw: lw * .8});
    }
    const bx = s.x0 + .3;
    box(g, P, bx, s.z0 + .3, bx + 1.2, s.z1 - .3, .6, 2.3);
    g.beginPath(); for (let y = 1; y < 2.2; y += .4) quadL(g, P, s.z1 - .3, bx + .15, bx + 1.05, y, y + .12); g.fillStyle = INK.lit; g.fill();
  }

  function paintPlaza(g, P, p) {
    fillPoly(g, [P(p.x0, 0, p.z0), P(p.x1, 0, p.z0), P(p.x1, 0, p.z1), P(p.x0, 0, p.z1)], '#18191c');
    g.beginPath();
    for (let x = p.x0 + .6; x < p.x1; x += .6) line(g, P(x, 0, p.z0), P(x, 0, p.z1));
    for (let z = p.z0 + .6; z < p.z1; z += .6) line(g, P(p.x0, 0, z), P(p.x1, 0, z));
    g.strokeStyle = INK.faint; g.lineWidth = lw * .7; g.stroke();
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    g.beginPath(); for (const rr of [.8, 1.5]) for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, q = P(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    g.strokeStyle = INK.edge; g.lineWidth = lw * .8; g.stroke();
  }
  function paintLot(g, P, p) {
    // Parking lot: a fine grid of bays, as in a technical drawing.
    g.beginPath(); path(g, [P(p.x0, 0, p.z0), P(p.x1, 0, p.z0), P(p.x1, 0, p.z1), P(p.x0, 0, p.z1)]);
    for (let x = p.x0 + .35; x < p.x1; x += .35) line(g, P(x, 0, p.z0), P(x, 0, p.z1));
    for (let z = p.z0 + 1.1; z < p.z1 - .2; z += 1.1) line(g, P(p.x0, 0, z), P(p.x1, 0, z));
    g.strokeStyle = INK.soft; g.lineWidth = lw * .6; g.stroke();
    const r = rng(Math.round(p.x0 * 31 + p.z0 * 7));
    for (let x = p.x0 + .05; x < p.x1 - .3; x += .35) for (let z = p.z0 + .15; z < p.z1 - .9; z += 1.1) if (r() < .3) box(g, P, x + .04, z, x + .3, z + .7, 0, .22, {top: r() < .2 ? '#bdbdba' : '#202124', edge: '#55565b', lw: lw * .7});
  }
  function paintField(g, P, f) {
    fillPoly(g, [P(f.x0, 0, f.z0), P(f.x1, 0, f.z0), P(f.x1, 0, f.z1), P(f.x0, 0, f.z1)], f.fallow ? '#121315' : INK.field);
    g.beginPath(); path(g, [P(f.x0, 0, f.z0), P(f.x1, 0, f.z0), P(f.x1, 0, f.z1), P(f.x0, 0, f.z1)]);
    g.strokeStyle = INK.soft; g.lineWidth = lw * .8; g.stroke();
    if (f.fallow) return;
    g.beginPath();
    if (f.dir === 'x') for (let z = f.z0 + .3; z < f.z1; z += .3) line(g, P(f.x0 + .1, 0, z), P(f.x1 - .1, 0, z));
    else for (let x = f.x0 + .3; x < f.x1; x += .3) line(g, P(x, 0, f.z0 + .1), P(x, 0, f.z1 - .1));
    g.strokeStyle = INK.furrow; g.lineWidth = lw * .7; g.stroke();
    if (f.crop) {
      g.beginPath();
      for (let x = f.x0 + .3; x < f.x1 - .1; x += .45) for (let z = f.z0 + .3; z < f.z1 - .1; z += .45) { const a = P(x, 0, z), b = P(x, .28, z); line(g, a, b); }
      g.strokeStyle = '#38393e'; g.lineWidth = lw * .7; g.stroke();
    }
  }

  // Marina: finger piers with moored boats, a rock breakwater and channel buoys.
  const marina = {x0: -58, x1: -42, z: 18.2};
  function paintMarina(g, P) {
    const {x0, x1, z} = marina;
    box(g, P, x0, z, x1, z + .5, -.05, .08, {top: '#1a1b1e', edge: INK.soft, lw: lw * .8});
    const r = rng(41);
    for (let x = x0 + 1; x < x1; x += 2.2) {
      box(g, P, x, z + .5, x + .3, z + 6, -.05, .08, {top: '#1a1b1e', edge: INK.soft, lw: lw * .8});
      for (let zz = z + 1; zz < z + 5.6; zz += 1) for (const side of [-1, 1]) {
        if (r() < .3) continue;
        const bx = side < 0 ? x - .75 : x + .45;
        box(g, P, bx, zz, bx + .3, zz + .8, 0, .16, {top: r() < .3 ? '#cfcfcc' : '#202124', edge: '#55565b', lw: lw * .7});
      }
    }
  }
  const breakwater = [];
  { const r = rng(9); for (let t = 0; t <= 1; t += .012) { const x = -60 + t * 22, z = 26.5 + Math.sin(t * Math.PI) * 2.2; breakwater.push({x: x + (r() - .5) * .3, z: z + (r() - .5) * .4, s: .25 + r() * .2}); } }
  function paintBreakwater(g, P) {
    for (const k of breakwater) {
      const pts = [P(k.x - k.s, 0, k.z), P(k.x, .15, k.z - k.s * .7), P(k.x + k.s, 0, k.z), P(k.x, -.05, k.z + k.s * .7)];
      fillPoly(g, pts, '#17181b'); g.beginPath(); path(g, pts); g.strokeStyle = '#4a4b50'; g.lineWidth = lw * .7; g.stroke();
    }
  }
  const buoys = [[-34, 30], [-27, 36], [-46, 34], [-18, 42], [-40, 44]].map(([x, z], i) => ({x, z, phase: i * 1.7}));
  function paintBuoy(g, P, b, res) {
    const a = P(b.x, 0, b.z), t = P(b.x, .9, b.z), w = .14 * res;
    g.beginPath(); g.moveTo(a[0] - w, a[1]); g.lineTo(t[0], t[1]); g.lineTo(a[0] + w, a[1]); g.closePath();
    g.fillStyle = '#1c1d20'; g.fill(); g.strokeStyle = '#6a6b70'; g.lineWidth = lw; g.stroke();
  }

  // Elevated metro: deck segments, the gorge truss and three stations.
  function gorgeBottom(x, z) {
    // Lowest still-visible height under (x, z): below this, the far rim of the gorge hides the structure.
    let zr = rimX(0, 'e') - (x - z);
    for (let i = 0; i < 3; i++) zr = rimX(zr, 'e') - (x - z);
    const xr = rimX(zr, 'e');
    return Math.max(-GORGE.depth, ((x + z) / 2 - (xr + zr) / 2) / V);
  }
  const overGorge = x => x > GORGE.x0 - 1.5 && x < GORGE.x1 + 1.5;
  function paintDeck(g, P, s) {
    const {x0, x1} = s, top = DECK, bot = DECK - .3, gorge = overGorge((x0 + x1) / 2);
    const spacing = gorge ? 3 : 4;
    for (let x = Math.ceil(x0 / spacing) * spacing; x < x1; x += spacing) {
      const ground = gorge && x > rimX(0, 'w') - .3 && x < rimX(0, 'e') + .3 ? gorgeBottom(x, .2) : 0;
      box(g, P, x - .2, -.22, x + .2, .22, ground, bot, {lw: lw * .8});
      box(g, P, x - .25, -.9, x + .25, .9, bot - .3, bot, {lw: lw * .8});
    }
    box(g, P, x0, -.86, x1, .86, bot, top, {top: '#17181b', lw: lw * .8});
    g.beginPath();
    for (const z of [-.55, -.22, .22, .55]) line(g, P(x0, top + .03, z), P(x1, top + .03, z));
    g.strokeStyle = '#5d5e63'; g.lineWidth = lw * .7; g.stroke();
    g.beginPath();
    if (gorge) {
      // Warren truss on both sides of the bridge span.
      for (const z of [-.86, .86]) {
        line(g, P(x0, top + 1.3, z), P(x1, top + 1.3, z));
        for (let x = x0; x < x1 - .01; x += 1) { line(g, P(x, top, z), P(x + .5, top + 1.3, z)); line(g, P(x + .5, top + 1.3, z), P(x + 1, top, z)); }
      }
      for (let x = x0; x <= x1; x += 1) line(g, P(x + .5, top + 1.3, -.86), P(x + .5, top + 1.3, .86));
      g.strokeStyle = '#5a5b60';
    } else {
      line(g, P(x0, top + .22, .86), P(x1, top + .22, .86)); for (let x = x0; x <= x1 + .01; x += .5) line(g, P(x, top, .86), P(x, top + .22, .86));
      g.strokeStyle = INK.soft;
    }
    g.lineWidth = lw * .7; g.stroke();
  }
  function paintStation(g, P, st, side) {
    const {x0, x1} = st, z0 = side < 0 ? -1.75 : .86, z1 = side < 0 ? -.86 : 1.75, top = DECK + .12;
    box(g, P, x0, z0, x1, z1, DECK - .45, top, {top: '#1f2023'});
    g.beginPath(); for (let x = x0 + .4; x < x1; x += .8) { const zz = side < 0 ? z0 + .2 : z1 - .2; line(g, P(x, top, zz), P(x, top + 1.2, zz)); }
    g.strokeStyle = INK.edge; g.lineWidth = lw; g.stroke();
    // Curved canopy ribs
    g.beginPath();
    for (let x = x0; x <= x1 + .01; x += .5) for (let i = 0; i <= 8; i++) {
      const a = i / 8 * Math.PI, zz = (z0 + z1) / 2 + Math.cos(a) * (z1 - z0) / 2 * 1.1, yy = top + 1.2 + Math.sin(a) * .35, q = P(x, yy, zz);
      i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
    }
    line(g, P(x0, top + 1.55, (z0 + z1) / 2), P(x1, top + 1.55, (z0 + z1) / 2));
    g.strokeStyle = '#4f5055'; g.lineWidth = lw * .7; g.stroke();
    g.beginPath(); quadL(g, P, z1, x0 + .3, x1 - .3, top + .05, top + .12); g.fillStyle = INK.lit; g.fill();
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
    const pad = .45;
    statics.push({key, paint, u0: u0 - pad, u1: u1 + pad, v0: v0 - pad, v1: v1 + pad, spr: null, res: 0, used: 0});
  }
  const GROUND = -1e6; // ground-level decals draw before everything else
  for (const f of city.fields) item([f.x0, f.z0, f.x1, f.z1, 0, .3], GROUND + f.x0 + f.z0, (g, P) => paintField(g, P, f));
  for (const p of city.plazas) item([p.x0, p.z0, p.x1, p.z1, 0, .1], GROUND + p.x0 + p.z0, (g, P) => paintPlaza(g, P, p));
  for (const p of city.lots) item([p.x0, p.z0, p.x1, p.z1, 0, .3], p.key, (g, P) => paintLot(g, P, p));
  item([marina.x0 - 1, marina.z, marina.x1 + 1, marina.z + 6.2, -.1, .3], GROUND + 1, (g, P) => paintMarina(g, P));
  item([-61, 24, -37, 29.5, -.1, .3], GROUND + 2, (g, P) => paintBreakwater(g, P));
  for (const b of city.buildings) item([b.x0 - .15, b.z0 - .15, b.x1 + .15, b.z1 + .15, 0, b.h + 1.5], (b.x0 + b.x1 + b.z0 + b.z1) / 2, (g, P, res) => paintBuilding(g, P, b, res));
  for (const gr of city.groves) item([gr.x0 - .6, gr.z0 - .6, gr.x1 + .6, gr.z1 + .6, 0, 2.3], gr.key ?? (gr.x0 + gr.x1 + gr.z0 + gr.z1) / 2, (g, P, res) => paintGrove(g, P, gr, res));
  for (const y of city.yards) item([y.x0, y.z0, y.x1, y.z1, 0, 1.4], y.key ?? (y.x0 + y.x1 + y.z0 + y.z1) / 2, (g, P) => paintYard(g, P, y));
  for (const c of city.cranes) item([c.x - 1.5, 13.2, c.x + 1.5, 23.2, 0, 7.2], c.x + 17, (g, P) => paintCrane(g, P, c));
  for (const b of buoys) item([b.x - .3, b.z - .3, b.x + .3, b.z + .3, 0, 1], b.x + b.z, (g, P, res) => paintBuoy(g, P, b, res));
  const ships = [{x0: -38, z0: 18.4, x1: -25, z1: 20.3}, {x0: -22, z0: 18.4, x1: -12, z1: 20.1}];
  for (const s of ships) item([s.x0, s.z0, s.x1, s.z1, 0, 2.6], (s.x0 + s.x1) / 2 + s.z0, (g, P) => paintShip(g, P, s));
  const deckEnd = STOPS[2].x1 + 8;
  for (let x = -EDGE; x < deckEnd; x += 2) {
    const x1 = x + 2, s = {x0: x, x1}, low = overGorge(x + 1) ? -GORGE.depth : 0;
    item([x, -.9, x1, .9, low, DECK + (low ? 1.5 : .4)], x + 1, (g, P) => paintDeck(g, P, s));
  }
  for (const st of STOPS) for (const side of [-1, 1]) {
    const z0 = side < 0 ? -1.9 : .86, z1 = side < 0 ? -.86 : 1.9;
    item([st.x0 - .2, z0, st.x1 + .2, z1, 0, DECK + 1.8], (st.x0 + st.x1) / 2 + side * 1.4, (g, P) => paintStation(g, P, st, side));
  }
  const beacons = city.buildings.filter(b => b.h > 10).map((b, i) => ({x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: b.h + .6, phase: i * .73}));

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
    const keep = lw; lw = lineWidth(r);
    it.paint(g, P, r);
    lw = keep;
    if (it.spr !== cv) { spritePixels -= it.spr ? it.spr.width * it.spr.height : 0; spritePixels += cv.width * cv.height; }
    it.spr = cv; it.res = res;
  }
  const lineWidth = r => Math.min(1.6, Math.max(.6, r * .028));

  // ---------- Live items ----------
  function paintTrainCar(g, P, x0, x1, z, y, lead, dir) {
    const zh = .3, h = .62;
    box(g, P, x0, z - zh, x1, z + zh, y, y + h, {top: '#e4e4e1', left: '#d6d6d3', right: '#bdbdba', edge: '#8c8d90'});
    g.beginPath();
    for (let x = x0 + .16; x < x1 - .2; x += .3) quadL(g, P, z + zh, x, x + .2, y + .28, y + .5);
    g.fillStyle = '#26272b'; g.fill();
    g.beginPath(); quadL(g, P, z + zh, x0, x1, y + .08, y + .12); g.fillStyle = '#5a5b60'; g.fill();
    if (lead && dir > 0) { g.beginPath(); quadR(g, P, x1, z - zh + .08, z + zh - .08, y + .3, y + .52); g.fillStyle = '#26272b'; g.fill(); }
  }
  function paintFreightCar(g, P, z0, z1, x, lead) {
    box(g, P, x - .34, z0, x + .34, z1, .12, .78, {top: '#202124', lw: lw * .8});
    g.beginPath(); quadR(g, P, x + .34, z0 + .1, z1 - .1, .6, .66); if (lead) quadL(g, P, z1, x - .2, x + .2, .44, .6); g.fillStyle = INK.litSoft; g.fill();
  }
  function paintCar(g, P, p, car) {
    const along = car.lane.axis === 'x', fwd = car.lane.dir, L = .34, Wd = .16;
    const [x0, x1, z0, z1] = along ? [p.x - L, p.x + L, p.z - Wd, p.z + Wd] : [p.x - Wd, p.x + Wd, p.z - L, p.z + L];
    g.globalAlpha = p.fade;
    box(g, P, x0, z0, x1, z1, .05, .24, {top: car.tone > .78 ? '#c9c9c6' : '#222326', edge: '#5f6065', lw: lw * .8});
    if (along) box(g, P, x0 + .15, z0 + .02, x1 - .18, z1 - .02, .24, .36, {top: '#1a1b1e', edge: '#4d4e53', lw: lw * .7}); else box(g, P, x0 + .02, z0 + .15, x1 - .02, z1 - .18, .24, .36, {top: '#1a1b1e', edge: '#4d4e53', lw: lw * .7});
    g.beginPath();
    if (along) { quadR(g, P, x1, z0 + .03, z0 + .09, .12, .18); quadR(g, P, x1, z1 - .09, z1 - .03, .12, .18); }
    else { quadL(g, P, z1, x0 + .03, x0 + .09, .12, .18); quadL(g, P, z1, x1 - .09, x1 - .03, .12, .18); }
    g.fillStyle = fwd > 0 ? INK.lit : '#6a6b70'; g.fill();
    g.globalAlpha = 1;
  }
  function paintBoat(g, P, b) {
    box(g, P, b.x - .7, b.z - .22, b.x + .7, b.z + .22, 0, .24, {top: '#1f2023', lw: lw * .8});
    box(g, P, b.x - .25, b.z - .14, b.x + .2, b.z + .14, .24, .5, {top: INK.white, edge: INK.whiteEdge, lw: lw * .8});
    g.beginPath(); line(g, P(b.x + .75, 0, b.z), P(b.x + 2.4, 0, b.z - .25)); line(g, P(b.x + .75, 0, b.z), P(b.x + 2.4, 0, b.z + .25)); g.strokeStyle = '#26272b'; g.lineWidth = lw; g.stroke();
  }
  function paintWindmill(g, P, m, t) {
    const {x, z, h} = m, base = .5, topW = .22;
    g.beginPath();
    for (const [dx, dz] of [[-base, -base], [base, -base], [base, base], [-base, base]]) line(g, P(x + dx, 0, z + dz), P(x + dx * topW / base, h, z + dz * topW / base));
    for (let y = .8; y < h; y += .8) { const k = base - (base - topW) * y / h; g.moveTo(...P(x - k, y, z + k)); g.lineTo(...P(x + k, y, z + k)); g.lineTo(...P(x + k, y, z - k)); }
    g.strokeStyle = '#55565b'; g.lineWidth = lw * .8; g.stroke();
    const hub = [x + .35, h + .1, z + .35], rot = t * .9;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot + i * Math.PI * 2 / 3, tip = P(hub[0] + Math.cos(a) * 1.6 * .7, hub[1] + Math.sin(a) * 1.6, hub[2] - Math.cos(a) * 1.6 * .7);
      line(g, P(...hub), tip);
    }
    g.strokeStyle = '#c9c9c6'; g.lineWidth = lw * 1.3; g.stroke();
    const p = P(...hub); g.beginPath(); g.arc(p[0], p[1], Math.max(1, .08 * Sd), 0, Math.PI * 2); g.fillStyle = INK.lit; g.fill();
  }

  // ---------- Ground (drawn live: a few large paths) ----------
  function drawGround(P) {
    ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const E = EDGE, wz = 16 + ROAD, wx = -8 - ROAD;
    // Land west of the gorge (city), then the road surface of the city grid.
    const rimW = [], rimE = [];
    for (let z = WORLD.z0; z <= WORLD.z1 + .01; z += 1) { rimW.push([rimX(z, 'w'), z]); rimE.push([rimX(z, 'e'), z]); }
    fillPoly(ctx, [P(WORLD.x0, 0, WORLD.z0), ...rimW.map(([x, z]) => P(x, 0, z)), P(WORLD.x0, 0, WORLD.z1)], INK.land);
    fillPoly(ctx, [P(-E, 0, -E), P(E, 0, -E), P(E, 0, E), P(-E, 0, E)], INK.road);
    const pads = new Path2D(), add = (p, pts) => { p.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) p.lineTo(...pts[i]); p.closePath(); };
    for (let bx = 0; bx < BLOCKS; bx++) for (let bz = 0; bz < BLOCKS; bz++) {
      if (zoneOf(bx, bz) === 'water') continue;
      const x0 = blockMin(bx) + ROAD, z0 = blockMin(bz) + ROAD, x1 = blockMin(bx) + GRID - ROAD, z1 = blockMin(bz) + GRID - ROAD;
      add(pads, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)]);
    }
    ctx.fillStyle = INK.pad; ctx.fill(pads); ctx.strokeStyle = INK.padEdge; ctx.lineWidth = lw; ctx.stroke(pads);
    // Water
    fillPoly(ctx, [P(WORLD.x0, 0, wz), P(wx, 0, wz), P(wx, 0, WORLD.z1), P(WORLD.x0, 0, WORLD.z1)], INK.water);
    ctx.beginPath(); line(ctx, P(WORLD.x0, 0, wz), P(wx, 0, wz)); line(ctx, P(wx, 0, wz), P(wx, 0, WORLD.z1)); ctx.strokeStyle = INK.quay; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); const rr = rng(5);
    for (let i = 0; i < 60; i++) { const x = WORLD.x0 + rr() * (wx - WORLD.x0 - 2), z = wz + 2 + rr() * (WORLD.z1 - wz - 3), l = .4 + rr() * 1.2; line(ctx, P(x, 0, z), P(x + l, 0, z)); }
    ctx.strokeStyle = INK.ripple; ctx.lineWidth = lw; ctx.stroke();
    // Lane dashes
    ctx.beginPath();
    for (const r of roadList) {
      if (r.metro) continue;
      if (r.axis === 'x') line(ctx, P(r.from, 0, r.at), P(r.to, 0, r.at)); else line(ctx, P(r.at, 0, r.from), P(r.at, 0, r.to));
    }
    ctx.setLineDash([.4 * Sd, .6 * Sd]); ctx.strokeStyle = INK.dash; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
    // Street lamps along the block corners
    ctx.beginPath();
    for (let i = 0; i <= BLOCKS; i++) for (let k = 0; k <= BLOCKS; k++) {
      const x = -HALF + GRID * i + ROAD + .3, z = -HALF + GRID * k + ROAD + .3; if (isWater(x, z) || Math.abs(x) > E || Math.abs(z) > E) continue;
      line(ctx, P(x, 0, z), P(x, .9, z)); line(ctx, P(x, .9, z), P(x + .25, .9, z));
    }
    ctx.strokeStyle = '#34353a'; ctx.lineWidth = lw * .8; ctx.stroke();
    // Freight corridor: ballast, sleepers and rails.
    fillPoly(ctx, [P(RAIL_X - ROAD, 0, -E), P(RAIL_X + ROAD, 0, -E), P(RAIL_X + ROAD, 0, E), P(RAIL_X - ROAD, 0, E)], '#131417');
    ctx.beginPath(); for (const x of [RAIL_X - .4, RAIL_X + .4]) line(ctx, P(x, 0, -E), P(x, 0, E));
    ctx.setLineDash([.06 * Sd, .2 * Sd]); ctx.strokeStyle = '#26272b'; ctx.lineWidth = .25 * Sd; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); for (const x of [RAIL_X - .55, RAIL_X - .25, RAIL_X + .25, RAIL_X + .55]) line(ctx, P(x, 0, -E), P(x, 0, E));
    ctx.strokeStyle = '#4c4d52'; ctx.lineWidth = lw * .7; ctx.stroke();
    // Metro shadow on its avenue and across the countryside
    fillPoly(ctx, [P(-E, 0, -.75), P(rimX(0, 'w'), 0, -.75), P(rimX(0, 'w'), 0, .75), P(-E, 0, .75)], '#0e0f12');

    // Gorge: dark chasm, visible west cliff with strata, river on the floor, then the far plateau over it.
    const D = GORGE.depth;
    fillPoly(ctx, [...rimW.map(([x, z]) => P(x, 0, z)), ...rimE.slice().reverse().map(([x, z]) => P(x, 0, z))], INK.gorge);
    const foot = rimW.map(([x, z]) => [x + 1.6 + Math.sin(z * .8) * .4, z]);
    fillPoly(ctx, [...rimW.map(([x, z]) => P(x, 0, z)), ...foot.slice().reverse().map(([x, z]) => P(x, -D, z))], INK.cliff);
    ctx.beginPath();
    for (let k = 1; k < 6; k++) { const f = k / 6; rimW.forEach(([x, z], i) => { const q = P(x + 1.6 * f + Math.sin(z * .8) * .4 * f, -D * f + Math.sin(z * 1.7 + k) * .25, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); }
    for (let i = 0; i < rimW.length; i += 3) line(ctx, P(rimW[i][0], 0, rimW[i][1]), P(foot[i][0], -D, foot[i][1]));
    ctx.strokeStyle = INK.strata; ctx.lineWidth = lw * .7; ctx.stroke();
    ctx.beginPath(); foot.forEach(([x, z], i) => { const q = P(x + 2.4 + Math.sin(z * .45) * .8, -D, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.strokeStyle = '#2b3036'; ctx.lineWidth = lw * 1.4; ctx.stroke();
    fillPoly(ctx, [...rimE.map(([x, z]) => P(x, 0, z)), P(WORLD.x1, 0, WORLD.z1), P(WORLD.x1, 0, WORLD.z0)], INK.land);
    ctx.beginPath(); rimW.forEach(([x, z], i) => { const q = P(x, 0, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    rimE.forEach(([x, z], i) => { const q = P(x, 0, z); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.strokeStyle = '#4a4b50'; ctx.lineWidth = lw; ctx.stroke();
    // Village farm tracks
    ctx.beginPath();
    for (const t of city.tracks) if (t.axis === 'x') line(ctx, P(t.from, 0, t.at), P(t.to, 0, t.at)); else line(ctx, P(t.at, 0, t.from), P(t.at, 0, t.to));
    ctx.strokeStyle = INK.track; ctx.lineWidth = lw * 1.6; ctx.stroke();
    fillPoly(ctx, [P(rimX(0, 'e'), 0, -.75), P(WORLD.x1, 0, -.75), P(WORLD.x1, 0, .75), P(rimX(0, 'e'), 0, .75)], '#121316');
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
  function baseScale() { return Math.max(8, Math.min(19, (W / (2 * C) + H) / 108)); }
  function zoom() { return typeof cityZoom === 'number' ? cityZoom / .86 : 1; }
  const FOCUS = [3.5, 1.2]; // world point near Central station that sits at screen centre
  function clampPan() {
    if (typeof cityPanX !== 'number') return;
    // Keep the view centre inside the world: city, gorge and village.
    const fu = (FOCUS[0] - FOCUS[1]) * C, fv = (FOCUS[0] + FOCUS[1]) * ISO;
    const u0 = -72, u1 = 96, v0 = -40, v1 = 62;
    cityPanX = Math.max((fu - u1) * S, Math.min((fu - u0) * S, cityPanX));
    cityPanY = Math.max((fv - v1) * S, Math.min((fv - v0) * S, cityPanY));
  }
  const paused = () => (typeof cityPaused !== 'undefined' && cityPaused) || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const focused = () => !!(document.body && document.body.classList && document.body.classList.contains('city-focus'));

  function draw(budgetEnd) {
    S = baseScale() * zoom(); Sd = S * dpr; lw = lineWidth(Sd);
    clampPan();
    const panX = (typeof cityPanX === 'number' ? cityPanX : 0) * dpr, panY = (typeof cityPanY === 'number' ? cityPanY : 0) * dpr;
    OX = canvas.width / 2 + panX - (FOCUS[0] - FOCUS[1]) * C * Sd;
    OY = canvas.height * .5 + panY - (FOCUS[0] + FOCUS[1]) * ISO * Sd;
    const P = (x, y, z) => [OX + (x - z) * C * Sd, OY + ((x + z) * ISO - y * V) * Sd];
    const cw = canvas.width, ch = canvas.height, onScreen = q => q[0] > -2 * Sd && q[0] < cw + 2 * Sd && q[1] > -4 * Sd && q[1] < ch + 4 * Sd;
    ctx.lineJoin = 'round';
    drawGround(P);

    const live = [];
    for (const car of traffic) {
      const p = carAt(car, time); if (isWater(p.x, p.z) || !onScreen(P(p.x, 0, p.z))) continue;
      live.push({key: p.x + p.z, draw: () => paintCar(ctx, P, p, car)});
    }
    const len = metroLength(), services = [], half = metroCycle() / 2;
    for (const [phase, z] of [[0, .38], [half, -.38]]) {
      const m = metroAt(time, phase); services.push({...m, z});
      for (let k = 0; k < METRO.cars; k++) {
        const x0 = m.x - len / 2 + k * (METRO.car + METRO.gap), x1 = x0 + METRO.car;
        if (!onScreen(P(x0, DECK, z)) && !onScreen(P(x1, DECK, z))) continue;
        const lead = m.dir > 0 ? k === METRO.cars - 1 : k === 0;
        live.push({key: (x0 + x1) / 2 + 2.3 + z, draw: () => paintTrainCar(ctx, P, x0, x1, z, DECK + .05, lead, m.dir)});
      }
    }
    const fr = freightAt(time);
    for (let k = 0; k < FREIGHT.cars; k++) {
      const lead = fr.dir > 0 ? fr.front - k * (FREIGHT.car + FREIGHT.gap) : fr.front + k * (FREIGHT.car + FREIGHT.gap);
      const z0 = fr.dir > 0 ? lead - FREIGHT.car : lead, z1 = z0 + FREIGHT.car;
      if (z1 < -EDGE - 2 || z0 > EDGE + 2) continue;
      live.push({key: RAIL_X + (z0 + z1) / 2, draw: () => paintFreightCar(ctx, P, z0, z1, RAIL_X - .4 * fr.dir, k === 0 && fr.dir > 0)});
    }
    for (const [i, z] of [[0, 33], [1, 39], [2, 47]]) {
      const span = 34, u = (time * .04 + i * .37) % 2, x = -56 + (u < 1 ? u : 2 - u) * span;
      live.push({key: x + z, draw: () => paintBoat(ctx, P, {x, z})});
    }
    if (onScreen(P(city.windmill.x, 2, city.windmill.z))) live.push({key: city.windmill.x + city.windmill.z + .5, draw: () => paintWindmill(ctx, P, city.windmill, time)});

    // Sprites: rebuild at the settled scale within a time budget; draw old sprites scaled meanwhile.
    const all = statics.concat(live).sort((a, b) => a.key - b.key);
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

    // Blinking lights: aircraft beacons on towers and channel buoys.
    ctx.fillStyle = INK.lit;
    for (const b of beacons.concat(buoys.map(q => ({x: q.x, z: q.z, y: 1, phase: q.phase})))) {
      const on = (Math.sin(time * 2.4 + b.phase * 5) + 1) / 2; if (on < .35) continue;
      const p = P(b.x, b.y, b.z); ctx.globalAlpha = on; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.1, .065 * Sd), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating tag on the first train, shown only when the city itself is in focus.
    if (focused()) {
      const m = services[0], a = P(m.x, DECK + 1, m.z);
      if (onScreen(a)) {
        const text = m.state === 'doors open' ? `M1 · AT ${m.at.toUpperCase()} · DOORS OPEN` : `M1 · TO ${m.towards.toUpperCase()} · ${Math.round(m.speed * 14)} KM/H`;
        const fs = Math.round(10 * dpr);
        ctx.font = `${fs}px "Shiftwise Mono", ui-monospace, monospace`;
        const tw = ctx.measureText(text).width, bw = tw + 18 * dpr, bh = 22 * dpr, bx = Math.max(8 * dpr, Math.min(cw - bw - 8 * dpr, a[0] - bw / 2)), by = a[1] - 44 * dpr;
        ctx.strokeStyle = '#d8d8d6'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0], by + bh); ctx.stroke();
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5 * dpr); else ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = '#0d0e10ee'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f2f2f0'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 9 * dpr, by + bh / 2 + .5);
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
