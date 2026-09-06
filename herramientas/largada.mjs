// Analiza los golpes de la largada: quién pega a quién, dónde y con qué velocidad.
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const track = new Track(process.env.CIRCUITO || 'polvaredas');
const line = buildRacingLine(track);
const cars = [];
for (let i = 0; i < 20; i++) {
  const slot = track.gridSlot(i);
  const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false;
  const d = DRIVER_NAMES[i];
  cars.push({ state: c, id: i, ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: 1 }) });
}
const dt = 1 / 120, events = [], near = [];
let t = 0; const log = [];
for (let k = 0; k < 120 * 25; k++) {
  t += dt;
  if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
  for (const c of cars) stepCar(c.state, track, dt, c.input);
  for (let i = 0; i < cars.length; i++) { const a = cars[i].state; for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, events); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, events); }
  for (const e of events) if (e.type === 'car' && e.strength > 4) {
    const A = cars.find(c => c.state === e.a), B = cars.find(c => c.state === e.b);
    const fx = Math.sin(e.a.heading), fz = Math.cos(e.a.heading);
    const lz = (e.b.x - e.a.x) * fx + (e.b.z - e.a.z) * fz;
    log.push(`t=${t.toFixed(1)} #${A.id}(${(A.state.speed*3.6).toFixed(0)}km/h lat${A.state.lateral.toFixed(1)} ${A.state.surface}) vs #${B.id}(${(B.state.speed*3.6).toFixed(0)} lat${B.state.lateral.toFixed(1)}) ${lz > 1 ? 'B adelante' : lz < -1 ? 'A adelante' : 'lado a lado'} fuerza ${e.strength.toFixed(1)} sector ${track.sector(A.state.trackIdx)}`);
  }
  events.length = 0;
}
console.log(log.slice(0, 40).join('\n')); console.log('total', log.length);
