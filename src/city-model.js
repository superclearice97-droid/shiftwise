// Shiftwise city — pure world model (no DOM). Original layout; decorative only.
// Ground plane is X/Z, Y is up. One unit is roughly one storey.
// The metro leaves the city eastward, crosses a gorge on a truss bridge and ends in a farming village.
export const GRID = 8, BLOCKS = 14, HALF = 56, EDGE = 62, ROAD = 1.05;
export const METRO_Z = 0, RAIL_X = 24, DECK = 2.4;
export const GORGE = {x0: 70, x1: 81, depth: 9};
export const WORLD = {x0: -EDGE, x1: 136, z0: -EDGE, z1: EDGE};
export const STATION = {x0: 1.2, x1: 8.8, name: 'Central'};
export const STOPS = [
  {x0: -51, x1: -43.4, name: 'Northgate'},
  STATION,
  {x0: 100, x1: 107.6, name: 'Millbrook'},
];
export const C = Math.cos(Math.PI / 6), ISO = .5, V = .92;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const blockMin = b => -HALF + GRID * b;
export const project = (x, y, z) => [(x - z) * C, (x + z) * ISO - y * V];
export const isWater = (x, z) => x < -8 - ROAD && z > 16 + ROAD;
/** Jagged gorge rim: x position of the west (w) or east (e) edge at depth z. */
export const rimX = (z, side) => side === 'w'
  ? GORGE.x0 + Math.sin(z * .37) * .8 + Math.sin(z * 1.13 + 1) * .35 + Math.sin(z * 2.9) * .12
  : GORGE.x1 + Math.sin(z * .29 + 2) * .9 + Math.sin(z * 1.31) * .3 + Math.sin(z * 3.3 + .4) * .12;

export function zoneOf(bx, bz) {
  const x = blockMin(bx), z = blockMin(bz);
  if (x < -8 && z >= 16) return 'water';
  if (x < -8 && z === 8) return 'port';
  if (bx + bz <= 4 || (bx === 0 && bz < 8) || (bz === 0 && bx < 8)) return 'forest';
  if (x >= -8 && x <= 8 && z >= -24 && z <= 8) return 'downtown';
  if (z >= 24 && x >= -8) return 'industrial';
  const h = (bx * 7 + bz * 13) % 17;
  if (h === 0 || h === 9) return 'forest';
  if (h === 4) return 'plaza';
  if (h === 12) return 'lot';
  return 'mixed';
}

/** Road centre-line segments. axis 'x' runs along X at z=at; axis 'z' runs along Z at x=at. */
export function roads() {
  const list = [];
  for (let k = 0; k <= BLOCKS; k++) {
    const r = -HALF + GRID * k;
    list.push({axis: 'x', at: r, from: r > 16 ? -8 : -EDGE, to: EDGE, metro: r === METRO_Z});
    if (r === RAIL_X) continue; // rail corridor replaces this avenue
    list.push({axis: 'z', at: r, from: -EDGE, to: r < -8 ? 16 : EDGE});
  }
  return list;
}

/** Car lanes: full-length roads only. Vehicles fade in and out at the road ends. */
export function lanes() {
  const out = [];
  for (const r of roads()) {
    if (r.metro || r.from !== -EDGE || r.to !== EDGE) continue;
    out.push({...r, offset: .45, dir: 1}, {...r, offset: -.45, dir: -1});
  }
  return out;
}

