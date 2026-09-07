// Casco del Fiat 600 por secciones transversales ("loft"): a lo largo del auto se recorre una serie de
// estaciones, y en cada una la sección es una superelipse (redonda en las puntas, algo más cuadrada en la cabina)
// con panza de guardabarros en las ruedas y pasarruedas recortados. Todo se define con pocos parámetros, así que
// se pueden probar variantes (BODY_DESIGNS) y elegir la mejor.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

// Perfil superior (z adelante +, y alto) de un 600 D visto de costado; las variantes lo escalan/desplazan.
const TOP_BASE = [
  // cola: chapa trasera, tapa del motor, luneta; techo abovedado; parabrisas; capó bajo que cae en la trompa
  [-1.62, 0.6], [-1.57, 0.78], [-1.48, 0.94], [-1.34, 1.06], [-1.2, 1.15], [-1.02, 1.33], [-0.84, 1.42], [-0.5, 1.46],
  [-0.1, 1.45], [0.25, 1.4], [0.4, 1.3], [0.52, 1.1], [0.62, 1.0], [0.8, 0.97], [1.0, 0.93], [1.15, 0.87], [1.28, 0.79],
  [1.38, 0.71], [1.46, 0.62], [1.5, 0.55],
];

export const BODY_DESIGNS = {
  A: { name: 'Fiel', desc: 'Proporciones del 600 D de las fotos: capó bajo, cabina abovedada, cola panzona.',
       roof: 1.0, width: 0.7, n: 2.3, nEnds: 1.9, fender: 0.06, sill: 0.36, glassIn: 0.04, tailK: 1.0, noseK: 1.0 },
  B: { name: 'Huevito', desc: 'Caricatura: más alto y redondo, techo más abovedado, guardabarros gordos.',
       roof: 1.08, width: 0.74, n: 2.0, nEnds: 1.8, fender: 0.1, sill: 0.34, glassIn: 0.02, tailK: 1.02, noseK: 0.95 },
  C: { name: 'Abarth', desc: 'De picadas: más bajo y ancho, secciones más llenas, guardabarros ensanchados.',
       roof: 0.95, width: 0.78, n: 2.8, nEnds: 2.2, fender: 0.13, sill: 0.32, glassIn: 0.05, tailK: 0.98, noseK: 1.0 },
  D: { name: 'Flaco', desc: 'Primer 600 (1955): angosto y alto, cola que cae larga, guardabarros apenas marcados.',
       roof: 1.04, width: 0.65, n: 2.2, nEnds: 1.9, fender: 0.03, sill: 0.38, glassIn: 0.03, tailK: 1.12, noseK: 1.0 },
};

const WHEEL_Z = [1.0, -1.0], WHEEL_R = 0.36, WHEEL_Y = 0.29;

