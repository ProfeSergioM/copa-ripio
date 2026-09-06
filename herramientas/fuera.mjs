// Mide cuánto se salen de pista los pilotos IA (segundos en pasto/zanja por vuelta) y dónde.
// Uso: DIF=1.14 CIRCUITO=polvaredas node herramientas/fuera.mjs [segundos]
import { Track } from '../js/track.js';
import { createCar, stepCar, collideCars, collideBarrier } from '../js/physics.js';
import { AIDriver, buildRacingLine } from '../js/ai.js';
import { DRIVER_NAMES } from '../js/config.js';
const seconds = parseFloat(process.argv[2] || '240');
const dif = parseFloat(process.env.DIF || '1');
const track = new Track(process.env.CIRCUITO || 'polvaredas', { reverse: process.env.REVERSE === '1' });
const line = buildRacingLine(track);
const cars = [];
const dd = dif - 1;
for (let i = 0; i < 20; i++) {
  const slot = track.gridSlot(i);
  const c = createCar(i, slot.x, slot.z, slot.heading); c.y = track.heightAt(slot.x, slot.z); c.trackIdx = slot.idx; c.frozen = false;
  c.tune = { torque: 1 + dd * 0.9, grip: 1.02 + dd * 0.9, brake: 1 + dd * 0.5 };
  const d = DRIVER_NAMES[i];
  cars.push({ state: c, name: d[0], ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: dif, tune: c.tune, muk: process.env.MUK ? parseFloat(process.env.MUK) : undefined, hs: process.env.HS ? parseFloat(process.env.HS) : undefined, sfk: process.env.SFK ? parseFloat(process.env.SFK) : undefined }), lastP: 0, laps: [], lapT: 0, off: 0, offWide: 0, stuck: 0 });
}
const dt = 1 / 120, L = track.length; const events = [], near = []; let t = 0;
const offBySector = {};
for (let k = 0; k < Math.round(seconds / dt); k++) {
  t += dt;
  if (k % 2 === 0) for (const c of cars) c.input = c.ai.update(dt * 2, cars.map(x => x.state), t, 0);
  for (const c of cars) stepCar(c.state, track, dt, c.input);
  for (let i = 0; i < cars.length; i++) { const a = cars[i].state; for (let j = i + 1; j < cars.length; j++) collideCars(a, cars[j].state, events); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, events); }
  events.length = 0;
  for (const c of cars) {
    const s = c.state; c.lapT += dt;
    if (s.progress > L * 0.4 && s.progress < L * 0.6) s.halfPassed = true;
    if (c.lastP > L * 0.85 && s.progress < L * 0.15 && s.halfPassed) { s.halfPassed = false; if (t > 2) c.laps.push(c.lapT); c.lapT = 0; }
    c.lastP = s.progress;
    if (t > 15 && (s.surface === 'grass' || s.surface === 'ditch')) { c.off += dt; const sec = track.sector(s.trackIdx); offBySector[sec] = (offBySector[sec] || 0) + dt; if (Math.abs(s.lateral) > track.W + 3) { c.offWide += dt; c.wideRun = (c.wideRun || 0) + dt; if (process.env.DIAG && c.wideRun > 4 && !c.diag) { c.diag = true; const sm = track.samples[s.trackIdx]; const he = Math.atan2(Math.sin(sm.heading - s.heading), Math.cos(sm.heading - s.heading)); console.log(`DIAG t${t.toFixed(0)} ${c.name}: idx ${s.trackIdx} ${sec} lat ${s.lateral.toFixed(1)} v ${(s.speed * 3.6).toFixed(0)} headErr ${he.toFixed(2)} surf ${s.surface} y ${s.y.toFixed(1)} h ${track.heightAt(s.x, s.z).toFixed(1)} stuck ${c.ai.stuckT.toFixed(1)} rec ${c.ai.recoverT.toFixed(1)} wall ${c.ai.outsideWall} in ${JSON.stringify(c.input)} dmg ${JSON.stringify(s.damage)}`); } } else c.wideRun = 0; }
    if (Math.abs(s.speed) < 1 && t > 5) c.stuck += dt;
  }
}
let totOff = 0, totLaps = 0, bests = [];
for (const c of cars) { totOff += c.off; totLaps += c.laps.length; if (c.laps.length) bests.push(Math.min(...c.laps)); }
console.log(`dif ${dif} ${track.name || ''}: vueltas ${totLaps}, fuera de pista ${totOff.toFixed(0)} s (${(totOff / Math.max(1, totLaps)).toFixed(1)} s/vuelta), mejor vuelta ${Math.min(...bests).toFixed(1)}, media mejores ${(bests.reduce((a, b) => a + b, 0) / bests.length).toFixed(1)}, parados ${cars.reduce((a, c) => a + c.stuck, 0).toFixed(0)} s, reposiciones ${cars.reduce((a, c) => a + c.ai.resets, 0)}`);
console.log('por sector:', Object.entries(offBySector).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' | '));
if (process.env.DETALLE) for (const c of cars) console.log(c.name.padEnd(18), 'fuera', c.off.toFixed(1), 'lejos', c.offWide.toFixed(1), 'vueltas', c.laps.map(x => x.toFixed(0)).join(' '));
