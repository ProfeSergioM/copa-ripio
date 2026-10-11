// Árboles y arbustos de dibujo animado.
//
// Antes cada árbol era una figura geométrica sola: una esfera facetada sobre un tronco, un cono para el
// álamo, tres conos para el pino. Acá cada copa se arma con varios bultos y, el truco del estilo, las
// normales del follaje apuntan desde el centro de la copa y no desde cada bulto: la luz la sombrea como un
// solo volumen con las bandas del material toon, y los bultos sólo se notan en el contorno.
//
// Tronco y copa van en una sola geometría (una llamada de dibujo por especie). El color de cada ejemplar
// sale del color de instancia, pero sólo tiñe el follaje: el atributo aFollaje (1 en la copa, 0 en el
// tronco) decide en el shader cuánto del color de instancia se aplica. Los colores propios de la geometría
// (vertexColors) sombrean: más oscuro abajo y adentro, más claro arriba.
//
// Hay dos niveles de detalle por especie: 'cerca' para lo que se ve desde la pista y 'lejos' para el fondo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from './util.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();

// pinta una pieza: color por vértice según una función y marca si es follaje
function pieza(geo, follaje, colorDe) {
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), fol = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pos, i);
    const [r, g, b] = colorDe(_v);
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    fol[i] = follaje ? 1 : 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFollaje', new THREE.BufferAttribute(fol, 1));
  geo.deleteAttribute('uv');
  return geo;
}

// Lleva las normales del follaje hacia las de un volumen: centro fijo (copa redonda) o eje vertical
// (pinos y álamos). 'cuanto' mezcla con la normal propia del bulto para que no quede del todo liso.
export function normalesDeVolumen(geo, centro, cuanto, eje = false, aplastar = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
    _c.copy(_v).sub(centro);
    if (eje) _c.y = _c.y * 0.35 + 0.25; else _c.y /= aplastar;
    _c.normalize();
    _n.lerp(_c, cuanto).normalize();
    nor.setXYZ(i, _n.x, _n.y, _n.z);
  }
}

const corteza = (base, alto) => (v) => { const k = 0.62 + 0.38 * clamp(v.y / alto, 0, 1); return [base[0] * k, base[1] * k, base[2] * k]; };
const MADERA = [0.43, 0.30, 0.2], MADERA_OSCURA = [0.33, 0.23, 0.16];

// sombreado del follaje: abajo y adentro oscuro, arriba y afuera claro (el color lo pone la instancia)
function luzDeCopa(centro, radio, alto) {
  return (v) => {
    const h = clamp((v.y - (centro.y - alto)) / (2 * alto), 0, 1);
    const afuera = clamp(Math.hypot(v.x - centro.x, v.z - centro.z) / radio, 0, 1);
    const k = 0.58 + 0.42 * h + 0.14 * afuera;
    return [k, k, k * 0.97];
  };
}

export function bulto(r, ancho, alto, x, y, z, sy = 1) {
  const g = new THREE.SphereGeometry(r, ancho, alto);
  g.scale(1, sy, 1); g.translate(x, y, z);
  return g;
}

function tronco(r0, r1, alto, lados, inclina = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, alto, lados, 1, true);
  g.translate(0, alto / 2, 0);
  if (inclina) g.rotateZ(inclina);
  return g;
}

function rama(largo, grosor, base, ang, giro) {
  const g = new THREE.CylinderGeometry(grosor * 0.6, grosor, largo, 5, 1, true);
  g.translate(0, largo / 2, 0); g.rotateZ(ang); g.rotateY(giro); g.translate(0, base, 0);
  return g;
}