function topProfile(d) {
  // escala vertical del techo (por encima de 0,6) y alargamiento de cola/trompa
  return TOP_BASE.map(([z, y]) => [z < 0 ? z * d.tailK : z * d.noseK, 0.6 + (y - 0.6) * d.roof]);
}
function interp(pts, z) {
  if (z <= pts[0][0]) return pts[0][1]; if (z >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i + 1 < pts.length; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]; if (z >= z0 && z <= z1) { const t = (z - z0) / (z1 - z0); const s = t * t * (3 - 2 * t); return lerp(y0, y1, s); } }
  return pts[pts.length - 1][1];
}
// Parámetros de la sección en la estación z
function station(d, z, zMin, zMax) {
  const L = zMax - zMin, u = (z - zMin) / L; // 0 cola … 1 trompa
  const yTop = interp(d._top, z);
  // ancho en planta: pleno en el medio y puntas redondeadas (cuarto de elipse) como la trompa del 600
  const capR = 0.7 * d.tailK, capF = 0.9 * d.noseK;
  let cap = 1;
  if (z - zMin < capR) cap = Math.sqrt(1 - Math.pow(1 - (z - zMin) / capR, 2));
  if (zMax - z < capF) cap = Math.min(cap, Math.sqrt(1 - Math.pow(1 - (zMax - z) / capF, 2)));
  const endT = clamp(cap, 0, 1);
  let w = d.width * lerp(0.3, 1, endT);
  // piso: zócalo, que sube en las puntas (barbilla y cola)
  let yBot = d.sill + Math.pow(clamp((Math.abs(z) - (z > 0 ? 1.15 * d.noseK : 1.25 * d.tailK)) / 0.35, 0, 1), 2) * 0.22;
  // pasarruedas: el borde inferior sigue el arco de la rueda
  let arch = 0;
  for (const zw of WHEEL_Z) { const dz = z - zw; if (Math.abs(dz) < WHEEL_R) arch = Math.max(arch, WHEEL_Y + Math.sqrt(WHEEL_R * WHEEL_R - dz * dz) + 0.03 - yBot); }
  yBot += Math.max(0, arch);
  // panza de guardabarros: bulto lateral alrededor de la rueda, solo abajo
  let fender = 0;
  for (const zw of WHEEL_Z) { const dz = (z - zw) / 0.55; fender = Math.max(fender, d.fender * Math.exp(-dz * dz * 2.2)); }
  const n = lerp(d.nEnds, d.n, endT);
  return { yTop, yBot: Math.min(yBot, yTop - 0.15), w, n, fender };
}
const RING = 18; // puntos por medio anillo (de arriba al piso)
function sectionPoint(st, k, side, d) { return sectionPointT(st, k / (RING - 1), side, d); }
function sectionPointT(st, t, side, d) {
  // t: 0 arriba (centro) … 1 abajo (centro). Dos cuadrantes: domo estrecho arriba del cinturón (huevo)
  // y panza más llena abajo, con guardabarros. El cinturón (ancho máximo) va a ~55 % de la altura en la cabina.
  const H = st.yTop - st.yBot, tall = H > 0.7;
  const yBelt = st.yBot + H * (tall ? 0.52 : 0.68);
  let x, y;
  if (t < 0.5) { // domo: desde el techo (0,yTop) hasta el cinturón (w,yBelt)
    const ang = (t / 0.5) * Math.PI / 2, e = 2 / (tall ? st.n : st.n * 0.85);
    x = st.w * Math.pow(Math.sin(ang), e); y = yBelt + (st.yTop - yBelt) * Math.pow(Math.cos(ang), e);
  } else { // panza: desde el cinturón hasta el zócalo (0.86 w, yBot)
    const ang = ((t - 0.5) / 0.5) * Math.PI / 2, e = 2 / (st.n + 0.6);
    const wS = st.w * 0.86;
    x = wS + (st.w - wS) * Math.pow(Math.cos(ang), e); y = yBelt - (yBelt - st.yBot) * Math.pow(Math.sin(ang), 2 / 2.2);
  }
  // tumblehome: los vidrios apenas metidos
  const hi = clamp((y - yBelt) / Math.max(0.01, st.yTop - yBelt), 0, 1);
  x -= d.glassIn * hi * (1 - hi) * 2;
  // guardabarros: bulto abajo del cinturón
  const lo = clamp(1 - (y - st.yBot) / 0.4, 0, 1);
  x += st.fender * Math.sin(lo * Math.PI / 2);
  if (t >= 0.5 && y < st.yBot + 0.01) y = st.yBot;
  return [side * x, y];
}

