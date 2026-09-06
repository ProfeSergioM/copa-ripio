// Un solo piloto IA da vueltas: imprime su trayectoria por segundo para depurar.
import { Track } from '../js/track.js';
import { createCar, stepCar, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';

const track = new Track(process.env.CIRCUITO || 'polvaredas', { reverse: process.argv[3] === 'reverse' });
const line = buildRacingLine(track);
const slot = track.gridSlot(0);
const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false;
const ai = new AIDriver(c, track, line, { skill: parseFloat(process.argv[2] || '0.9'), aggression: 0.5, seed: 3, difficulty: 1 });
const dt = 1 / 120, events = [], near = [];
let t = 0, lastP = 0, lapT = 0; const laps = [];
for (let k = 0; k < 120 * 150; k++) {
  t += dt; lapT += dt;
  if (k % 2 === 0) c.input = ai.update(dt * 2, [c], t, 0);
  stepCar(c, track, dt, c.input);
  track.barriersNear(c.x, c.z, near); for (const b of near) collideBarrier(c, b, events);
  if (events.length) { console.log(`  t=${t.toFixed(1)} golpe ${events[0].type} fuerza ${events[0].strength.toFixed(1)}`); events.length = 0; }
  if (c.progress > track.length * 0.4 && c.progress < track.length * 0.6) c.halfPassed = true;
  if (lastP > track.length * 0.85 && c.progress < track.length * 0.15 && c.halfPassed) { c.halfPassed = false; laps.push(lapT); console.log(`VUELTA ${laps.length}: ${lapT.toFixed(1)} s`); lapT = 0; }
  lastP = c.progress;
  if (k % 120 === 0) console.log(`t=${t.toFixed(0).padStart(3)} ${track.sector(c.trackIdx).padEnd(22)} v=${(c.speed * 3.6).toFixed(0).padStart(3)} km/h lat=${c.lateral.toFixed(1).padStart(5)} ${c.surface.padEnd(8)} g${c.gear + 1} rpm=${c.rpm.toFixed(0)} steer=${c.steer.toFixed(2)} in=${c.input.steer.toFixed(2)} th=${c.input.throttle.toFixed(2)} br=${c.input.brake.toFixed(2)} slipR=${(c.slipR * 57.3).toFixed(0)}° perm=${((ai.allowed||0)*3.6).toFixed(0)} Rmin90=${(1/Math.max(...Array.from({length:45},(_,k)=>Math.abs(track.samples[(c.trackIdx+k*2)%track.n].curvS)))).toFixed(0)} ${c.airborne ? 'AIRE' : ''} ${ai.recoverT > 0 ? 'RECUP' : ''}`);
}
console.log('vueltas', laps.map(x => x.toFixed(1)).join(' '));
