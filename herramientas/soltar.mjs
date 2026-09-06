// Secuencia del jugador: acelerar, soltar y girar a fondo, y volver a acelerar a fondo girando.
import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
const track = new Track();
for (const v0k of [40, 60]) {
  const c = createCar(1, 0, 0, 0); c.frozen = false; const s0 = track.samples[5]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 5;
  const dt = 1 / 120; let t = 0;
  while (t < 15 && c.speed * 3.6 < v0k) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); t += dt; }
  const log = [];
  const phases = [[1.0, 0, 1, 'suelto+giro'], [3.0, 1, 1, 'a fondo+giro']];
  for (const [dur, th, st, name] of phases) {
    for (let tt = 0; tt < dur; tt += dt) {
      stepCar(c, track, dt, { steer: st, throttle: th, brake: 0, handbrake: false });
      if (Math.round(tt * 120) % 30 === 0) log.push(`${name[0]} ${(c.speed*3.6).toFixed(0)}km/h g${c.gear+1} ${c.rpm.toFixed(0)}rpm ws${c.wheelspin.toFixed(2)} FxR${(c.FxR||0).toFixed(0)} slipR${(c.slipR*57).toFixed(0)}° ${c.surface}${c.reverse?' REV':''}`);
    }
  }
  console.log(`desde ${v0k}: ` + log.join(' | '));
}
