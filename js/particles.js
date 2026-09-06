// Partículas de polvo/humo (Points con shader) y escombros (piezas que salen volando).
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 2500) {
    this.max = max; this.count = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max);
    this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3); this.alpha0 = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.18, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false;
    this.wind = { x: 0, z: 0 };
    this.geo = geo;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, size, life, r, g, b, alpha = 0.5, grow = 1.5, gravity = 0.6) {
    let i;
    if (this.count < this.max) i = this.count++;
    else { i = Math.floor(Math.random() * this.max); }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.alpha0[i] = alpha; this.alpha[i] = alpha; this.grav[i] = gravity;
  }
  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // compactar
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[n * 3 + k]; this.vel[i * 3 + k] = this.vel[n * 3 + k]; this.col[i * 3 + k] = this.col[n * 3 + k]; }
          this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.size[i] = this.size[n]; this.grow[i] = this.grow[n]; this.alpha0[i] = this.alpha0[n]; this.grav[i] = this.grav[n];
        }
        i--; continue;
      }
      const f = this.life[i] / this.maxLife[i];
      this.vel[i * 3] += (this.wind.x - this.vel[i * 3]) * 0.9 * dt; this.vel[i * 3 + 1] += this.grav[i] * dt; this.vel[i * 3 + 2] += (this.wind.z - this.vel[i * 3 + 2]) * 0.9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = this.alpha0[i] * Math.min(1, f * 2.5);
      this.size[i] += this.grow[i] * dt;
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true;
  }
}

export class Debris {
  constructor(scene, track) { this.scene = scene; this.track = track; this.items = []; }
  spawn(mesh, x, y, z, vx, vy, vz) {
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.items.push({ mesh, vx, vy, vz, wx: (Math.random() - 0.5) * 8, wy: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8, t: 0, rest: false });
    if (this.items.length > 60) { const o = this.items.shift(); this.scene.remove(o.mesh); }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i]; d.t += dt;
      if (!d.rest) {
        d.vy -= 9.81 * dt; d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.wx * dt; d.mesh.rotation.y += d.wy * dt; d.mesh.rotation.z += d.wz * dt;
        const g = this.track.heightAt(d.mesh.position.x, d.mesh.position.z) + 0.1;
        if (d.mesh.position.y < g) { d.mesh.position.y = g; d.vy = -d.vy * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wz *= 0.5; if (Math.abs(d.vy) < 0.8) d.rest = true; }
      }
      if (d.t > 14) { const s = Math.max(0, 1 - (d.t - 14) / 1.5); d.mesh.scale.setScalar(s); if (s <= 0) { this.scene.remove(d.mesh); this.items.splice(i, 1); } }
    }
  }
  clear() { for (const d of this.items) this.scene.remove(d.mesh); this.items.length = 0; }
}

// Lluvia: segmentos que caen alrededor de la cámara, empujados por el viento.
export class Rain {
  constructor(scene, count = 1400) {
    this.count = count; this.box = { x: 70, y: 40, z: 70 };
    this.pos = new Float32Array(count * 3 * 2);
    this.p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { this.p[i * 3] = (Math.random() - 0.5) * this.box.x; this.p[i * 3 + 1] = Math.random() * this.box.y; this.p[i * 3 + 2] = (Math.random() - 0.5) * this.box.z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#cfe0ee', transparent: true, opacity: 0.32 }));
    this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    this.wind = { x: 0, z: 0 }; this.scene = scene;
  }
  set enabled(v) { this.lines.visible = v; }
  get enabled() { return this.lines.visible; }
  update(dt, cx, cy, cz, groundFn) {
    if (!this.lines.visible) return;
    const vy = -20, b = this.box;
    for (let i = 0; i < this.count; i++) {
      let x = this.p[i * 3] + this.wind.x * dt, y = this.p[i * 3 + 1] + vy * dt, z = this.p[i * 3 + 2] + this.wind.z * dt;
      if (y < -6) { y += b.y; x = (Math.random() - 0.5) * b.x; z = (Math.random() - 0.5) * b.z; }
      if (x > b.x / 2) x -= b.x; if (x < -b.x / 2) x += b.x; if (z > b.z / 2) z -= b.z; if (z < -b.z / 2) z += b.z;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      const wx = cx + x, wy = cy + y - 8, wz = cz + z;
      const k = i * 6;
      this.pos[k] = wx; this.pos[k + 1] = wy; this.pos[k + 2] = wz;
      this.pos[k + 3] = wx + this.wind.x * 0.03; this.pos[k + 4] = wy + 0.7; this.pos[k + 5] = wz + this.wind.z * 0.03;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.lines); this.lines.geometry.dispose(); }
}
