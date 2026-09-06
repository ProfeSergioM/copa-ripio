// Convierte una malla GLB (de ComfyUI/Hunyuan3D o de cualquier otro lado) en el casco del Fitito para el juego:
// la centra, la escala a 3,2 m de largo, la apoya en el piso, la orienta (trompa a +z), le saca las ruedas
// (el juego pone las suyas, que giran) y la guarda compacta en assets/modelos/fitito.json.
// Uso: node herramientas/importar_casco.mjs assets/modelos/fitito_raw.glb [--giro 0|90|180|270] [--espejo] [--sinruedas 0]
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const giro = +opt('giro', 0), espejo = args.includes('--espejo'), cortarRuedas = opt('sinruedas', '1') !== '0';
if (!file) { console.error('Uso: node herramientas/importar_casco.mjs archivo.glb [--giro 90] [--espejo]'); process.exit(1); }

// ---- lector GLB mínimo (JSON + BIN; solo POSITION e índices de la primera malla; sin texturas)
function readGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('No es un GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); off += 8;
    const chunk = buf.subarray(off, off + len); off += len;
    if (type === 0x4e4f534a) json = JSON.parse(Buffer.from(chunk).toString('utf8')); else if (type === 0x004e4942) bin = chunk;
  }
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const stride = bv.byteStride || comps * T.BYTES_PER_ELEMENT;
    const out = new T(a.count * comps);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = new T(bin.buffer, bin.byteOffset + start + k * stride + c * T.BYTES_PER_ELEMENT, 1)[0];
    return out;
  };
  // junta todas las primitivas de todas las mallas
  const pos = [], idx = []; let base = 0;
  for (const m of json.meshes) for (const p of m.primitives) {
    const P = acc(p.attributes.POSITION); for (const v of P) pos.push(v);
    if (p.indices != null) { const I = acc(p.indices); for (const v of I) idx.push(v + base); } else for (let k = 0; k < P.length / 3; k++) idx.push(base + k);
    base += P.length / 3;
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

const { pos, idx } = readGlb(fs.readFileSync(file));
const n = pos.length / 3;
console.log('vértices', n, 'triángulos', idx.length / 3);

// ---- orientación: giro sobre Y y espejo opcional, luego centrar y escalar
for (let i = 0; i < n; i++) {
  let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const a = giro * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  [x, z] = [x * c + z * s, -x * s + z * c];
  if (espejo) x = -x;
  pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
}
const bb = () => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i * 3 + k]); mx[k] = Math.max(mx[k], pos[i * 3 + k]); } return { mn, mx }; };
let { mn, mx } = bb();
const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
console.log('tamaño original', size.map(v => v.toFixed(3)).join(' × '));
// el eje más largo debe ser z (largo del auto); si es x, giramos 90°
if (size[0] > size[2] * 1.15) { console.log('el largo estaba en x: giro 90°'); for (let i = 0; i < n; i++) { const x = pos[i * 3], z = pos[i * 3 + 2]; pos[i * 3] = -z; pos[i * 3 + 2] = x; } ({ mn, mx } = bb()); }
const L = 3.2, sc = L / (mx[2] - mn[2]);
for (let i = 0; i < n; i++) { pos[i * 3] = (pos[i * 3] - (mn[0] + mx[0]) / 2) * sc; pos[i * 3 + 1] = (pos[i * 3 + 1] - mn[1]) * sc; pos[i * 3 + 2] = (pos[i * 3 + 2] - (mn[2] + mx[2]) / 2) * sc; }
({ mn, mx } = bb());
console.log('escalado: ancho', (mx[0] - mn[0]).toFixed(2), 'alto', (mx[1] - mn[1]).toFixed(2), 'largo', (mx[2] - mn[2]).toFixed(2));

// ---- sacar las ruedas: triángulos enteros dentro de los pasarruedas (abajo, afuera, cerca de los ejes ±1,0)
let tri = [];
const wheelTop = 0.62, ejes = [1.0, -1.0];
for (let t = 0; t < idx.length; t += 3) {
  let fuera = 0;
  for (let k = 0; k < 3; k++) {
    const v = idx[t + k], x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (cortarRuedas && y < wheelTop && Math.abs(x) > 0.42 && ejes.some(e => Math.abs(z - e) < 0.48)) fuera++;
  }
  if (fuera < 3) tri.push(idx[t], idx[t + 1], idx[t + 2]);
}
console.log('triángulos tras sacar ruedas', tri.length / 3);
// piso: nada por debajo de 0,3 m (el juego tapa con el piso oscuro)
const pos2 = Float32Array.from(pos); for (let i = 0; i < n; i++) if (pos2[i * 3 + 1] < 0.3) pos2[i * 3 + 1] = 0.3;

// ---- compactar: solo vértices usados, cuantizados a 16 bits
const used = new Map(); const outPos = [], outIdx = [];
for (const v of tri) { if (!used.has(v)) { used.set(v, outPos.length / 3); outPos.push(pos2[v * 3], pos2[v * 3 + 1], pos2[v * 3 + 2]); } outIdx.push(used.get(v)); }
const q = outPos.map(v => Math.round(v * 1000));
fs.mkdirSync('assets/modelos', { recursive: true });
fs.writeFileSync('assets/modelos/fitito.json', JSON.stringify({ escala: 0.001, largo: L, pos: q, idx: outIdx }));
console.log('guardado assets/modelos/fitito.json:', outPos.length / 3, 'vértices,', outIdx.length / 3, 'triángulos. Recargá el juego para verlo (si mira al revés: --giro 180; si está espejado: --espejo).');