// ---------- árbol de copa (paraíso, fresno) ----------
function arbolCopa(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const partes = [];
  const alto = 2.7, centro = new THREE.Vector3(0.12, 4.0, 0);
  partes.push(pieza(tronco(0.3, 0.17, alto + 0.6, cerca ? 8 : 6, 0.05), false, corteza(MADERA, alto)));
  if (cerca) {
    partes.push(pieza(rama(1.5, 0.12, 2.1, 0.75, 0.4), false, corteza(MADERA, 3.6)));
    partes.push(pieza(rama(1.3, 0.1, 2.4, -0.7, 2.2), false, corteza(MADERA, 3.6)));
  }
  const bultos = [bulto(1.75, cerca ? 8 : 6, cerca ? 5 : 4, centro.x, centro.y, centro.z, 0.92)];
  const n = cerca ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6, r = 1.25 + rnd() * 0.35;
    const y = centro.y - 0.45 + rnd() * 1.1;
    bultos.push(bulto(1.0 + rnd() * 0.45, cerca ? 7 : 6, 4, centro.x + Math.cos(a) * r, y, centro.z + Math.sin(a) * r, 0.9));
  }
  if (cerca) bultos.push(bulto(1.05, 7, 4, centro.x - 0.2, centro.y + 1.25, centro.z + 0.15));
  const copa = mergeGeometries(bultos);
  normalesDeVolumen(copa, centro, 0.7, false, 0.85);
  partes.push(pieza(copa, true, luzDeCopa(centro, 2.9, 2.0)));
  return mergeGeometries(partes);
}

// ---------- pino: pisos de follaje con borde dentado y caído ----------
function pino(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const partes = [pieza(tronco(0.24, 0.12, 2.6, 6), false, corteza(MADERA_OSCURA, 2.6))];
  const pisos = cerca ? [[2.45, 2.4, 1.3], [2.05, 2.2, 2.75], [1.65, 2.0, 4.1], [1.2, 1.8, 5.35], [0.72, 1.6, 6.5]]
    : [[2.3, 2.8, 1.5], [1.65, 2.5, 3.4], [1.0, 2.2, 5.3]];
  const lados = cerca ? 12 : 7;
  for (const [r, h, y] of pisos) {
    const g = new THREE.ConeGeometry(r, h, lados, cerca ? 2 : 1, true);
    // el borde de abajo: puntas alternadas hacia afuera y caídas, como ramas
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      if (_v.y < -h / 2 + 1e-3) {
        const ang = Math.atan2(_v.z, _v.x), punta = Math.round(ang / (Math.PI * 2 / lados)) % 2 === 0;
        const k = punta ? 1.16 : 0.9;
        pos.setXYZ(i, _v.x * k, _v.y - (punta ? 0.28 : 0), _v.z * k);
      }
    }
    g.rotateY(rnd() * Math.PI);
    g.translate(0, y + h / 2, 0);
    g.computeVertexNormals();
    normalesDeVolumen(g, new THREE.Vector3(0, y + h * 0.3, 0), 0.45, true);
    partes.push(pieza(g, true, (v) => {
      const enPiso = clamp((v.y - y) / h, 0, 1), afuera = clamp(Math.hypot(v.x, v.z) / r, 0, 1);
      const k = 0.55 + 0.3 * enPiso + 0.22 * afuera + 0.12 * clamp(y / 6.5, 0, 1);
      return [k * 0.95, k, k * 0.95];
    }));
  }
  return mergeGeometries(partes);
}

// ---------- álamo: columna de bultos ----------
function alamo(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const partes = [pieza(tronco(0.2, 0.12, 3.0, 6), false, corteza(MADERA, 3.0))];
  const bultos = [], n = cerca ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), y = 3.0 + f * 6.6, r = 1.25 - 0.62 * f;
    bultos.push(bulto(r * (0.92 + rnd() * 0.2), cerca ? 7 : 6, cerca ? 5 : 4, (rnd() - 0.5) * 0.35, y, (rnd() - 0.5) * 0.35, 1.45));
  }
  const copa = mergeGeometries(bultos);
  normalesDeVolumen(copa, new THREE.Vector3(0, 6.3, 0), 0.6, true);
  partes.push(pieza(copa, true, (v) => { const k = 0.6 + 0.45 * clamp((v.y - 2.6) / 7.5, 0, 1) + 0.1 * clamp(Math.hypot(v.x, v.z) / 1.2, 0, 1); return [k, k, k * 0.96]; }));
  return mergeGeometries(partes);
}

