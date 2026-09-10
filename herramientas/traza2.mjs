// Traza de una vuelta: velocidad real, velocidad que se cree permitida y el techo físico del auto.
// Uso: CIRCUITO=ovalo HS=0.006 node herramientas/traza2.mjs
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
const track = new Track(process.env.CIRCUITO || 'ovalo');
const line = buildRacingLine(track);
const emp = process.env.EMP ? parseFloat(process.env.EMP) : (track.def.aiBoost || 1);
const slot = track.gridSlot(0);
const c = createCar(0, slot.x, slot.z, slot.heading);
c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
c.tune = { torque: emp, grip: 1.02 * emp, brake: emp };
const ai = new AIDriver(c, track, line, { skill: 0.95, aggression: 0.5, seed: 3, difficulty: 1, tune: c.tune, hs: process.env.HS ? parseFloat(process.env.HS) : undefined });
const dt = 1 / 120, L = track.length, n = track.samples.length;
const bal = new Array(n).fill(null);
let t = 0, lastP = 0, vueltas = 0;
for (let k = 0; k < 120 * 200 && vueltas < 5; k++) {
  t += dt; if (k % 2 === 0) c.input = ai.update(dt * 2, [c], t, 0); stepCar(c, track, dt, c.input);
  if (c.progress > L * 0.4 && c.progress < L * 0.6) c.halfPassed = true;
  if (lastP > L * 0.85 && c.progress < L * 0.15 && c.halfPassed) { c.halfPassed = false; vueltas++; }
  lastP = c.progress;
  if (vueltas === 3 && k % 6 === 0) {
    const i = c.trackIdx, q = track.samples[i];
    // techo físico: lo que aguantan las gomas con el radio que está describiendo el auto
    const curvReal = Math.abs(c.yawRate) / Math.max(Math.abs(c.speed), 1);
    bal[i] = { v: c.speed * 3.6, perm: (ai.allowed || 0) * 3.6, techo: Math.sqrt(1.0 * c.tune.grip * 9.81 / Math.max(Math.abs(q.curvS), 1e-4)) * 3.6, lat: c.lateral, gas: c.input.throttle, fre: c.input.brake, curv: q.curvS, curvReal, latG: Math.abs(c.speed * c.yawRate) / 9.81 };
  }
}
const filas = bal.map((b, i) => b && { i, ...b }).filter(Boolean);
console.log('idx  v(km/h) permit techo  latG  lat(m) gas fre  curvPista curvAuto');
for (let k = 0; k < filas.length; k += Math.max(1, Math.round(filas.length / 42))) {
  const f = filas[k];
  console.log(String(f.i).padStart(4), f.v.toFixed(0).padStart(7), f.perm.toFixed(0).padStart(6), f.techo.toFixed(0).padStart(6), f.latG.toFixed(2).padStart(6), f.lat.toFixed(1).padStart(6), f.gas.toFixed(2).padStart(5), f.fre.toFixed(2).padStart(4), f.curv.toFixed(4).padStart(9), f.curvReal.toFixed(4).padStart(9));
}
const latMax = Math.max(...filas.map(f => f.latG));
console.log(`latG máximo ${latMax.toFixed(2)} · velocidad media ${(filas.reduce((a, f) => a + f.v, 0) / filas.length).toFixed(1)} km/h`);
