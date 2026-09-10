// Techo real de curva según lo que hace el pie: acelerando, de levantada (coasting) o frenando.
// El círculo de fricción reparte el agarre entre doblar y empujar/frenar, así que el pedal cambia el radio.
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
const pista = new Track('ovalo');
const grip = parseFloat(process.env.GRIP || '1.18');
const plano = { heightAt: () => 0, slopeAt: () => ({ gx: 0, gz: 0 }), surfaceAt: () => 'gravel', nearest: () => ({ dist: 0, idx: 0, lateral: 0 }), gripScale: 1, samples: pista.samples, n: pista.n, wrap: (i) => pista.wrap(i), marks: null, barriersNear: () => {}, step: 1, hw: 6, W: 8 };
function prueba(kmh, modo) {
  let mejor = 0;
  for (let f = 0.1; f <= 1.0001; f += 0.05) {
    const c = createCar(0, 0, 0, 0);
    c.frozen = false; c.tune = { torque: 1, grip, brake: 1 }; c.vz = kmh / 3.6; c.trackIdx = 0;
    const dt = 1 / 240; let lat = 0, n = 0, vfin = 0;
    for (let k = 0; k < 240 * 5; k++) {
      const v = Math.hypot(c.vx, c.vz);
      let inp = { steer: f, throttle: 0, brake: 0, handbrake: false };
      if (modo === 'gas') inp.throttle = v < kmh / 3.6 ? 0.3 : 0.05;
      else if (modo === 'freno') inp.brake = 0.25;
      stepCar(c, plano, dt, inp);
      if (k > 240 * 2) { lat += Math.abs(v * c.yawRate); n++; vfin = v; }
    }
    mejor = Math.max(mejor, lat / Math.max(n, 1) / 9.81);
  }
  return mejor;
}
console.log('v(km/h)   gas   levantada   freno');
for (const kmh of [45, 60, 75, 90, 105]) {
  console.log(String(kmh).padStart(7), prueba(kmh, 'gas').toFixed(2).padStart(6), prueba(kmh, 'coast').toFixed(2).padStart(11), prueba(kmh, 'freno').toFixed(2).padStart(7));
}