/** Static scenery. Building footprints never overlap and never enter roads. */
export function makeCity(seed = 1307) {
  const rnd = rng(seed), buildings = [], groves = [], yards = [], cranes = [], plazas = [], lots = [], fields = [], tracks = [];
  const add = (x0, z0, x1, z1, h, style, extra = {}) => buildings.push({x0, z0, x1, z1, h, style, seed: Math.floor(rnd() * 1e9), ...extra});
  const pal = (x, z) => ({x, z, h: 1.5 + rnd() * .6, kind: 'palm'});
  for (let bx = 0; bx < BLOCKS; bx++) for (let bz = 0; bz < BLOCKS; bz++) {
    const zone = zoneOf(bx, bz), bx0 = blockMin(bx), bz0 = blockMin(bz);
    const x0 = bx0 + 2, z0 = bz0 + 2, x1 = bx0 + GRID - 2, z1 = bz0 + GRID - 2; // building envelope (4 x 4)
    const cx = bx0 + GRID / 2, cz = bz0 + GRID / 2, key = cx + cz;
    if (zone === 'water') continue;
    // Sidewalk palms: split into a back row (drawn before the block) and a front row (after it).
    const edge = ROAD + .45, back = [], front = [];
    if (zone !== 'forest' && zone !== 'port' && zone !== 'industrial') {
      for (let s = edge + .4; s < GRID - edge; s += 1.55 + rnd() * .5) {
        if (rnd() < .3) back.push(pal(bx0 + s, bz0 + edge));
        if (rnd() < .3) back.push(pal(bx0 + edge, bz0 + s));
        if (rnd() < .45) front.push(pal(bx0 + s, bz0 + GRID - edge));
        if (rnd() < .45) front.push(pal(bx0 + GRID - edge, bz0 + s));
      }
      if (back.length) groves.push({x0: bx0 + ROAD, z0: bz0 + ROAD, x1: bx0 + GRID - ROAD, z1: bz0 + GRID - ROAD, trees: back, key: key - 5});
      if (front.length) groves.push({x0: bx0 + ROAD, z0: bz0 + ROAD, x1: bx0 + GRID - ROAD, z1: bz0 + GRID - ROAD, trees: front, key: key + 5});
    }
    if (zone === 'forest') {
      const trees = [];
      for (let x = bx0 + ROAD + .45; x < bx0 + GRID - ROAD - .2; x += .62) for (let z = bz0 + ROAD + .45; z < bz0 + GRID - ROAD - .2; z += .62) {
        if (rnd() < .12) continue;
        trees.push({x: x + (rnd() - .5) * .3, z: z + (rnd() - .5) * .3, h: .8 + rnd() * .7, kind: rnd() < .5 ? 'round' : 'cone'});
      }
      groves.push({x0: bx0 + ROAD, z0: bz0 + ROAD, x1: bx0 + GRID - ROAD, z1: bz0 + GRID - ROAD, trees, key});
      continue;
    }
    if (zone === 'plaza') {
      plazas.push({x0: x0 - .6, z0: z0 - .6, x1: x1 + .6, z1: z1 + .6, key: key - 4});
      const trees = [];
      for (let i = 0; i < 9; i++) trees.push(pal(x0 + .3 + rnd() * (x1 - x0 - .6), z0 + .3 + rnd() * (z1 - z0 - .6)));
      groves.push({x0, z0, x1, z1, trees, key});
      add(x1 - .9, z1 - .7, x1 - .1, z1 - .1, .5, 'kiosk');
      continue;
    }
    if (zone === 'lot') {
      lots.push({x0: x0 - .6, z0: z0 - .6, x1: x1 + .6, z1: z1 + .6, key: key - 4});
      continue;
    }
    if (zone === 'port') {
      if (bx % 2) {
        add(x0 - .7, z0 - .5, x1 + .7, z0 + 2.2, 1.1, 'warehouse', {whiteRoof: true});
        const rows = [];
        for (let z = z0 + 2.7; z + .45 < z1 + .6; z += .55) {
          const stacks = [];
          for (let x = x0 - .6; x + 1.05 < x1 + .7; x += 1.12) stacks.push({x, h: 1 + Math.floor(rnd() * 3), tone: rnd()});
          rows.push({z, stacks});
        }
        yards.push({x0: x0 - .7, z0: z0 + 2.6, x1: x1 + .7, z1: z1 + .6, rows, key: key + 1});
      } else {
        const rows = [];
        for (let z = z0 - .5; z + .45 < z1 + .6; z += .55) {
          const stacks = [];
          for (let x = x0 - .6; x + 1.05 < x1 + .7; x += 1.12) stacks.push({x, h: 1 + Math.floor(rnd() * 3), tone: rnd()});
          rows.push({z, stacks});
        }
        yards.push({x0: x0 - .7, z0: z0 - .5, x1: x1 + .7, z1: z1 + .6, rows, key});
      }
      if (bx % 2 === 0) cranes.push({x: cx, z: 16});
      continue;
    }
    if (zone === 'downtown') {
      const r = rnd();
      if (r < .22) add(x0 + .6, z0 + .6, x1 - .6, z1 - .6, 7 + rnd() * 5, 'glass', {chamfer: rnd() < .5});
      else if (r < .6) add(x0 - .4, z0 - .4, x1 + .4, z1 + .4, 2.2 + rnd() * 1.6, 'office');
      else if (r < .8) { add(x0 - .4, z0, x1 + .4, z0 + 1.6, 3 + rnd() * 2, 'slab'); add(x0, z0 + 2.4, x1 - .6, z1, 1.4 + rnd(), 'office'); }
      else add(x0 - .3, z0, x1 + .3, z1 - .8, 1.2 + rnd() * .4, 'terminal');
      continue;
    }
    if (zone === 'industrial') {
      const r = rnd();
      if (r < .35) add(x0 - .5, z0 - .5, x1 + .5, z1 - 1.2, 1.4 + rnd() * .5, 'warehouse', {whiteRoof: rnd() < .2});
      else if (r < .7) { add(x0 - .5, z0 - .5, x1 + .5, z0 + 1.6, 1.3, 'shed', {saw: true}); add(x0 - .5, z0 + 2.2, x1 + .5, z1 + .5, 1.6, 'warehouse', {whiteRoof: rnd() < .12}); }
      else {
        add(x0 - .5, z0 - .5, x0 + 2, z1 + .5, 1.8, 'shed', {saw: true});
        yards.push({x0: x0 + 2.5, z0: z0 - .5, x1: x1 + .5, z1: z1 + .5, key, rows: [0, 1, 2, 3].map(i => ({z: z0 + i * .9, stacks: [{x: x0 + 2.6, h: 1 + i % 2, tone: rnd()}, {x: x0 + 3.8, h: 1, tone: rnd()}]}))});
      }
      continue;
    }
    // Mixed: one main building per block, leaving open ground, palms and paths around it.
    const r = rnd();
    if (r < .3) {
      const alongX = rnd() < .5;
      if (alongX) add(x0 - .4, z0 + .4, x1 + .4, z0 + 2.1, 2 + rnd() * 2.6, 'slab');
      else add(x0 + .4, z0 - .4, x0 + 2.1, z1 + .4, 2 + rnd() * 2.6, 'slab');
    } else if (r < .52) add(x0 - .2, z0 - .2, x1 + .2, z1 + .2, 1.4 + rnd() * 1.6, 'office');
    else if (r < .66) add(x0 - .3, z0, x1 + .3, z1 - .8, 1.1 + rnd() * .4, 'terminal');
    else if (r < .71) add(x0 + .7, z0 + .7, x1 - .7, z1 - .7, 5 + rnd() * 4, 'glass', {chamfer: rnd() < .4});
    else if (r < .82) { add(x0, z0, x0 + 1.6, z1, 1.6 + rnd() * 1.5, 'slab'); add(x0 + 2.3, z0 + 1.6, x1, z1, 1 + rnd() * .6, 'office'); }
    else {
      // Open ground: a small pavilion among palms.
      const trees = [];
      for (let i = 0; i < 7; i++) trees.push(pal(x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)));
      groves.push({x0, z0, x1, z1, trees, key});
      add(x0 + 1.2, z0 + 1.2, x0 + 2.4, z0 + 2.2, .6, 'office');
    }
  }

  // ---- Village beyond the gorge: fields, farm tracks, houses, barns and silos. ----
  const vx0 = GORGE.x1 + 3.5, vx1 = WORLD.x1 - 2;
  const core = (x, z) => x > 93 && x < 115 && Math.abs(z) < 13;
  for (let x = vx0; x < vx1 - 4; x += 6.5) for (let z = -54; z < 54; z += 6.5) {
    const fx0 = x + .5, fz0 = z + .5, fx1 = x + 6, fz1 = z + 6;
    if (fz1 > -2.6 && fz0 < 2.6) continue; // metro corridor
    if (core(fx0, fz0) || core(fx1, fz1) || core(fx0, fz1) || core(fx1, fz0)) continue;
    const kind = rnd();
    fields.push({x0: fx0, z0: fz0, x1: fx1, z1: fz1, dir: kind < .5 ? 'x' : 'z', crop: kind > .78, fallow: kind > .93});
  }
  for (let x = vx0; x < vx1; x += 6.5) tracks.push({axis: 'z', at: x + .25, from: -55, to: 55});
  tracks.push({axis: 'x', at: -6.25, from: vx0, to: vx1}, {axis: 'x', at: 6.25, from: vx0, to: vx1});
  // Hedgerows on some field edges
  for (const f of fields) if (rnd() < .22) {
    const trees = [];
    for (let x = f.x0 + .3; x < f.x1; x += .7) trees.push({x, z: f.z1 + .1, h: .7 + rnd() * .4, kind: 'round'});
    groves.push({x0: f.x0, z0: f.z1 - .2, x1: f.x1, z1: f.z1 + .4, trees, key: f.x0 + f.z1 + 3});
  }
  // Village core: houses with pitched roofs around two lanes, plus farm buildings.
  for (const side of [-1, 1]) for (let x = 95; x < 114; x += 2.6) {
    if (rnd() < .18) continue;
    const z = side < 0 ? -11 + rnd() * .6 : 8.2 + rnd() * .6, w = 1.5 + rnd() * .5, d = 1.6 + rnd() * .4;
    add(x, z, x + w, z + d, .9 + rnd() * .4, 'house', {ridge: rnd() < .5 ? 'x' : 'z'});
  }
  add(96, -4.6, 99, -2.8, 1.6, 'barn', {ridge: 'x'});
  add(110, 3, 113.2, 5.2, 1.8, 'barn', {ridge: 'z'});
  add(99.8, -4.4, 100.9, -3.3, 3.2, 'silo');
  add(101.3, -4.4, 102.4, -3.3, 2.8, 'silo');
  add(113.8, 3.2, 114.9, 4.3, 3.4, 'silo');
  // Scrub woodland on both gorge rims.
  for (const [x0, x1, side] of [[EDGE + 1, GORGE.x0 - 1.4, 'w'], [GORGE.x1 + 1.2, vx0 - .2, 'e']]) for (let z = -58; z < 58; z += 4) {
    if (Math.abs(z + 2) < 4) continue; // keep the line corridor clear
    const trees = [];
    for (let i = 0; i < 9; i++) if (rnd() < .7) { const tz = z + rnd() * 4, lim = side === 'w' ? rimX(tz, 'w') - 1 : x1; trees.push({x: x0 + rnd() * (Math.min(x1, lim) - x0), z: tz, h: .7 + rnd() * .6, kind: rnd() < .6 ? 'cone' : 'round'}); }
    if (trees.length) groves.push({x0, z0: z, x1, z1: z + 4, trees, key: (x0 + x1) / 2 + z + 2});
  }
  const windmill = {x: 118.5, z: -9.5, h: 4.6};
  add(windmill.x - .45, windmill.z - .45, windmill.x + .45, windmill.z + .45, .35, 'kiosk');
  return {buildings, groves, yards, cranes, plazas, lots, fields, tracks, windmill};
}

