// Una vuelta limpia de un piloto IA solo: tiempo de vuelta y reparto del pedal.
// Sirve para comparar contra lo que hace una persona (el jugador anda cerca de 38 s en el óvalo).
// Uso: CIRCUITO=ovalo EMP=1.16 SKILL=0.95 node herramientas/vuelta.mjs
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';

const nombre = process.env.CIRCUITO || 'ovalo';
const track = new Track(nombre, { reverse: process.env.REVERSE === '1' });
const line = buildRacingLine(track);
const emp = process.env.EMP ? parseFloat(process.env.EMP) : (track.def.aiBoost || 1);
const dif = parseFloat(process.env.DIF || '1'), dd = dif - 1;
const slot = track.gridSlot(0);
const c = createCar(0, slot.x, slot.z, slot.heading);
c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
c.tune = { torque: (1 + dd * 0.9) * emp, grip: (1.02 + dd * 0.9) * emp, brake: (1 + dd * 0.5) * emp };
const ai = new AIDriver(c, track, line, {
  skill: parseFloat(process.env.SKILL || '0.95'), aggression: 0.5, seed: 3, difficulty: dif, tune: c.tune,
  muk: process.env.MUK ? parseFloat(process.env.MUK) : undefined,
  hs: process.env.HS ? parseFloat(process.env.HS) : undefined,
  pace: process.env.PACE ? parseFloat(process.env.PACE) : (track.def.aiPace || 1),
});

const dt = 1 / 120, L = track.length, laps = [];
let t = 0, lastP = 0, lapT = 0, off = 0, vmax = 0;
let tGas = 0, tLev = 0, tFreno = 0, sumaFreno = 0, vueltasFreno = 0;
for (let k = 0; k < 120 * 400 && laps.length < 6; k++) {
  t += dt; lapT += dt;
  if (k % 2 === 0) c.input = ai.update(dt * 2, [c], t, 0);
  stepCar(c, track, dt, c.input);
  if (t > 6) { // sin la largada
    if (c.input.brake > 0.02) { tFreno += dt; sumaFreno += c.input.brake * dt; }
    else if (c.input.throttle > 0.05) tGas += dt; else tLev += dt;
    vmax = Math.max(vmax, c.speed * 3.6);
    if (c.surface === 'grass' || c.surface === 'ditch') off += dt;
  }
  if (c.progress > L * 0.4 && c.progress < L * 0.6) c.halfPassed = true;
  if (lastP > L * 0.85 && c.progress < L * 0.15 && c.halfPassed) { c.halfPassed = false; if (t > 2) laps.push(lapT); lapT = 0; }
  lastP = c.progress;
}
const total = tGas + tLev + tFreno, pc = (x) => `${(100 * x / Math.max(total, 0.001)).toFixed(0)} %`;
console.log(`${nombre}${process.env.REVERSE === '1' ? ' (al revés)' : ''} emp ${emp.toFixed(2)} dif ${dif}`);
console.log(`  vueltas ${laps.map(x => x.toFixed(1)).join(' ')} · mejor ${Math.min(...laps).toFixed(2)} s · fuera ${(off / Math.max(1, laps.length)).toFixed(2)} s/vuelta · punta ${vmax.toFixed(0)} km/h`);
console.log(`  pedal: gas ${pc(tGas)} · levantada ${pc(tLev)} · freno ${pc(tFreno)} (fuerza media ${(sumaFreno / Math.max(tFreno, 0.001)).toFixed(2)})`);
