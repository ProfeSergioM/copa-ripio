// Perfil lateral de un piloto IA a lo largo de una vuelta (ASCII) + rugosidad (2ª diferencia por metro).
import { Track } from '../js/track.js';
import { createCar, stepCar } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
const track = new Track('polvaredas'); const line = buildRacingLine(track);
const slot = track.gridSlot(0); const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false;
const ai = new AIDriver(c, track, line, { skill: 0.9, aggression: 0.5, seed: 3, difficulty: 1 });
const dt = 1 / 120; let t = 0, lap = 0, lastP = 0; const prof = new Array(track.n).fill(null);
for (let k = 0; k < 120 * 200 && lap < 2; k++) { t += dt; if (k % 2 === 0) c.input = ai.update(dt * 2, [c], t, 0); stepCar(c, track, dt, c.input); if (lastP > track.length * 0.85 && c.progress < track.length * 0.15) lap++; lastP = c.progress; if (lap === 1) prof[c.trackIdx] = { lat: c.lateral, st: c.input.steer, v: c.speed }; }
let rough = 0, n = 0;
for (let i = 2; i < track.n; i++) if (prof[i] && prof[i - 1] && prof[i - 2]) { rough += Math.abs(prof[i].lat - 2 * prof[i - 1].lat + prof[i - 2].lat); n++; }
console.log('rugosidad lateral', (rough / n).toFixed(3), 'm por m²');
for (let i = 0; i < track.n; i += 12) { const p = prof[i]; if (!p) continue; const col = Math.round((p.lat + 8) * 3); console.log(`${String(i).padStart(4)} ${track.sector(i).padEnd(22)} ${' '.repeat(Math.max(0, col))}${Math.abs(p.st) > 0.9 ? '#' : '*'} v${(p.v * 3.6).toFixed(0)} st${p.st.toFixed(2)} curv${(track.samples[i].curvS * 100).toFixed(1)}`); }
