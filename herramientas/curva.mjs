// Acelerar en curva: entra a v0 con volante fijo (fracción) y acelerador a fondo 3 s. ¿Gana velocidad?
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track();
for (const [v0k, st] of [[30, 1], [30, 0.5], [45, 1], [45, 0.5], [60, 0.6]]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[5]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 5;
  const dt = 1 / 120; let t = 0;
  while (t < 15 && c.speed * 3.6 < v0k) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); t += dt; }
  const log = [];
  for (let tt = 0; tt < 3; tt += dt) { stepCar(c, track, dt, { steer: st, throttle: 1, brake: 0, handbrake: false }); if (Math.round(tt * 120) % 60 === 0) log.push(`${(c.speed * 3.6).toFixed(0)}(g${c.gear + 1},${c.steer.toFixed(2)},${(c.slipR * 57).toFixed(0)}°)`); }
  console.log(`v0=${v0k} volante=${st}: ${log.join(' → ')}`);
}
