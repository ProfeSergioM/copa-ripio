// Simulación sin navegador: corre una carrera con los 20 pilotos IA y pruebas de manejo del jugador.
// Uso: node herramientas/simular.mjs [segundos] [reverse]
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier, resetCarAt } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';

const seconds = parseFloat(process.argv[2] || '200');
const reverse = process.argv[3] === 'reverse';
const track = new Track(process.env.CIRCUITO || 'polvaredas', { reverse });
console.log(`Pista: ${track.length.toFixed(0)} m, ${track.n} muestras, radio mínimo ${track.minCurveRadius.toFixed(1)} m, meta en (${track.samples[0].x.toFixed(0)}, ${track.samples[0].z.toFixed(0)})`);
let maxSlope = 0; for (const s of track.samples) maxSlope = Math.max(maxSlope, Math.abs(s.slope));
console.log(`Pendiente máxima ${(maxSlope * 100).toFixed(1)} %, barreras ${track.barriers.length}`);
const line = buildRacingLine(track);

// ---- carrera IA
const cars = [];
for (let i = 0; i < 20; i++) {
  const slot = track.gridSlot(i);
  const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false;
  const d = DRIVER_NAMES[i];
  cars.push({ state: c, name: d[0], ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: 1 }), lastP: 0, laps: [], lapT: 0, hits: 0, stuck: 0, maxSpeed: 0, air: 0, spins: 0 });
}
const dt = 1 / 120, L = track.length;
const events = [];
const near = [];
let t = 0, startHits = 0;
const steps = Math.round(seconds / dt);
for (let k = 0; k < steps; k++) {
  t += dt;
  if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
  for (const c of cars) stepCar(c.state, track, dt, c.input);
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i].state;
    for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, events);
    track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, events);
  }
  for (const e of events) { const A = cars.find(c => c.state === e.a); if (A) A.hits++; if (e.b) { const B = cars.find(c => c.state === e.b); if (B) B.hits++; } if (e.type === 'car' && e.strength > 4 && t < 20) startHits++; }
  events.length = 0;
  for (const c of cars) {
    const s = c.state; c.lapT += dt;
    if (s.progress > L * 0.4 && s.progress < L * 0.6) s.halfPassed = true;
    if (c.lastP > L * 0.85 && s.progress < L * 0.15 && s.halfPassed) { s.halfPassed = false; if (t > 2) { c.laps.push(c.lapT); } c.lapT = 0; }
    c.lastP = s.progress;
    c.maxSpeed = Math.max(c.maxSpeed, s.speed);
    if (Math.abs(s.speed) < 1 && t > 5) c.stuck += dt;
    if (s.airborne) c.air += dt;
    if (Math.abs(s.slipR) > 1.0) c.spins += dt;
  }
}
console.log(`
Golpes fuertes entre autos en los primeros 20 s: ${startHits}`);
console.log('\nPiloto              vueltas  mejor    últ.    vmax km/h  golpes  parado s  aire s  trompo s  daño');
for (const c of cars) {
  const best = c.laps.length ? Math.min(...c.laps) : NaN;
  const d = c.state.damage;
  console.log(`${c.name.padEnd(20)}${String(c.laps.length).padStart(4)}   ${best.toFixed(1).padStart(6)}  ${(c.laps.at(-1) || NaN).toFixed(1).padStart(6)}   ${(c.maxSpeed * 3.6).toFixed(0).padStart(6)}   ${String(c.hits).padStart(5)}   ${c.stuck.toFixed(1).padStart(6)}  ${c.air.toFixed(1).padStart(6)}  ${c.spins.toFixed(1).padStart(7)}   ${((d.front + d.rear + d.left + d.right) / 4 * 100).toFixed(0)}%`);
}

