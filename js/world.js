// Escenario: cielo, terreno, decorado rural, tribuna con público, molino, vacas, banderilleros, hora del día, clima.
// Todo cuelga de un grupo para poder desarmarlo y construir otra pista.
import * as THREE from 'three';
import { toonMat } from './car.js';
import { mulberry32, clamp, lerp, smoothstep, pick } from './util.js';
import { SPONSORS } from './config.js';
import { Rain } from './particles.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const TOD = {
  morning: { sun: [-0.5, 0.55, 0.7], sunCol: '#fff1cf', sunI: 1.9, hemiSky: '#bfe6f5', hemiGround: '#9a8a5c', hemiI: 0.75, top: '#6fc0e0', horizon: '#f6e6c4', fog: '#e6dcc0', fogNear: 220, fogFar: 620, lamps: false, night: false },
  noon:    { sun: [0.2, 0.95, 0.3], sunCol: '#ffffff', sunI: 2.2, hemiSky: '#a9dcf2', hemiGround: '#a89a68', hemiI: 0.8, top: '#4fb0e0', horizon: '#dff0f8', fog: '#d6e8ee', fogNear: 260, fogFar: 700, lamps: false, night: false },
  sunset:  { sun: [0.85, 0.22, -0.4], sunCol: '#ffb070', sunI: 1.7, hemiSky: '#e8a878', hemiGround: '#6a4a3a', hemiI: 0.7, top: '#5a6fb0', horizon: '#ffb58a', fog: '#e8a98a', fogNear: 200, fogFar: 560, lamps: false, night: false },
  dusk:    { sun: [0.6, 0.12, -0.7], sunCol: '#8aa0ff', sunI: 0.55, hemiSky: '#3a4a8a', hemiGround: '#2a2530', hemiI: 0.55, top: '#141a3c', horizon: '#6a5a9a', fog: '#3e3a66', fogNear: 120, fogFar: 420, lamps: true, night: true },
  fog:     { sun: [0.3, 0.6, 0.4], sunCol: '#d8dde2', sunI: 0.7, hemiSky: '#c9cfd4', hemiGround: '#8a8f86', hemiI: 0.9, top: '#b9c2c9', horizon: '#dfe4e8', fog: '#d6dbdf', fogNear: 18, fogFar: 150, lamps: true, night: false, foggy: true },
  storm:   { sun: [0.3, 0.7, 0.4], sunCol: '#aab4c0', sunI: 0.8, hemiSky: '#7a8a98', hemiGround: '#4a4a44', hemiI: 0.7, top: '#3d4a58', horizon: '#8d98a2', fog: '#8a949c', fogNear: 90, fogFar: 330, lamps: true, night: false },
};

export class World {
  constructor(scene, track, renderer) {
    this.scene = scene; this.track = track; this.renderer = renderer;
    this.animated = []; this.rnd = mulberry32(2024);
    this.flags = []; this.lamps = []; this.tvSpots = [];
    this.time = 0; this.wind = { x: 0, z: 0 }; this.wet = false;
    this.group = new THREE.Group(); scene.add(this.group);
  }

  add(obj) { this.group.add(obj); return obj; }

