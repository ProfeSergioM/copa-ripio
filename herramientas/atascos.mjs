// Dónde se quedan parados los rivales (sector, superficie) en una carrera de 20.
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const track = new Track(process.env.CIRCUITO || 'polvaredas');
const line = buildRacingLine(track);
const cars = [];
for (let i = 0; i < 20; i++) { const slot = track.gridSlot(i); const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false; const d = DRIVER_NAMES[i]; cars.push({ state: c, name: d[0], ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: 1 }), stuckHere: null }); }
const dt = 1 / 120, events = [], near = []; let t = 0; const where = {}; const detail = [];
for (let k = 0; k < 120 * 150; k++) {
  t += dt;
  if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
  for (const c of cars) stepCar(c.state, track, dt, c.input);
  for (let i = 0; i < cars.length; i++) { const a = cars[i].state; for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, events); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, events); }
  events.length = 0;
  if (k % 12 === 0) for (const c of cars) {
    const s = c.state;
    if (Math.abs(s.speed) < 1 && t > 6) {
      const key = `${track.sector(s.trackIdx)} · ${s.surface} · lat ${Math.round(s.lateral / 3) * 3}`;
      where[key] = (where[key] || 0) + 0.1;
      if (!c.stuckHere) { c.stuckHere = key; detail.push(`t=${t.toFixed(0)} ${c.name} se traba en ${key} (rumbo err ${((s.heading - track.samples[s.trackIdx].heading) * 57.3).toFixed(0)}°, recup=${c.ai.recoverT.toFixed(1)})`); }
    } else c.stuckHere = null;
  }
}
console.log(Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v.toFixed(1)} s  ${k}`).join('\n'));
console.log(detail.slice(0, 12).join('\n'));