// ---- prueba de manejo "de teclado": recta, acelerador a fondo, luego volante a fondo
function handlingTest(label, speedTarget, steerHold) {
  const c = createCar(99, 0, 0, 0); c.frozen = false;
  const s0 = track.samples[10]; resetCarAt(c, s0.x, s0.z, s0.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = 10;
  let tt = 0, maxYaw = 0, maxSlipR = 0, spun = false, latDev = 0;
  while (tt < 6 && Math.abs(c.speed) < speedTarget) { stepCar(c, track, dt, { steer: 0, throttle: 1, brake: 0, handbrake: false }); tt += dt; }
  const v0 = c.speed * 3.6, h0 = c.heading;
  let tt2 = 0;
  while (tt2 < steerHold) { stepCar(c, track, dt, { steer: 1, throttle: 1, brake: 0, handbrake: false }); tt2 += dt; maxYaw = Math.max(maxYaw, Math.abs(c.yawRate)); maxSlipR = Math.max(maxSlipR, Math.abs(c.slipR)); if (Math.abs(c.slipR) > 1.2) spun = true; }
  // soltar el volante y ver si se recupera
  let tt3 = 0; while (tt3 < 2) { stepCar(c, track, dt, { steer: 0, throttle: 0.5, brake: 0, handbrake: false }); tt3 += dt; }
  const turned = ((c.heading - h0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  console.log(`${label}: llegó a ${v0.toFixed(0)} km/h en ${tt.toFixed(1)} s; giro ${(turned * 57.3).toFixed(0)}°, yaw máx ${maxYaw.toFixed(2)} rad/s, deriva trasera máx ${(maxSlipR * 57.3).toFixed(0)}°, ${spun ? 'TROMPO' : 'sin trompo'}, velocidad final ${(c.speed * 3.6).toFixed(0)} km/h, yaw final ${c.yawRate.toFixed(2)}`);
}
handlingTest('Volante a fondo 1 s a 50 km/h', 50 / 3.6, 1);
handlingTest('Volante a fondo 1 s a 80 km/h', 80 / 3.6, 1);
handlingTest('Volante a fondo 2.5 s a 80 km/h', 80 / 3.6, 2.5);
handlingTest('Volante a fondo 1.5 s a 100 km/h', 100 / 3.6, 1.5);

// ---- "jugador de teclado": dirección todo o nada, acelerador todo o nada, con el suavizado de main.js
{
  const c = createCar(97, 0, 0, 0); c.frozen = false; const slot = track.gridSlot(0); resetCarAt(c, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx;
  const ai = new AIDriver(c, track, line, { skill: 0.9, aggression: 0.5, seed: 5, difficulty: 1 });
  let t = 0, lastP = 0, lapT = 0, steerRaw = 0, spins = 0, off = 0; const laps = [];
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  for (let k = 0; k < 120 * 240; k++) {
    t += dt; lapT += dt;
    if (k % 2 === 0) {
      const a = ai.update(dt * 2, [c], t, 0);
      const key = Math.abs(a.steer) > 0.25 ? Math.sign(a.steer) : 0;
      steerRaw += (key - steerRaw) * Math.min(1, dt * 2 * (key !== 0 ? 5 : 9));
      inp.steer = steerRaw; inp.throttle = a.throttle > 0.35 ? 1 : 0; inp.brake = a.brake > 0.35 ? 1 : 0;
    }
    stepCar(c, track, dt, inp);
    if (c.progress > L * 0.4 && c.progress < L * 0.6) c.halfPassed = true;
    if (lastP > L * 0.85 && c.progress < L * 0.15 && c.halfPassed) { c.halfPassed = false; if (t > 2) laps.push(lapT); lapT = 0; }
    lastP = c.progress;
    if (Math.abs(c.slipR) > 1.0) spins += dt; if (c.surface === 'grass' || c.surface === 'ditch') off += dt;
  }
  console.log(`
Jugador de teclado (bot): vueltas ${laps.map(x => x.toFixed(1)).join(' ')} · trompo ${spins.toFixed(1)} s · fuera de pista ${off.toFixed(1)} s`);
}
