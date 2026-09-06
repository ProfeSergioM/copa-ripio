// Salir al pasto y volver: ¿salta?
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track();
let maxVy = 0, maxAir = 0, air = 0;
for (const idx of [30, 200, 500, 700]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[idx]; resetCarAt(c, s0.x + s0.nx * 12, s0.z + s0.nz * 12, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = idx;
  const dt = 1 / 120;
  for (let t = 0; t < 6; t += dt) { stepCar(c, track, dt, { steer: -0.35, throttle: 1, brake: 0, handbrake: false }); maxVy = Math.max(maxVy, c.vy); if (c.airborne) { air += dt; maxAir = Math.max(maxAir, c.y - track.heightAt(c.x, c.z)); } }
}
console.log(`vy máx ${maxVy.toFixed(1)} m/s, tiempo en el aire ${air.toFixed(2)} s, altura máx ${maxAir.toFixed(2)} m`);
