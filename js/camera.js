// Cámaras: persecución (cerca/lejos), capó, TV fija en las curvas, órbita de menú y modo foto.
import * as THREE from 'three';
import { clamp, dampTo, lerp } from './util.js';

export class ChaseCamera {
  constructor(camera, track) {
    this.cam = camera; this.track = track;
    this.mode = 0; // 0 cerca, 1 lejos, 2 capó, 3 TV
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.shakeAmt = 0; this.fov = 64; this.orbitT = 0; this.init = false;
    this.dir = new THREE.Vector3(0, 0, 1);
    this.tvSpots = []; this.tvSpot = null;
    this.photo = { yaw: 0.6, pitch: 0.35, dist: 7 };
  }
  setTrack(track, tvSpots) { this.track = track; this.tvSpots = tvSpots || []; this.tvSpot = null; this.init = false; }
  cycle() { this.mode = (this.mode + 1) % (this.tvSpots.length ? 4 : 3); this.init = false; }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  update(dt, car, lookBack = false) {
    if (this.mode === 3) return this.updateTV(dt, car);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let dx = fx, dz = fz;
    const sp = Math.abs(car.speed);
    if (sp > 3 && this.mode !== 2) { const l = Math.hypot(car.vx, car.vz) || 1; const w = clamp((sp - 3) / 12, 0, 0.28); dx = lerp(fx, car.vx / l, w); dz = lerp(fz, car.vz / l, w); const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; }
    this.dir.x = dampTo(this.dir.x, dx, 5, dt); this.dir.z = dampTo(this.dir.z, dz, 5, dt);
    const n = Math.hypot(this.dir.x, this.dir.z) || 1; const ddx = this.dir.x / n, ddz = this.dir.z / n;
    let dist, height, lookH, rate;
    if (this.mode === 0) { dist = 11.5; height = 4.4; lookH = 1.0; rate = 7; }
    else if (this.mode === 1) { dist = 16; height = 7; lookH = 1.2; rate = 6; }
    else { dist = -0.9; height = 1.28; lookH = 1.0; rate = 30; }
    const sgn = lookBack ? -1 : 1;
    const tx = car.x - ddx * dist * sgn, tz = car.z - ddz * dist * sgn, ty = car.y + height;
    if (!this.init) { this.pos.set(tx, ty, tz); this.init = true; }
    this.pos.x = dampTo(this.pos.x, tx, rate, dt); this.pos.z = dampTo(this.pos.z, tz, rate, dt); this.pos.y = dampTo(this.pos.y, ty, rate * 0.8, dt);
    if (this.mode !== 2) { const g = this.track.heightAt(this.pos.x, this.pos.z) + 0.7; if (this.pos.y < g) this.pos.y = g; }
    this.look.set(car.x + ddx * 6 * sgn, car.y + lookH, car.z + ddz * 6 * sgn);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    const sh = this.shakeAmt * 0.25;
    this.cam.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
    this.roll = dampTo(this.roll || 0, clamp(-(car.accLat || 0) * 0.006, -0.05, 0.05), 4, dt);
    this.cam.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.cam.lookAt(this.look);
    this.cam.up.set(0, 1, 0);
    const targetFov = (this.mode === 2 ? 70 : 56) + clamp(sp / 38, 0, 1) * 12;
    this.setFov(dampTo(this.fov, targetFov, 3, dt));
  }
  setFov(f) { this.fov = f; if (Math.abs(this.cam.fov - f) > 0.05) { this.cam.fov = f; this.cam.updateProjectionMatrix(); } }

  // Cámara de TV: elige el puesto que viene adelante y sigue al auto con zoom
  updateTV(dt, car) {
    const t = this.track, spots = this.tvSpots;
    if (!spots.length) return this.update(dt, car);
    const idx = car.trackIdx >= 0 ? car.trackIdx : t.nearest(car.x, car.z).idx;
    const ahead = (sp) => { let d = sp.idx - idx; if (t.closed) d = ((d % t.n) + t.n) % t.n; return d; };
    if (!this.tvSpot || ahead(this.tvSpot) < -25 || ahead(this.tvSpot) > t.n - 25) {
      let best = null, bd = 1e9;
      for (const sp of spots) { const d = ahead(sp); if (d >= -20 && d < bd) { bd = d; best = sp; } }
      this.tvSpot = best || spots[0];
    }
    const sp = this.tvSpot;
    this.cam.position.set(sp.x, sp.y, sp.z);
    this.look.set(car.x, car.y + 0.8, car.z);
    this.cam.lookAt(this.look);
    const d = Math.hypot(car.x - sp.x, car.z - sp.z);
    this.setFov(dampTo(this.fov, clamp(68 - d * 0.55, 18, 62), 4, dt));
  }

  orbit(dt, cx, cz, cy) {
    this.orbitT += dt * 0.12; this.init = false;
    const r = 30, a = this.orbitT;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = Math.max(cy + 11, this.track.heightAt(x, z) + 4);
    this.cam.position.set(x, y, z);
    this.cam.lookAt(cx, cy + 1, cz);
    this.setFov(55);
  }

  // Modo foto: órbita libre alrededor del auto (yaw, pitch, distancia)
  updatePhoto(car) {
    const p = this.photo;
    p.pitch = clamp(p.pitch, -0.1, 1.4); p.dist = clamp(p.dist, 2.5, 30);
    const x = car.x + Math.sin(p.yaw + car.heading) * Math.cos(p.pitch) * p.dist;
    const z = car.z + Math.cos(p.yaw + car.heading) * Math.cos(p.pitch) * p.dist;
    let y = car.y + 0.7 + Math.sin(p.pitch) * p.dist;
    y = Math.max(y, this.track.heightAt(x, z) + 0.4);
    this.cam.position.set(x, y, z);
    this.cam.lookAt(car.x, car.y + 0.7, car.z);
    this.setFov(50);
  }
}
