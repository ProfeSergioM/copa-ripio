// Un piloto IA solo: segundos fuera de pista por vuelta y tiempo de vuelta, para calibrar MUK/HS.
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
const out = [];
for (const name of (process.env.CIRCUITO || 'polvaredas,ovalo').split(',')) {
  const track = new Track(name); const line = buildRacingLine(track);
  const slot = track.gridSlot(0); const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
  const ai = new AIDriver(c, track, line, { skill: parseFloat(process.env.SKILL || '0.9'), aggression: 0.5, seed: 3, difficulty: 1, muk: process.env.MUK ? parseFloat(process.env.MUK) : undefined, hs: process.env.HS ? parseFloat(process.env.HS) : undefined });
  const dt = 1 / 120; let t = 0, lastP = 0, lapT = 0, off = 0; const laps = []; const L = track.length;
  for (let k = 0; k < 120 * 300 && laps.length < 4; k++) {
    t += dt; lapT += dt; if (k % 2 === 0) c.input = ai.update(dt * 2, [c], t, 0); stepCar(c, track, dt, c.input);
    if (c.progress > L * 0.4 && c.progress < L * 0.6) c.halfPassed = true;
    if (lastP > L * 0.85 && c.progress < L * 0.15 && c.halfPassed) { c.halfPassed = false; if (t > 2) laps.push(lapT); lapT = 0; }
    lastP = c.progress; if (t > 10 && (c.surface === 'grass' || c.surface === 'ditch')) off += dt;
  }
  out.push(`${name}: vueltas ${laps.map(x => x.toFixed(1)).join(' ')} · fuera ${(off / Math.max(1, laps.length)).toFixed(1)} s/vuelta`);
}
console.log(`MUK ${process.env.MUK || '0.72'} HS ${process.env.HS || '0'} → ${out.join(' | ')}`);
