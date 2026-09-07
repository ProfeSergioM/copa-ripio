// Modelo caricaturesco del Fiat 600 ("Fitito"), con daños visibles (abolladuras, piezas que se caen).
import * as THREE from 'three';
import { clamp, mulberry32 } from './util.js';
import { BODY_DESIGNS, loftBody, surfacePatch } from './carroceria.js';

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([60, 105, 175, 255]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}
export function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}
export function outlineMat(width = 0.035) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1d130c, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${width.toFixed(3)};`);
  };
  return m;
}

const chromeMat = toonMat('#e8eef2');
const tireMat = toonMat('#2a2a2e');
const hubMat = toonMat('#f2e9d2');
const glassMat = toonMat('#3a5566', { transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const darkMat = toonMat('#2b1d14');
const lightOn = toonMat('#fff6c8', { emissive: '#ffe9a0', emissiveIntensity: 0.6 });
const lensMat = toonMat('#dbeefb', { transparent: true, opacity: 0.55, emissive: '#ffe9a0', emissiveIntensity: 0.15 });
const lightBroken = toonMat('#4a4a4a');
const tailOff = toonMat('#c8342a', { emissive: '#4a0c08', emissiveIntensity: 0.35 });
const tailOn = toonMat('#ff4a3a', { emissive: '#ff2a1a', emissiveIntensity: 1.6 });
const outline = outlineMat();
const woodMat = toonMat('#a8743c');
const suitcaseMats = ['#b5533c', '#3f6fb5', '#c9a26b', '#6f8f4b'].map(c => toonMat(c));
const whitewallMat = toonMat('#f3eee2');

function roundedRect(w, h, r) {
  const sh = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  return sh;
}
// Vidrio con marco cromado: un rectángulo redondeado de cromo apenas más grande, y el vidrio delante.
function glassPane(w, h, r = 0.08, divider = null) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(w + 0.05, h + 0.05, r + 0.02), { depth: 0.02, bevelEnabled: false }), chromeMat); g.add(frame);
  const glass = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: 0.02, bevelEnabled: false }), glassMat); glass.position.z = 0.012; g.add(glass);
  if (divider != null) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.02, h, 0.03), chromeMat); d.position.set(divider, 0, 0.02); g.add(d); }
  return g;
}

// Perfil lateral del 600: trompa corta y redonda, parabrisas bastante parado, techo abovedado
// y la cola que cae en curva continua desde el techo hasta el paragolpes (motor atrás).
function bodyShape() {
  const sh = new THREE.Shape();
  // Fiat 600: capó corto que cae redondo ("trompa de bulldog"), parabrisas parado, cabina alta y larga,
  // luneta empinada y cola panzona (el motor va atrás), sin la caída larga de un Renault 4CV.
  sh.moveTo(1.42, 0.36);
  sh.splineThru([
    new THREE.Vector2(1.5, 0.5), new THREE.Vector2(1.5, 0.7), new THREE.Vector2(1.42, 0.9), new THREE.Vector2(1.26, 1.02),
    new THREE.Vector2(1.02, 1.08), new THREE.Vector2(0.76, 1.12), new THREE.Vector2(0.56, 1.17), new THREE.Vector2(0.4, 1.38),
    new THREE.Vector2(0.18, 1.48), new THREE.Vector2(-0.3, 1.53), new THREE.Vector2(-0.78, 1.49), new THREE.Vector2(-1.04, 1.36),
    new THREE.Vector2(-1.24, 1.12), new THREE.Vector2(-1.42, 0.9), new THREE.Vector2(-1.56, 0.72), new THREE.Vector2(-1.63, 0.54),
    new THREE.Vector2(-1.56, 0.36),
  ]);
  sh.lineTo(-1.42, 0.36);
  sh.absarc(-1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(0.58, 0.36);
  sh.absarc(1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(1.42, 0.36);
  return sh;
}

let bodyGeoTemplate = null;
export let customBody = false;
const loftCache = {};
// Diseño de casco activo: null = perfil extruido clásico; 'A'..'D' = loft por secciones (js/carroceria.js)
export let bodyDesign = null;
export function setBodyDesign(key) { bodyDesign = key && BODY_DESIGNS[key] ? key : null; }
function loftFor(key) { if (!loftCache[key]) loftCache[key] = loftBody(key); return loftCache[key]; }

// Ubicación de vidrios, luces y cromados según la superficie del casco elegido
function layoutFor(key) {
  if (!key) return {
    wsh: { y: 1.4, z: 0.56, rot: -0.51 }, rw: { y: 1.37, z: -1.25, rot: Math.PI + 0.69 },
    doorX: 0.735, quarterX: 0.73, flankX: 0.752, numX: 0.748, mirrorX: 0.88,
    head: { z: 1.545, ringZ: 1.6, reflZ: 1.565, bulbZ: 1.59 }, badge: { y: 0.76, z: 1.64, tilt: -0.23 }, park: { z: 1.65 },
    hood: { y: 1.225, z: 1.06, rot: 0.19, seamF: { y: 1.04, z: 1.47, rot: 0.75 }, seamB: { y: 1.262, z: 0.66 }, stripB: { y: 0.945, z: 1.53, rot: 1.0 } },
    tail: { y: 0.8, z: -1.7 }, lid: { y: 0.98, z: -1.49, rot: Math.PI + 0.62 }, bumperF: 1.69, bumperR: -1.78, plateF: { y: 0.44, z: 1.76 }, plateR: -1.74,
    roofY: 1.575, fenders: true, numY: 0.76, stripeH: { y: 1.228, z: 1.02, rot: 0.19 }, roofStripeY: 1.632, wshW: 1.16, rwW: 1.02, wheelX: 0.64,
  };
  const { api } = loftFor(key);
  const rotFor = (z) => { const phi = api.slopeAt(z); return Math.atan2(-Math.cos(phi), -Math.sin(phi)); }; // normal de la chapa → rotation.x de un plano
  const zW = 0.48, zR = api.zAtTopY(1.32, -1);
  const zHead = api.zAtTopY(0.93, 1) - 0.05, zBadge = api.zAtTopY(0.78, 1), zTail = api.zAtTopY(0.8, -1), zLid = api.zAtTopY(1.02, -1);
  const zH = 0.95;
  return {
    wsh: { y: api.topY(zW) + 0.02, z: zW, rot: rotFor(zW) }, rw: { y: api.topY(zR) + 0.02, z: zR, rot: rotFor(zR) },
    doorX: api.surfaceX(0.1, 1.17) + 0.012, quarterX: api.surfaceX(-0.6, 1.16) + 0.012, flankX: api.surfaceX(0.0, 0.7) + 0.012, numX: api.surfaceX(-0.02, 0.76) + 0.008, mirrorX: api.surfaceX(0.5, 1.05) + 0.14,
    head: { z: zHead, ringZ: zHead + 0.055, reflZ: zHead + 0.02, bulbZ: zHead + 0.045 }, badge: { y: 0.78, z: zBadge + 0.02, tilt: -(Math.PI / 2 + api.slopeAt(zBadge)) + Math.PI / 2 }, park: { z: api.zMax - 0.03 },
    hood: { y: api.topY(zH) + 0.015, z: zH, rot: api.slopeAt(zH), seamF: { y: api.topY(zH + 0.42) + 0.012, z: zH + 0.42, rot: api.slopeAt(zH + 0.42) }, seamB: { y: api.topY(0.64) + 0.012, z: 0.64 }, stripB: { y: api.topY(zH + 0.5) + 0.012, z: zH + 0.5, rot: api.slopeAt(zH + 0.5) } },
    tail: { y: 0.8, z: zTail - 0.02 }, lid: { y: 1.02, z: zLid, rot: rotFor(zLid) }, bumperF: api.zMax + 0.02, bumperR: api.zMin - 0.02, plateF: { y: 0.44, z: api.zMax + 0.09 }, plateR: api.zMin - 0.04,
    roofY: api.topY(-0.3) + 0.01, fenders: false, numY: 0.76, stripeH: { y: api.topY(1.0) + 0.012, z: 1.0, rot: api.slopeAt(1.0) }, roofStripeY: api.topY(-0.28) + 0.012,
    // vidrios tan anchos como el domo a su altura; ruedas metidas bajo el guardabarros
    wshW: 2 * api.surfaceX(zW, api.topY(zW) - 0.12) - 0.04, rwW: 2 * api.surfaceX(zR, api.topY(zR) - 0.12) - 0.04, wheelX: api.surfaceX(1.0, 0.45) - 0.07,
  };
}
// Casco importado (assets/modelos/fitito.json, generado con herramientas/importar_casco.mjs): reemplaza al perfil extruido.
export async function loadBodyModel(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return false;
    const d = await r.json(); const k = d.escala || 0.001;
    const pos = new Float32Array(d.pos.length); for (let i = 0; i < d.pos.length; i++) pos[i] = d.pos[i] * k;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(d.idx);
    g.computeVertexNormals();
    bodyGeoTemplate = g; customBody = true; return true;
  } catch (e) { return false; }
}
function bodyGeometry(designKey = bodyDesign) {
  if (designKey && !customBody) {
    const g = loftFor(designKey).geometry.clone();
    const n = g.attributes.position.count, pos = g.attributes.position, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const y = pos.getY(i); const shade = y < 0.42 ? 0.62 : y < 0.6 ? 0.62 + (y - 0.42) / 0.18 * 0.3 : 0.92 + Math.min(1, (y - 0.6) / 0.6) * 0.08; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  if (!bodyGeoTemplate) {
    const g = new THREE.ExtrudeGeometry(bodyShape(), { depth: 1.16, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.13, bevelSegments: 5, curveSegments: 6 });
    g.translate(0, 0, -0.58);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    bodyGeoTemplate = g;
  }
  const g = bodyGeoTemplate.clone();
  const n = g.attributes.position.count, pos = g.attributes.position;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const shade = y < 0.42 ? 0.62 : y < 0.6 ? 0.62 + (y - 0.42) / 0.18 * 0.3 : 0.92 + Math.min(1, (y - 0.6) / 0.6) * 0.08;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function numberTexture(num, color = '#2b1d14') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff8e6'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#2b1d14'; g.stroke();
  g.fillStyle = color; g.font = 'bold 72px Fredoka, Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f1e8'; g.fillRect(0, 0, 128, 40);
  g.strokeStyle = '#2b1d14'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 36);
  g.fillStyle = '#2b1d14'; g.font = 'bold 26px Fredoka, Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let _shadowMat = null;
function contactShadowMat() {
  if (_shadowMat) return _shadowMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(20,12,6,0.55)'); grad.addColorStop(0.55, 'rgba(20,12,6,0.32)'); grad.addColorStop(1, 'rgba(20,12,6,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  _shadowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  return _shadowMat;
}

// Estrella dorada que flota sobre el rival de la fecha
export function createRivalStar() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.46, a = i / 10 * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); }
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  geo.center();
  const g = new THREE.Group();
  const star = new THREE.Mesh(geo, toonMat('#ffd23f', { emissive: '#8a5a00', emissiveIntensity: 0.5 })); star.castShadow = true;
  g.add(star); g.add(new THREE.Mesh(geo, outline));
  return g;
}

function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; }

// spec: { color, roofColor, number, accessory, stripes, helmetColor, seed }
// Barro sobre la carrocería: oscurece la parte baja con manchas; uDirt 0..1 por auto (compartido por carrocería y guardabarros).
function dirtify(mat, dirt) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = dirt;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vDirtPos;\nvoid main() {\n vDirtPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uDirt; varying vec3 vDirtPos;\nfloat dirtHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n { float fl = dirtHash(floor(vDirtPos.xz * 170.0 + vDirtPos.y * 140.0)); float st = dirtHash(vec2(floor(vDirtPos.y * 55.0 + vDirtPos.z * 3.0), floor(vDirtPos.x * 2.0))); float sw = dirtHash(floor(vDirtPos.xz * 3.5 + vDirtPos.y * 2.0)); diffuseColor.rgb *= 0.955 + 0.045 * fl + 0.035 * st + 0.03 * sw; }\n { float n = dirtHash(floor(vDirtPos.xz * 9.0)) * 0.5 + dirtHash(floor(vDirtPos.xz * 23.0 + vDirtPos.y * 7.0)) * 0.5; float m = smoothstep(1.05, 0.2, vDirtPos.y) * uDirt; m = clamp(m * (0.55 + n * 0.9), 0.0, 0.85); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.24, 0.15), m); }')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n { vec3 vd = normalize(vViewPosition); float fres = pow(1.0 - max(dot(vd, normal), 0.0), 3.0); vec3 hv = normalize(vd + normalize(vec3(0.35, 0.9, 0.25))); float spec = pow(max(dot(normal, hv), 0.0), 48.0); diffuseColor.rgb += (fres * 0.09 + spec * 0.28) * (1.0 - uDirt * 0.6); }');
  };
  mat.customProgramCacheKey = () => 'dirt';
  return mat;
}
export function setDirt(cv, v) { cv.dirt.value = v; }

// Detalles que siguen la chapa del casco lofteado: vidrios con marco, ventilete, costuras de puerta, moldura,
// luces, escudo con bigotes, luces de posición y guiños, espejo, manijas, tomas de aire y número de puerta.
function buildLoftDetails(loft, spec, vis, addPart, headlights, taillights, numMat) {
  const api = loft.api, zMax = api.zMax, zMin = api.zMin;
  const patch = (z0, z1, t0, t1, side, off, mat, nz = 12, nt = 8) => { const m = new THREE.Mesh(surfacePatch(api, z0, z1, t0, t1, side, off, nz, nt), mat); vis.add(m); return m; };
  const both = (z0, z1, t0, t1, off, mat, nz, nt) => { patch(z0, z1, t0, t1, 1, off, mat, nz, nt); patch(z0, z1, t0, t1, -1, off, mat, nz, nt); };
  const at = (z, t, side, off = 0.02) => { const p = api.pointAt(z, t, side), n = api.normalAt(z, t, side); return { p: new THREE.Vector3(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off), n: new THREE.Vector3(n[0], n[1], n[2]) }; };
  const place = (obj, z, t, side, off = 0.02) => { const { p, n } = at(z, t, side, off); obj.position.copy(p); obj.lookAt(p.clone().add(n)); vis.add(obj); return obj; };
  const frameMat = chromeMat, seamMat = toonMat('#1d130c');
  // vidrios: marco cromado (un poco más grande, pegado) y vidrio encima
  const glass = (z0, z1, t0, t1, sides) => { for (const sd of sides) { patch(z0 - 0.03, z1 + 0.03, Math.max(0, t0 - 0.025), t1 + 0.025, sd, 0.004, frameMat); patch(z0, z1, t0, t1, sd, 0.008, glassMat); } };
  glass(0.37, 0.6, 0.0, 0.37, [1, -1]);          // parabrisas
  glass(zMin + 0.36, zMin + 0.64, 0.0, 0.36, [1, -1]); // luneta
  glass(-0.36, 0.44, 0.17, 0.43, [1, -1]);        // ventanilla de puerta
  glass(-0.84, -0.47, 0.19, 0.41, [1, -1]);       // custodia
  both(0.2, 0.225, 0.17, 0.43, 0.011, frameMat, 2, 6); // ventilete
  // costuras de la puerta y moldura cromada del cinturón
  both(0.5, 0.515, 0.1, 0.96, 0.005, seamMat, 2, 12); both(-0.53, -0.515, 0.1, 0.96, 0.005, seamMat, 2, 12);
  both(-0.52, 0.51, 0.95, 0.965, 0.005, seamMat, 12, 2); both(-0.52, 0.51, 0.44, 0.455, 0.005, seamMat, 12, 2);
  both(zMin + 0.45, zMax - 0.45, 0.63, 0.65, 0.008, frameMat, 24, 2);
  // tira del capó y costura del baúl
  both(0.66, zMax - 0.1, 0.0, 0.012, 0.008, frameMat, 16, 2);
  both(zMax - 0.1, zMax - 0.085, 0.0, 0.42, 0.005, seamMat, 2, 8); both(0.63, 0.645, 0.0, 0.4, 0.005, seamMat, 2, 8);
  // franjas de carrera
  if (spec.stripes) { const sm = toonMat(spec.stripeColor || '#fff8e6'); both(-0.75, 0.3, 0.04, 0.11, 0.009, sm, 16, 3); both(0.66, zMax - 0.14, 0.04, 0.12, 0.009, sm, 12, 3); }
  // faros: reflector, lamparita, lente y aro, sobre la trompa
  for (const sd of [-1, 1]) {
    const zH = zMax - 0.3, tH = 0.28;
    place(new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), chromeMat), zH, tH, sd, 0.012);
    place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lightOn), zH, tH, sd, 0.04);
    const hl = place(new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), lensMat), zH, tH, sd, -0.02); hl.scale.z = 0.72; headlights.push(hl);
    place(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 18), chromeMat), zH, tH, sd, 0.05);
    // luces de posición y guiños
    place(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), toonMat('#fff2d0', { emissive: '#8a7a40', emissiveIntensity: 0.3 })), zMax - 0.06, 0.62, sd, 0.0).scale.z = 0.6;
    place(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12), chromeMat), zMax - 0.06, 0.62, sd, 0.03);
    place(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), toonMat('#ffb340', { emissive: '#7a4a00', emissiveIntensity: 0.4 })), 1.05, 0.5, sd, 0.0);
    // luces traseras y reflector
    const tl = place(new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), tailOff), zMin + 0.2, 0.33, sd, 0.0); tl.scale.z = 0.6; tl.castShadow = false; taillights.push(tl);
    place(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), chromeMat), zMin + 0.2, 0.33, sd, 0.04);
    place(new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), toonMat('#b02020')), zMin + 0.08, 0.6, sd, 0.008);
    // número de puerta, manija, tomas de aire del motor
    place(new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), numMat), -0.02, 0.62, sd, 0.01);
    place(box(0.16, 0.04, 0.03, chromeMat), 0.42, 0.5, sd, 0.02);
    place(box(0.22, 0.16, 0.08, darkMat), -0.93, 0.34, sd, 0.0);
    place(box(0.06, 0.18, 0.05, chromeMat), -0.83, 0.34, sd, 0.03);
  }
  // escudo y bigotes cromados
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), toonMat('#c8342a')); badge.geometry.rotateX(Math.PI / 2); place(badge, zMax - 0.14, 0.0, 1, 0.01);
  place(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14), chromeMat), zMax - 0.14, 0.0, 1, 0.025);
  for (const sd of [-1, 1]) for (const [tt, len] of [[0.12, 0.3], [0.2, 0.26]]) place(box(len, 0.022, 0.03, chromeMat), zMax - 0.15, tt, sd, 0.012);
  // espejo en la puerta del piloto, con brazo
  const { p: mp, n: mn } = at(0.5, 0.3, 1, 0.14);
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), chromeMat); mirror.rotation.z = Math.PI / 2; mirror.position.copy(mp); addPart(mirror, 'left', 0.35);
  const arm = box(0.14, 0.02, 0.02, chromeMat); arm.position.copy(mp.clone().sub(mn.clone().multiplyScalar(0.07))); arm.lookAt(mp.clone().add(mn)); arm.rotateY(Math.PI / 2); vis.add(arm);
}

export function createCarVisual(spec) {
  const rnd = mulberry32(spec.seed || 1);
  const root = new THREE.Group();
  const vis = new THREE.Group(); // subgrupo que inclinamos (suspensión)
  vis.position.z = 0.12;
  root.add(vis);
  const dirt = { value: 0 };
  const bodyMat = dirtify(toonMat(spec.color, { vertexColors: true }), dirt);
  const design = spec.body !== undefined ? (spec.body && BODY_DESIGNS[spec.body] ? spec.body : null) : bodyDesign;
  const L = layoutFor(customBody ? null : design);
  const loft = (design && !customBody) ? loftFor(design) : null;
  const geo = bodyGeometry(design);
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true;
  vis.add(body);
  vis.add(new THREE.Mesh(geo, outline));
  const orig = new Float32Array(geo.attributes.position.array);
  const origCol = new Float32Array(geo.attributes.color.array);
  // sombra de contacto bajo el auto (aterriza el dibujo)
  const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.3), contactShadowMat()); shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.07; shadowBlob.renderOrder = 1; root.add(shadowBlob);

  const parts = [];
  const addPart = (mesh, zone, threshold) => { mesh.castShadow = true; vis.add(mesh); parts.push({ mesh, zone, threshold, attached: true }); return mesh; };

  // piso (tapa las aberturas de los pasarruedas)
  const floor = box(1.1, 0.3, 2.9, darkMat); floor.position.set(0, 0.45, 0); floor.castShadow = false; vis.add(floor);

  // techo bicolor (casquete)
  if (spec.roofColor && spec.roofColor !== spec.color) {
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), toonMat(spec.roofColor));
    roof.scale.set(0.66, 0.07, 0.62); roof.position.set(0, L.roofY, -0.3); vis.add(roof);
  }
  if (spec.stripes) {
    const sm = toonMat(spec.stripeColor || '#fff8e6');
    for (const dx of [-0.16, 0.16]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.9), sm); r.position.set(dx, L.roofStripeY, -0.28); vis.add(r);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.55), sm); h.position.set(dx, L.stripeH.y, L.stripeH.z); h.rotation.x = L.stripeH.rot; vis.add(h);
    }
  }

  // vidrios: parabrisas corto y parado, luneta que cae, ventanillas de puerta y custodia
  if (!loft) {
  // parabrisas y luneta grandes, de esquinas redondeadas y marco cromado, por fuera del bisel del casco
  const wsh = glassPane(L.wshW, 0.44, 0.1); wsh.position.set(0, L.wsh.y, L.wsh.z); wsh.rotation.x = L.wsh.rot; vis.add(wsh);
  const rw = glassPane(L.rwW, 0.42, 0.12); rw.position.set(0, L.rw.y, L.rw.z); rw.rotation.x = L.rw.rot; vis.add(rw);
  for (const sx of [-1, 1]) {
    // ventanilla de puerta con ventilete adelante, y custodia trasera
    const dw = glassPane(0.8, 0.36, 0.07, 0.22); dw.position.set(sx * L.doorX, 1.17, 0.1); dw.rotation.y = sx * Math.PI / 2; vis.add(dw);
    const qw = glassPane(0.38, 0.32, 0.09); qw.position.set(sx * L.quarterX, 1.16, -0.6); qw.rotation.y = sx * Math.PI / 2; vis.add(qw);
    // tomas de aire del motor detrás de la custodia (marca registrada del 600)
    const scoop = box(0.1, 0.16, 0.22, darkMat); scoop.position.set(sx * (L.flankX - 0.02), 1.06, -0.95); scoop.rotation.y = sx * 0.35; vis.add(scoop);
    const scoopLip = box(0.06, 0.18, 0.06, chromeMat); scoopLip.position.set(sx * (L.flankX + 0.02), 1.06, -0.84); vis.add(scoopLip);
    // manijas (puertas "suicidas": manija adelante)
    const h = box(0.03, 0.04, 0.16, chromeMat); h.position.set(sx * (L.flankX + 0.01), 0.88, 0.42); vis.add(h);
  }
  }
  if (!loft) {
  // moldura cromada lateral, filete de la puerta y bisagras (puerta suicida, abre hacia adelante)
  for (const sx of [-1, 1]) {
    const strip = box(0.02, 0.03, 2.4, chromeMat); strip.position.set(sx * L.flankX, 0.62, 0.05); vis.add(strip);
    // marco de la puerta: dos verticales, el zócalo y la línea bajo la ventanilla
    const seamF = box(0.015, 0.58, 0.025, darkMat); seamF.position.set(sx * L.flankX, 0.71, 0.46); vis.add(seamF);
    const seamR = box(0.015, 0.58, 0.025, darkMat); seamR.position.set(sx * L.flankX, 0.71, -0.5); vis.add(seamR);
    const seamB = box(0.015, 0.025, 0.98, darkMat); seamB.position.set(sx * L.flankX, 0.43, -0.02); vis.add(seamB);
    const seamT = box(0.015, 0.025, 0.98, darkMat); seamT.position.set(sx * L.flankX, 0.99, -0.02); vis.add(seamT);
    for (const hy of [0.62, 0.95]) { const hinge = box(0.03, 0.08, 0.04, chromeMat); hinge.position.set(sx * (L.flankX + 0.01), hy, -0.5); vis.add(hinge); }
    // guinos ambar bajo los faros
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), toonMat('#ffb340', { emissive: '#7a4a00', emissiveIntensity: 0.4 })); blink.position.set(sx * (L.flankX - 0.01), 0.86, 1.15); vis.add(blink);
    // luces de posición redondas junto al paragolpes
    const park = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), toonMat('#fff2d0', { emissive: '#8a7a40', emissiveIntensity: 0.3 })); park.position.set(sx * 0.45, 0.6, L.park.z); park.scale.z = 0.6; vis.add(park);
    const parkRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12), chromeMat); parkRing.position.set(sx * 0.45, 0.6, L.park.z + 0.02); vis.add(parkRing);
  }
  // limpiaparabrisas y espejo interior
  }
  if (!loft) {
  // limpiaparabrisas apoyados en la base del parabrisas y espejo interior colgado de su borde superior
  const wshTop = { y: L.wsh.y + 0.19 * Math.cos(L.wsh.rot), z: L.wsh.z + 0.19 * Math.sin(-L.wsh.rot) };
  const wshBase = { y: L.wsh.y - 0.2 * Math.cos(L.wsh.rot), z: L.wsh.z - 0.2 * Math.sin(-L.wsh.rot) };
  for (const wx of [-0.25, 0.2]) { const wiper = box(0.03, 0.02, 0.3, darkMat); wiper.position.set(wx, wshBase.y + 0.03, wshBase.z + 0.02); wiper.rotation.x = L.wsh.rot; wiper.rotation.y = 0.35; vis.add(wiper); }
  const innerMirror = box(0.2, 0.05, 0.02, darkMat); innerMirror.position.set(0, wshTop.y - 0.08, wshTop.z - 0.12); vis.add(innerMirror);
  }
  // piloto (cabeza con casco y torso), volante a la izquierda
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), toonMat(spec.helmetColor || '#e2a33b'));
  helmet.position.set(0.3, 1.14, 0.0); vis.add(helmet);
  const visor = box(0.2, 0.09, 0.06, darkMat); visor.position.set(0.3, 1.14, 0.15); vis.add(visor);
  const torso = box(0.36, 0.3, 0.26, toonMat(spec.helmetColor || '#e2a33b')); torso.position.set(0.3, 0.88, -0.05); torso.castShadow = false; vis.add(torso);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 14), darkMat); wheelRim.position.set(0.3, 1.02, 0.28); wheelRim.rotation.x = 0.4; vis.add(wheelRim);

  // guardabarros abultados alrededor de las ruedas (color carrocería)
  const fenderMat = dirtify(toonMat(spec.color), dirt);
  for (const [fx, fz] of (customBody || !L.fenders) ? [] : [[0.7, 1.0], [-0.7, 1.0], [0.7, -1.0], [-0.7, -1.0]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fenderMat); if (fz > 0) f.scale.set(0.05, 0.24, 0.44); else f.scale.set(0.1, 0.28, 0.48); f.position.set(fx, 0.6, fz); f.castShadow = true; vis.add(f); // adelante casi plano, atrás un bulto discreto
    const fo = new THREE.Mesh(f.geometry, outline); fo.position.copy(f.position); fo.scale.copy(f.scale); vis.add(fo);
  }
  // faros redondos sobre los guardabarros
  const headlights = [], taillights = [];
  if (!loft) for (const sx of [-1, 1]) {
    // faros redondos grandes, altos sobre los guardabarros, con aro cromado
    // óptica: reflector cromado, lamparita y lente de vidrio transparente, con aro cromado
    const refl = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), chromeMat); refl.position.set(sx * 0.5, 0.93, L.head.reflZ); vis.add(refl);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lightOn); bulb.position.set(sx * 0.5, 0.93, L.head.bulbZ); vis.add(bulb);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), lensMat);
    hl.position.set(sx * 0.5, 0.93, L.head.z); hl.scale.z = 0.72; vis.add(hl); headlights.push(hl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 18), chromeMat); ring.position.set(sx * 0.5, 0.93, L.head.ringZ); vis.add(ring);
    // faros traseros redondos sobre los guardabarros, con aro cromado
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), tailOff); tl.scale.set(1, 1, 0.6);
    tl.position.set(sx * 0.55, L.tail.y, L.tail.z); tl.castShadow = false; vis.add(tl); taillights.push(tl); // por fuera del bisel del casco
    const tring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), chromeMat); tring.position.set(sx * 0.55, L.tail.y, L.tail.z - 0.03); vis.add(tring);
    // reflector rojo chico debajo
    const rrefl = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), toonMat('#b02020')); rrefl.position.set(sx * 0.5, 0.62, L.bumperR + 0.06); rrefl.rotation.y = Math.PI; vis.add(rrefl);
  }
  // insignia y bigote cromado
  if (!loft) {
  // escudo FIAT al centro con bigotes cromados a los lados, y tira cromada por el medio del capó
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), toonMat('#c8342a')); badge.rotation.x = Math.PI / 2 + L.badge.tilt; badge.position.set(0, L.badge.y, L.badge.z); vis.add(badge);
  const badgeRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14), chromeMat); badgeRing.rotation.x = L.badge.tilt; badgeRing.position.set(0, L.badge.y, L.badge.z + 0.01); vis.add(badgeRing);
  for (const sx of [-1, 1]) for (const [dy, len] of [[0.045, 0.3], [-0.03, 0.26]]) { const wk = box(len, 0.022, 0.03, chromeMat); wk.rotation.x = L.badge.tilt; wk.position.set(sx * (0.12 + len / 2), L.badge.y + dy, L.badge.z - 0.005 - dy * 0.25); vis.add(wk); }
  // tapa del baúl (adelante): tira cromada por el medio y costura en U
  const hoodStrip = box(0.02, 0.014, 0.74, chromeMat); hoodStrip.position.set(0, L.hood.y, L.hood.z); hoodStrip.rotation.x = L.hood.rot; vis.add(hoodStrip);
  const hoodStripB = box(0.02, 0.014, 0.3, chromeMat); hoodStripB.position.set(0, L.hood.stripB.y, L.hood.stripB.z); hoodStripB.rotation.x = L.hood.stripB.rot; vis.add(hoodStripB);
  for (const sx of [-1, 1]) { const hs = box(0.025, 0.015, 0.8, darkMat); hs.position.set(sx * 0.44, L.hood.y - 0.01, L.hood.z); hs.rotation.x = L.hood.rot; vis.add(hs); }
  const hoodSeamF = box(0.9, 0.015, 0.025, darkMat); hoodSeamF.position.set(0, L.hood.seamF.y, L.hood.seamF.z); hoodSeamF.rotation.x = L.hood.seamF.rot; vis.add(hoodSeamF);
  const hoodSeamB = box(0.9, 0.015, 0.025, darkMat); hoodSeamB.position.set(0, L.hood.seamB.y, L.hood.seamB.z); hoodSeamB.rotation.x = L.hood.rot; vis.add(hoodSeamB);
  const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshToonMaterial({ map: plateTexture('FIAT ' + spec.number), gradientMap: toonGradient() })); frontPlate.position.set(0, L.plateF.y, L.plateF.z); vis.add(frontPlate);
  }
  // tapa del motor: junta oscura alrededor, rejilla de lamas en un hueco y manija cromada
  const lid = new THREE.Group(); lid.position.set(0, L.lid.y, L.lid.z); lid.rotation.x = L.lid.rot;
  const seam = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(1.0, 0.58, 0.11)), toonMat('#1d130c')); seam.position.z = 0.005; lid.add(seam);
  const lidPanel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.9, 0.48, 0.09)), fenderMat); lidPanel.position.z = 0.012; lid.add(lidPanel);
  // parrilla ancha de lamas cromadas (la marca registrada de la cola del 600)
  const grille = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.7, 0.28, 0.05)), darkMat); grille.position.set(0, -0.06, 0.02); lid.add(grille);
  for (let i = 0; i < 7; i++) { const slat = box(0.66, 0.02, 0.02, chromeMat); slat.position.set(0, -0.18 + i * 0.04, 0.03); lid.add(slat); }
  const lidHandle = box(0.14, 0.03, 0.03, chromeMat); lidHandle.position.set(0, 0.18, 0.03); lid.add(lidHandle);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.065), new THREE.MeshToonMaterial({ map: plateTexture('600'), gradientMap: toonGradient() })); emblem.position.set(-0.3, 0.18, 0.03); emblem.rotation.z = Math.PI; lid.add(emblem);
  if (loft) { const q = loft.api.pointAt(L.lid.z, 0, 1), n = loft.api.normalAt(L.lid.z, 0.02, 1); lid.position.set(0, q[1] + n[1] * 0.006, q[2] + n[2] * 0.006); lid.rotation.set(0, 0, 0); lid.lookAt(0, q[1] + n[1], q[2] + n[2]); lid.rotateZ(Math.PI); }
  vis.add(lid);
  // luz de patente y caño de escape
  const plateLamp = box(0.14, 0.05, 0.08, chromeMat); plateLamp.position.set(0, 0.6, L.plateR); vis.add(plateLamp);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), chromeMat); pipe.rotation.x = Math.PI / 2; pipe.position.set(-0.42, 0.38, L.bumperR + 0.06); vis.add(pipe);
  const pipeEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), darkMat); pipeEnd.rotation.x = Math.PI / 2; pipeEnd.position.set(-0.42, 0.38, L.bumperR - 0.05); vis.add(pipeEnd);
  // paragolpes con defensas (desprendibles)
  const bumperGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.3, 8);
  const mkBumper = (z) => { const g = new THREE.Group(); const b = new THREE.Mesh(bumperGeo, chromeMat); b.rotation.z = Math.PI / 2; g.add(b); for (const sx of [-0.42, 0.42]) { const o = box(0.07, 0.16, 0.08, chromeMat); o.position.set(sx, 0, 0); g.add(o); } g.position.set(0, 0.42, z); return g; };
  addPart(mkBumper(L.bumperF), 'front', 0.55);
  addPart(mkBumper(L.bumperR), 'rear', 0.55);
  // espejo
  if (!loft) {
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), chromeMat); mirror.rotation.z = Math.PI / 2; mirror.position.set(L.mirrorX, 1.06, 0.5); addPart(mirror, 'left', 0.35);
  const mirrorArm = box(0.16, 0.02, 0.02, chromeMat); mirrorArm.position.set(L.mirrorX - 0.08, 1.02, 0.5); mirrorArm.rotation.z = 0.35; vis.add(mirrorArm);
  }
  // patente
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshToonMaterial({ map: plateTexture('FIAT ' + spec.number), gradientMap: toonGradient() }));
  plate.position.set(0, 0.5, L.plateR); plate.rotation.y = Math.PI; addPart(plate, 'rear', 0.8);
  // números
  const numTex = numberTexture(spec.number);
  const numMat = new THREE.MeshToonMaterial({ map: numTex, gradientMap: toonGradient(), transparent: true });
  if (!loft) for (const sx of [-1, 1]) {
    const nm = new THREE.Mesh(new THREE.CircleGeometry(0.25, 24), numMat);
    nm.position.set(sx * L.numX, L.numY, -0.02); nm.rotation.y = sx * Math.PI / 2; vis.add(nm);
  }
  if (loft) buildLoftDetails(loft, spec, vis, addPart, headlights, taillights, numMat);
  const nh = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), numMat);
  nh.position.set(0, L.stripeH.y + 0.004, 1.0); nh.rotation.x = -Math.PI / 2 + L.stripeH.rot; vis.add(nh);

  // accesorios
  if (spec.accessory === 'rack') {
    const rack = new THREE.Group();
    const frame = box(1.1, 0.04, 0.9, chromeMat); frame.position.y = 0.06; rack.add(frame);
    for (let i = 0; i < 4; i++) { const leg = box(0.04, 0.1, 0.04, chromeMat); leg.position.set((i % 2 ? 0.5 : -0.5), 0.02, (i < 2 ? 0.4 : -0.4)); rack.add(leg); }
    const s1 = box(0.7, 0.22, 0.5, suitcaseMats[Math.floor(rnd() * 4)]); s1.position.set(-0.15, 0.2, 0); rack.add(s1);
    const s2 = box(0.45, 0.16, 0.36, suitcaseMats[Math.floor(rnd() * 4)]); s2.position.set(0.3, 0.17, 0.05); s2.rotation.y = 0.3; rack.add(s2);
    rack.position.set(0, 1.64, -0.28); addPart(rack, 'any', 0.5);
  } else if (spec.accessory === 'lights') {
    const bar = new THREE.Group();
    bar.add(box(1.0, 0.05, 0.05, darkMat));
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.1, 10), lightOn); l.rotation.x = Math.PI / 2; l.position.set(-0.36 + i * 0.24, 0.1, 0.03); bar.add(l); }
    bar.position.set(0, 0.56, L.bumperF + 0.05); addPart(bar, 'front', 0.4); // debajo del escudo, sobre el paragolpes
  } else if (spec.accessory === 'spoiler') {
    const sp = new THREE.Group();
    const plank = box(1.2, 0.05, 0.3, woodMat); plank.position.y = 0.2; sp.add(plank);
    for (const sx of [-0.45, 0.45]) { const l = box(0.05, 0.2, 0.05, darkMat); l.position.set(sx, 0.1, 0); sp.add(l); }
    sp.position.set(0, L.lid.y + 0.24, L.lid.z + 0.07); addPart(sp, 'rear', 0.45);
  } else if (spec.accessory === 'antenna') {
    const ant = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), chromeMat); rod.position.y = 0.7; ant.add(rod);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), toonMat(spec.roofColor || '#d94a3a')); flag.rotation.z = Math.PI / 2; flag.position.set(0.13, 1.3, 0); ant.add(flag);
    ant.position.set(-0.55, 0.9, L.lid.z + 0.14); vis.add(ant);
  }

  // ruedas chicas con tazas grandes
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.19, 16);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14);
  const wwGeo = new THREE.TorusGeometry(0.235, 0.028, 6, 18);
  const rimMat = dirtify(toonMat(spec.color), dirt);
  const WX = L.wheelX;
  for (const [x, z, steer] of [[WX, 1.0, true], [-WX, 1.0, true], [WX, -1.0, false], [-WX, -1.0, false]]) {
    const w = new THREE.Group(); w.position.set(x, 0.29, z);
    const tire = new THREE.Mesh(wheelGeo, tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
    const spin = new THREE.Group(); spin.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; rim.position.x = Math.sign(x) * 0.095; spin.add(rim);
    if (spec.whitewall !== false) { const ww = new THREE.Mesh(wwGeo, whitewallMat); ww.rotation.y = Math.PI / 2; ww.position.x = Math.sign(x) * 0.1; spin.add(ww); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), chromeMat); dome.scale.set(0.35, 1, 1); dome.position.x = Math.sign(x) * 0.11; spin.add(dome);
    const ol = new THREE.Mesh(wheelGeo, outline); ol.rotation.z = Math.PI / 2; spin.add(ol);
    w.add(spin); vis.add(w);
    wheels.push({ group: w, spin, steer, side: Math.sign(x) });
  }

  return {
    root, vis, body, bodyMat, geo, orig, origCol, parts, headlights, taillights, wheels, spec, shadowBlob, dirt,
    colorAttr: geo.attributes.color, smokeAnchor: new THREE.Vector3(0, 1.1, -1.35), exhaustAnchor: new THREE.Vector3(-0.42, 0.38, -1.88), braking: false,
    deformTotal: 0, wobble: 0,
  };
}

const _tmp = new THREE.Vector3();
// Ruido determinista por posición: los vértices duplicados (geometría sin índice) se mueven igual y no se raja la chapa.
function hash3(x, y, z, k) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 9.17) * 43758.5453; return s - Math.floor(s) - 0.5; }
// Abolla la carrocería alrededor de un punto local (coordenadas del auto), empujando en dirección "dir".
export function deformBody(cv, localPoint, dir, depth) {
  const pos = cv.geo.attributes.position, col = cv.colorAttr;
  const arr = pos.array, orig = cv.orig, carr = col.array;
  const R = 0.5 + depth * 1.2;
  const px = localPoint.x, py = localPoint.y, pz = localPoint.z;
  const seed = cv.deformTotal * 7.3;
  for (let i = 0; i < pos.count; i++) {
    const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
    if (oy < 0.42) continue;
    const d = Math.hypot(ox - px, oy - py, oz - pz);
    if (d > R) continue;
    const f = (1 - d / R) ** 2;
    const j = 0.25 * f * depth;
    let nx = arr[i * 3] + dir.x * depth * f + hash3(ox, oy, oz, seed) * j;
    let ny = arr[i * 3 + 1] + dir.y * depth * f * 0.5 + hash3(ox, oy, oz, seed + 1) * j;
    let nz = arr[i * 3 + 2] + dir.z * depth * f + hash3(ox, oy, oz, seed + 2) * j;
    const dd = Math.hypot(nx - ox, ny - oy, nz - oz);
    if (dd > 0.34) { const k = 0.34 / dd; nx = ox + (nx - ox) * k; ny = oy + (ny - oy) * k; nz = oz + (nz - oz) * k; }
    arr[i * 3] = nx; arr[i * 3 + 1] = ny; arr[i * 3 + 2] = nz;
    const dark = 1 - 0.45 * f * clamp(depth * 3, 0, 1);
    carr[i * 3] *= dark; carr[i * 3 + 1] *= dark; carr[i * 3 + 2] *= dark;
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  cv.geo.computeVertexNormals();
  cv.deformTotal += depth;
}

export function breakHeadlight(cv, side) {
  const hl = cv.headlights[side < 0 ? 0 : 1];
  if (hl.material === lightBroken) return false;
  hl.material = lightBroken; return true;
}

export function setHeadlights(cv, on) {
  for (const hl of cv.headlights) if (hl.material !== lightBroken) hl.material.emissiveIntensity = on ? 1.3 : 0.15;
}

// Devuelve piezas que se desprenden según daño por zona {front,rear,left,right}
export function detachParts(cv, damage) {
  const out = [];
  for (const p of cv.parts) {
    if (!p.attached) continue;
    const z = p.zone === 'any' ? Math.max(damage.front, damage.rear, damage.left, damage.right) : damage[p.zone];
    if (z >= p.threshold) {
      p.attached = false;
      p.mesh.getWorldPosition(_tmp);
      const q = new THREE.Quaternion(); p.mesh.getWorldQuaternion(q);
      cv.vis.remove(p.mesh);
      out.push({ mesh: p.mesh, x: _tmp.x, y: _tmp.y, z: _tmp.z, quat: q });
    }
  }
  return out;
}

export function restoreCar(cv) {
  cv.geo.attributes.position.array.set(cv.orig);
  cv.geo.attributes.position.needsUpdate = true;
  cv.colorAttr.array.set(cv.origCol); cv.colorAttr.needsUpdate = true;
  cv.geo.computeVertexNormals();
  cv.deformTotal = 0;
  for (const p of cv.parts) if (!p.attached) { p.attached = true; cv.vis.add(p.mesh); }
  for (const hl of cv.headlights) hl.material = lightOn;
  cv.dirt.value = 0;
}

export function setBrakeLights(cv, on) {
  if (cv.braking === on) return; cv.braking = on;
  for (const t of cv.taillights) t.material = on ? tailOn : tailOff;
}