// Devuelve la geometría (indexada, con normales suaves) y funciones de consulta de la superficie.
export function loftBody(key) {
  const d = { ...BODY_DESIGNS[key] }; d._top = topProfile(d);
  const zMin = d._top[0][0], zMax = d._top[d._top.length - 1][0];
  const NS = 46, stations = [];
  for (let i = 0; i < NS; i++) {
    // más estaciones en las puntas (curvan más)
    const u = i / (NS - 1), uu = 0.5 - 0.5 * Math.cos(u * Math.PI);
    const z = lerp(zMin, zMax, uu);
    const st = station(d, z, zMin, zMax);
    const ring = [];
    for (let k = 0; k < RING; k++) ring.push(sectionPoint(st, k, 1, d));
    stations.push({ z, st, ring });
  }
  const pos = [], idx = [];
  const W = RING * 2 - 2; // puntos por anillo completo (sin repetir los del centro)
  for (const S of stations) {
    for (let k = 0; k < RING; k++) { const [x, y] = S.ring[k]; pos.push(x, y, S.z); }
    for (let k = RING - 2; k >= 1; k--) { const [x, y] = S.ring[k]; pos.push(-x, y, S.z); }
  }
  for (let i = 0; i + 1 < NS; i++) for (let k = 0; k < W; k++) {
    const a = i * W + k, b = i * W + (k + 1) % W, c = (i + 1) * W + k, e = (i + 1) * W + (k + 1) % W;
    idx.push(a, c, b, b, c, e);
  }
  // tapas de punta: abanico al centro
  for (const [i, dir] of [[0, -1], [NS - 1, 1]]) {
    const S = stations[i]; const cIdx = pos.length / 3; pos.push(0, (S.st.yTop + S.st.yBot) / 2, S.z);
    for (let k = 0; k < W; k++) { const a = i * W + k, b = i * W + (k + 1) % W; if (dir < 0) idx.push(cIdx, b, a); else idx.push(cIdx, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const api = {
    // altura del techo/capó en z
    topY: (z) => interp(d._top, z),
    // x de la superficie (lado derecho) a la altura y en la estación z
    surfaceX: (z, y) => { let best = 0, bd = 1e9; const st = station(d, clamp(z, zMin, zMax), zMin, zMax); for (let k = 0; k < RING; k++) { const [x, yy] = sectionPoint(st, k, 1, d); const dd = Math.abs(yy - y); if (dd < bd) { bd = dd; best = x; } } return best; },
    // z donde el perfil superior alcanza la altura y, en la trompa (side>0) o en la cola (side<0)
    zAtTopY: (y, side) => { const pts = d._top; let z = side > 0 ? zMax : zMin; for (let i = 0; i + 1 < pts.length; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[i + 1]; const inNose = side > 0 ? z0 > 0.4 : z1 < -0.6; if (!inNose) continue; if ((y0 - y) * (y1 - y) <= 0) { const t = (y - y0) / ((y1 - y0) || 1); z = lerp(z0, z1, t); if (side > 0) return z; } } return z; },
    slopeAt: (z) => { const dz = 0.05; return Math.atan2(interp(d._top, z + dz) - interp(d._top, z - dz), 2 * dz); },
    // punto de la superficie en coordenadas (z, t): t 0 = techo centro, 0.5 = cinturón, 1 = piso centro; side ±1
    pointAt: (z, t, side) => { const zc = clamp(z, zMin, zMax); const st = station(d, zc, zMin, zMax); const [x, y] = sectionPointT(st, clamp(t, 0, 1), side, d); return [x, y, zc]; },
    normalAt: (z, t, side) => {
      const e = 0.02, et = 0.02;
      const p = api.pointAt(z, t, side), pz = api.pointAt(z + e, t, side), pt = api.pointAt(z, t + et, side);
      const az = [pz[0] - p[0], pz[1] - p[1], pz[2] - p[2]], at = [pt[0] - p[0], pt[1] - p[1], pt[2] - p[2]];
      let n = [az[1] * at[2] - az[2] * at[1], az[2] * at[0] - az[0] * at[2], az[0] * at[1] - az[1] * at[0]];
      const L = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(v => v / L);
      // hacia afuera: alejándose del eje del auto (o hacia arriba en el centro)
      const cy = (st(z).yTop + st(z).yBot) / 2;
      if (n[0] * p[0] + n[1] * (p[1] - cy) < 0) n = n.map(v => -v);
      return n;
    },
    zMin, zMax, design: d,
  };
  const st = (z) => station(d, clamp(z, zMin, zMax), zMin, zMax);
  return { geometry: g, api };
}

// Parche que sigue la superficie: rectángulo en el espacio (z, t) de un lado, levantado "offset" sobre la chapa.
// Sirve para vidrios, marcos cromados, molduras, costuras y franjas, que así calzan en cualquier casco.
export function surfacePatch(api, z0, z1, t0, t1, side, offset = 0.006, nz = 12, nt = 8) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nt; j++) {
    const z = lerp(z0, z1, i / nz), t = lerp(t0, t1, j / nt);
    const p = api.pointAt(z, t, side), n = api.normalAt(z, t, side);
    pos.push(p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset); nor.push(n[0], n[1], n[2]);
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) {
    const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, e = c + 1;
    if (side > 0) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
