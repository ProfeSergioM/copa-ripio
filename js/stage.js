// Contrarreloj: los rivales corren el tramo "aparte" (simulación sin dibujar) y devuelven sus tiempos.
import { createCar, stepCar, collideBarrier } from './physics.js';
import { AIDriver, buildRacingLine } from './ai.js';
import { mulberry32 } from './util.js';

// Devuelve { nombre: segundos } para todos los pilotos IA del plantel. Se corre en tandas para no congelar la UI.
export async function computeStageTimes(track, roster, difficulty, onProgress) {
  const line = buildRacingLine(track);
  const dt = 1 / 60, near = [], ev = [];
  const times = {};
  const ais = roster.filter(r => !r.isPlayer);
  const rnd = mulberry32(track.n * 7 + 3);
  for (let i = 0; i < ais.length; i++) {
    const r = ais[i];
    const slot = track.gridSlot(0);
    const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
    const ai = new AIDriver(c, track, line, { skill: r.skill, aggression: r.aggression, seed: r.seed, difficulty });
    let t = 0;
    while (t < 240 && c.progress < track.length - 3) {
      c.input = ai.update(dt, [c], t, 0); stepCar(c, track, dt, c.input);
      track.barriersNear(c.x, c.z, near); for (const b of near) collideBarrier(c, b, ev); ev.length = 0;
      t += dt;
    }
    // un poco de personalidad: los menos hábiles pierden más y todos tienen su día
    times[r.name] = t * (1 + (1 - r.skill) * 0.12 + (rnd() - 0.5) * 0.04);
    onProgress && onProgress((i + 1) / ais.length, r.name);
    await new Promise(res => setTimeout(res, 0));
  }
  return times;
}
