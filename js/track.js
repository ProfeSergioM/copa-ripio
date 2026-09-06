// Pista de ripio: trazado (spline), relieve, malla, barreras y consultas rápidas.
// Soporta circuitos cerrados (vueltas) y tramos abiertos (rally punto a punto).
import * as THREE from 'three';
import { TRACK } from './config.js';
import { Noise2D, clamp, lerp, smoothstep, mulberry32 } from './util.js';

export const CIRCUITS = {
  polvaredas: {
    id: 'polvaredas', name: 'Autódromo Rural de Polvaredas', closed: true, start: [95, -6], heightScale: 1.35,
    points: [
      [0, 0, 0], [55, -3, 0.1], [110, -5, 0.4], [160, -5, 0.8],
      [205, 30, 2], [200, 80, 3.5], [165, 112, 5], [125, 100, 4.5],
      [95, 60, 3], [60, 45, 2], [35, 70, 2.5], [35, 110, 4], [10, 135, 6],
      [-20, 134, 8.5], [-32, 134, 9.6], [-44, 133, 9.4], [-58, 130, 6.4],
      [-90, 120, 4], [-125, 85, 2], [-140, 35, 0], [-125, -15, -1.5], [-75, -32, -1], [-35, -15, -0.5],
    ],
    sectors: [
      [0.00, 'Recta de los Boxes'], [0.13, 'Curva del Sauce'], [0.22, 'Horquilla del Puente'],
      [0.33, 'La Tenaza'], [0.47, 'Lomo de Burro'], [0.55, 'Bajada de los Álamos'],
      [0.68, 'Curvón del Molino'], [0.84, 'Recta del Molino'],
    ],
    scenery: { grandstand: 0.035, windmill: 0.76, house: 0.36, bridge: 0.25, poplars: [0.56, 0.68], willow: 0.16 },
  },
  ovalo: {
    id: 'ovalo', name: 'Óvalo de Tierra del Club Social', closed: true, start: [0, -55], heightScale: 1.35,
    points: [
      [-110, -52, 0], [-40, -56, 0.2], [40, -56, 0.2], [110, -52, 0.4], [148, -22, 1.2], [152, 18, 1.4], [120, 50, 0.8],
      [40, 58, 0.3], [-40, 58, 0.3], [-120, 50, 0.6], [-152, 18, 1.5], [-148, -22, 1.3],
    ],
    sectors: [[0.0, 'Recta de la Cantina'], [0.2, 'Curva del Tanque'], [0.45, 'Contrarrecta'], [0.72, 'Curva de la Cancha']],
    scenery: { grandstand: 0.04, windmill: 0.3, house: 0.6, bridge: null, poplars: [0.46, 0.7], willow: 0.85 },
  },
  cerro: {
    id: 'cerro', name: 'Especial Camino del Cerro', closed: false,
    points: [
      [0, 0, 0], [60, 5, 1], [120, -10, 3], [170, 20, 6], [200, 70, 9], [180, 120, 12], [230, 160, 16], [300, 150, 19],
      [340, 200, 23], [320, 260, 26], [260, 290, 24], [220, 350, 20], [270, 410, 18], [340, 420, 15], [390, 470, 12],
      [370, 530, 10], [300, 560, 8], [260, 620, 6], [300, 680, 4], [380, 700, 2], [450, 690, 1],
    ],
    sectors: [[0.0, 'Salida del pueblo'], [0.18, 'Subida del Cerro'], [0.4, 'La Cumbre'], [0.55, 'Bajada de las Cabras'], [0.8, 'Vado del Arroyo'], [0.93, 'Llegada']],
    scenery: { grandstand: 0.95, windmill: 0.42, house: 0.1, bridge: 0.8, poplars: [0.05, 0.16], willow: 0.82 },
  },
};

export class Track {
  constructor(circuit = 'polvaredas', { reverse = false } = {}) {
    this.def = typeof circuit === 'string' ? CIRCUITS[circuit] : circuit;
    this.closed = this.def.closed !== false;
    this.hw = TRACK.halfWidth;
    this.sh = TRACK.shoulder;
    this.W = this.hw + this.sh;
    this.reverse = reverse && this.closed;
    this.noise = new Noise2D(7);
    this.gripScale = 1; // < 1 con lluvia
    this.buildSamples();
    this.buildHash();
    this.buildHeightfield();
    this.buildBarriers();
  }

