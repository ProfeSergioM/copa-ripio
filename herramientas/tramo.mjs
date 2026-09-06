// Tiempos de los pilotos IA en el tramo abierto (contrarreloj, uno por vez).
import { Track } from '../js/track.js';
import { createCar, stepCar, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const track = new Track(process.env.CIRCUITO || 'cerro');
const line = buildRacingLine(track);
const dt = 1 / 60, near = [], ev = [];
const t0 = performance.now();
for (const [name, skill, aggr] of DRIVER_NAMES.slice(0, parseInt(process.argv[2] || '6'))) {
  const slot = track.gridSlot(0);
  const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
  const ai = new AIDriver(c, track, line, { skill, aggression: aggr, seed: 3, difficulty: 1 });
  let t = 0, hits = 0, stuck = 0;
  while (t < 240 && c.progress < track.length - 3) { c.input = ai.update(dt, [c], t, 0); stepCar(c, track, dt, c.input); track.barriersNear(c.x, c.z, near); for (const b of near) collideBarrier(c, b, ev); hits += ev.length; ev.length = 0; if (Math.abs(c.speed) < 1 && t > 3) stuck += dt; t += dt; }
  console.log(`${name.padEnd(18)} ${t.toFixed(1)} s  golpes ${hits}  parado ${stuck.toFixed(1)} s`);
}
console.log(`cómputo ${(performance.now() - t0).toFixed(0)} ms`);