/** Cosine-eased run between two points: accelerates, cruises smoothly, stops. */
function ease(from, to, u) { return from + (to - from) * (1 - Math.cos(Math.PI * u)) / 2; }
function easeSpeed(from, to, u, dur) { return Math.abs(to - from) * Math.PI * Math.sin(Math.PI * u) / (2 * dur); }

/** Metro line 1: shuttles Northgate → Central → (gorge bridge) → Millbrook and back. */
export const METRO = {cars: 3, car: 2.2, gap: .16, avg: 3.4, dwell: 7, terminus: 11};
export const metroLength = () => METRO.cars * METRO.car + (METRO.cars - 1) * METRO.gap;
const centre = s => (s.x0 + s.x1) / 2;
const ROUTE = [0, 1, 2, 1].map(i => STOPS[i]);
export function metroCycle() {
  let total = 0;
  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length];
    total += (a === STOPS[0] || a === STOPS[2] ? METRO.terminus : METRO.dwell) + Math.abs(centre(b) - centre(a)) / METRO.avg;
  }
  return total;
}
/** Returns the train centre x, travel direction, speed (units/s), state and station names. */
export function metroAt(t, phase = 0) {
  const cycle = metroCycle();
  let u = ((t + phase) % cycle + cycle) % cycle;
  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length], dwell = a === STOPS[0] || a === STOPS[2] ? METRO.terminus : METRO.dwell;
    const dir = centre(b) > centre(a) ? 1 : -1, towards = (dir > 0 ? STOPS[2] : STOPS[0]).name;
    if (u < dwell) return {x: centre(a), dir, speed: 0, state: 'doors open', at: a.name, towards};
    u -= dwell;
    const dur = Math.abs(centre(b) - centre(a)) / METRO.avg;
    if (u < dur) {
      const k = u / dur;
      return {x: ease(centre(a), centre(b), k), dir, speed: easeSpeed(centre(a), centre(b), k, dur), state: k > .7 ? 'arriving' : k < .25 ? 'departing' : 'running', at: k > .7 ? b.name : a.name, towards};
    }
    u -= dur;
  }
  return {x: centre(STOPS[0]), dir: 1, speed: 0, state: 'doors open', at: STOPS[0].name, towards: STOPS[2].name};
}

