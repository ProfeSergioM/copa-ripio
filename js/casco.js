// Carrocería con volumen del Fitito.
//
// La carrocería de siempre es el perfil lateral estirado a lo ancho: de costado se ve bien, pero de frente,
// de atrás y de arriba es una tabla con los cantos redondeados, y los vidrios, las costuras y los
// guardabarros son piezas apoyadas encima. Acá el casco se arma por secciones: en cada punto del largo hay
// una sección redondeada cuyo alto sale del mismo perfil lateral (así la silueta de costado no cambia) y cuyo
// ancho se cierra hacia la trompa y la cola; la cabina se angosta hacia el techo y los pasarruedas abultan.
//
// Los vidrios, los marcos, las costuras de puertas y capó, la rejilla del motor, la moldura cromada y los
// pasarruedas no son piezas: se pintan sobre la chapa, en el sombreador, a partir de la posición de cada
// punto. Por eso no pueden quedar flotando ni corridos, y los bordes salen nítidos a cualquier distancia.
// Todo lo que sí es una pieza (faros, paragolpes, espejo, números) se ubica preguntándole a la superficie
// dónde está, no con medidas fijas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, mulberry32 } from './util.js';

// Perfil lateral del Fitito (z adelante, y alto): es el del casco original
const PERFIL = [[1.42, 0.36], [1.5, 0.5], [1.5, 0.7], [1.42, 0.9], [1.26, 1.02], [1.02, 1.08], [0.76, 1.12], [0.56, 1.17], [0.4, 1.38], [0.18, 1.48],
  [-0.3, 1.53], [-0.78, 1.49], [-1.04, 1.36], [-1.24, 1.12], [-1.42, 0.9], [-1.56, 0.72], [-1.63, 0.54], [-1.56, 0.36]];

