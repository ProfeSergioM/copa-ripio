// Traza detallada del primer rival que se traba (qué hace la IA y la física mientras está parado).
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const track = new Track('polvaredas'); const line = buildRacingLine(track);
const cars = [];
for (let i = 0; i < 20; i++) { const slot = track.gridSlot(i); const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false; const d = DRIVER_NAMES[i]; cars.push({ state: c, name: d[0], ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: 1 }), stuckT: 0 }); }
const dt = 1 / 120, events = [], near = []; let t = 0, target = null, traceEnd = 0;
for (let k = 0; k < 120 * 150; k++) {
  t += dt;
  if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
  for (const c of cars) stepCar(c.state, track, dt, c.input);
  const hits = [];
  for (let i = 0; i < cars.length; i++) { const a = cars[i].state; for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, events); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, events); }
  for (const e of events) if (target && e.a === target.state) hits.push(e.type + (e.bar ? '' : '(auto)'));
  events.length = 0;
  for (const c of cars) { if (Math.abs(c.state.speed) < 1 && t > 6) c.stuckT += dt; else c.stuckT = 0; if (!target && c.stuckT > 3 && c.state.surface === 'ditch') { target = c; traceEnd = t + 8; console.log(`${c.name} trabado en t=${t.toFixed(0)} ${track.sector(c.state.trackIdx)}`); } }
  if (target && t < traceEnd && k % 30 === 0) {
    const s = target.state, ai = target.ai, inp = target.input;
    const barsNear = []; track.barriersNear(s.x, s.z, barsNear);
    const close = barsNear.map(b => ({ b, d: Math.hypot(b.x - s.x, b.z - s.z) - b.r })).filter(o => o.d < 2.5).map(o => `${o.b.type}@${o.d.toFixed(1)}`);
    console.log(`t=${t.toFixed(1)} v=${(s.speed * 3.6).toFixed(0)} lat=${s.lateral.toFixed(1)} ${s.surface} in(st=${inp.steer.toFixed(2)} th=${inp.throttle.toFixed(2)} br=${inp.brake.toFixed(2)}) steer=${s.steer.toFixed(2)} perm=${(ai.allowed * 3.6).toFixed(0)} recup=${ai.recoverT.toFixed(1)} muro=${ai.outsideWall} rev=${s.reverse} pend=${(s.gradF || 0).toFixed(2)} cerca=[${close.join(' ')}] golpes=[${hits.join(' ')}]`);
  }
}
