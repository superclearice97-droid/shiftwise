// Background city model: footprints stay off roads and each other; vehicles and trains stay finite.
import assert from 'node:assert/strict';
import {makeCity, makeTraffic, roads, carAt, metroAt, freightAt, metroLength, ROAD, EDGE, STATION} from '../src/city-model.js';
const city = makeCity(), list = roads();
assert(city.buildings.length > 150, 'dense city');
for (const b of city.buildings) {
  assert([b.x0, b.z0, b.x1, b.z1, b.h].every(Number.isFinite) && b.x1 > b.x0 && b.z1 > b.z0 && b.h > 0);
  for (const r of list) {
    const [lo, hi] = r.axis === 'x' ? [b.z0, b.z1] : [b.x0, b.x1], [a0, a1] = r.axis === 'x' ? [b.x0, b.x1] : [b.z0, b.z1];
    if (a1 < r.from || a0 > r.to) continue;
    assert(hi <= r.at - ROAD || lo >= r.at + ROAD, 'building must not sit on a road');
  }
}
for (let i = 0; i < city.buildings.length; i++) for (let j = i + 1; j < city.buildings.length; j++) {
  const a = city.buildings[i], b = city.buildings[j];
  assert(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, 'footprints must not overlap');
}
const cars = makeTraffic();
for (let t = 0; t < 400; t += 1.7) {
  for (const c of cars) { const p = carAt(c, t); assert(Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= EDGE + 1 && Math.abs(p.z) <= EDGE + 1); }
  for (const dir of [1, -1]) { const m = metroAt(t, dir); assert(Number.isFinite(m.front) && m.speed >= 0); }
  assert(Number.isFinite(freightAt(t).front));
}
let dwell = false;
for (let t = 0; t < 120; t += .25) { const m = metroAt(t, 1); if (m.state === 'doors open') { dwell = true; assert(m.front > STATION.x0 && m.front <= STATION.x1); } }
assert(dwell, 'inbound metro stops at the station');
assert(metroLength() < STATION.x1 - STATION.x0 + .5, 'metro fits the platform');
console.log('PASS: city footprints clear roads and each other; traffic, metro and freight stay finite; metro dwells at the station.');
