// Doblar acelerando desde muy despacio, con y sin daño de motor: ¿se tranca?
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track();
for (const [label, dmgRear, st, v0k] of [['sano, volante a fondo desde 15', 0, 1, 15], ['motor 0.7, volante a fondo desde 15', 0.7, 1, 15], ['motor 0.7, medio volante desde 25', 0.7, 0.5, 25], ['sano, volante a fondo desde 5', 0, 1, 5]]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[5]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 5; c.damage.rear = dmgRear;
  const dt = 1 / 120; let t = 0;
  while (t < 15 && c.speed * 3.6 < v0k) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); t += dt; }
  const log = [];
  for (let tt = 0; tt < 4; tt += dt) { stepCar(c, track, dt, { steer: st, throttle: 1, brake: 0, handbrake: false }); if (Math.round(tt * 120) % 60 === 0) log.push(`${(c.speed * 3.6).toFixed(0)}km/h(g${c.gear + 1} ${c.rpm.toFixed(0)}rpm ws${c.wheelspin.toFixed(1)}${c.misfiring ? ' FALLA' : ''})`); }
  console.log(`${label}: ${log.join(' → ')}`);
}