  dispose() {
    this.scene.remove(this.group);
    // geometrias, materiales y texturas de este mundo; los materiales compartidos (los del auto) no se tocan
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (m.userData.compartido) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap', 'aoMap']) if (m[k] && !m[k].userData.compartido) m[k].dispose();
        m.dispose();
      }
    });
    if (this.track && this.track.marks) { this.track.marks.texture.dispose(); this.track.marks = null; }
    if (this.rain) { this.rain.dispose(); this.rain = null; }
    this.animated.length = 0; this.flags.length = 0; this.lamps.length = 0; this.tvSpots.length = 0;
  }

  async build(progress, opts = {}) {
    this.wet = !!opts.wet;
    const steps = [
      ['Cielo', () => this.buildSky()],
      ['Terreno', () => this.buildTerrain()],
      ['Ripio', () => this.add(this.track.buildMeshes(this.wet))],
      ['Barreras', () => this.buildBarriers()],
      ['Tribuna', () => this.buildGrandstand()],
      ['Campo', () => this.buildFarm()],
      ['Cámaras', () => this.buildTvSpots()],
      ['Arboleda', () => this.buildTrees()],
      ['Detalles', () => { this.buildMarshals(); this.buildLamps(); this.buildBirds(); this.buildGantry(); }],
      ['Ambiente', () => { this.buildCountryside(); if (ATMOSFERA) this.buildAtmosphere(); }],
    ];
    for (let i = 0; i < steps.length; i++) {
      progress && progress(i / steps.length, steps[i][0]);
      await new Promise(r => setTimeout(r, 10));
      steps[i][1]();
    }
    this.rain = new Rain(this.scene);
    progress && progress(1, 'Listo');
  }

  // ---------- Luces y cielo ----------
  buildSky() {
    this.hemi = this.add(new THREE.HemisphereLight('#bfe6f5', '#9a8a5c', 0.75));
    this.sun = new THREE.DirectionalLight('#fff1cf', 1.9);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 300;
    const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; this.sun.shadow.mapSize.set(mobile ? 1536 : 3072, mobile ? 1536 : 3072); this.sun.shadow.radius = 3; this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.sunTarget = this.add(new THREE.Object3D()); this.sun.target = this.sunTarget;
    this.add(this.sun);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#6fc0e0') }, horizon: { value: new THREE.Color('#f6e6c4') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff1cf') }, night: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){ vec3 d = normalize(vW - cameraPosition); float h = clamp(d.y, -0.1, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          c += sunCol * (pow(sd, 260.0) * 1.2 + pow(sd, 6.0) * 0.18);
          if (night > 0.0) { vec2 g = floor(d.xz / max(d.y,0.05) * 60.0); float st = step(0.985, hash(g)) * smoothstep(0.1, 0.4, d.y); c += vec3(st) * night * 0.9; }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = this.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), this.skyMat));
    this.scene.fog = new THREE.Fog('#e6dcc0', 220, 620);
    const cloudMat = toonMat(this.wet ? '#8f9aa4' : '#ffffff', { fog: false });
    this.clouds = new THREE.Group();
    for (let i = 0; i < (this.wet ? 34 : 16); i++) {
      const cl = new THREE.Group();
      const puffs = 3 + Math.floor(this.rnd() * 4);
      for (let p = 0; p < puffs; p++) {
        const r = 8 + this.rnd() * 12;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
        m.position.set((p - puffs / 2) * r * 1.1, this.rnd() * 5, (this.rnd() - 0.5) * 8); m.scale.y = 0.55; cl.add(m);
      }
      cl.position.set((this.rnd() - 0.5) * 1400, (this.wet ? 90 : 140) + this.rnd() * 60, (this.rnd() - 0.5) * 1400);
      cl.userData.speed = 1.5 + this.rnd() * 2;
      this.clouds.add(cl);
    }
    this.add(this.clouds);
    // destello de lente del sol
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(flareTexture(256, '#fff3c0', 1), 420, 0));
    flare.addElement(new LensflareElement(flareTexture(128, '#ffd08a', 0.5), 90, 0.35));
    flare.addElement(new LensflareElement(flareTexture(128, '#8fd3e8', 0.4), 60, 0.6));
    flare.addElement(new LensflareElement(flareTexture(128, '#ffb0a0', 0.35), 120, 0.9));
    this.flare = new THREE.Object3D(); this.flare.add(flare); this.add(this.flare);
    this.setTimeOfDay('morning');
  }

  setTimeOfDay(name) {
    const p = TOD[name] || TOD.morning; this.tod = p; this.todName = name;
    this.sun.position.set(p.sun[0] * 120, p.sun[1] * 120, p.sun[2] * 120); this.sun.color.set(p.sunCol); this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiI;
    this.skyMat.uniforms.top.value.set(p.top); this.skyMat.uniforms.horizon.value.set(p.horizon);
    this.skyMat.uniforms.sunDir.value.set(p.sun[0], p.sun[1], p.sun[2]); this.skyMat.uniforms.sunCol.value.set(p.sunCol);
    this.skyMat.uniforms.night.value = p.night ? 1 : 0;
    const aire = this.track.def.aire; // tinte y alcance propios del circuito (el bosque va más cerrado)
    const nieblaCol = aire && !p.foggy ? aire.color : p.fog;
    this.scene.fog.color.set(nieblaCol);
    this.scene.fog.near = p.fogNear * (aire && !p.foggy ? aire.k : 1);
    this.scene.fog.far = p.fogFar * (aire && !p.foggy ? aire.k : 1);
    this.renderer.setClearColor(nieblaCol);
    for (const l of this.lamps) { l.light.visible = p.lamps; l.bulb.material = p.lamps ? this.lampOnMat : this.lampOffMat; l.cone.visible = p.lamps; }
    this.clouds.visible = !p.night;
    this.night = p.night; this.foggy = !!p.foggy;
    if (this.flare) this.flare.visible = !p.night && name !== 'storm' && !p.foggy;
  }

  // Clima: 'dry' o 'rain'; viento en m/s (vector)
  setWeather(weather, wind = { x: 0, z: 0 }) {
    this.wind = wind;
    const rain = weather === 'rain';
    if (this.rain) { this.rain.enabled = rain; this.rain.wind = wind; }
    this.track.gripScale = rain ? 0.74 : 1;
    this.raining = rain;
  }

  // ---------- Terreno ----------
  buildTerrain() {
    const hf = this.track.hf, w = hf.w, d = hf.d;
    const geo = new THREE.PlaneGeometry((w - 1) * hf.cell, (d - 1) * hf.cell, w - 1, d - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const cx = hf.x0 + (w - 1) * hf.cell / 2, cz = hf.z0 + (d - 1) * hf.cell / 2;
    const wet = this.wet;
    const bosque = this.track.def.paisaje === 'bosque';
    const grass = new THREE.Color(bosque ? (wet ? '#3f6030' : '#4f7a36') : (wet ? '#5f7f3c' : '#7fa04a')), dry = new THREE.Color(bosque ? (wet ? '#5c6a3a' : '#77813f') : (wet ? '#8a7f48' : '#b9a85a')), dark = new THREE.Color(bosque ? '#2c4622' : '#4c6a30'), dust = new THREE.Color(wet ? '#8f7a55' : '#c9ad78'), rock = new THREE.Color('#8f8a7a'), snow = new THREE.Color('#e8e6dd');
    const cerro = new THREE.Color('#26401f'), pizarra = new THREE.Color('#2b3340');
    const tmp = new THREE.Color();
    const nz = this.track.noise;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      const ix = Math.round((x - hf.x0) / hf.cell), iz = Math.round((z - hf.z0) / hf.cell);
      const h = hf.data[clamp(iz, 0, d - 1) * w + clamp(ix, 0, w - 1)];
      pos.setXYZ(i, pos.getX(i), h, pos.getZ(i));
      const dist = hf.dist[clamp(iz, 0, d - 1) * w + clamp(ix, 0, w - 1)];
      const n1 = nz.fbm(x / 60, z / 60, 3), n2 = nz.fbm(x / 14 + 9, z / 14, 2);
      tmp.copy(grass).lerp(dry, smoothstep(0.05, 0.5, n1)).lerp(dark, smoothstep(0.2, 0.6, -n2) * 0.6);
      tmp.lerp(dust, 1 - smoothstep(this.track.W + 0.5, this.track.W + 6, dist));
      if (bosque) {
        // cerros oscuros de fondo: pinar cerrado que se va a pizarra, sin nieve
        tmp.lerp(cerro, smoothstep(18, 46, h));
        tmp.lerp(pizarra, smoothstep(46, 80, h));
      } else {
        if (h > 26) tmp.lerp(rock, smoothstep(26, 40, h));
        if (h > 52) tmp.lerp(snow, smoothstep(52, 66, h));
      }
      tmp.lerp(new THREE.Color('#ffffff'), bosque ? 0.5 : 0.68).multiplyScalar(0.94 + 0.12 * nz.noise(x / 5, z / 5));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const grassTex = makeGrassTexture(this.wet); grassTex.repeat.set((w - 1) * hf.cell / 7, (d - 1) * hf.cell / 7);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1, metalness: 0 });
    // foto de pasto con normales (Poly Haven, CC0); si no carga queda la textura dibujada
    const rx = (w - 1) * hf.cell / 11, rz = (d - 1) * hf.cell / 11;
    loadTex('assets/texturas/pasto_color.jpg', true, rx, rz, (tx) => { if (mat.map && mat.map !== tx && !mat.map.userData.compartido) mat.map.dispose(); mat.map = tx; mat.needsUpdate = true; });
    loadTex('assets/texturas/pasto_normal.jpg', false, rx, rz, (tx) => { if (mat.normalMap && mat.normalMap !== tx && !mat.normalMap.userData.compartido) mat.normalMap.dispose(); mat.normalMap = tx; mat.normalScale.set(0.7, 0.7); mat.needsUpdate = true; });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz); mesh.receiveShadow = true;
    this.terrain = this.add(mesh);
  }

  // ---------- Barreras y estacas ----------
  buildBarriers() {
    const t = this.track;
    const tires = t.barriers.filter(b => b.type === 'tires'), bales = t.barriers.filter(b => b.type === 'bale');
    const tireGeo = new THREE.TorusGeometry(0.42, 0.17, 8, 14); tireGeo.rotateX(Math.PI / 2);
    const mats = [toonMat('#2a2a2e'), toonMat('#f5f1e8'), toonMat('#d94a3a')];
    const counts = [0, 0, 0], assign = [];
    for (const b of tires) for (let k = 0; k < 3; k++) { const mi = k === 1 ? (b.paint ? 1 : 2) : 0; assign.push([b, k, mi]); counts[mi]++; }
    const inst = mats.map((m, i) => { const im = new THREE.InstancedMesh(tireGeo, m, Math.max(1, counts[i])); im.castShadow = true; im.receiveShadow = true; im.count = 0; this.add(im); return im; });
    const M = new THREE.Matrix4();
    for (const [b, k, mi] of assign) {
      const y = t.heightAt(b.x, b.z) + 0.17 + k * 0.33;
      M.makeRotationY(b.idx * 0.7 + k).setPosition(b.x, y, b.z);
      inst[mi].setMatrixAt(inst[mi].count++, M);
    }
    const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12); baleGeo.rotateZ(Math.PI / 2);
    const baleMesh = new THREE.InstancedMesh(baleGeo, toonMat('#e3c56a'), Math.max(1, bales.length)); baleMesh.castShadow = true; baleMesh.receiveShadow = true;
    bales.forEach((b, i) => { M.makeRotationY(b.rot).setPosition(b.x, t.heightAt(b.x, b.z) + 0.72, b.z); baleMesh.setMatrixAt(i, M); });
    this.add(baleMesh);
    const stakeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), toonMat('#f5f1e8'), t.stakes.length);
    const tipMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 6), toonMat('#d94a3a'), t.stakes.length);
    t.stakes.forEach((s, i) => { M.identity().setPosition(s.x, s.y + 0.5, s.z); stakeMesh.setMatrixAt(i, M); M.identity().setPosition(s.x, s.y + 1.0, s.z); tipMesh.setMatrixAt(i, M); });
    this.add(stakeMesh); this.add(tipMesh);
    this.buildFence();
  }

  // Alambrado rural: postes de madera con tres hilos de alambre, siguiendo los postes del cerco de la pista
  buildFence() {
    const t = this.track, M = new THREE.Matrix4(), E = new THREE.Euler();
    const posts = t.barriers.filter(b => b.type === 'fence');
    if (!posts.length) return;
    const H = 1.35;
    const postGeo = new THREE.CylinderGeometry(0.09, 0.12, H, 6); postGeo.translate(0, H / 2, 0);
    const postMesh = new THREE.InstancedMesh(postGeo, toonMat('#6b4a2e'), posts.length); postMesh.castShadow = true; postMesh.receiveShadow = true;
    const ys = new Map();
    posts.forEach((b, i) => { const y = t.heightAt(b.x, b.z) - 0.05; ys.set(b, y); E.set(b.lean, b.idx * 0.9, b.lean * 0.7); M.makeRotationFromEuler(E).setPosition(b.x, y, b.z); postMesh.setMatrixAt(i, M); });
    this.add(postMesh);
    // hilos: entre postes consecutivos del mismo lado (índices seguidos; en los cortes no hay hilo)
    const wires = [];
    for (const side of [-1, 1]) {
      const row = posts.filter(b => b.side === side).sort((a, b) => a.idx - b.idx);
      const link = (a, b) => { for (const h of [0.45, 0.85, 1.22]) wires.push(a.x, ys.get(a) + h, a.z, b.x, ys.get(b) + h, b.z); };
      for (let i = 0; i + 1 < row.length; i++) if (row[i + 1].idx - row[i].idx <= 2) link(row[i], row[i + 1]);
      if (t.closed && row.length > 2 && row[0].idx <= 1 && row[row.length - 1].idx >= t.n - 2) link(row[row.length - 1], row[0]);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3430 })));
  }

  // ---------- Árboles y álamos ----------
  buildTrees() {
    const t = this.track, rnd = mulberry32(77), sc = t.def.scenery;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6); trunkGeo.translate(0, 1.1, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2.2, 1); crownGeo.translate(0, 3.4, 0);
    const poplarGeo = new THREE.ConeGeometry(1.4, 9, 7); poplarGeo.translate(0, 5.5, 0);
    const bushGeo = new THREE.IcosahedronGeometry(1.0, 1); bushGeo.translate(0, 0.7, 0);
    // pino de tres pisos y ombú de copa ancha
    const pineGeo = mergeGeometries([new THREE.ConeGeometry(2.2, 3.2, 7).translate(0, 3.2, 0), new THREE.ConeGeometry(1.7, 2.8, 7).translate(0, 5.0, 0), new THREE.ConeGeometry(1.1, 2.2, 7).translate(0, 6.6, 0)]);
    const ombuGeo = new THREE.IcosahedronGeometry(3.2, 1); ombuGeo.scale(1.35, 0.6, 1.35); ombuGeo.translate(0, 3.6, 0);
    const bosque = t.def.paisaje === 'bosque';
    const greens = bosque
      ? (this.wet ? ['#2f5426', '#3a6330', '#254a20', '#436e33'] : ['#37622c', '#426f34', '#2b5124', '#4c7a3a'])
      : (this.wet ? ['#4e7a33', '#5c8a3e', '#41692e', '#6f9440'] : ['#5e8f3e', '#6fa04a', '#4f7f38', '#8fae4a']);
    const trees = [], poplars = [], bushes = [], pines = [], ombus = [];
    const b = t.bounds;
    const density = (t.closed ? 900 : 1600) * (bosque ? 2.6 : 1);
    for (let i = 0; i < density; i++) {
      const x = b.minX - 140 + rnd() * (b.maxX - b.minX + 280), z = b.minZ - 140 + rnd() * (b.maxZ - b.minZ + 280);
      const q = t.nearest(x, z);
      if (q.dist < t.W + 11) continue; // los árboles quedan del otro lado del alambrado
      const h = t.heightAt(x, z);
      if (h > 40) continue;
      if (this.reservedHit(x, z)) continue;
      const r = rnd();
      // en el bosque mandan los pinos y los árboles son más altos
      if (bosque) {
        if (r < 0.56) pines.push({ x, z, h, s: 0.9 + rnd() * 0.9, rot: rnd() * 6, c: 2 });
        else if (r < 0.82) trees.push({ x, z, h, s: 0.9 + rnd() * 0.8, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
        else if (r < 0.94) bushes.push({ x, z, h, s: 0.7 + rnd() * 0.9, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
        else poplars.push({ x, z, h, s: 0.9 + rnd() * 0.6, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
        continue;
      }
      if (r < 0.42) trees.push({ x, z, h, s: 0.7 + rnd() * 0.7, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
      else if (r < 0.6) bushes.push({ x, z, h, s: 0.6 + rnd() * 0.8, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
      else if (r < 0.78) pines.push({ x, z, h, s: 0.7 + rnd() * 0.6, rot: rnd() * 6, c: 2 });
      else if (r < 0.86 && q.dist > t.W + 25) ombus.push({ x, z, h, s: 0.9 + rnd() * 0.5, rot: rnd() * 6, c: 3 });
      else poplars.push({ x, z, h, s: 0.8 + rnd() * 0.5, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
    }
    // Banda de pinar pegada al alambrado: da la sensación de correr dentro del bosque
    if (bosque) {
      for (let f = 0; f < 1; f += 0.0035) {
        const q = t.sampleAtFrac(f);
        for (const side of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const lat = side * (t.W + 12 + rnd() * 46);
            const x = q.x + q.nx * lat + (rnd() - 0.5) * 8, z = q.z + q.nz * lat + (rnd() - 0.5) * 8;
            if (t.nearest(x, z).dist < t.W + 11 || this.reservedHit(x, z)) continue;
            const h = t.heightAt(x, z);
            if (rnd() < 0.62) pines.push({ x, z, h, s: 0.9 + rnd() * 1.0, rot: rnd() * 6, c: 2 });
            else trees.push({ x, z, h, s: 0.9 + rnd() * 0.8, rot: rnd() * 6, c: Math.floor(rnd() * greens.length) });
          }
        }
      }
    }
    for (let f = sc.poplars[0]; f < sc.poplars[1]; f += 0.012) {
      const s = t.sampleAtFrac(f);
      for (const side of [-1, 1]) { const lat = side * (t.W + 7 + rnd()); const x = s.x + s.nx * lat, z = s.z + s.nz * lat; poplars.push({ x, z, h: t.heightAt(x, z), s: 1 + rnd() * 0.3, rot: rnd() * 6, c: 1 }); }
    }
    const sw = t.sampleAtFrac(sc.willow);
    const swx = sw.x + sw.nx * (t.W + 6), swz = sw.z + sw.nz * (t.W + 6);
    const willow = new THREE.Group();
    const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.5, 7), toonMat('#7a5a3a')); wt.position.y = 1.7; willow.add(wt);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(2.6 + rnd(), 8, 6), toonMat('#8fb85a')); m.position.set(Math.cos(i) * 2.2, 4.5 + rnd(), Math.sin(i) * 2.2); m.scale.y = 1.4; willow.add(m); }
    willow.position.set(swx, t.heightAt(swx, swz), swz); willow.traverse(o => { o.castShadow = true; }); this.add(willow);
    t.addBarrier({ x: swx, z: swz, r: 0.9, type: 'tree' });

    const M = new THREE.Matrix4(), col = new THREE.Color();
    const place = (geo, list, mat, colored) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.castShadow = true; im.receiveShadow = true;
      list.forEach((o, i) => { M.makeRotationY(o.rot); M.scale(new THREE.Vector3(o.s, o.s, o.s)); M.setPosition(o.x, o.h, o.z); im.setMatrixAt(i, M); if (colored) im.setColorAt(i, col.set(greens[o.c])); });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.add(im); return im;
    };
    place(trunkGeo, trees, toonMat('#7a5a3a'), false);
    place(crownGeo, trees, toonMat('#ffffff'), true);
    place(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 5), poplars, toonMat('#6a4a2a'), false);
    place(poplarGeo, poplars, toonMat('#ffffff'), true);
    place(bushGeo, bushes, toonMat('#ffffff'), true);
    place(new THREE.CylinderGeometry(0.2, 0.28, 2.0, 6).translate(0, 1, 0), pines, toonMat('#5a3d28'), false);
    place(pineGeo, pines, toonMat('#ffffff'), true);
    place(new THREE.CylinderGeometry(0.7, 1.1, 2.6, 7).translate(0, 1.3, 0), ombus, toonMat('#6a4a32'), false);
    place(ombuGeo, ombus, toonMat('#ffffff'), true);
    for (const o of pines) if (t.nearest(o.x, o.z).dist < t.W + 30) t.addBarrier({ x: o.x, z: o.z, r: 0.3 * o.s + 0.1, type: 'tree' });
    for (const o of ombus) t.addBarrier({ x: o.x, z: o.z, r: 1.0 * o.s, type: 'tree' });
    for (const o of trees) if (t.nearest(o.x, o.z).dist < t.W + 30) t.addBarrier({ x: o.x, z: o.z, r: 0.35 * o.s + 0.1, type: 'tree' });
    for (const o of poplars) if (t.nearest(o.x, o.z).dist < t.W + 30) t.addBarrier({ x: o.x, z: o.z, r: 0.25, type: 'tree' });
  }
  reservedHit(x, z) { for (const r of this.reserved || []) if (Math.hypot(x - r.x, z - r.z) < r.r) return true; return false; }

  // ---------- Tribuna, público, carteles ----------
  buildGrandstand() {
    const t = this.track, rnd = mulberry32(12);
    const s = t.sampleAtFrac(t.def.scenery.grandstand);
    const lat = -(t.W + 11.5); // detrás del alambrado
    const gx = s.x + s.nx * lat, gz = s.z + s.nz * lat;
    const g = new THREE.Group();
    g.position.set(gx, t.heightAt(gx, gz) - 0.2, gz);
    g.rotation.y = s.heading + Math.PI / 2; // frente a la pista: las gradas suben alejándose
    const steps = 5, len = 40;
    const stepMat = toonMat('#c9b48a'), roofMat = toonMat('#d94a3a'), postMat = toonMat('#5a4a3a');
    for (let i = 0; i < steps; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 1.6), stepMat); m.position.set(0, 0.4 + i * 0.8, -i * 1.6 - 1); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.3, steps * 1.6 + 2), roofMat); roof.position.set(0, steps * 0.8 + 3.2, -steps * 0.8 - 0.5); roof.rotation.x = -0.12; roof.castShadow = true; g.add(roof);
    for (let i = 0; i <= 4; i++) for (const zz of [-0.5, -steps * 1.6 - 0.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, steps * 0.8 + 3.2, 6), postMat); p.position.set(-len / 2 + i * len / 4, (steps * 0.8 + 3.2) / 2, zz); g.add(p); }
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.45, 3, 6); bodyGeo.translate(0, 0.55, 0);
    const headGeo = new THREE.SphereGeometry(0.19, 8, 6); headGeo.translate(0, 1.05, 0);
    const n = 210;
    const bodies = new THREE.InstancedMesh(bodyGeo, toonMat('#ffffff'), n);
    const heads = new THREE.InstancedMesh(headGeo, toonMat('#ffffff'), n);
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'], shirts = ['#d94a3a', '#3f6fb5', '#f0c541', '#6f8f4b', '#f5f1e8', '#c76ba3', '#2f8f7a', '#ef8a3c'];
    const col = new THREE.Color();
    this.spectators = { bodies, heads, data: [] };
    for (let i = 0; i < n; i++) {
      const row = Math.floor(rnd() * steps), x = -len / 2 + 1 + rnd() * (len - 2), z = -row * 1.6 - 1 + (rnd() - 0.5) * 0.6, y = 0.8 + row * 0.8;
      this.spectators.data.push({ x, y, z, phase: rnd() * 6.28, amp: 0.05 + rnd() * 0.12, speed: 2 + rnd() * 3, rot: (rnd() - 0.5) * 0.6 });
      bodies.setColorAt(i, col.set(pick(rnd, shirts))); heads.setColorAt(i, col.set(pick(rnd, skins)));
    }
    bodies.instanceColor.needsUpdate = true; heads.instanceColor.needsUpdate = true;
    bodies.castShadow = true; g.add(bodies, heads);
    // paraguas si llueve
    if (this.wet) {
      const umb = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 0.3, 8), toonMat('#ffffff'), 90);
      for (let i = 0; i < 90; i++) { const d = this.spectators.data[i * 2]; M4.identity().setPosition(d.x, d.y + 1.5, d.z); umb.setMatrixAt(i, M4); umb.setColorAt(i, col.set(pick(rnd, shirts))); }
      umb.instanceColor.needsUpdate = true; g.add(umb);
    }
    this.buildBanners();
    this.add(g);
    this.grandstand = g; this.grandstandPos = { x: gx, z: gz };
    this.reserved = [{ x: gx, z: gz, r: 30 }];
    for (let i = -len / 2; i <= len / 2; i += 4) { const px = gx + s.tx * i + s.nx * 2.5, pz = gz + s.tz * i + s.nz * 2.5; this.fencePost(px, pz); }
    this.buildBunting(gx + s.nx * 2.5, gz + s.nz * 2.5, s.tx, s.tz, len);
    this.animated.push((dt, time) => {
      const M = M4, d = this.spectators.data, cheer = this.cheerLevel || 0;
      for (let i = 0; i < d.length; i++) {
        const o = d[i];
        const bob = Math.abs(Math.sin(time * o.speed + o.phase)) * o.amp * (1 + 4 * cheer);
        M.makeRotationY(o.rot + Math.sin(time * 1.3 + o.phase) * 0.2 * (1 + cheer)); M.setPosition(o.x, o.y + bob, o.z);
        bodies.setMatrixAt(i, M); heads.setMatrixAt(i, M);
      }
      bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    });
  }
  // banderines de colores colgados entre los postes del cerco de la tribuna
  buildBunting(x0, z0, tx, tz, len) {
    const t = this.track, cols = ['#d94a3a', '#f0c541', '#3f6fb5', '#f5f1e8', '#6f8f4b', '#ef8a3c'];
    const geo = new THREE.ConeGeometry(0.22, 0.5, 3); geo.rotateX(Math.PI); geo.translate(0, -0.25, 0);
    const flags = [];
    const n = Math.floor(len / 1.1);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), along = -len / 2 + u * len;
      const sag = Math.sin(((along + len / 2) % 8) / 8 * Math.PI) * 0.45;
      const x = x0 + tx * along, z = z0 + tz * along;
      const m = new THREE.Mesh(geo, toonMat(cols[i % cols.length], { side: THREE.DoubleSide }));
      m.position.set(x, t.heightAt(x, z) + 2.4 - sag, z); m.rotation.y = Math.atan2(tx, tz) + Math.PI / 2;
      this.add(m); flags.push({ m, ph: i * 0.7 });
    }
    this.animated.push((dt, time) => { const w = Math.hypot(this.wind.x, this.wind.z); for (const f of flags) f.m.rotation.x = Math.sin(time * (3 + w) + f.ph) * (0.25 + w * 0.06); });
  }
  fencePost(x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), toonMat('#8a6a4a')); m.position.set(x, this.track.heightAt(x, z) + 0.55, z); this.add(m);
  }
  bannerTexture(text, bg, fg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#2b1d14'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 118);
    g.fillStyle = fg; g.font = 'bold 54px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  buildBanners() {
    const t = this.track, rnd = mulberry32(55);
    const bgs = ['#f0c541', '#d94a3a', '#3f6fb5', '#f5f1e8', '#6f8f4b', '#ef8a3c'];
    const fgs = ['#2b1d14', '#fff3d6', '#fff3d6', '#c94f2a', '#fff3d6', '#2b1d14'];
    const spots = [0.02, 0.05, 0.08, 0.11, 0.2, 0.28, 0.4, 0.52, 0.66, 0.74, 0.86, 0.93];
    let k = 0;
    for (const f of spots) {
      const s = t.sampleAtFrac(f);
      const side = (f < 0.13) ? -1 : (rnd() < 0.5 ? -1 : 1);
      const lat = side * (t.W + 3.2);
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat, y = t.heightAt(x, z);
      const i = k++ % SPONSORS.length;
      const mat = new THREE.MeshToonMaterial({ map: this.bannerTexture(SPONSORS[i], bgs[i % bgs.length], fgs[i % fgs.length]), side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), mat); m.position.set(x, y + 1.6, z); m.rotation.y = s.heading + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
      m.castShadow = true; this.add(m);
      for (const dx of [-3.8, 3.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), toonMat('#5a4a3a')); p.position.set(x + s.tx * dx, y + 1.4, z + s.tz * dx); this.add(p); }
    }
  }

  // ---------- Granja, molino, vacas, tanque ----------
  buildFarm() {
    const t = this.track, rnd = mulberry32(9), sc = t.def.scenery;
    const s = t.sampleAtFrac(sc.windmill);
    const side = Math.sign(s.curvS) || 1;
    const mx = s.x + s.nx * side * (t.W + 16), mz = s.z + s.nz * side * (t.W + 16), my = t.heightAt(mx, mz);
    const mill = new THREE.Group(); mill.position.set(mx, my, mz);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, 12, 4, 1, true), toonMat('#8a8f96', { side: THREE.DoubleSide })); tower.position.y = 6; mill.add(tower);
    for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12.4, 5), toonMat('#5a5f66')); const a = i * Math.PI / 2 + Math.PI / 4; leg.position.set(Math.cos(a) * 1.1, 6, Math.sin(a) * 1.1); leg.rotation.z = Math.cos(a) * 0.09; leg.rotation.x = -Math.sin(a) * 0.09; mill.add(leg); }
    const rotor = new THREE.Group(); rotor.position.set(0, 12.4, 0.9);
    for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.05), toonMat(i % 2 ? '#e8eef2' : '#d94a3a')); b.position.y = 2.0; const g = new THREE.Group(); g.rotation.z = i * Math.PI * 2 / 18; b.rotation.y = 0.35; g.add(b); rotor.add(g); }
    rotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), toonMat('#2b1d14')));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 2.4), toonMat('#f0c541')); tail.position.set(0, 12.4, -2.6); mill.add(tail);
    mill.add(rotor); mill.traverse(o => { o.castShadow = true; }); this.add(mill);
    t.addBarrier({ x: mx, z: mz, r: 1.8, type: 'post' });
    this.animated.push((dt) => { rotor.rotation.z += dt * (1.4 + Math.hypot(this.wind.x, this.wind.z) * 0.3); });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.4, 16), toonMat('#4aa3df')); tank.position.set(mx + 8, t.heightAt(mx + 8, mz + 2) + 0.7, mz + 2); tank.castShadow = true; this.add(tank);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.18, 6, 16), toonMat('#8a8f96')); rim.rotation.x = Math.PI / 2; rim.position.copy(tank.position).y += 0.7; this.add(rim);
    t.addBarrier({ x: mx + 8, z: mz + 2, r: 4.2, type: 'post' });
    // casa
    const hs = t.sampleAtFrac(sc.house);
    const hside = Math.sign(hs.curvS) || 1;
    const hx = hs.x + hs.nx * hside * (t.W + 22), hz = hs.z + hs.nz * hside * (t.W + 22), hy = t.heightAt(hx, hz);
    const house = new THREE.Group(); house.position.set(hx, hy, hz); house.rotation.y = rnd() * 6;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 6), toonMat('#f5f1e8')); walls.position.y = 1.6; house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 2.6, 4), toonMat('#c94f2a')); roof.position.y = 4.5; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.75; house.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.2), toonMat('#7a5a3a')); door.position.set(1.5, 1.05, 3.05); house.add(door);
    for (const dx of [-2.6, -0.4]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.2), toonMat('#8fd3e8')); win.position.set(dx, 1.8, 3.05); house.add(win); }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), toonMat('#b8473f')); chimney.position.set(-3, 4.8, -1); house.add(chimney);
    house.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); this.add(house);
    t.addBarrier({ x: hx, z: hz, r: 5.5, type: 'post' });
    this.reserved.push({ x: hx, z: hz, r: 14 }, { x: mx, z: mz, r: 14 });
    this.chimney = new THREE.Vector3(hx - 3 * Math.cos(house.rotation.y), hy + 5.9, hz + 3 * Math.sin(house.rotation.y));
    // vacas
    const cowBody = new THREE.BoxGeometry(1.6, 0.9, 0.8), cowHead = new THREE.BoxGeometry(0.55, 0.5, 0.45), legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
    const cowMat = toonMat('#f5f1e8'), spotMat = toonMat('#2b1d14'), pinkMat = toonMat('#f7b7c8');
    this.cows = [];
    for (let i = 0; i < 7; i++) {
      const cx = hx + (rnd() - 0.5) * 34, cz = hz + (rnd() - 0.5) * 34;
      if (Math.hypot(cx - hx, cz - hz) < 8 || t.nearest(cx, cz).dist < t.W + 6) continue;
      const cow = new THREE.Group(); cow.position.set(cx, t.heightAt(cx, cz), cz); cow.rotation.y = rnd() * 6;
      const b = new THREE.Mesh(cowBody, cowMat); b.position.y = 0.95; cow.add(b);
      for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4 + rnd() * 0.4, 0.4, 0.82), spotMat); sp.position.set((rnd() - 0.5) * 1.1, 0.95 + (rnd() - 0.5) * 0.4, 0); cow.add(sp); }
      const head = new THREE.Group(); head.position.set(0.95, 1.1, 0);
      head.add(new THREE.Mesh(cowHead, cowMat));
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.4), pinkMat); nose.position.x = 0.3; head.add(nose);
      for (const dz of [-0.28, 0.28]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.25), cowMat); ear.position.set(-0.05, 0.25, dz); head.add(ear); }
      cow.add(head);
      for (const [lx, lz] of [[-0.6, -0.28], [-0.6, 0.28], [0.6, -0.28], [0.6, 0.28]]) { const l = new THREE.Mesh(legGeo, cowMat); l.position.set(lx, 0.3, lz); cow.add(l); }
      cow.traverse(o => { o.castShadow = true; });
      this.add(cow); this.cows.push({ g: cow, head, phase: rnd() * 6 });
      t.addBarrier({ x: cx, z: cz, r: 0.9, type: 'cow' });
    }
    for (let a = 0; a < Math.PI * 2; a += 0.28) { const px = hx + Math.cos(a) * 19, pz = hz + Math.sin(a) * 19; if (t.nearest(px, pz).dist > t.W + 3) this.fencePost(px, pz); }
    this.animated.push((dt, time) => { for (const c of this.cows) { c.head.rotation.y = Math.sin(time * 0.4 + c.phase) * 0.5; c.head.rotation.z = -0.3 + Math.sin(time * 0.9 + c.phase) * 0.3; } });
    if (sc.bridge != null) {
      const ps = t.sampleAtFrac(sc.bridge);
      const pside = -Math.sign(ps.curvS) || 1;
      const px = ps.x + ps.nx * pside * (t.W + 9), pz = ps.z + ps.nz * pside * (t.W + 9);
      const bridge = new THREE.Group(); bridge.position.set(px, t.heightAt(px, pz) + 0.3, pz); bridge.rotation.y = ps.heading;
      for (let i = 0; i < 8; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 0.45), toonMat('#a8743c')); pl.position.z = -2 + i * 0.55; bridge.add(pl); }
      for (const dx of [-1.4, 1.4]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4.6), toonMat('#7a5a3a')); rail.position.set(dx, 0.9, 0); bridge.add(rail); for (const dz of [-2, 0, 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), toonMat('#7a5a3a')); p.position.set(dx, 0.45, dz); bridge.add(p); } }
      bridge.traverse(o => { o.castShadow = true; }); this.add(bridge);
      t.addBarrier({ x: px, z: pz, r: 2.4, type: 'post' });
    }
  }

  // ---------- Banderilleros ----------
  buildMarshals() {
    const t = this.track;
    const yellow = toonMat('#f0c541', { side: THREE.DoubleSide });
    for (let k = 0; k < 8; k++) {
      const s = t.sampleAtFrac((k + 0.5) / 8);
      const side = k % 2 ? 1 : -1;
      const lat = side * (t.W + 3.5);
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat, y = t.heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = s.heading + (side < 0 ? Math.PI / 2 : -Math.PI / 2);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 3, 6), toonMat('#ef8a3c')); body.position.y = 0.75; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toonMat('#e0ac69')); head.position.y = 1.35; g.add(head);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8), toonMat('#f5f1e8')); hat.position.y = 1.5; g.add(hat);
      const arm = new THREE.Group(); arm.position.set(0.3, 1.15, 0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), toonMat('#5a4a3a')); stick.position.y = 0.45; arm.add(stick);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), yellow); flag.position.set(0.35, 0.75, 0); arm.add(flag);
      arm.rotation.z = -1.4; g.add(arm);
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), toonMat('#f5f1e8')); post.position.set(-0.9, 0.45, 0); g.add(post);
      g.traverse(o => { o.castShadow = true; }); this.add(g);
      this.flags.push({ g, arm, flag, x, z, active: 0 });
    }
    this.animated.push((dt, time) => {
      for (const f of this.flags) {
        f.active = Math.max(0, f.active - dt);
        const target = f.active > 0 ? -0.2 + Math.sin(time * 9) * 0.5 : -1.4;
        f.arm.rotation.z = lerp(f.arm.rotation.z, target, clamp(dt * 8, 0, 1));
      }
    });
  }
  raiseFlag(x, z, seconds = 3) {
    let best = null, bd = 1e18;
    for (const f of this.flags) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; best = f; } }
    if (best && bd < 90 * 90) best.active = Math.max(best.active, seconds);
  }

  // ---------- Reflectores ----------
  buildLamps() {
    const t = this.track;
    this.lampOnMat = toonMat('#fff2b0', { emissive: '#ffe9a0', emissiveIntensity: 1.6 });
    this.lampOffMat = toonMat('#8a8f96');
    const coneMat = new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const count = Math.round(t.length / 70);
    for (let k = 0; k < count; k++) {
      const s = t.sampleAtFrac(k / count);
      const side = k % 2 ? 1 : -1;
      const lat = side * (t.W + 2.2);
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat, y = t.heightAt(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), toonMat('#5a5f66')); pole.position.set(x, y + 3.5, z); this.add(pole);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), this.lampOffMat); bulb.position.set(x - s.nx * side * 0.6, y + 7, z - s.nz * side * 0.6); this.add(bulb);
      const light = new THREE.PointLight('#ffe0a0', 60, 40, 1.6); light.position.set(x - s.nx * side * 1.5, y + 6.5, z - s.nz * side * 1.5); light.visible = false; this.add(light);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 7.5, 12, 1, true), coneMat); cone.position.set(x - s.nx * side * 3, y + 3.6, z - s.nz * side * 3); cone.visible = false; this.add(cone);
      this.lamps.push({ light, bulb, cone });
    }
  }

  buildBirds() {
    this.birds = new THREE.Group();
    const mat = toonMat('#2b1d14');
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.25), mat); l.position.x = -0.45; const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.25), mat); r.position.x = 0.45;
      b.add(l, r); b.userData = { l, r, phase: i * 0.7, r0: 30 + i * 6, h: 28 + i * 3, sp: 0.25 + i * 0.03 };
      this.birds.add(b);
    }
    this.add(this.birds);
    this.animated.push((dt, time) => {
      const c = this.track.bounds;
      for (const b of this.birds.children) {
        const u = b.userData, a = time * u.sp + u.phase;
        b.position.set(c.cx + Math.cos(a) * u.r0 * 2, u.h + Math.sin(a * 2) * 3 + this.track.heightAt(c.cx, c.cz), c.cz + Math.sin(a) * u.r0 * 1.4);
        b.rotation.y = -a; const f = Math.sin(time * 9 + u.phase) * 0.7; u.l.rotation.z = f; u.r.rotation.z = -f;
      }
    });
  }

  buildGantry() {
    const t = this.track;
    const make = (s, text) => {
      const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.heading;
      const w = t.W * 2 + 3;
      for (const dx of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.5, 0.5), toonMat('#f5f1e8')); p.position.set(dx, 3.25, 0); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 1.6, 0.6), new THREE.MeshToonMaterial({ map: this.bannerTexture(text, '#d94a3a', '#fff3d6'), side: THREE.DoubleSide }));
      beam.position.set(0, 6, 0); g.add(beam);
      g.traverse(o => { o.castShadow = true; }); this.add(g);
      return g;
    };
    const g = make(t.samples[0], t.closed ? 'LARGADA · META' : 'LARGADA');
    this.startLights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toonMat('#5a1008')); l.position.set(-1.2 + i * 1.2, 4.9, 0.4); g.add(l); this.startLights.push(l); }
    if (!t.closed) make(t.samples[t.n - 4], 'LLEGADA');
  }
  setStartLights(n, green) {
    this.startLights.forEach((l, i) => { l.material = green ? toonMat('#4ee04e', { emissive: '#2a8a2a', emissiveIntensity: 1 }) : (i < n ? toonMat('#ff3a2a', { emissive: '#8a1008', emissiveIntensity: 1 }) : toonMat('#5a1008')); });
  }

  // Cámaras fijas de TV: a los costados, cada ~110 m, alternando lados
  buildTvSpots() {
    const t = this.track;
    const count = Math.max(4, Math.round(t.length / 110));
    for (let k = 0; k < count; k++) {
      const idx = t.wrap(Math.floor((k + 0.5) / count * t.n));
      const s = t.samples[idx];
      const side = k % 2 ? 1 : -1;
      const lat = side * (t.W + 7);
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
      this.tvSpots.push({ x, y: t.heightAt(x, z) + 5.5, z, idx });
      (this.reserved = this.reserved || []).push({ x, z, r: 10 });
    }
  }

  update(dt, focusX, focusZ, particles, camY = 0) {
    this.time += dt;
    this.updateAtmosphere(dt, focusX, focusZ, particles, camY);
    for (const f of this.animated) f(dt, this.time);
    for (const c of this.clouds.children) { c.position.x += (c.userData.speed + this.wind.x * 0.5) * dt; c.position.z += this.wind.z * 0.5 * dt; if (c.position.x > 800) c.position.x = -800; if (c.position.z > 800) c.position.z = -800; }
    this.sunTarget.position.set(focusX, 0, focusZ);
    if (this.flare) this.flare.position.set(focusX + this.tod.sun[0] * 900, camY + this.tod.sun[1] * 900, focusZ + this.tod.sun[2] * 900);
    this.sun.position.set(focusX + this.tod.sun[0] * 120, this.tod.sun[1] * 120, focusZ + this.tod.sun[2] * 120);
    if (particles && this.chimney && Math.random() < dt * 6) particles.emit(this.chimney.x, this.chimney.y, this.chimney.z, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 1.2, 4, 0.75, 0.72, 0.7, 0.35, 1.2);
    if (this.rain) this.rain.update(dt, focusX, camY, focusZ);
  }
}
const M4 = new THREE.Matrix4();