  // índice con vuelta (cerrado) o recortado (abierto)
  wrap(i) { return this.closed ? ((i % this.n) + this.n) % this.n : clamp(i, 0, this.n - 1); }

  // ---------- Trazado ----------
  buildSamples() {
    const hs = (typeof process !== 'undefined' && process.env && process.env.ALTURA) ? parseFloat(process.env.ALTURA) : (this.def.heightScale || 1); // más desnivel en los circuitos planos
    let pts = this.def.points.map(p => new THREE.Vector3(p[0], p[2] * hs, p[1]));
    if (this.reverse) pts = [pts[0], ...pts.slice(1).reverse()];
    const curve = new THREE.CatmullRomCurve3(pts, this.closed, 'centripetal', 0.5);
    curve.arcLengthDivisions = 4000;
    this.length = curve.getLength();
    const n = Math.round(this.length / TRACK.sampleStep);
    const spaced = curve.getSpacedPoints(n);
    this.n = this.closed ? n : n + 1;
    let k0 = 0;
    if (this.closed && this.def.start) {
      let kd = 1e18;
      for (let i = 0; i < n; i++) { const d = (spaced[i].x - this.def.start[0]) ** 2 + (spaced[i].z - this.def.start[1]) ** 2; if (d < kd) { kd = d; k0 = i; } }
    }
    const s = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const p = spaced[this.closed ? (i + k0) % n : i];
      s[i] = { x: p.x, z: p.z, y: p.y, tx: 0, tz: 0, nx: 0, nz: 0, curv: 0, dist: i * (this.length / n) };
    }
    const w = (i) => s[this.wrap(i)];
    for (let i = 0; i < this.n; i++) {
      const a = w(i - 1), b = w(i + 1);
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      s[i].tx = tx; s[i].tz = tz; s[i].nx = tz; s[i].nz = -tx;
      s[i].heading = Math.atan2(tx, tz);
    }
    const step = this.length / n;
    for (let i = 0; i < this.n; i++) {
      const a = w(i - 2), b = w(i + 2);
      const dtx = b.tx - a.tx, dtz = b.tz - a.tz;
      s[i].curv = (dtx * s[i].tz - dtz * s[i].tx) / (4 * step); // >0 = gira a la izquierda
    }
    for (let i = 0; i < this.n; i++) { let c = 0; for (let k = -6; k <= 6; k++) c += w(i + k).curv; s[i].curvS = c / 13; }
    for (let i = 0; i < this.n; i++) { const a = w(i - 1), b = w(i + 1); s[i].slope = (b.y - a.y) / (2 * step); }
    this.samples = s;
    this.step = step;
    this.minCurveRadius = 1 / Math.max(...s.map(q => Math.abs(q.curv)));
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const q of s) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
    this.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  setDirection(reverse) {
    reverse = reverse && this.closed;
    if (reverse === this.reverse) return;
    this.reverse = reverse;
    this.buildSamples(); this.buildHash();
  }

  sector(i) {
    let f = this.wrap(i) / this.n;
    if (this.reverse) f = (1 - f) % 1;
    let name = this.def.sectors[0][1];
    for (const [start, nm] of this.def.sectors) if (f >= start) name = nm;
    return name;
  }
  sampleAtFrac(f) { return this.samples[this.wrap(Math.floor(f * (this.n - 1)))]; }

  buildHash() {
    this.cell = 16;
    this.hash = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = this.key(this.samples[i].x, this.samples[i].z);
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(i);
    }
  }
  key(x, z) { return ((Math.floor(x / this.cell)) * 73856093) ^ ((Math.floor(z / this.cell)) * 19349663); }

  nearest(x, z, hint = -1) {
    const s = this.samples, n = this.n;
    let best = -1, bd = 1e18;
    if (hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = this.wrap(hint + k), d = (s[i].x - x) ** 2 + (s[i].z - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd < 30 * 30) return this.finish(best, x, z);
    }
    best = -1; bd = 1e18;
    for (let ring = 0; ring <= 8; ring++) {
      const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
      for (let ix = cx - ring; ix <= cx + ring; ix++) for (let iz = cz - ring; iz <= cz + ring; iz++) {
        if (ring > 0 && Math.abs(ix - cx) !== ring && Math.abs(iz - cz) !== ring) continue;
        const list = this.hash.get((ix * 73856093) ^ (iz * 19349663));
        if (!list) continue;
        for (const i of list) { const d = (s[i].x - x) ** 2 + (s[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0 && bd < (ring * this.cell) ** 2) break;
    }
    if (best < 0) for (let i = 0; i < n; i += 8) { const d = (s[i].x - x) ** 2 + (s[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return this.finish(best, x, z);
  }
  finish(i, x, z) {
    const q = this.samples[i];
    const dx = x - q.x, dz = z - q.z;
    const along = dx * q.tx + dz * q.tz;
    const lateral = dx * q.nx + dz * q.nz;
    return { idx: i, lateral, along, dist: Math.abs(lateral), progress: q.dist + along };
  }

  surfaceAt(lateral) {
    const d = Math.abs(lateral);
    if (d <= this.hw) return 'gravel';
    if (d <= this.W) return 'shoulder';
    if (d > this.W + 3 && d < this.W + 7) return 'ditch';
    return 'grass';
  }

  // ---------- Relieve ----------
  baseHeight(x, z) {
    const nz = this.noise;
    // lomadas grandes, ondulaciones medianas, montículos chicos en el pasto y cerros lejanos
    let h = 4.6 * nz.fbm(x / 150, z / 150, 3) + 2.2 * nz.fbm(x / 38 + 7, z / 38 + 3, 2) + 0.55 * nz.fbm(x / 11 + 3, z / 11 + 9, 2) + 8 * nz.fbm(x / 420 + 2, z / 420, 2);
    const b = this.bounds;
    // distancia al rectángulo del trazado: cerros al fondo
    const ddx = Math.max(b.minX - x, 0, x - b.maxX), ddz = Math.max(b.minZ - z, 0, z - b.maxZ);
    const r = Math.hypot(ddx, ddz);
    const far = smoothstep(120, 340, r);
    h += far * (42 + 62 * (0.5 + nz.fbm(x / 90, z / 90, 3)));
    return h;
  }
  buildHeightfield() {
    const b = this.bounds, margin = 400;
    this.hf = { x0: b.minX - margin, z0: b.minZ - margin, cell: 3.0 };
    const w = Math.ceil((b.maxX - b.minX + margin * 2) / this.hf.cell) + 1;
    const d = Math.ceil((b.maxZ - b.minZ + margin * 2) / this.hf.cell) + 1;
    this.hf.w = w; this.hf.d = d;
    const data = new Float32Array(w * d);
    const info = new Float32Array(w * d);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const x = this.hf.x0 + i * this.hf.cell, z = this.hf.z0 + j * this.hf.cell;
      const q = this.nearest(x, z);
      data[j * w + i] = this.heightBlend(x, z, q);
      info[j * w + i] = q.dist;
    }
    this.hf.data = data; this.hf.dist = info;
  }
  heightBlend(x, z, q) {
    const s = this.samples[q.idx];
    const base = this.baseHeight(x, z);
    let dl = q.dist;
    if (!this.closed && (q.idx === 0 || q.idx === this.n - 1)) dl = Math.max(dl, Math.abs(q.along)); // más allá de los extremos
    const w = smoothstep(this.W + 2, this.W + 34, dl);
    let h = lerp(s.y, base, w);
    const dz = (dl - (this.W + 5)) / 2.2;
    h -= 0.35 * Math.exp(-(dz * dz)) * (1 - w);
    h -= 0.35 * (1 - smoothstep(this.W - 0.5, this.W + 1.5, dl));
    return h;
  }
  heightHF(x, z) {
    const hf = this.hf;
    const fx = clamp((x - hf.x0) / hf.cell, 0, hf.w - 1.001), fz = clamp((z - hf.z0) / hf.cell, 0, hf.d - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = hf.data[j * hf.w + i], b = hf.data[j * hf.w + i + 1], c = hf.data[(j + 1) * hf.w + i], e = hf.data[(j + 1) * hf.w + i + 1];
    return lerp(lerp(a, b, u), lerp(c, e, u), v);
  }
  heightAt(x, z, hint = -1) {
    const q = this.nearest(x, z, hint);
    const inside = this.closed || ((q.idx > 0 || q.along >= 0) && (q.idx < this.n - 1 || q.along <= 0));
    if (q.dist < this.W + 6 && inside) {
      const s0 = this.samples[q.idx], s1 = this.samples[this.wrap(q.idx + (q.along >= 0 ? 1 : -1))];
      const t = clamp(Math.abs(q.along) / this.step, 0, 1);
      const ribbon = lerp(s0.y, s1.y, t);
      if (q.dist < this.W + 1.5) return ribbon;
      // transición continua entre la cinta exacta y el relieve interpolado (sin escalón al volver del pasto)
      return lerp(ribbon, this.heightHF(x, z), (q.dist - (this.W + 1.5)) / 4.5);
    }
    return this.heightHF(x, z);
  }
  slopeAt(x, z, hint = -1) {
    const e = 0.6;
    const hx = this.heightAt(x + e, z, hint) - this.heightAt(x - e, z, hint);
    const hz = this.heightAt(x, z + e, hint) - this.heightAt(x, z - e, hint);
    return { gx: hx / (2 * e), gz: hz / (2 * e) };
  }

  // ---------- Barreras ----------
  buildBarriers() {
    const rnd = mulberry32(31);
    this.barriers = [];
    const s = this.samples, n = this.n, W = this.W;
    let lastTire = -100, lastBale = -100;
    for (let i = 0; i < n; i++) {
      const c = s[i].curvS;
      if (Math.abs(c) > 1 / 48 && i - lastTire >= 1.3) {
        const side = -Math.sign(c), lat = side * (W + 6.5); // detrás de la zanja: hay escapatoria antes del muro
        this.barriers.push({ x: s[i].x + s[i].nx * lat, z: s[i].z + s[i].nz * lat, r: 0.62, type: 'tires', idx: i, lat, paint: (Math.floor(i / 2.6) % 2) });
        lastTire = i;
      }
      if (Math.abs(c) > 1 / 30 && i - lastBale >= 1.7) {
        const side = Math.sign(c), lat = side * (W + 1.1);
        this.barriers.push({ x: s[i].x + s[i].nx * lat, z: s[i].z + s[i].nz * lat, r: 0.75, type: 'bale', idx: i, lat, rot: rnd() * Math.PI });
        lastBale = i;
      }
    }
    // alambrado perimetral: postes cada metro a FENCE_D del centro, por dentro y por fuera, para que nadie se vaya al infinito.
    // Donde el circuito pasa cerca de sí mismo (infield angosto) el cerco se corta: lo cubre el del otro tramo.
    const FENCE_D = W + 10;
    this.fenceD = FENCE_D;
    for (const side of [-1, 1]) {
      let skip = false;
      for (let i = 0; i < n; i++) {
        const lat = side * FENCE_D;
        const x = s[i].x + s[i].nx * lat, z = s[i].z + s[i].nz * lat;
        if (i % 4 === 0) skip = this.nearest(x, z).dist < FENCE_D - 1.5; // otro tramo del circuito pasa más cerca: ahí va su cerco
        if (skip) continue;
        this.barriers.push({ x, z, r: 0.32, type: 'fence', idx: i, lat, side, lean: (rnd() - 0.5) * 0.12 });
      }
    }
    this.stakes = [];
    for (let i = 0; i < n; i += 10) for (const side of [-1, 1]) {
      const lat = side * (W + 0.5);
      this.stakes.push({ x: s[i].x + s[i].nx * lat, z: s[i].z + s[i].nz * lat, y: s[i].y });
    }
    this.bcell = 10; this.bhash = new Map();
    for (const b of this.barriers) this.addBarrierToHash(b);
  }
  addBarrierToHash(b) {
    const k = ((Math.floor(b.x / this.bcell)) * 73856093) ^ ((Math.floor(b.z / this.bcell)) * 19349663);
    if (!this.bhash.has(k)) this.bhash.set(k, []);
    this.bhash.get(k).push(b);
  }
  addBarrier(b) { this.barriers.push(b); this.addBarrierToHash(b); }
  barriersNear(x, z, out) {
    out.length = 0;
    const cx = Math.floor(x / this.bcell), cz = Math.floor(z / this.bcell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const l = this.bhash.get((ix * 73856093) ^ (iz * 19349663));
      if (l) for (const b of l) out.push(b);
    }
    return out;
  }

  gridSlot(i) {
    const row = Math.floor(i / 2), col = i % 2;
    const idx = this.closed ? this.wrap(this.n - 12 - row * 8 - col * 4) : this.wrap(8 + row * 7 + col * 3);
    const s = this.samples[idx];
    const lat = this.closed ? (col === 0 ? -1 : 1) * 3.0 : 0;
    return { x: s.x + s.nx * lat, z: s.z + s.nz * lat, heading: s.heading, idx };
  }

  // ---------- Mallas ----------
  buildMeshes(wet = false) {
    const group = new THREE.Group();
    const s = this.samples, n = this.n, W = this.W, hw = this.hw;
    const lats = [-W, -hw, hw, W];
    const rows = this.closed ? n + 1 : n;
    const pos = new Float32Array(rows * 4 * 3), col = new Float32Array(rows * 4 * 3), uv = new Float32Array(rows * 4 * 2);
    const shoulderCol = new THREE.Color(wet ? '#7a6448' : '#bf9e72'), gravelCol = new THREE.Color(wet ? '#6a5540' : '#b08c62');
    const rnd = mulberry32(5);
    for (let r = 0; r < rows; r++) {
      const q = s[r % n];
      const v = (r * this.step) / 8;
      for (let k = 0; k < 4; k++) {
        const lat = lats[k], vi = r * 4 + k;
        pos[vi * 3] = q.x + q.nx * lat; pos[vi * 3 + 1] = q.y + 0.05; pos[vi * 3 + 2] = q.z + q.nz * lat;
        uv[vi * 2] = lat / (2 * W) + 0.5; uv[vi * 2 + 1] = v;
        const c = (k === 0 || k === 3) ? shoulderCol : gravelCol;
        const tint = 0.86 + 0.34 * this.noise.fbm(q.x / 25, q.z / 25, 2) + 0.1 * this.noise.noise(q.x / 6, q.z / 6) + (rnd() - 0.5) * 0.05; // lodo: manchones grandes y charquitos
        col[vi * 3] = c.r * tint; col[vi * 3 + 1] = c.g * tint; col[vi * 3 + 2] = c.b * tint;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < 3; k++) { const a = r * 4 + k, b = a + 1, c = a + 4, d = a + 5; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // marcas de neumáticos (surcos que se acumulan) multiplicadas sobre el ripio
    this.marks = new TireMarks(this);
    const mudTex = makeMudTextures(wet);
    const mat = new THREE.MeshStandardMaterial({ map: mudTex.map, roughnessMap: mudTex.roughness, vertexColors: true, roughness: wet ? 0.5 : 0.9, metalness: 0 });
    if (typeof loadTrackTextures === 'function') loadTrackTextures(mat, wet, mudTex.canvas);
    const marks = this.marks, len = this.length;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.marksMap = { value: marks.texture }; sh.uniforms.marksScale = { value: 8 / len };
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec2 vMarksUv;\nvoid main() {\n vMarksUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D marksMap; uniform float marksScale; varying vec2 vMarksUv;\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n float mk = texture2D(marksMap, vec2(vMarksUv.x, vMarksUv.y * marksScale)).a; diffuseColor.rgb *= (1.0 - mk * 0.7);');
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    const lineMat = new THREE.MeshLambertMaterial({ map: makeCheckerTexture(), transparent: true });
    const addLine = (q) => {
      const lg = new THREE.PlaneGeometry(hw * 2, 2.2); lg.rotateX(-Math.PI / 2); // x = a lo ancho, z = a lo largo
      const line = new THREE.Mesh(lg, lineMat);
      line.position.set(q.x, q.y + 0.09, q.z);
      line.rotation.y = q.heading;
      group.add(line);
    };
    // líneas blancas de borde entre el ripio y la banquina
    const lineW = 0.28, rowsL = rows;
    for (const side of [-1, 1]) {
      const lp = new Float32Array(rowsL * 2 * 3), lc = new Float32Array(rowsL * 2 * 3);
      for (let r = 0; r < rowsL; r++) {
        const q = s[r % n];
        const worn = 0.5 + 0.5 * Math.max(0, Math.min(1, 0.5 + this.noise.noise(r / 9 + side * 40, 3.7))); // desgaste irregular, salpicada de barro
        for (let k = 0; k < 2; k++) {
          const lat = side * (hw - 0.05 + (k ? lineW : 0)), vi = r * 2 + k;
          lp[vi * 3] = q.x + q.nx * lat; lp[vi * 3 + 1] = q.y + 0.075; lp[vi * 3 + 2] = q.z + q.nz * lat;
          lc[vi * 3] = worn; lc[vi * 3 + 1] = worn * 0.97; lc[vi * 3 + 2] = worn * 0.9;
        }
      }
      const li = [];
      for (let r = 0; r < rowsL - 1; r++) { const a = r * 2, b = a + 1, c = a + 2, d = a + 3; li.push(a, c, b, b, c, d); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3)); lg.setIndex(li); lg.computeVertexNormals();
      const lm = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ color: wet ? '#d8d4c4' : '#fbf7ea', vertexColors: true })); lm.receiveShadow = true;
      group.add(lm);
    }
    addLine(s[0]);
    if (!this.closed) addLine(s[n - 4]);
    this.meshGroup = group;
    return group;
  }
}

// Marcas de neumáticos: lienzo de baja resolución a lo largo de la pista (u = ancho, v = distancia).
export class TireMarks {
  constructor(track) {
    this.track = track;
    this.w = 64; this.h = Math.min(8192, Math.round(track.length * 4));
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    this.ctx = c.getContext('2d'); this.ctx.clearRect(0, 0, this.w, this.h);
    this.texture = new THREE.CanvasTexture(c);
    this.texture.wrapS = THREE.ClampToEdgeWrapping; this.texture.wrapT = track.closed ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter;
    this.dirty = false; this.t = 0;
  }
  // progress en metros, lateral en metros, fuerza 0..1
  mark(progress, lateral, strength) {
    const t = this.track;
    const u = (lateral / (2 * t.W) + 0.5) * this.w;
    const v = (((progress / t.length) % 1) + 1) % 1 * this.h;
    this.ctx.fillStyle = `rgba(40,28,14,${(0.06 + strength * 0.14).toFixed(3)})`;
    this.ctx.beginPath(); this.ctx.ellipse(u, v, 1.1 + strength * 0.9, 1.8, 0, 0, 7); this.ctx.fill();
    this.dirty = true;
  }
  update(dt) { this.t += dt; if (this.dirty && this.t > 0.4) { this.texture.needsUpdate = true; this.dirty = false; this.t = 0; } }
}

// Lodo procedural: manchones, huellas de ruedas, costras secas y charcos. Devuelve color + rugosidad (charcos y huellas brillan).
// El lienzo cubre 16 m de ancho por 8 m de largo (u = ancho, v = a lo largo).
function makeMudTextures(wet) {
  const Wc = 1024, Hc = 512;
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d');
  const r = document.createElement('canvas'); r.width = 256; r.height = 128;
  const rg = r.getContext('2d'); const rs = 256 / Wc;
  const rnd = mulberry32(99);
  g.fillStyle = wet ? '#5a4632' : '#9a7a54'; g.fillRect(0, 0, Wc, Hc);
  rg.fillStyle = wet ? '#9a9a9a' : '#d0d0d0'; rg.fillRect(0, 0, 256, 128);
  const blob = (ctx, x, y, rx, ry, rot, style, sc = 1) => { ctx.fillStyle = style; ctx.beginPath(); ctx.ellipse(x * sc, y * sc, rx * sc, ry * sc, rot, 0, 7); ctx.fill(); };
  // manchones oscuros grandes (barro más húmedo) y costras claras (barro seco)
  for (let i = 0; i < 70; i++) { const x = rnd() * Wc, y = rnd() * Hc, rx = 40 + rnd() * 120, ry = 20 + rnd() * 60, rot = rnd() * 3; blob(g, x, y, rx, ry, rot, 'rgba(38,24,12,0.3)'); blob(rg, x, y, rx, ry, rot, 'rgba(80,80,80,0.25)', rs); }
  for (let i = 0; i < 45; i++) { const x = rnd() * Wc, y = rnd() * Hc, rx = 30 + rnd() * 90, ry = 12 + rnd() * 40, rot = rnd() * 3; blob(g, x, y, rx, ry, rot, wet ? 'rgba(150,125,95,0.12)' : 'rgba(200,170,130,0.2)'); blob(rg, x, y, rx, ry, rot, 'rgba(240,240,240,0.35)', rs); }
  // huellas de ruedas: bandas hundidas a lo largo (u constante, serpenteando), con un bordecito claro
  const ruts = [0.33, 0.41, 0.59, 0.67, 0.5];
  for (const u of ruts) {
    for (const [ctx, sc, width, style] of [[g, 1, 30, 'rgba(30,18,8,0.42)'], [rg, rs, 30, 'rgba(60,60,60,0.6)']]) {
      ctx.strokeStyle = style; ctx.lineWidth = width * sc; ctx.lineCap = 'round'; ctx.beginPath();
      for (let y = -20; y <= Hc + 20; y += 16) { const x = (u * Wc + Math.sin(y / 70 + u * 20) * 14 + Math.sin(y / 23) * 5); if (y < 0) ctx.moveTo(x * sc, y * sc); else ctx.lineTo(x * sc, y * sc); }
      ctx.stroke();
    }
    g.strokeStyle = wet ? 'rgba(120,98,70,0.16)' : 'rgba(170,140,100,0.22)'; g.lineWidth = 6; g.beginPath();
    for (let y = -20; y <= Hc + 20; y += 16) { const x = u * Wc + 18 + Math.sin(y / 70 + u * 20) * 14 + Math.sin(y / 23) * 5; if (y < 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // piedritas y terrones
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * Wc, y = rnd() * Hc, rad = 0.8 + rnd() * 2.6, dark = rnd() < 0.55;
    const shade = dark ? 30 + Math.floor(rnd() * 40) : 120 + Math.floor(rnd() * 80);
    blob(g, x + 0.8, y + 0.9, rad, rad * 0.7, rnd() * 3, 'rgba(25,15,6,0.4)');
    blob(g, x, y, rad, rad * (0.5 + rnd() * 0.6), rnd() * 3, `rgba(${shade + 18},${shade},${Math.max(0, shade - 35)},0.9)`);
  }
  // charcos: oscuros, con reflejo del cielo, y muy lisos en el mapa de rugosidad
  const puddles = wet ? 20 : 10;
  for (let i = 0; i < puddles; i++) {
    const x = rnd() * Wc, y = rnd() * Hc, rx = 24 + rnd() * 70, ry = 10 + rnd() * 26, rot = rnd() * 3;
    blob(g, x, y, rx, ry, rot, 'rgba(24,18,12,0.7)'); blob(g, x - rx * 0.15, y - ry * 0.2, rx * 0.75, ry * 0.6, rot, 'rgba(120,135,155,0.5)');
    blob(rg, x, y, rx, ry, rot, 'rgba(20,20,20,0.9)', rs);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const rt = new THREE.CanvasTexture(r); rt.wrapS = THREE.ClampToEdgeWrapping; rt.wrapT = THREE.RepeatWrapping;
  return { map: t, roughness: rt, canvas: c };
}

function makeCheckerTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#2b1d14' : '#fff3d6'; g.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Foto de grava con normales (Poly Haven, CC0). La cinta mide 16 m de ancho por 8 m de repetición: 2 baldosas a lo ancho.
const _loader = new THREE.TextureLoader();
function loadTrackTextures(mat, wet, mudCanvas) {
  // la foto de grava (detalle fino) se multiplica sobre el lodo procedural (manchas, huellas, charcos)
  _loader.load('assets/texturas/grava_color.jpg', (t) => {
    const img = t.image; if (!img || !mudCanvas) return;
    const c = document.createElement('canvas'); c.width = mudCanvas.width; c.height = mudCanvas.height;
    const g = c.getContext('2d');
    g.drawImage(mudCanvas, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55;
    const tile = c.height; for (let x = 0; x < c.width; x += tile) g.drawImage(img, x, 0, tile, tile);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex; mat.color.set(wet ? '#d8ccb8' : '#fff0dc'); mat.needsUpdate = true;
  }, undefined, () => {});
  _loader.load('assets/texturas/grava_normal.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); t.anisotropy = 8; mat.normalMap = t; mat.normalScale.set(0.7, 0.7); mat.needsUpdate = true; }, undefined, () => {});
}