// ---------- arbusto: tres o cuatro bultos al ras del piso ----------
function arbusto(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const centro = new THREE.Vector3(0, 0.5, 0);
  const bultos = [bulto(0.78, cerca ? 8 : 6, cerca ? 5 : 4, 0, 0.62, 0, 0.85)];
  const n = cerca ? 4 : 2;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd(); bultos.push(bulto(0.48 + rnd() * 0.22, cerca ? 7 : 5, 4, Math.cos(a) * 0.62, 0.4 + rnd() * 0.25, Math.sin(a) * 0.62, 0.85)); }
  const copa = mergeGeometries(bultos);
  normalesDeVolumen(copa, centro, 0.7, false, 0.7);
  return pieza(copa, true, luzDeCopa(centro, 1.3, 0.8));
}

// ---------- ombú: tronco gordo y copa ancha y chata ----------
function ombu(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const partes = [pieza(tronco(1.15, 0.62, 2.8, cerca ? 9 : 7), false, corteza(MADERA, 2.8))];
  if (cerca) for (let i = 0; i < 4; i++) partes.push(pieza(rama(2.3, 0.32, 2.2, 0.85, i * 1.6 + rnd()), false, corteza(MADERA, 4.5)));
  const centro = new THREE.Vector3(0, 4.3, 0);
  const bultos = [bulto(2.4, cerca ? 9 : 7, cerca ? 5 : 4, 0, centro.y, 0, 0.62)];
  const n = cerca ? 9 : 4;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd() * 0.4, r = 2.6 + rnd() * 0.7; bultos.push(bulto(1.35 + rnd() * 0.5, cerca ? 7 : 6, 4, Math.cos(a) * r, centro.y - 0.25 + rnd() * 0.7, Math.sin(a) * r, 0.7)); }
  const copa = mergeGeometries(bultos);
  normalesDeVolumen(copa, centro, 0.7, false, 0.55);
  partes.push(pieza(copa, true, luzDeCopa(centro, 4.2, 1.6)));
  return mergeGeometries(partes);
}

// ---------- sauce llorón: cúpula y una cortina de bultos largos que cuelgan alrededor ----------
function sauce(cerca, semilla) {
  const rnd = mulberry32(semilla);
  const partes = [pieza(tronco(0.55, 0.32, 3.4, 9, 0.06), false, corteza(MADERA, 3.4))];
  for (let i = 0; i < 3; i++) partes.push(pieza(rama(2.0, 0.22, 3.0, 0.8, i * 2.1 + rnd()), false, corteza(MADERA, 4.6)));
  const centro = new THREE.Vector3(0, 5.2, 0);
  const bultos = [bulto(2.3, 9, 5, 0, centro.y, 0, 0.7)];
  const n = cerca ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.3, r = 2.4 + rnd() * 0.5;
    bultos.push(bulto(0.85 + rnd() * 0.3, 7, 5, Math.cos(a) * r, centro.y - 1.6 - rnd() * 0.6, Math.sin(a) * r, 2.3));
  }
  const copa = mergeGeometries(bultos);
  normalesDeVolumen(copa, centro, 0.65, false, 1.2);
  partes.push(pieza(copa, true, (v) => { const k = 0.6 + 0.5 * clamp((v.y - 2) / 5, 0, 1) + 0.1 * clamp(Math.hypot(v.x, v.z) / 3, 0, 1); return [k, k, k * 0.95]; }));
  return mergeGeometries(partes);
}

export const ESPECIES = { copa: arbolCopa, pino, alamo, arbusto, ombu, sauce };

// Material compartido: toon con colores por vértice, y el color de instancia aplicado sólo al follaje
export function materialVegetacion(toonMat) {
  const m = toonMat('#ffffff', { vertexColors: true });
  m.onBeforeCompile = (sh) => {
    // a esta altura los #include todavía no están expandidos: se reemplaza el de color entero
    sh.vertexShader = 'attribute float aFollaje;\n' + sh.vertexShader.replace('#include <color_vertex>', `
      #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
        vColor = vec3( 1.0 );
      #endif
      #ifdef USE_COLOR
        vColor *= color;
      #endif
      #ifdef USE_INSTANCING_COLOR
        vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, aFollaje);
      #endif`);
  };
  m.customProgramCacheKey = () => 'vegetacion';
  return m;
}
