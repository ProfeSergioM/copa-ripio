import { Track } from '../js/track.js';
import { createCar, stepCar, resetCarAt } from '../js/physics.js';
for (const [name, idx] of [['ovalo', 575], ['polvaredas', 720]]) {
  const t = new Track(name); const q = t.samples[idx];
  let row = [];
  for (let l = -20; l <= 20; l += 2) row.push(`${l}:${t.heightAt(q.x + q.nx * l, q.z + q.nz * l).toFixed(2)}`);
  console.log(name, 'idx', idx, 'curv', q.curvS.toFixed(3), 'perfil', row.join(' '));
  for (const st of [-1, 0, 1]) {
    const c = createCar(1, 0, 0, 0); c.frozen = false; resetCarAt(c, q.x + q.nx * 13, q.z + q.nz * 13, q.heading); c.y = t.heightAt(c.x, c.z); c.trackIdx = idx;
    const log = [];
    for (let k = 0; k < 120 * 6; k++) { stepCar(c, t, 1 / 120, { steer: st, throttle: 1, brake: 0, handbrake: false }); if (k % 120 === 119) log.push(`t${((k + 1) / 120)} lat ${c.lateral.toFixed(1)} v ${(c.speed * 3.6).toFixed(0)} ${c.surface} spin ${c.wheelspin.toFixed(2)} slipR ${c.slipR.toFixed(2)} gradL ${c.gradL.toFixed(2)} gradF ${c.gradF.toFixed(2)}`); }
    console.log(' steer', st, '|', log.join(' | '));
  }
}
