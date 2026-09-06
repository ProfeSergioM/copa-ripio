// ¿El alambrado frena a un auto que se va derecho fuera de la pista? Sale perpendicular a fondo desde varios puntos.
import { Track } from '../js/track.js';
import { createCar, stepCar, collideBarrier, resetCarAt } from '../js/physics.js';
const track = new Track(process.env.CIRCUITO || 'polvaredas'); const dt = 1 / 120, near = [], ev = [];
let worst = 0;
for (const idx of [50, 200, 400, 600, 800]) for (const side of [-1, 1]) {
  const q = track.samples[idx];
  const c = createCar(1, 0, 0, 0); c.frozen = false; resetCarAt(c, q.x, q.z, q.heading + side * Math.PI / 2 * -1); c.y = track.heightAt(c.x, c.z); c.trackIdx = idx;
  // rumbo hacia el lado 'side' (nx apunta a lateral positivo)
  c.heading = Math.atan2(q.nx * side, q.nz * side);
  let maxLat = 0, t = 0;
  for (let k = 0; k < 120 * 12; k++) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); track.barriersNear(c.x, c.z, near); for (const b of near) collideBarrier(c, b, ev); ev.length = 0; maxLat = Math.max(maxLat, Math.abs(c.lateral)); t += dt; }
  worst = Math.max(worst, maxLat);
  console.log(`idx ${idx} lado ${side}: lateral máximo ${maxLat.toFixed(1)} m (cerco a ${track.fenceD.toFixed(1)}), velocidad final ${(c.speed * 3.6).toFixed(0)} km/h`);
}
console.log(worst < track.fenceD + 0.5 ? 'OK: nadie pasa el alambrado' : 'FALLA: alguien pasó el alambrado');
