// Background city model: footprints stay off roads and each other; vehicles and trains stay finite.
import assert from 'node:assert/strict';
import {makeCity, makeTraffic, roads, carAt, metroAt, metroCycle, freightAt, metroLength, ROAD, EDGE, STATION, STOPS, GORGE, rimX} from '../src/city-model.js';
const city = makeCity(), list = roads();
assert(city.buildings.length > 80, 'city and village have buildings');
assert(city.fields.length > 40, 'village has fields');
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
  for (const ph of [0, 37]) { const m = metroAt(t, ph); assert(Number.isFinite(m.x) && m.speed >= 0 && m.x >= STOPS[0].x0 && m.x <= STOPS[2].x1); }
  assert(Number.isFinite(freightAt(t).front));
}
const seen = new Set();
for (let t = 0; t < metroCycle(); t += .25) {
  const m = metroAt(t);
  if (m.state === 'doors open') { const st = STOPS.find(s => s.name === m.at); seen.add(m.at); assert(m.x - metroLength() / 2 >= st.x0 - .01 && m.x + metroLength() / 2 <= st.x1 + .01, 'train stops inside the platform'); }
}
assert.deepEqual([...seen].sort(), STOPS.map(s => s.name).sort(), 'metro calls at every station, including the village');
// Village buildings stay east of the gorge, city buildings west of it.
for (const b of city.buildings) assert(b.x1 < rimX(b.z0, 'w') - 2 || b.x0 > rimX(b.z0, 'e') + 1, 'no building in the gorge');
assert(STOPS[2].x0 > GORGE.x1 && STATION.x1 < GORGE.x0, 'line crosses the gorge');
assert(metroLength() < STATION.x1 - STATION.x0 + .5, 'metro fits the platform');
console.log('PASS: city footprints clear roads and each other; traffic, metro and freight stay finite; metro calls at all three stations across the gorge.');