// Efectos de atmósfera (bruma baja, motas a contraluz, humo de la parrilla): apagados por rendimiento.
const ATMOSFERA = false;
// Bruma baja según la hora (0 = nada)
const MIST = { morning: 0.5, fog: 0.85, dusk: 0.4, storm: 0.35, sunset: 0.3, noon: 0.08 };

World.prototype.buildCountryside = function () {
  // Rollos de pasto, camionetas de los hinchas detrás de la tribuna y una parrilla con su humo.
  const t = this.track, rnd = mulberry32(23), sc = t.def.scenery, W = t.W;
  const rollGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.5, 12); rollGeo.rotateZ(Math.PI / 2);
  const rolls = [];
  for (let k = 0; k < 400 && rolls.length < 14; k++) {
    const s = t.samples[Math.floor(rnd() * t.n)], side = rnd() < 0.5 ? -1 : 1, lat = side * (W + 17 + rnd() * 30);
    const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
    if (t.nearest(x, z).dist < W + 15 || this.reservedHit(x, z)) continue;
    rolls.push({ x, z, rot: rnd() * 6 });
    t.addBarrier({ x, z, r: 1.0, type: 'roll' });
  }
  if (rolls.length) {
    const rm = new THREE.InstancedMesh(rollGeo, toonMat('#d9c27a'), rolls.length); rm.castShadow = rm.receiveShadow = true;
    rolls.forEach((r, i) => { M4.makeRotationY(r.rot).setPosition(r.x, t.heightAt(r.x, r.z) + 0.8, r.z); rm.setMatrixAt(i, M4); });
    this.add(rm);
  }
  // camionetas estacionadas detrás de la tribuna
  const g0 = t.sampleAtFrac(sc.grandstand);
  const cols = ['#c9d6e2', '#d94a3a', '#3f6fb5', '#f0c541', '#6f8f4b', '#f5f1e8'];
  const truckBody = new THREE.BoxGeometry(1.9, 0.7, 4.7); truckBody.translate(0, 0.75, 0);
  const truckCab = new THREE.BoxGeometry(1.8, 0.8, 1.7); truckCab.translate(0, 1.5, 1.1);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10); wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = toonMat('#2a2a2e');
  for (let i = 0; i < 5; i++) {
    const along = (i - 2) * 4.2 + (rnd() - 0.5) * 1.2, lat = -(W + 25 + (i % 2) * 5 + rnd() * 1.5);
    const x = g0.x + g0.tx * along + g0.nx * lat, z = g0.z + g0.tz * along + g0.nz * lat, y = t.heightAt(x, z);
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = g0.heading + Math.PI / 2 + (rnd() - 0.5) * 0.5;
    const col = cols[i % cols.length];
    const body = new THREE.Mesh(truckBody, toonMat(col)); body.castShadow = true; grp.add(body);
    const cab = new THREE.Mesh(truckCab, toonMat(col)); cab.castShadow = true; grp.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), toonMat('#9fd3e8')); glass.position.set(0, 1.55, 0.25); grp.add(glass);
    for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(wx, 0.38, wz); grp.add(w); }
    this.add(grp);
    t.addBarrier({ x, z, r: 2.2, type: 'truck' });
    (this.reserved = this.reserved || []).push({ x, z, r: 4 });
  }
  // parrilla: ladrillos, brasas y humo
  const s2 = t.sampleAtFrac(sc.grandstand + 0.035);
  const lat = -(W + 15.5), ax = s2.x + s2.nx * lat, az = s2.z + s2.nz * lat, ay = t.heightAt(ax, az);
  const pg = new THREE.Group(); pg.position.set(ax, ay, az); pg.rotation.y = s2.heading;
  const bricks = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 0.9), toonMat('#9a5a3a')); bricks.position.y = 0.4; bricks.castShadow = true; pg.add(bricks);
  const grill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.7), toonMat('#3a3a3a')); grill.position.y = 0.83; pg.add(grill);
  const ember = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: '#ff7a2a' })); ember.position.y = 0.7; pg.add(ember);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.9), toonMat('#c9a56a')); table.position.set(0, 0.8, -1.6); table.castShadow = true; pg.add(table);
  this.add(pg);
  this.asado = { x: ax, y: ay + 0.9, z: az, ember };
  t.addBarrier({ x: ax, z: az, r: 1.2, type: 'asado' });
  this.animated.push((dt, time) => { ember.material.color.setHSL(0.06, 1, 0.5 + 0.12 * Math.sin(time * 9) + 0.06 * Math.sin(time * 23)); });
};