// Medidas. El perfil se agranda para ocupar lo mismo que la carrocería vieja (que engorda 13 cm en todo el
// contorno por cómo se arma): los choques están calculados para ese tamaño. largo y altoK estiran el perfil
// desde el centro y desde el zócalo; las ruedas y los pasarruedas no se mueven.
export const VARIANTES = {
  fiel: { ancho: 0.75, hombro: 0.03, cabina: 0.08, techo: 4, redondez: 3.0, trompa: 4.5, cola: 4.0, abulta: 0.035, largo: 1.083, piso: 0.21, altoK: 1.17 }, // zócalo a 21 cm del piso: con ruedas de 58 cm, lo que tiene un 600
};
const ZC = -0.065; // centro del perfil a lo largo

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// La superficie del casco, como funciones. Todo lo demás (malla, ubicación de piezas) sale de acá.
export function superficie(v = VARIANTES.fiel) {
  // techo y piso del perfil para cada z: se recorre la curva del perfil y se anota el alto mínimo y máximo
  const zP = (z) => ZC + (z - ZC) * v.largo, yP = (y) => v.piso + (y - 0.36) * v.altoK; // del perfil a la medida real
  const curva = new THREE.SplineCurve(PERFIL.map(([z, y]) => new THREE.Vector2(zP(z), yP(y))));
  const zMin = zP(-1.63), zMax = zP(1.5), M = 400, techo = new Float64Array(M + 1).fill(-1), piso = new Float64Array(M + 1).fill(9);
  for (const p of curva.getPoints(6000)) { const k = clamp(Math.round((p.x - zMin) / (zMax - zMin) * M), 0, M); techo[k] = Math.max(techo[k], p.y); piso[k] = Math.min(piso[k], p.y); }
  for (let k = 0; k <= M; k++) {
    if (techo[k] < 0) { techo[k] = techo[k - 1]; piso[k] = piso[k - 1]; }
    const z = zMin + (zMax - zMin) * k / M; if (z > zP(-1.56) && z < zP(1.42)) piso[k] = v.piso;
  }
  const leer = (arr, z) => { const f = clamp((z - zMin) / (zMax - zMin) * M, 0, M), k = Math.min(M - 1, Math.floor(f)), u = f - k; return arr[k] + (arr[k + 1] - arr[k]) * u; };
  const CINTURA = yP(0.94); // donde termina la chapa y empieza la cabina: en el 600 queda bastante abajo y los vidrios son altos
  const seccion = (z) => {
    const yt = leer(techo, z), yb = Math.min(leer(piso, z), yt - 1e-3);
    // ancho en planta: parejo en el medio y redondeado en las puntas
    let a = v.ancho * (1 - 0.03 * (z / 1.6) ** 2);
    if (z > 1.0) a *= Math.max(0, 1 - ((z - 1.0) / (zMax - 1.0)) ** v.trompa) ** (1 / v.trompa);
    if (z < -0.95) a *= Math.max(0, 1 - ((-0.95 - z) / (-0.95 - zMin)) ** v.cola) ** (1 / v.cola);
    return { yt, yb, a, cab: smooth(yP(1.15), yP(1.45), yt) };
  };
  // Medio ancho de la sección a la altura y (0 si y queda fuera). De abajo hacia arriba: el zócalo se redondea,
  // la chapa sube casi derecha hasta la cintura, ahí hay un hombro, y la cabina sigue más angosta con los
  // vidrios apenas inclinados y el techo chato. Donde no hay cabina (capó y cola) la sección se cierra redonda.
  const xLado = (y, z) => {
    const s = seccion(z); if (y <= s.yb || y >= s.yt) return 0;
    const yMid = Math.min(yP(0.72), (s.yt + s.yb) / 2), n = v.redondez;
    let x;
    if (y < yMid) x = s.a * Math.max(0, 1 - ((yMid - y) / (yMid - s.yb)) ** n) ** (1 / n);
    else {
      const sinCabina = s.a * Math.max(0, 1 - ((y - yMid) / (s.yt - yMid)) ** n) ** (1 / n);
      let conCabina = sinCabina;
      if (s.cab > 0 && s.yt > CINTURA + 0.05) {
        if (y < CINTURA) conCabina = s.a * (1 - 0.03 * ((y - yMid) / (CINTURA - yMid)) ** 2);
        else {
          const q = (y - CINTURA) / (s.yt - CINTURA), pie = s.a * 0.985 - v.hombro * smooth(CINTURA, CINTURA + 0.05, y);
          conCabina = pie * (1 - v.cabina * q ** 1.3) * Math.max(0, 1 - q ** v.techo) ** (1 / v.techo);
        }
      }
      x = sinCabina + (conCabina - sinCabina) * s.cab;
    }
    for (const zr of [1.0, -1.0]) x += v.abulta * Math.exp(-(((z - zr) / 0.42) ** 2)) * Math.exp(-(((y - 0.56) / 0.26) ** 2)) * smooth(0, 0.2, s.a); // pasarruedas
    return x;
  };
  const biseccion = (f, a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m)) a = m; else b = m; } return (a + b) / 2; };
  return {
    v, zMin, zMax, CINTURA, seccion, xLado, zP, yP,
    // hasta dónde llega la chapa hacia adelante (o hacia atrás) en el punto (x, y) de la vista de frente
    zFrente: (x, y) => biseccion((z) => xLado(y, z) > Math.abs(x), 0.6, zMax + 0.01),
    zCola: (x, y) => biseccion((z) => xLado(y, z) > Math.abs(x), -0.6, zMin - 0.01),
    // alto de la chapa sobre el punto (x, z) de la vista de arriba
    yTecho: (x, z) => { const s = seccion(z); return biseccion((y) => xLado(y, z) > Math.abs(x), (s.yt + s.yb) / 2, s.yt); },
  };
}

// La malla: anillos de puntos a lo largo, más juntos en las puntas, cerrados con un punto en cada extremo
export function geometriaCasco(S) {
  const N = 60, K = 22, R = 2 * K, pos = [], idx = [];
  for (let i = 1; i < N; i++) {
    const z = S.zMin + (S.zMax - S.zMin) * (0.5 - 0.5 * Math.cos(Math.PI * i / N)), s = S.seccion(z);
    for (let j = 0; j < R; j++) {
      // de abajo al centro, subiendo por la izquierda (+x), techo, y bajando por la derecha
      const f = j / R, y = f < 0.5 ? s.yb + (s.yt - s.yb) * (0.5 - 0.5 * Math.cos(Math.PI * f * 2)) : s.yt - (s.yt - s.yb) * (0.5 - 0.5 * Math.cos(Math.PI * (f - 0.5) * 2));
      const x = (j === 0 || j === K) ? 0 : S.xLado(clamp(y, s.yb + 1e-4, s.yt - 1e-4), z) * (f < 0.5 ? 1 : -1);
      pos.push(x, y, z);
    }
  }
  const anillos = N - 1, a0 = pos.length / 3;
  const sC = S.seccion(S.zMin), sT = S.seccion(S.zMax);
  pos.push(0, (sC.yt + sC.yb) / 2, S.zMin, 0, (sT.yt + sT.yb) / 2, S.zMax);
  for (let i = 0; i < anillos - 1; i++) for (let j = 0; j < R; j++) { const a = i * R + j, b = i * R + (j + 1) % R, c = a + R, d = b + R; idx.push(a, b, c, b, d, c); }
  for (let j = 0; j < R; j++) { idx.push(a0, (j + 1) % R, j); const u = (anillos - 1) * R; idx.push(a0 + 1, u + j, u + (j + 1) % R); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const n = pos.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const y = pos[i * 3 + 1], c = y < 0.42 ? 0.62 : y < 0.6 ? 0.62 + (y - 0.42) / 0.18 * 0.3 : 0.92 + Math.min(1, (y - 0.6) / 0.6) * 0.08; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // posición y normal de fábrica: el sombreador dibuja vidrios y costuras con ellas, así no se corren al abollarse
  g.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(g.attributes.position.array), 3));
  g.setAttribute('aBaseN', new THREE.BufferAttribute(new Float32Array(g.attributes.normal.array), 3));
  return g;
}

