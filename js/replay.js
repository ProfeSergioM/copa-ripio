// Repetición: graba las poses de los 20 autos a 20 Hz y los golpes; reproduce con interpolación.
import { lerp, wrapAngle } from './util.js';

export const REPLAY_RATE = 20;
export const STRIDE = 8; // x, y, z, rumbo, cabeceo, rolido, giro ruedas, ángulo ruedas

export class Replay {
  constructor(nCars) { this.n = nCars; this.frames = []; this.times = []; this.events = []; this.acc = 1; }
  record(dt, cars, time) {
    this.acc += dt;
    if (this.acc < 1 / REPLAY_RATE) return;
    this.acc -= 1 / REPLAY_RATE;
    const f = new Float32Array(this.n * STRIDE);
    cars.forEach((c, i) => {
      const s = c.state, k = i * STRIDE;
      f[k] = s.x; f[k + 1] = s.y; f[k + 2] = s.z; f[k + 3] = s.heading; f[k + 4] = c.vis.vis.rotation.x; f[k + 5] = c.vis.vis.rotation.z; f[k + 6] = s.steer; f[k + 7] = s.wheelAngle;
    });
    this.frames.push(f); this.times.push(time);
  }
  addEvent(time, x, z, strength, player) { this.events.push({ time, x, z, strength, player }); }
  get duration() { return this.times.length ? this.times[this.times.length - 1] : 0; }
  get start() { return this.times.length ? this.times[0] : 0; }
  // instante del golpe más fuerte que involucró al jugador (o el más fuerte de todos)
  bestMoment() {
    let best = null;
    for (const e of this.events) { const w = e.strength * (e.player ? 2.5 : 1); if (!best || w > best.w) best = { ...e, w }; }
    return best;
  }
  frameAt(t, out) {
    const T = this.times, F = this.frames;
    if (!F.length) return null;
    if (t <= T[0]) return F[0];
    if (t >= T[T.length - 1]) return F[F.length - 1];
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    const u = (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo]);
    const a = F[lo], b = F[hi];
    out = out || new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      const k = i % STRIDE;
      if (k === 3) out[i] = a[i] + wrapAngle(b[i] - a[i]) * u; else out[i] = lerp(a[i], b[i], u);
    }
    return out;
  }
}
