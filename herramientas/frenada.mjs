// Distancia de frenada real del auto (para calibrar la desaceleración que asume la IA).
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track('polvaredas'); const dt = 1 / 120;
for (const v0 of [60, 80, 100, 120]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[10]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 10;
  let tt = 0; while (tt < 15 && c.speed * 3.6 < v0) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); tt += dt; }
  const x0 = c.x, z0 = c.z, v = c.speed; let tb = 0;
  while (c.speed > 1 && tb < 10) { stepCar(c, track, dt, { steer: 0, throttle: 0, brake: 1, handbrake: false }); tb += dt; }
  const d = Math.hypot(c.x - x0, c.z - z0);
  console.log(`${(v * 3.6).toFixed(0)} km/h → ${d.toFixed(1)} m en ${tb.toFixed(2)} s, decel media ${(v / tb).toFixed(2)} m/s², equivalente v²/2d ${(v * v / (2 * d)).toFixed(2)}`);
}
