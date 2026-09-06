// Mide el zigzag de la IA: cambios de sentido lateral (>0.8 m de amplitud) por vuelta, solo y en pelotón.
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const track = new Track(process.env.CIRCUITO || 'polvaredas'); const line = buildRacingLine(track);
function run(nCars, secs) {
  const cars = [];
  for (let i = 0; i < nCars; i++) { const slot = track.gridSlot(i); const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false; const d = DRIVER_NAMES[i]; cars.push({ state: c, name: d[0], ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: 1 }), rev: 0, lastDir: 0, extLat: 0, steerSum: 0, n: 0, laps: 0, lastP: 0, maxAbsSteerIn: 0 }); }
  const dt = 1 / 120, ev = [], near = []; let t = 0;
  for (let k = 0; k < 120 * secs; k++) {
    t += dt;
    if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
    for (const c of cars) stepCar(c.state, track, dt, c.input);
    for (let i = 0; i < cars.length; i++) { const a = cars[i].state; for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, ev); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, ev); }
    ev.length = 0;
    if (k % 6 === 0) for (const c of cars) {
      const s = c.state;
      // cambios de sentido lateral
      const d = s.lateral - c.extLat;
      if (c.lastDir === 0) { c.lastDir = Math.sign(d) || 1; c.extLat = s.lateral; }
      else if (Math.sign(d) === c.lastDir) c.extLat = s.lateral;
      else if (Math.abs(d) > 0.8) { c.rev++; c.lastDir = -c.lastDir; c.extLat = s.lateral; }
      c.steerSum += Math.abs(c.input.steer); c.n++;
      if (c.lastP > track.length * 0.85 && s.progress < track.length * 0.15) c.laps++;
      c.lastP = s.progress;
    }
  }
  return cars;
}
for (const [n, secs] of [[1, 140], [20, 140]]) {
  const cars = run(n, secs);
  const rev = cars.map(c => c.rev / Math.max(1, c.laps + 1)), st = cars.map(c => c.steerSum / c.n);
  console.log(`${n} auto(s): vaivenes laterales por vuelta media ${(rev.reduce((a, b) => a + b) / rev.length).toFixed(1)} (máx ${Math.max(...rev).toFixed(1)}), |volante| medio ${(st.reduce((a, b) => a + b) / st.length).toFixed(2)}`);
}
