// Distancia de frenada real del auto (para calibrar la desaceleración que asume la IA).
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track('polvaredas'); const dt = 1 / 120;
for (const v0 of [60, 80, 100, 120]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[10]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 10;
  // acelera manteniendose en la cinta (sin corregir, el auto se va al pasto y nunca llega a la velocidad pedida)
  let tt = 0;
  while (tt < 25 && c.speed * 3.6 < v0) {
    const q = track.samples[c.trackIdx];
    const err = ((q.heading - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = Math.max(-1, Math.min(1, err * 2 - c.lateral * 0.15));
    stepCar(c, track, dt, { steer, throttle: 1, brake: 0, handbrake: false }); tt += dt;
  }
  if (c.speed * 3.6 < v0 - 2) { console.log(`${v0} km/h: no los alcanza en la recta (llego a ${(c.speed * 3.6).toFixed(0)})`); continue; }
  const x0 = c.x, z0 = c.z, v = c.speed; let tb = 0;
  while (c.speed > 1 && tb < 10) { stepCar(c, track, dt, { steer: 0, throttle: 0, brake: 1, handbrake: false }); tb += dt; }
  const d = Math.hypot(c.x - x0, c.z - z0);
  console.log(`${(v * 3.6).toFixed(0)} km/h → ${d.toFixed(1)} m en ${tb.toFixed(2)} s, decel media ${(v / tb).toFixed(2)} m/s², equivalente v²/2d ${(v * v / (2 * d)).toFixed(2)}`);
}