World.prototype.buildAtmosphere = function () {
  const t = this.track, rnd = mulberry32(41);
  // bruma baja: planos con degradado radial que flotan sobre los bajos del terreno y derivan con el viento
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64); grad.addColorStop(0, 'rgba(255,255,255,0.55)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const mistTex = new THREE.CanvasTexture(c);
  this.mist = new THREE.Group();
  const mistGeo = new THREE.PlaneGeometry(46, 20); mistGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 18; i++) {
    const s = t.samples[Math.floor(rnd() * t.n)], side = rnd() < 0.5 ? -1 : 1, lat = side * (t.W + 6 + rnd() * 50);
    const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
    const m = new THREE.Mesh(mistGeo, new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.4, depthWrite: false, color: '#ffffff' }));
    m.position.set(x, t.heightAt(x, z) + 0.6 + rnd() * 0.8, z); m.rotation.y = rnd() * 6; m.renderOrder = 2;
    m.userData = { ph: rnd() * 6, base: 0.3 + rnd() * 0.4 };
    this.mist.add(m);
  }
  this.add(this.mist);
  // motas de polvo y polen a contraluz alrededor de la cámara
  const N = 320, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 44; pos[i * 3 + 1] = (rnd() - 0.5) * 20; pos[i * 3 + 2] = (rnd() - 0.5) * 44; }
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  this.motes = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.14, color: '#fff2c4', transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }));
  this.motes.frustumCulled = false; this.motes.userData = { cx: 0, cy: 0, cz: 0 };
  this.add(this.motes);
};