// Pintura del casco: sobre el color del auto dibuja vidrios con marco, piloto, costuras, moldura, rejilla y
// pasarruedas, y encima el barro (el mismo de la carrocería vieja).
const GLSL_PINTURA = `
 { vec3 P = vec3(vBase.x / KX, (vBase.y - PISO) / KY + 0.36, (vBase.z - ZC) / KZ + ZC); // a las medidas del perfil, donde están dibujados vidrios y costuras
   vec3 Nb = normalize(vBaseN); vec3 pintura = diffuseColor.rgb;
   float sd = 1.0; float tipo = 0.0; // tipo: 1 costado, 2 parabrisas, 3 luneta
   if (abs(Nb.x) > 0.5 && P.y > 0.9) {
     float d1 = max(sdCaja(vec2(P.z - 0.03, P.y - 1.19), vec2(0.38, 0.2), 0.08), (P.z - (0.49 - 0.7 * (P.y - 1.17))) * 0.82);
     float d2 = max(sdCaja(vec2(P.z + 0.65, P.y - 1.175), vec2(0.22, 0.185), 0.09), (-P.z - (0.97 - 0.45 * (P.y - 1.0))) * 0.9);
     sd = min(d1, d2); tipo = 1.0;
   } else if (Nb.z > 0.3 && P.z > 0.25 && P.y > 1.12) { sd = sdCaja(vec2(P.x, P.y - 1.305), vec2(0.58 - 0.3 * (P.y - 1.2), 0.105), 0.07); tipo = 2.0; }
   else if (Nb.z < -0.2 && P.z < -0.8 && P.y > 1.05) { sd = sdCaja(vec2(P.x, P.y - 1.27), vec2(0.51 - 0.22 * (P.y - 1.16), 0.115), 0.08); tipo = 3.0; }
   vec3 cromo = vec3(0.80, 0.85, 0.88);
   // costuras: puerta, tapa del baúl y tapa del motor
   float linea = 0.0;
   if (abs(Nb.x) > 0.5) {
     float puerta = abs(sdCaja(vec2(P.z - 0.03, P.y - 0.9), vec2(0.46, 0.48), 0.07));
     linea = max(linea, (1.0 - smoothstep(0.008, 0.014, puerta)) * step(P.y, 0.985));
   }
   if (Nb.y > 0.45 && P.z > 0.6) linea = max(linea, 1.0 - smoothstep(0.008, 0.014, abs(sdCaja(vec2(P.x, P.z - 1.02), vec2(0.42, 0.4), 0.16))));
   float rejilla = 0.0;
   if (Nb.z < -0.3 && P.z < -1.2) {
     linea = max(linea, 1.0 - smoothstep(0.008, 0.014, abs(sdCaja(vec2(P.x, P.y - 0.86), vec2(0.43, 0.25), 0.1))));
     float r = sdCaja(vec2(P.x, P.y - 0.8), vec2(0.3, 0.12), 0.04);
     rejilla = (1.0 - smoothstep(-0.004, 0.004, r)) * step(0.45, fract(P.y * 34.0));
   }
   // moldura cromada a lo largo del costado y tira del capó
   float moldura = 0.0;
   if (abs(Nb.x) > 0.5) moldura = (1.0 - smoothstep(0.009, 0.013, abs(P.y - 0.81))) * step(abs(P.z), 1.22);
   if (Nb.y > 0.45 && P.z > 0.66 && P.z < 1.4) moldura = max(moldura, 1.0 - smoothstep(0.008, 0.012, abs(P.x)));
   pintura = mix(pintura, pintura * 0.32, linea * 0.9);
   // toma de aire del motor detrás de la ventanilla trasera: tres ranuras con marco cromado
   if (abs(Nb.x) > 0.5) {
     float toma = sdCaja(vec2(P.z + 1.04, P.y - 0.88), vec2(0.075, 0.04), 0.02);
     pintura = mix(pintura, vec3(0.045, 0.035, 0.03), (1.0 - smoothstep(-0.003, 0.003, toma)) * (0.5 + 0.5 * step(0.4, fract(P.z * 42.0))));
     pintura = mix(pintura, cromo, (1.0 - smoothstep(0.006, 0.009, toma)) * smoothstep(-0.003, 0.003, toma));
   }
   pintura = mix(pintura, vec3(0.05, 0.04, 0.035), rejilla);
   pintura = mix(pintura, cromo, moldura);
   // pasarruedas: el hueco oscuro y un filete más oscuro alrededor
   if (abs(vBase.x) > 0.3) {
     float rueda = min(length(vec2(vBase.z - 1.0, vBase.y - 0.3)), length(vec2(vBase.z + 1.0, vBase.y - 0.3))); // las ruedas no se estiran con el perfil
     pintura = mix(pintura, pintura * 0.55, 1.0 - smoothstep(0.375, 0.39, rueda));
     if (rueda < 0.36) discard; // el hueco de verdad: por ahí se ve la rueda
   }
   // vidrio: oscuro, más claro arriba, con dos reflejos en diagonal y el casco del piloto adentro
   if (tipo > 0.5) {
     vec2 q = tipo < 1.5 ? vec2(P.z, P.y) : vec2(P.x, P.y);
     vec3 vidrio = mix(vec3(0.045, 0.085, 0.115), vec3(0.16, 0.26, 0.33), smoothstep(1.05, 1.42, P.y));
     float reflejo = smoothstep(0.0, 0.03, sin((q.x * 0.9 + q.y * 1.5) * 9.0) - 0.82);
     vec2 cabeza = tipo < 1.5 ? vec2(P.z + 0.02, P.y - 1.2) : vec2(P.x - 0.28, P.y - 1.235);
     float casco = 1.0 - smoothstep(0.092, 0.1, length(cabeza * vec2(1.0, 1.06)));
     float adelante = tipo < 1.5 ? step(0.015, cabeza.x) : 1.0; // de costado la visera va adelante; de frente, a todo el ancho
     float visera = casco * adelante * (1.0 - smoothstep(0.018, 0.028, abs(cabeza.y - 0.012))) * (tipo > 2.5 ? 0.0 : 1.0);
     float hombros = 1.0 - smoothstep(-0.004, 0.004, sdCaja(vec2(cabeza.x + (tipo < 1.5 ? 0.03 : 0.0), cabeza.y + 0.17), vec2(0.13, 0.07), 0.05));
     vidrio = mix(vidrio, uPiloto * 0.3 + 0.1, hombros * 0.8);
     vidrio = mix(vidrio, mix(uPiloto, vec3(0.03), visera) * 0.8, casco * 0.9);
     vidrio += reflejo * 0.16;
     vidrio *= 0.68 + 0.32 * smoothstep(0.0, 0.04, -sd); // sombra del marco sobre el borde: el vidrio queda hundido
     pintura = mix(pintura, vidrio, 1.0 - smoothstep(-0.002, 0.002, sd));
     pintura = mix(pintura, cromo, (1.0 - smoothstep(0.016, 0.02, sd)) * smoothstep(-0.002, 0.002, sd)); // marco cromado
   }
   diffuseColor.rgb = pintura; }
`;
export function pintarCasco(mat, dirt, colorPiloto, v) {
  const f = (x) => x.toFixed(4), medidas = `const float KX = ${f(v.ancho / 0.72)}; const float KY = ${f(v.altoK)}; const float KZ = ${f(v.largo)}; const float PISO = ${f(v.piso)}; const float ZC = ${f(ZC)};
`;
  const piloto = { value: new THREE.Color(colorPiloto) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = dirt; sh.uniforms.uPiloto = piloto;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec3 aBase; attribute vec3 aBaseN; varying vec3 vBase; varying vec3 vBaseN; varying vec3 vDirtPos;\nvoid main() {\n vBase = aBase; vBaseN = aBaseN; vDirtPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uDirt; uniform vec3 uPiloto; varying vec3 vBase; varying vec3 vBaseN; varying vec3 vDirtPos;\nfloat dirtHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + medidas + 'float sdCaja(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_PINTURA
        + '\n { float n = dirtHash(floor(vDirtPos.xz * 9.0)) * 0.5 + dirtHash(floor(vDirtPos.xz * 23.0 + vDirtPos.y * 7.0)) * 0.5; float m = smoothstep(1.05, 0.2, vDirtPos.y) * uDirt; m = clamp(m * (0.55 + n * 0.9), 0.0, 0.85); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.24, 0.15), m); }')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n { vec3 vd = normalize(vViewPosition); float fres = pow(1.0 - max(dot(vd, normal), 0.0), 3.0); vec3 hv = normalize(vd + normalize(vec3(0.35, 0.9, 0.25))); float spec = pow(max(dot(normal, hv), 0.0), 48.0); diffuseColor.rgb += (fres * 0.09 + spec * 0.28) * (1.0 - uDirt * 0.6); }');
  };
  mat.customProgramCacheKey = () => 'casco' + medidas;
  mat.userData.noFusionar = true;
  return mat;
}