/** Freight shuttle along the ground rail corridor (alternating direction each run). */
export const FREIGHT = {cars: 7, car: 2.1, gap: .18, dur: 46, rest: 10};
export function freightAt(t) {
  const len = FREIGHT.cars * FREIGHT.car + (FREIGHT.cars - 1) * FREIGHT.gap, a = -EDGE - 4 - len, b = EDGE + 4 + len;
  const cycle = FREIGHT.dur + FREIGHT.rest, n = Math.floor(t / cycle), u = Math.min(1, (t - n * cycle) / FREIGHT.dur);
  const dir = n % 2 ? -1 : 1;
  return {front: dir > 0 ? ease(a, b, u) : ease(b, a, u), dir};
}

export function carAt(car, t) {
  const len = car.lane.to - car.lane.from;
  const s = (((car.offset + t * car.speed * car.lane.dir) % len) + len) % len;
  const along = car.lane.from + s, across = car.lane.at + car.lane.offset;
  const fade = Math.min(1, s / 3, (len - s) / 3);
  return car.lane.axis === 'x' ? {x: along, z: across, fade} : {x: across, z: along, fade};
}

export function makeTraffic(seed = 77, count = 90) {
  // One speed per lane and evenly spread offsets, so vehicles in a lane never pass through each other.
  const rnd = rng(seed), all = lanes(), cars = [], perLane = Math.ceil(count / all.length);
  all.forEach((lane, i) => {
    const speed = 1.25 + (i * 7 % 5) * .22, len = lane.to - lane.from, n = Math.max(1, Math.min(perLane, Math.round(perLane * (.6 + rnd() * .6))));
    for (let k = 0; k < n; k++) cars.push({lane, offset: (k + rnd() * .55) * len / n, speed, tone: rnd()});
  });
  return cars;
}