World.prototype.updateAtmosphere = function (dt, fx, fz, particles, camY) {
  const p = this.tod || {};
  if (this.mist) {
    const k = (this.wet ? 0.35 : 1) * (MIST[this.todName] || 0);
    this.mist.visible = k > 0.02;
    if (this.mist.visible) for (const m of this.mist.children) {
      m.position.x += this.wind.x * 0.25 * dt; m.position.z += this.wind.z * 0.25 * dt;
      const d = Math.hypot(m.position.x - fx, m.position.z - fz); if (d > 260) { m.position.x = fx + (Math.random() - 0.5) * 300; m.position.z = fz + (Math.random() - 0.5) * 300; m.position.y = this.track.heightAt(m.position.x, m.position.z) + 0.8; }
      m.material.opacity = k * m.userData.base * (0.8 + 0.2 * Math.sin(this.time * 0.3 + m.userData.ph));
      m.material.color.set(p.fog || '#ffffff');
    }
  }
  if (this.motes) {
    this.motes.visible = !p.night && !p.foggy && !this.wet;
    if (this.motes.visible) {
      const a = this.motes.geometry.attributes.position.array, u = this.motes.userData;
      u.cx = fx; u.cy = camY; u.cz = fz; this.motes.position.set(fx, camY, fz);
      const wx = this.wind.x * 0.35 * dt, wz = this.wind.z * 0.35 * dt, tm = this.time;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += wx + Math.sin(tm * 0.7 + i) * 0.2 * dt; a[i + 1] += Math.sin(tm * 0.5 + i * 0.37) * 0.25 * dt - 0.05 * dt; a[i + 2] += wz + Math.cos(tm * 0.6 + i * 0.11) * 0.2 * dt;
        if (a[i] > 22) a[i] -= 44; else if (a[i] < -22) a[i] += 44;
        if (a[i + 2] > 22) a[i + 2] -= 44; else if (a[i + 2] < -22) a[i + 2] += 44;
        if (a[i + 1] > 10) a[i + 1] -= 20; else if (a[i + 1] < -10) a[i + 1] += 20;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      this.motes.material.opacity = p.night ? 0 : 0.5;
    }
  }
  if (ATMOSFERA && particles && this.asado && Math.random() < dt * 10) particles.emit(this.asado.x + (Math.random() - 0.5) * 0.8, this.asado.y, this.asado.z + (Math.random() - 0.5) * 0.4, this.wind.x * 0.25 + (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.5, this.wind.z * 0.25 + (Math.random() - 0.5) * 0.3, 0.7, 4.5, 0.62, 0.6, 0.58, 0.28, 1.5, 0.9);
};

// Textura de pasto: manchas suaves que rompen la uniformidad del terreno (se multiplica con el color por vértice)
function makeGrassTexture(wet) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = wet ? '#c9cbb8' : '#d6d8c2'; g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(17);
  for (let i = 0; i < 900; i++) {
    const v = 180 + Math.floor(rnd() * 75);
    g.fillStyle = `rgba(${v - 30},${v},${v - 60},${0.25 + rnd() * 0.35})`;
    g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 3 + rnd() * 9, 1.5 + rnd() * 4, rnd() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(90,120,50,${0.2 + rnd() * 0.3})`; g.lineWidth = 1; const x = rnd() * 256, y = rnd() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 6); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Textura radial para el destello del sol
const _flares = new Map();
function flareTexture(size, color, hard) {
  const clave = size + color + hard;
  if (_flares.has(clave)) return _flares.get(clave);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color); grad.addColorStop(0.2 * hard + 0.05, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.compartido = true;
  _flares.set(clave, t); return t;
}

const _texLoader = new THREE.TextureLoader();
// Cada foto se carga una vez y se comparte entre mundos (no se libera al cambiar de fecha)
const _fotosMundo = new Map();
export function loadTex(url, srgb, rx, ry, onLoad) {
  const listo = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.compartido = true; onLoad(t); };
  const y = _fotosMundo.get(url);
  if (y) { if (y.image) listo(y); else y.addEventListener('load', () => listo(y)); return; }
  const t = _texLoader.load(url, listo, undefined, () => {});
  t.userData.compartido = true;
  _fotosMundo.set(url, t);
}
