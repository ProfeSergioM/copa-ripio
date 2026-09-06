// Modelo caricaturesco del Fiat 600 ("Fitito"), con daños visibles (abolladuras, piezas que se caen).
import * as THREE from 'three';
import { clamp, mulberry32 } from './util.js';

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
  sh.moveTo(1.55, 0.36);
  sh.splineThru([
    new THREE.Vector2(1.64, 0.5), new THREE.Vector2(1.63, 0.7), new THREE.Vector2(1.54, 0.9), new THREE.Vector2(1.36, 1.02),
    new THREE.Vector2(1.1, 1.08), new THREE.Vector2(0.8, 1.11), new THREE.Vector2(0.56, 1.16), new THREE.Vector2(0.4, 1.38),
    new THREE.Vector2(0.18, 1.48), new THREE.Vector2(-0.3, 1.53), new THREE.Vector2(-0.78, 1.49), new THREE.Vector2(-1.04, 1.36),
    new THREE.Vector2(-1.24, 1.12), new THREE.Vector2(-1.42, 0.9), new THREE.Vector2(-1.56, 0.72), new THREE.Vector2(-1.63, 0.54),
    new THREE.Vector2(-1.56, 0.36),
  ]);
  sh.lineTo(-1.42, 0.36);
  sh.absarc(-1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(0.58, 0.36);
  sh.absarc(1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(1.55, 0.36);
  return sh;
}

let bodyGeoTemplate = null;
function bodyGeometry() {
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

export function createCarVisual(spec) {
  const rnd = mulberry32(spec.seed || 1);
  const root = new THREE.Group();
  const vis = new THREE.Group(); // subgrupo que inclinamos (suspensión)
  vis.position.z = 0.12;
  root.add(vis);
  const dirt = { value: 0 };
  const bodyMat = dirtify(toonMat(spec.color, { vertexColors: true }), dirt);
  const geo = bodyGeometry();
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
    roof.scale.set(0.66, 0.07, 0.62); roof.position.set(0, 1.575, -0.3); vis.add(roof);
  }
  if (spec.stripes) {
    const sm = toonMat(spec.stripeColor || '#fff8e6');
    for (const dx of [-0.16, 0.16]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.9), sm); r.position.set(dx, 1.632, -0.28); vis.add(r);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.55), sm); h.position.set(dx, 1.045, 1.02); h.rotation.x = 0.2; vis.add(h);
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.42), sm); e.position.set(dx, 1.17, -1.3); e.rotation.x = -0.85; vis.add(e);
    }
  }

  // vidrios: parabrisas corto y parado, luneta que cae, ventanillas de puerta y custodia
  // parabrisas y luneta grandes, de esquinas redondeadas y marco cromado, por fuera del bisel del casco
  const wsh = glassPane(1.12, 0.4, 0.1); wsh.position.set(0, 1.33, 0.57); wsh.rotation.x = -0.6; vis.add(wsh);
  const rw = glassPane(1.04, 0.42, 0.12); rw.position.set(0, 1.36, -1.3); rw.rotation.x = Math.PI + 0.88; vis.add(rw);
  for (const sx of [-1, 1]) {
    // ventanilla de puerta con ventilete adelante, y custodia trasera
    const dw = glassPane(0.8, 0.36, 0.07, 0.22); dw.position.set(sx * 0.735, 1.17, 0.1); dw.rotation.y = sx * Math.PI / 2; vis.add(dw);
    const qw = glassPane(0.38, 0.32, 0.09); qw.position.set(sx * 0.73, 1.16, -0.6); qw.rotation.y = sx * Math.PI / 2; vis.add(qw);
    // tomas de aire del motor detrás de la custodia (marca registrada del 600)
    const scoop = box(0.1, 0.16, 0.22, darkMat); scoop.position.set(sx * 0.73, 1.06, -0.95); scoop.rotation.y = sx * 0.35; vis.add(scoop);
    const scoopLip = box(0.06, 0.18, 0.06, chromeMat); scoopLip.position.set(sx * 0.77, 1.06, -0.84); vis.add(scoopLip);
    // manijas (puertas "suicidas": manija adelante)
    const h = box(0.03, 0.04, 0.16, chromeMat); h.position.set(sx * 0.76, 0.88, 0.42); vis.add(h);
  }
  // moldura cromada lateral, filete de la puerta y bisagras (puerta suicida, abre hacia adelante)
  for (const sx of [-1, 1]) {
    const strip = box(0.02, 0.03, 2.4, chromeMat); strip.position.set(sx * 0.752, 0.62, 0.05); vis.add(strip);
    const seamF = box(0.015, 0.62, 0.02, darkMat); seamF.position.set(sx * 0.752, 0.7, 0.46); vis.add(seamF);
    const seamR = box(0.015, 0.62, 0.02, darkMat); seamR.position.set(sx * 0.752, 0.7, -0.5); vis.add(seamR);
    for (const hy of [0.62, 0.95]) { const hinge = box(0.03, 0.08, 0.04, chromeMat); hinge.position.set(sx * 0.76, hy, -0.5); vis.add(hinge); }
    // guinos ambar bajo los faros
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), toonMat('#ffb340', { emissive: '#7a4a00', emissiveIntensity: 0.4 })); blink.position.set(sx * 0.74, 0.86, 1.15); vis.add(blink);
    // luces de posición redondas junto al paragolpes
    const park = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), toonMat('#fff2d0', { emissive: '#8a7a40', emissiveIntensity: 0.3 })); park.position.set(sx * 0.5, 0.6, 1.66); park.scale.z = 0.6; vis.add(park);
    const parkRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12), chromeMat); parkRing.position.set(sx * 0.5, 0.6, 1.68); vis.add(parkRing);
  }
  // limpiaparabrisas y espejo interior
  for (const wx of [-0.25, 0.2]) { const wiper = box(0.03, 0.02, 0.34, darkMat); wiper.position.set(wx, 1.2, 0.68); wiper.rotation.x = -0.58; wiper.rotation.y = 0.35; vis.add(wiper); }
  const innerMirror = box(0.2, 0.05, 0.02, darkMat); innerMirror.position.set(0, 1.36, 0.42); vis.add(innerMirror);
  // piloto (cabeza con casco y torso), volante a la izquierda
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), toonMat(spec.helmetColor || '#e2a33b'));
  helmet.position.set(0.3, 1.14, 0.0); vis.add(helmet);
  const visor = box(0.2, 0.09, 0.06, darkMat); visor.position.set(0.3, 1.14, 0.15); vis.add(visor);
  const torso = box(0.36, 0.3, 0.26, toonMat(spec.helmetColor || '#e2a33b')); torso.position.set(0.3, 0.88, -0.05); torso.castShadow = false; vis.add(torso);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 14), darkMat); wheelRim.position.set(0.3, 1.02, 0.28); wheelRim.rotation.x = 0.4; vis.add(wheelRim);

  // guardabarros abultados alrededor de las ruedas (color carrocería)
  const fenderMat = dirtify(toonMat(spec.color), dirt);
  for (const [fx, fz] of [[0.7, 1.0], [-0.7, 1.0], [0.7, -1.0], [-0.7, -1.0]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fenderMat); if (fz > 0) f.scale.set(0.05, 0.24, 0.44); else f.scale.set(0.1, 0.28, 0.48); f.position.set(fx, 0.6, fz); f.castShadow = true; vis.add(f); // adelante casi plano, atrás un bulto discreto
    const fo = new THREE.Mesh(f.geometry, outline); fo.position.copy(f.position); fo.scale.copy(f.scale); vis.add(fo);
  }
  // faros redondos sobre los guardabarros
  const headlights = [], taillights = [];
  for (const sx of [-1, 1]) {
    // faros redondos grandes, altos sobre los guardabarros, con aro cromado
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), lightOn);
    hl.position.set(sx * 0.5, 0.93, 1.44); hl.scale.z = 0.75; vis.add(hl); headlights.push(hl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 6, 16), chromeMat); ring.position.set(sx * 0.5, 0.93, 1.51); vis.add(ring);
    // faros traseros redondos sobre los guardabarros, con aro cromado
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), tailOff); tl.scale.set(1, 1, 0.6);
    tl.position.set(sx * 0.58, 0.82, -1.6); tl.castShadow = false; vis.add(tl); taillights.push(tl);
    const tring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), chromeMat); tring.position.set(sx * 0.58, 0.82, -1.62); vis.add(tring);
    // reflector rojo chico debajo
    const refl = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), toonMat('#b02020')); refl.position.set(sx * 0.5, 0.62, -1.7); refl.rotation.y = Math.PI; vis.add(refl);
  }
  // insignia y bigote cromado
  // escudo FIAT al centro con bigotes cromados a los lados, y tira cromada por el medio del capó
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), toonMat('#c8342a')); badge.rotation.x = Math.PI / 2; badge.position.set(0, 0.74, 1.66); vis.add(badge);
  const badgeRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14), chromeMat); badgeRing.position.set(0, 0.74, 1.675); vis.add(badgeRing);
  for (const sx of [-1, 1]) for (const [dy, len] of [[0.04, 0.3], [-0.03, 0.26]]) { const wk = box(len, 0.022, 0.03, chromeMat); wk.position.set(sx * (0.12 + len / 2), 0.74 + dy, 1.655 - Math.abs(dy) * 0.4); vis.add(wk); }
  const hoodStrip = box(0.02, 0.014, 0.66, chromeMat); hoodStrip.position.set(0, 1.03, 1.05); hoodStrip.rotation.x = 0.2; vis.add(hoodStrip);
  const hoodStripB = box(0.02, 0.014, 0.3, chromeMat); hoodStripB.position.set(0, 0.86, 1.52); hoodStripB.rotation.x = 1.1; vis.add(hoodStripB);
  const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshToonMaterial({ map: plateTexture('FIAT ' + spec.number), gradientMap: toonGradient() })); frontPlate.position.set(0, 0.42, 1.86); vis.add(frontPlate);
  // tapa del motor: junta oscura alrededor, rejilla de lamas en un hueco y manija cromada
  const lid = new THREE.Group(); lid.position.set(0, 0.98, -1.49); lid.rotation.x = Math.PI + 0.62;
  const seam = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.96, 0.54, 0.1)), toonMat('#1d130c')); seam.position.z = 0.005; lid.add(seam);
  const lidPanel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.9, 0.48, 0.09)), fenderMat); lidPanel.position.z = 0.012; lid.add(lidPanel);
  // parrilla ancha de lamas cromadas (la marca registrada de la cola del 600)
  const grille = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.7, 0.28, 0.05)), darkMat); grille.position.set(0, -0.06, 0.02); lid.add(grille);
  for (let i = 0; i < 7; i++) { const slat = box(0.66, 0.02, 0.02, chromeMat); slat.position.set(0, -0.18 + i * 0.04, 0.03); lid.add(slat); }
  const lidHandle = box(0.14, 0.03, 0.03, chromeMat); lidHandle.position.set(0, 0.18, 0.03); lid.add(lidHandle);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.065), new THREE.MeshToonMaterial({ map: plateTexture('600'), gradientMap: toonGradient() })); emblem.position.set(-0.3, 0.18, 0.03); emblem.rotation.z = Math.PI; lid.add(emblem);
  vis.add(lid);
  // luz de patente y caño de escape
  const plateLamp = box(0.14, 0.05, 0.08, chromeMat); plateLamp.position.set(0, 0.6, -1.74); vis.add(plateLamp);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), chromeMat); pipe.rotation.x = Math.PI / 2; pipe.position.set(-0.42, 0.38, -1.72); vis.add(pipe);
  const pipeEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), darkMat); pipeEnd.rotation.x = Math.PI / 2; pipeEnd.position.set(-0.42, 0.38, -1.83); vis.add(pipeEnd);
  // paragolpes con defensas (desprendibles)
  const bumperGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.3, 8);
  const mkBumper = (z) => { const g = new THREE.Group(); const b = new THREE.Mesh(bumperGeo, chromeMat); b.rotation.z = Math.PI / 2; g.add(b); for (const sx of [-0.42, 0.42]) { const o = box(0.07, 0.16, 0.08, chromeMat); o.position.set(sx, 0, 0); g.add(o); } g.position.set(0, 0.42, z); return g; };
  addPart(mkBumper(1.8), 'front', 0.55);
  addPart(mkBumper(-1.78), 'rear', 0.55);
  // espejo
  const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), chromeMat); mirror.rotation.z = Math.PI / 2; mirror.position.set(0.88, 1.06, 0.5); addPart(mirror, 'left', 0.35);
  const mirrorArm = box(0.16, 0.02, 0.02, chromeMat); mirrorArm.position.set(0.8, 1.02, 0.5); mirrorArm.rotation.z = 0.35; vis.add(mirrorArm);
  // patente
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshToonMaterial({ map: plateTexture('FIAT ' + spec.number), gradientMap: toonGradient() }));
  plate.position.set(0, 0.5, -1.74); plate.rotation.y = Math.PI; addPart(plate, 'rear', 0.8);
  // números
  const numTex = numberTexture(spec.number);
  const numMat = new THREE.MeshToonMaterial({ map: numTex, gradientMap: toonGradient(), transparent: true });
  for (const sx of [-1, 1]) {
    const nm = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), numMat);
    nm.position.set(sx * 0.746, 0.8, 0.25); nm.rotation.y = sx * Math.PI / 2; vis.add(nm);
  }
  const nh = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), numMat);
  nh.position.set(0, 1.065, 1.0); nh.rotation.x = -Math.PI / 2 + 0.16; vis.add(nh);

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
    bar.position.set(0, 0.72, 1.82); addPart(bar, 'front', 0.4);
  } else if (spec.accessory === 'spoiler') {
    const sp = new THREE.Group();
    const plank = box(1.2, 0.05, 0.3, woodMat); plank.position.y = 0.2; sp.add(plank);
    for (const sx of [-0.45, 0.45]) { const l = box(0.05, 0.2, 0.05, darkMat); l.position.set(sx, 0.1, 0); sp.add(l); }
    sp.position.set(0, 1.22, -1.42); addPart(sp, 'rear', 0.45);
  } else if (spec.accessory === 'antenna') {
    const ant = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), chromeMat); rod.position.y = 0.7; ant.add(rod);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), toonMat(spec.roofColor || '#d94a3a')); flag.rotation.z = Math.PI / 2; flag.position.set(0.13, 1.3, 0); ant.add(flag);
    ant.position.set(-0.55, 0.9, -1.35); vis.add(ant);
  }

  // ruedas chicas con tazas grandes
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.19, 16);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14);
  const wwGeo = new THREE.TorusGeometry(0.235, 0.028, 6, 18);
  const rimMat = dirtify(toonMat(spec.color), dirt);
  for (const [x, z, steer] of [[0.64, 1.0, true], [-0.64, 1.0, true], [0.64, -1.0, false], [-0.64, -1.0, false]]) {
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
  for (const hl of cv.headlights) if (hl.material !== lightBroken) hl.material.emissiveIntensity = on ? 1.4 : 0.6;
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
