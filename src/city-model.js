// Shiftwise city — pure world model (no DOM). Original layout; decorative only.
// Ground plane is X/Z, Y is up. One unit is roughly one storey.
export const GRID = 8, BLOCKS = 14, HALF = 56, EDGE = 62, ROAD = .95;
export const METRO_Z = 0, RAIL_X = 24, DECK = 2.4;
export const STATION = {x0: 1.2, x1: 8.8, name: 'Central'};
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

export function zoneOf(bx, bz) {
  const x = blockMin(bx), z = blockMin(bz), cx = bx - 2, cz = bz - 2; // cx/cz: the designed core is 0..9
  if (x < -8 && z >= 16) return 'water';
  if (x < -8 && z === 8) return 'port';
  if (cx < 0 || cz < 0 || cx > 9 || cz > 9) {
    if (cz > 9 && x >= -8) return 'industrial';
    return (bx * 7 + bz * 3) % 5 === 0 ? 'park' : 'residential';
  }
  if ((cx <= 2 && cz <= 2) || (cx === 3 && cz === 3) || (cx === 8 && cz === 1)) return 'park';
  if (cx === 4 && cz === 5) return 'wheel';
  if ((cx >= 5 && cx <= 7 && cz >= 2 && cz <= 4) || (cx === 6 && cz === 5)) return 'downtown';
  if (cx >= 4 && cz >= 7) return 'industrial';
  return 'residential';
}

/** Road centre-line segments. axis 'x' runs along X at z=at; axis 'z' runs along Z at x=at. */
export function roads() {
  const list = [];
  for (let k = 0; k <= BLOCKS; k++) {
    const r = -HALF + GRID * k;
    // Along X: the waterfront road z=16 stays; roads further into the bay start at the shore.
    list.push({axis: 'x', at: r, from: r > 16 ? -8 : -EDGE, to: EDGE, metro: r === METRO_Z});
    if (r === RAIL_X) continue; // rail corridor replaces this avenue
    list.push({axis: 'z', at: r, from: -EDGE, to: r < -8 ? 16 : EDGE});
  }
  return list;
}

/** Car lanes: full-length roads only, so vehicles enter and leave beyond the visible city. */
export function lanes() {
  const out = [];
  for (const r of roads()) {
    if (r.metro || r.from !== -EDGE || r.to !== EDGE) continue;
    out.push({...r, offset: .42, dir: 1}, {...r, offset: -.42, dir: -1});
  }
  return out;
}