// Un parche redondo pegado al costado (para el número): sigue la curva de la chapa
function parcheLado(S, lado, zc, yc, radio) {
  const pos = [], uv = [], idx = [], A = 5, B = 20;
  pos.push(lado * (S.xLado(yc, zc) + 0.006), yc, zc); uv.push(0.5, 0.5);
  for (let a = 1; a <= A; a++) for (let b = 0; b < B; b++) {
    const r = radio * a / A, th = b / B * Math.PI * 2, z = zc + r * Math.cos(th), y = yc + r * Math.sin(th);
    pos.push(lado * (S.xLado(y, z) + 0.006), y, z); uv.push(0.5 - lado * (z - zc) / (2 * radio), 0.5 + (y - yc) / (2 * radio));
  }
  for (let b = 0; b < B; b++) { const p = 1 + b, q = 1 + (b + 1) % B; if (lado > 0) idx.push(0, q, p); else idx.push(0, p, q); }
  for (let a = 1; a < A; a++) for (let b = 0; b < B; b++) {
    const p = 1 + (a - 1) * B + b, q = 1 + (a - 1) * B + (b + 1) % B, r = p + B, s = q + B;
    if (lado > 0) idx.push(p, q, r, q, s, r); else idx.push(p, r, q, q, r, s);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Lo mismo sobre el capó, para leer desde atrás y arriba
function parcheCapo(S, zc, radio) {
  const pos = [], uv = [], idx = [], A = 5, B = 20;
  pos.push(0, S.yTecho(0, zc) + 0.014, zc); uv.push(0.5, 0.5);
  for (let a = 1; a <= A; a++) for (let b = 0; b < B; b++) {
    const r = radio * a / A, th = b / B * Math.PI * 2, x = r * Math.cos(th), z = zc + r * Math.sin(th);
    pos.push(x, S.yTecho(x, z) + 0.014, z); uv.push(0.5 + x / (2 * radio), 0.5 - (z - zc) / (2 * radio));
  }
  for (let b = 0; b < B; b++) idx.push(0, 1 + (b + 1) % B, 1 + b);
  for (let a = 1; a < A; a++) for (let b = 0; b < B; b++) { const p = 1 + (a - 1) * B + b, q = 1 + (a - 1) * B + (b + 1) % B, r = p + B, s = q + B; idx.push(p, q, r, q, s, r); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const _cascos = new Map(); // la superficie y la malla base de cada variante se calculan una vez

// Arma el auto completo con el casco nuevo. `t` son los materiales y ayudas de car.js (se pasan para no
// importarse mutuamente). Devuelve lo mismo que createCarVisual.
export function createCarVisualLoft(spec, t) {
  const rnd = mulberry32(spec.seed || 1);
  const nombre = VARIANTES[spec.casco] ? spec.casco : 'fiel';
  if (!_cascos.has(nombre)) { const S = superficie(VARIANTES[nombre]); _cascos.set(nombre, { S, geo: geometriaCasco(S) }); }
  const { S, geo: base } = _cascos.get(nombre);
  const root = new THREE.Group(), vis = new THREE.Group(); vis.position.z = 0.12; root.add(vis);
  const dirt = { value: 0 };
  const bodyMat = pintarCasco(t.toonMat(spec.color, { vertexColors: true }), dirt, spec.helmetColor || '#e2a33b', S.v);
  const geo = base.clone();
  const body = new THREE.Mesh(geo, bodyMat); body.castShadow = true; vis.add(body);
  const contorno = new THREE.Mesh(geo, t.outline); vis.add(contorno);
  const orig = new Float32Array(geo.attributes.position.array), origCol = new Float32Array(geo.attributes.color.array);
  const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.9), t.contactShadowMat()); shadowBlob.rotation.order = 'ZXY'; shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.07; shadowBlob.renderOrder = 1; root.add(shadowBlob);
  const parts = [];
  const addPart = (mesh, zone, threshold) => { mesh.castShadow = true; vis.add(mesh); parts.push({ mesh, zone, threshold, attached: true }); return mesh; };
  const M = (g, m) => new THREE.Mesh(g, m);

  // piso oscuro: tapa lo que se ve por debajo y entre las ruedas
  const piso = t.box(1.1, 0.16, 2.9, t.darkMat); piso.position.set(0, S.v.piso + 0.1, 0); piso.castShadow = false; vis.add(piso);

  // techo de otro color: un casquete que copia el techo
  if (spec.roofColor && spec.roofColor !== spec.color) {
    const pos = [], idx = [], A = 9, B = 7; // de -1.0 a 0.33 a lo largo, hasta donde el techo empieza a caer hacia los costados
    for (let a = 0; a <= A; a++) for (let b = 0; b <= B; b++) {
      const z = S.zP(-0.98) + (S.zP(0.3) - S.zP(-0.98)) * a / A, ancho = S.xLado(S.seccion(z).yt - 0.075, z) * 0.97, x = -ancho + 2 * ancho * b / B;
      pos.push(x, S.yTecho(x, z) + 0.007, z);
    }
    for (let a = 0; a < A; a++) for (let b = 0; b < B; b++) { const p = a * (B + 1) + b; idx.push(p, p + 1, p + B + 1, p + 1, p + B + 2, p + B + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    const mt = t.toonMat(spec.roofColor, { side: THREE.DoubleSide }); mt.userData.siempre = true; vis.add(M(g, mt));
  }
  // franjas de carrera: dos tiras sobre el techo y el capó, copiando la chapa
  if (spec.stripes) {
    const sm = t.toonMat(spec.stripeColor || '#fff8e6', { side: THREE.DoubleSide }); sm.userData.siempre = true;
    const tira = (x0, z0, z1) => { const pos = [], idx = [], A = 10; for (let a = 0; a <= A; a++) { const z = z0 + (z1 - z0) * a / A; for (const x of [x0 - 0.08, x0 + 0.08]) pos.push(x, S.yTecho(x, z) + 0.009, z); } for (let a = 0; a < A; a++) { const p = a * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); return M(g, sm); };
    for (const x of [-0.16, 0.16]) { vis.add(tira(x, S.zP(-0.95), S.zP(0.3))); vis.add(tira(x, S.zP(0.68), S.zP(1.38))); }
  }

  // faros: ópticas redondas en las esquinas de la trompa, con aro cromado, apoyadas donde está la chapa
  const headlights = [], taillights = [], cuencos = [];
  for (const sx of [-1, 1]) {
    const hx = sx * 0.47, hy = 0.83, hz = S.zFrente(hx, hy); // a la altura del borde del capó, como en el 600 (más arriba parecen los de un Escarabajo)
    const gc = new THREE.SphereGeometry(0.155, 14, 10); gc.scale(1, 1, 0.75); gc.translate(hx, hy, hz - 0.045); gc.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gc.attributes.position.count * 3).fill(0.97), 3)); cuencos.push(gc); // el bulto del guardabarros que aloja el faro
    const refl = M(new THREE.CircleGeometry(0.125, 16), t.chromeMat); refl.position.set(hx, hy, hz + 0.058); vis.add(refl);
    const bulb = M(new THREE.SphereGeometry(0.04, 8, 6), t.lightOn); bulb.position.set(hx, hy, hz + 0.075); vis.add(bulb);
    const hl = M(new THREE.SphereGeometry(0.14, 14, 12), t.lensMat); hl.position.set(hx, hy, hz + 0.045); hl.scale.z = 0.6; vis.add(hl); headlights.push(hl);
    const ring = M(new THREE.TorusGeometry(0.14, 0.022, 6, 18), t.chromeMat); ring.position.set(hx, hy, hz + 0.06); vis.add(ring);
    // luz de posición ámbar abajo del faro
    const py = 0.6, pz = S.zFrente(sx * 0.4, py);
    const park = M(new THREE.SphereGeometry(0.05, 10, 8), t.blinkMat); park.scale.z = 0.5; park.position.set(sx * 0.4, py, pz); vis.add(park);
    // traseras: redondas con aro, y el reflector chico abajo
    const tx = sx * 0.5, ty = 0.8, tz = S.zCola(tx, ty);
    const tl = M(new THREE.SphereGeometry(0.08, 10, 8), t.tailOff); tl.scale.set(1, 1, 0.55); tl.position.set(tx, ty, tz - 0.01); tl.castShadow = false; vis.add(tl); taillights.push(tl);
    const tring = M(new THREE.TorusGeometry(0.085, 0.018, 6, 12), t.chromeMat); tring.position.set(tx, ty, tz - 0.012); vis.add(tring);
    const rz = S.zCola(tx, 0.58); const rrefl = M(new THREE.CircleGeometry(0.035, 10), t.reflMat); rrefl.position.set(tx, 0.58, rz - 0.008); rrefl.rotation.y = Math.PI; vis.add(rrefl);
    // manija de la puerta
    const my = 0.9, mz = S.zP(0.34); const manija = t.box(0.03, 0.035, 0.15, t.chromeMat); manija.position.set(sx * (S.xLado(my, mz) + 0.012), my, mz); vis.add(manija);
  }
  { const g = mergeGeometries(cuencos, false); for (const x of cuencos) x.dispose(); const m = M(g, bodyMat); m.castShadow = false; vis.add(m); vis.add(M(g, t.outline)); }
  // escudo y bigotes cromados en la trompa
  {
    const by = 0.78, bz = S.zFrente(0, by);
    const escudo = M(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), t.badgeMat); escudo.rotation.x = Math.PI / 2; escudo.position.set(0, by, bz + 0.005); vis.add(escudo);
    const aro = M(new THREE.TorusGeometry(0.07, 0.013, 6, 14), t.chromeMat); aro.position.set(0, by, bz + 0.018); vis.add(aro);
    for (const sx of [-1, 1]) for (const [dy, len] of [[0.035, 0.26], [-0.035, 0.22]]) {
      const x = sx * (0.1 + len / 2), z = S.zFrente(x, by + dy);
      const bigote = t.box(len, 0.02, 0.025, t.chromeMat); bigote.position.set(x, by + dy, z + 0.006); bigote.rotation.y = -sx * Math.atan2(S.zFrente(sx * 0.1, by + dy) - S.zFrente(sx * (0.1 + len), by + dy), len); vis.add(bigote);
    }
    const placa = M(new THREE.PlaneGeometry(0.38, 0.11), new THREE.MeshToonMaterial({ map: t.plateTexture('FIAT ' + spec.number), gradientMap: t.toonGradient() })); placa.position.set(0, 0.52, S.zFrente(0, 0.52) + 0.012); vis.add(placa);
  }
  // paragolpes: una barra cromada que acompaña la curva de la trompa y de la cola, con dos defensas
  const paragolpes = (frente) => {
    const pts = []; for (let k = -6; k <= 6; k++) { const x = k * 0.105, z = frente ? S.zFrente(x, 0.44) + 0.05 : S.zCola(x, 0.44) - 0.05; pts.push(new THREE.Vector3(x, 0.44, z)); }
    const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.04, 6, false)];
    for (const x of [-0.36, 0.36]) { const d = new THREE.BoxGeometry(0.06, 0.15, 0.07); d.translate(x, 0.44, (frente ? S.zFrente(x, 0.44) + 0.07 : S.zCola(x, 0.44) - 0.07)); geos.push(d); }
    const g = mergeGeometries(geos.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(k)) y.deleteAttribute(k); return y; }), false);
    return M(g, t.chromeMat);
  };
  addPart(paragolpes(true), 'front', 0.55);
  addPart(paragolpes(false), 'rear', 0.55);
  {
    const ey = S.yP(1.02), ez = S.zP(0.52), ex = S.xLado(ey, ez);
    const espejo = M(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), t.chromeMat); espejo.rotation.z = Math.PI / 2; espejo.position.set(ex + 0.13, ey + 0.03, ez); addPart(espejo, 'left', 0.35);
    const brazo = t.box(0.14, 0.02, 0.02, t.chromeMat); brazo.position.set(ex + 0.06, ey, ez); brazo.rotation.z = 0.3; vis.add(brazo);
  }
  // caño de escape y patente trasera
  const cz = S.zCola(0.4, 0.42);
  const cano = M(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), t.chromeMat); cano.rotation.x = Math.PI / 2; cano.position.set(-0.4, 0.36, cz - 0.02); vis.add(cano);
  const patente = M(new THREE.PlaneGeometry(0.4, 0.12), new THREE.MeshToonMaterial({ map: t.plateTexture('FIAT ' + spec.number), gradientMap: t.toonGradient() }));
  patente.position.set(0, 0.56, S.zCola(0, 0.56) - 0.014); patente.rotation.y = Math.PI; addPart(patente, 'rear', 0.8);
  // números: en las puertas y sobre el capó, pegados a la chapa
  const numMat = new THREE.MeshToonMaterial({ map: t.numberTexture(spec.number), gradientMap: t.toonGradient(), transparent: true, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) vis.add(M(parcheLado(S, sx, S.zP(0.03), 0.78, 0.24), numMat));
  vis.add(M(parcheCapo(S, S.zP(1.0), 0.23), numMat));

  // accesorios
  if (spec.accessory === 'rack') {
    const rack = new THREE.Group();
    const frame = t.box(1.0, 0.04, 0.85, t.chromeMat); frame.position.y = 0.06; rack.add(frame);
    for (let i = 0; i < 4; i++) { const leg = t.box(0.04, 0.12, 0.04, t.chromeMat); leg.position.set((i % 2 ? 0.44 : -0.44), 0.0, (i < 2 ? 0.38 : -0.38)); rack.add(leg); }
    const s1 = t.box(0.66, 0.22, 0.48, t.suitcaseMats[Math.floor(rnd() * 4)]); s1.position.set(-0.13, 0.2, 0); rack.add(s1);
    const s2 = t.box(0.42, 0.16, 0.34, t.suitcaseMats[Math.floor(rnd() * 4)]); s2.position.set(0.28, 0.17, 0.05); s2.rotation.y = 0.3; rack.add(s2);
    t.fusionarEn(rack, t.SIN_PROTEGER, true); rack.position.set(0, S.yTecho(0, S.zP(-0.3)) + 0.03, S.zP(-0.3)); addPart(rack, 'any', 0.5);
  } else if (spec.accessory === 'lights') {
    const bar = new THREE.Group(); bar.add(t.box(0.9, 0.05, 0.05, t.darkMat));
    for (let i = 0; i < 4; i++) { const l = M(new THREE.CylinderGeometry(0.085, 0.065, 0.1, 10), t.lightOn); l.rotation.x = Math.PI / 2; l.position.set(-0.33 + i * 0.22, 0.09, 0.03); bar.add(l); }
    t.fusionarEn(bar, t.SIN_PROTEGER); bar.position.set(0, 0.58, S.zFrente(0, 0.6) + 0.1); addPart(bar, 'front', 0.4);
  } else if (spec.accessory === 'spoiler') {
    const sp = new THREE.Group();
    const plank = t.box(1.1, 0.05, 0.3, t.woodMat); plank.position.y = 0.2; sp.add(plank);
    for (const sx of [-0.4, 0.4]) { const l = t.box(0.05, 0.2, 0.05, t.darkMat); l.position.set(sx, 0.1, 0); sp.add(l); }
    t.fusionarEn(sp, t.SIN_PROTEGER, true); sp.position.set(0, S.yTecho(0, S.zP(-1.3)) - 0.02, S.zP(-1.3)); addPart(sp, 'rear', 0.45);
  } else if (spec.accessory === 'antenna') {
    const ant = new THREE.Group();
    const rod = M(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), t.chromeMat); rod.position.y = 0.65; ant.add(rod);
    const flag = M(new THREE.ConeGeometry(0.16, 0.3, 3), t.toonMat(spec.roofColor || '#d94a3a')); flag.rotation.z = Math.PI / 2; flag.position.set(0.13, 1.2, 0); ant.add(flag);
    ant.position.set(-0.4, S.yTecho(0.4, S.zP(-1.2)) - 0.02, S.zP(-1.2)); vis.add(ant);
  }

  // ruedas: una malla por rueda (ver car.js), un poco más afuera que la chapa para que asomen del pasarruedas
  const wheels = [], adornos = [];
  const wheelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.19, 16); wheelGeo.rotateZ(Math.PI / 2);
  const ruedaGeo = [1, -1].map((lado) => t.geometriaRueda(lado, spec.color, spec.whitewall !== false));
  const WX = S.xLado(0.45, 1.0) - 0.075;
  for (const [x, z, steer] of [[WX, 1.0, true], [-WX, 1.0, true], [WX, -1.0, false], [-WX, -1.0, false]]) {
    const w = new THREE.Group(); w.position.set(x, 0.29, z);
    const spin = new THREE.Group();
    const rueda = M(ruedaGeo[x > 0 ? 0 : 1], t.ruedaMat); rueda.castShadow = true; spin.add(rueda);
    const ol = M(wheelGeo, t.outline); spin.add(ol); adornos.push(ol);
    w.add(spin); vis.add(w);
    wheels.push({ group: w, spin, steer, side: Math.sign(x) });
  }

  const protegidos = new Set([body, contorno, ...parts.map((p) => p.mesh), ...headlights, ...taillights, ...wheels.map((w) => w.group)]);
  const fusionadas = t.fusionarEn(vis, protegidos);
  const lod = fusionadas.filter((m) => m.material !== numMat && !m.material.userData.siempre).concat(adornos); // de lejos se van cromados y detalles; techo, franjas y número quedan
  return {
    root, vis, body, bodyMat, geo, orig, origCol, parts, headlights, taillights, wheels, spec, shadowBlob, dirt, lod, lodCerca: true,
    colorAttr: geo.attributes.color, smokeAnchor: new THREE.Vector3(0, 1.05, S.zP(-1.4)), exhaustAnchor: new THREE.Vector3(-0.4, 0.36, cz - 0.15), braking: false,
    deformTotal: 0, wobble: 0,
  };
}
