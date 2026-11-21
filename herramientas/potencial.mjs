// Cuánto podría dar una vuelta: perfil de velocidad con el agarre real del auto (medido con agarre.mjs), la
// aceleración real del motor y una frenada firme, por el eje y por la trazada. Al lado, lo que hace un piloto
// IA solo. Sirve para saber si a los rivales los frena el auto o la forma de manejar.
// Uso: CIRCUITO=polvaredas G=0.5 node herramientas/potencial.mjs
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
const track = new Track(process.env.CIRCUITO || 'polvaredas'), line = buildRacingLine(track), n = track.n, L = track.length;
const G = parseFloat(process.env.G || '0.5') * 9.81, FRENO = parseFloat(process.env.FRENO || '6');
// aceleración a fondo según la velocidad, medida en la recta
const acel = []; { const c = createCar(0, track.samples[0].x, track.samples[0].z, track.samples[0].heading); c.frozen = false; c.trackIdx = 0; c.y = track.heightAt(c.x, c.z); let v0 = 0; for (let k = 0; k < 120 * 9; k++) { stepCar(c, track, 1 / 120, { steer: 0, throttle: 1, brake: 0, handbrake: false }); if (k % 12 === 11) { acel.push([c.speed, (c.speed - v0) / 0.1]); v0 = c.speed; } } }
const aMotor = (v) => { for (const [vv, a] of acel) if (vv >= v) return Math.max(a, 0.05); return 0.05; };
function perfil(curv) {
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(34, Math.sqrt(G / (Math.abs(curv(i)) + 1e-5)));
  for (let pasada = 0; pasada < 3; pasada++) {
    for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * FRENO * track.step)); }
    for (let i = 0; i < n; i++) { const j = (i + n - 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aMotor(v[j]) * track.step)); }
  }
  let t = 0; for (let i = 0; i < n; i++) t += track.step / v[i];
  return { t, v };
}
const eje = perfil((i) => track.samples[i].curvS), traz = perfil((i) => line.curv[i]);
// el piloto IA solo, vuelta lanzada
const slot = track.gridSlot(0), c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
const emp = parseFloat(process.env.EMP || '1'); c.tune = { torque: emp, grip: 1.02 * emp, brake: emp };
const ai = new AIDriver(c, track, line, { skill: 0.95, aggression: 0.5, seed: 3, difficulty: 1, tune: c.tune });
const vIA = new Float64Array(n), perm = new Float64Array(n); let t = 0, lastP = 0, vuelta = 0, tv = 0; const vueltas = [];
for (let k = 0; k < 120 * 300 && vueltas.length < 4; k++) {
  t += 1 / 120; tv += 1 / 120;
  if (k % 2 === 0) c.input = ai.update(1 / 60, [c], t, 0);
  stepCar(c, track, 1 / 120, c.input);
  if (vueltas.length >= 1) { vIA[c.trackIdx] = c.speed; perm[c.trackIdx] = ai.allowed || 0; }
  if (lastP > L * 0.85 && c.progress < L * 0.15) { vueltas.push(tv); tv = 0; }
  lastP = c.progress;
}
console.log(`${track.def.id}: potencial por el eje ${eje.t.toFixed(1)} s · por la trazada ${traz.t.toFixed(1)} s · piloto IA ${Math.min(...vueltas.slice(1)).toFixed(1)} s (vueltas ${vueltas.map(x => x.toFixed(1)).join(' ')})`);
if (process.env.DETALLE) for (let i = 0; i < n; i += Math.round(n / 48)) console.log(`${String(i).padStart(4)} ${track.sector(i).padEnd(24)} R eje ${(1 / (Math.abs(track.samples[i].curvS) + 1e-5)).toFixed(0).padStart(5)} · potencial ${(traz.v[i] * 3.6).toFixed(0).padStart(3)} · IA va a ${(vIA[i] * 3.6).toFixed(0).padStart(3)} (se permite ${(perm[i] * 3.6).toFixed(0).padStart(3)}) km/h`);
