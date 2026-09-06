// Superficie exterior del casco en el plano central (perfil + bisel de 0,13 m hacia afuera): para ubicar vidrios,
// emblemas y luces por fuera de la chapa. Uso: node herramientas/casco.mjs
import * as THREE from '../lib/three/three.module.js';
import { bodyShapeForTools } from '../js/car_shape.mjs';
const sh = bodyShapeForTools(THREE);
const pts = sh.getPoints(40); // [x=adelante(+), y=alto]
const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
const out = [];
for (let i = 0; i < pts.length; i++) {
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length], p = pts[i];
  const tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1;
  let nx = ty / L, ny = -tx / L;
  if ((p.x - cx) * nx + (p.y - cy) * ny < 0) { nx = -nx; ny = -ny; }
  out.push({ z: p.x + nx * 0.13, y: p.y + ny * 0.13, nz: nx, ny });
}
const top = out.filter(p => p.y > 0.6).sort((a, b) => b.z - a.z);
console.log('superficie exterior (z:y, normal):');
console.log(top.map(p => `${p.z.toFixed(2)}:${p.y.toFixed(2)}(${p.nz.toFixed(2)},${p.ny.toFixed(2)})`).join('  '));
