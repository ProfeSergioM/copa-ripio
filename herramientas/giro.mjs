// Prueba de giro: acelera hasta v0 y aplica volante a fondo; imprime el estado cada 0.1 s.
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track();
const v0 = parseFloat(process.argv[2] || '60') / 3.6, hold = parseFloat(process.argv[3] || '2'), th = parseFloat(process.argv[4] || '1');
const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[10]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 10;
const dt = 1 / 120; let t = 0;
while (t < 12 && c.speed < v0) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); t += dt; }
console.log(`v0=${(c.speed*3.6).toFixed(0)} km/h`);
let k = 0;
for (let tt = 0; tt < hold; tt += dt, k++) {
  stepCar(c, track, dt, { steer: 1, throttle: th, brake: 0, handbrake: false });
  if (k % 12 === 0) console.log(`t=${tt.toFixed(1)} v=${(c.speed*3.6).toFixed(0)} steer=${c.steer.toFixed(3)}/${c.maxSteer.toFixed(3)} yaw=${c.yawRate.toFixed(2)} vL=${c.lateralV.toFixed(2)} slipF=${(c.slipF*57.3).toFixed(1)} slipR=${(c.slipR*57.3).toFixed(1)} FyF=${c.FyF.toFixed(0)}/${c.maxF.toFixed(0)} FyR=${c.FyR.toFixed(0)}/${c.latAvailR.toFixed(0)} FxR=${c.FxR.toFixed(0)} surf=${c.surface} lat=${c.lateral.toFixed(1)}`);
}