/** Static building footprints and decorations. Footprints never overlap and never enter roads. */
export function makeCity(seed = 1307) {
  const rnd = rng(seed), buildings = [], groves = [], yards = [], cranes = [], plazas = [], palms = [];
  const add = (x0, z0, x1, z1, h, style, extra = {}) => buildings.push({x0, z0, x1, z1, h, style, seed: Math.floor(rnd() * 1e9), ...extra});
  for (let bx = 0; bx < BLOCKS; bx++) for (let bz = 0; bz < BLOCKS; bz++) {
    const zone = zoneOf(bx, bz), x0 = blockMin(bx) + 1.35, z0 = blockMin(bz) + 1.35, x1 = x0 + GRID - 2.7, z1 = z0 + GRID - 2.7;
    const span = x1 - x0;
    if (zone === 'water') continue;
    if (zone === 'park') {
      const trees = [];
      for (let x = x0 + .3; x < x1; x += .78) for (let z = z0 + .3; z < z1; z += .78) {
        if (rnd() < .16) continue;
        trees.push({x: x + (rnd() - .5) * .35, z: z + (rnd() - .5) * .35, h: .9 + rnd() * .8, kind: rnd() < .55 ? 'round' : 'cone'});
      }
      groves.push({x0, z0, x1, z1, trees, paths: true});
      continue;
    }
    if (zone === 'wheel') {
      plazas.push({x0, z0, x1, z1});
      for (const [x, z] of [[x0 + .4, z0 + .4], [x1 - .4, z0 + .4], [x0 + .4, z1 - .4], [x1 - .4, z1 - .4], [x0 + .4, (z0 + z1) / 2], [x1 - .4, (z0 + z1) / 2]]) palms.push({x, z, h: 1.7 + rnd() * .5});
      add(x1 - 1.3, z1 - 1, x1 - .35, z1 - .35, .55, 'kiosk');
      continue;
    }
    if (zone === 'port') {
      const rows = [];
      for (let z = z0 + .1; z + .45 < z1 - 1.2; z += .62) {
        const stacks = [];
        for (let x = x0 + .1; x + 1.05 < x1; x += 1.12) stacks.push({x, h: 1 + Math.floor(rnd() * 3), tone: rnd()});
        rows.push({z, stacks});
      }
      yards.push({x0, z0, x1, z1, rows});
      if (bx % 2 === 0) cranes.push({x: (x0 + x1) / 2, z: 16});
      continue;
    }
    if (zone === 'downtown') {
      if (rnd() < .38) {
        const inset = .25 + rnd() * .3;
        add(x0 + inset, z0 + inset, x1 - inset, z1 - inset, 8 + rnd() * 8, rnd() < .6 ? 'tower' : 'office', {crown: rnd() < .5});
      } else if (rnd() < .5) {
        const cut = x0 + span * (.42 + rnd() * .16);
        add(x0, z0, cut - .25, z1, 4.5 + rnd() * 7, 'tower');
        add(cut + .25, z0, x1, z1, 3.5 + rnd() * 6, rnd() < .5 ? 'office' : 'tower');
      } else {
        const cut = z0 + span * (.42 + rnd() * .16);
        add(x0, z0, x1, cut - .25, 4.5 + rnd() * 8, 'office');
        add(x0, cut + .25, x1, z1, 3 + rnd() * 5, 'tower');
      }
      continue;
    }
    if (zone === 'industrial') {
      const back = z0 + span * .6;
      add(x0, z0, x1, back - .2, 1.7 + rnd() * .7, 'warehouse', {whiteRoof: rnd() < .45, stripes: rnd() < .7});
      if (rnd() < .6) add(x0, back + .2, x0 + span * .55, z1, 1.1 + rnd() * .5, 'shed');
      else yards.push({x0, z0: back + .2, x1, z1, rows: [{z: back + .45, stacks: [{x: x0 + .2, h: 1, tone: .3}, {x: x0 + 1.4, h: 2, tone: .8}, {x: x0 + 2.6, h: 1, tone: .5}]}]});
      continue;
    }
    // Residential: four lots, some left as courtyards with trees.
    const half = span / 2;
    for (const [qx, qz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const lx0 = x0 + qx * half + (qx ? .2 : 0), lz0 = z0 + qz * half + (qz ? .2 : 0), lx1 = lx0 + half - .2, lz1 = lz0 + half - .2;
      if (rnd() < .2) {
        const trees = [];
        for (let i = 0; i < 4; i++) trees.push({x: lx0 + .45 + (i % 2) * (half - 1.1), z: lz0 + .45 + Math.floor(i / 2) * (half - 1.1), h: .9 + rnd() * .5, kind: 'round'});
        groves.push({x0: lx0, z0: lz0, x1: lx1, z1: lz1, trees});
        continue;
      }
      const s = .1 + rnd() * .35;
      add(lx0 + s, lz0 + s, lx1 - s * .6, lz1 - s * .6, 1.3 + rnd() * 3.6, rnd() < .25 ? 'office' : 'mid');
    }
  }
  return {buildings, groves, yards, cranes, plazas, palms};
}

/** Cosine-eased run between two points: accelerates, cruises smoothly, stops. */
function ease(from, to, u) { return from + (to - from) * (1 - Math.cos(Math.PI * u)) / 2; }
function easeSpeed(from, to, u, dur) { return Math.abs(to - from) * Math.PI * Math.sin(Math.PI * u) / (2 * dur); }

/** Metro service along the elevated line. dir 1 runs toward +X ("Harbor"), -1 toward -X ("Northgate"). */
export const METRO = {cars: 3, car: 2.2, gap: .16, avg: 2.5, dwell: 7, rest: 4};
export const metroLength = () => METRO.cars * METRO.car + (METRO.cars - 1) * METRO.gap;
export function metroAt(t, dir, phase = 0) {
  const len = metroLength(), start = dir > 0 ? -EDGE - 6 : EDGE + 6 + len, end = dir > 0 ? EDGE + 6 + len : -EDGE - 6;
  const stop = dir > 0 ? STATION.x1 - .2 : STATION.x0 + .2; // position of the leading end
  const ta = Math.abs(stop - start) / METRO.avg, tb = Math.abs(end - stop) / METRO.avg, cycle = ta + METRO.dwell + tb + METRO.rest;
  let u = ((t + phase) % cycle + cycle) % cycle;
  if (u < ta) return {front: ease(start, stop, u / ta), speed: easeSpeed(start, stop, u / ta, ta), state: u / ta > .55 ? 'arriving' : 'running'};
  u -= ta;
  if (u < METRO.dwell) return {front: stop, speed: 0, state: 'doors open'};
  u -= METRO.dwell;
  if (u < tb) return {front: ease(stop, end, u / tb), speed: easeSpeed(stop, end, u / tb, tb), state: 'departing'};
  return {front: end, speed: 0, state: 'depot'};
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
  return car.lane.axis === 'x' ? {x: along, z: across} : {x: across, z: along};
}

export function makeTraffic(seed = 77, count = 120) {
  // One speed per lane and evenly spread offsets, so vehicles in a lane never pass through each other.
  const rnd = rng(seed), all = lanes(), cars = [], perLane = Math.ceil(count / all.length);
  all.forEach((lane, i) => {
    const speed = 1.25 + (i * 7 % 5) * .22, len = lane.to - lane.from, n = Math.max(1, Math.min(perLane, Math.round(perLane * (.6 + rnd() * .6))));
    for (let k = 0; k < n; k++) cars.push({lane, offset: (k + rnd() * .55) * len / n, speed, tone: rnd()});
  });
  return cars;
}
