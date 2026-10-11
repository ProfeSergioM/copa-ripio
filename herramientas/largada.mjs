// Largada con técnica: cuánto se gana o se pierde según el régimen al verde.
// Arma un auto en la grilla, lo acelera quieto hasta el régimen pedido, lo suelta y mide en cuánto recorre
// 30, 60 y 100 m a fondo. Uso: node herramientas/largada.mjs [circuito]
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { CAR, LARGADA } from '../js/config.js';

const track = new Track(process.argv[2] || 'polvaredas');
const slot = track.gridSlot(0);
const dt = 1 / 120;

function correr(revs) {
  const c = createCar(0, slot.x, slot.z, slot.heading);
  c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = true;
  // acelerador constante que deja el motor en el régimen pedido (0 = sin acelerar en la previa)
  const pie = revs ? (revs - CAR.idleRpm) / (CAR.redline * 0.97 - CAR.idleRpm) : 0;
  for (let i = 0; i < 120 * 3; i++) stepCar(c, track, dt, { steer: 0, throttle: pie, brake: 0, handbrake: false });
  const alVerde = c.rpm;
  c.frozen = false;
  const x0 = c.x, z0 = c.z, marcas = [30, 60, 100], tiempos = [];
  let t = 0;
  while (tiempos.length < marcas.length && t < 20) {
    stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false });
    t += dt;
    if (Math.hypot(c.x - x0, c.z - z0) >= marcas[tiempos.length]) tiempos.push(t);
  }
  return { alVerde: Math.round(alVerde), tipo: c.largada ? c.largada.tipo : '-', calidad: c.largada ? +c.largada.calidad.toFixed(2) : 0, tiempos };
}

const base = correr(0);
console.log(`franja ${LARGADA.desde}-${LARGADA.hasta} rpm, empuje ${LARGADA.empuje}, dura ${LARGADA.dur} s`);
console.log('régimen  al verde  tipo       calidad   30 m    60 m    100 m   (diferencia contra no acelerar)');
for (const r of [0, 2800, 3300, 4250, 5200, 5700, 6100]) {
  const x = correr(r);
  const d = x.tiempos.map((v, i) => (v - base.tiempos[i] >= 0 ? '+' : '') + (v - base.tiempos[i]).toFixed(2));
  console.log(String(r || 'nada').padStart(7), String(x.alVerde).padStart(9), x.tipo.padEnd(10), String(x.calidad).padStart(7), ...x.tiempos.map(v => v.toFixed(2).padStart(7)), '  (' + d.join(' ') + ')');
}
