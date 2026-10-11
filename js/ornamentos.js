// Detalle del suelo a los costados de la pista: matas de pasto, flores silvestres y piedras.
//
// El terreno ya tiene la foto de pasto, pero de cerca era una alfombra lisa. Estas piezas son chicas y
// baratas (cinco hojas por mata, una piedra de doce caras), van agrupadas en parcelas de 70 m para que
// three descarte las que no se ven, y no proyectan sombra.
//
// Usan el mismo material que la vegetación: color por vértice para el sombreado y color de instancia para el
// tono, aplicado sólo donde aFollaje vale 1 (las hojas). Las flores llevan aFollaje 0 en los pétalos para
// conservar su color propio.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { materialVegetacion } from './vegetacion.js';

// Una mata: hojas finas en abanico, oscuras abajo y claras en la punta. Las normales miran hacia arriba
// para que las dos caras de cada hoja se iluminen como el piso (si no, la mitad salen negras).
function mata(semilla, hojas = 8, flores = null) {
  const rnd = mulberry32(semilla);
  const pos = [], col = [], fol = [];
  // en las matas el verde lo pone la instancia; en las flores la instancia pinta la corola, así que las
  // hojas llevan su verde propio y no se tiñen
  const verde = flores ? [0.42, 0.62, 0.26] : null;
  const hoja = (ang, alto, ancho, inclina) => {
    const cx = Math.cos(ang), cz = Math.sin(ang), px = -cz, pz = cx;
    const tx = cx * inclina * alto, tz = cz * inclina * alto;
    pos.push(px * ancho, 0, pz * ancho, -px * ancho, 0, -pz * ancho, tx, alto, tz);
    if (verde) col.push(verde[0] * 0.55, verde[1] * 0.55, verde[2] * 0.55, verde[0] * 0.55, verde[1] * 0.55, verde[2] * 0.55, verde[0] * 1.1, verde[1] * 1.1, verde[2] * 1.1);
    else col.push(0.5, 0.56, 0.42, 0.5, 0.56, 0.42, 1.08, 1.1, 0.95);
    fol.push(verde ? 0 : 1, verde ? 0 : 1, verde ? 0 : 1);
    return [tx, alto, tz];
  };
  const puntas = [];
  for (let i = 0; i < hojas; i++) {
    const ang = (i / hojas) * Math.PI * 2 + rnd() * 0.8;
    puntas.push(hoja(ang, 0.2 + rnd() * 0.24, 0.04 + rnd() * 0.025, 0.4 + rnd() * 0.45));
  }
  // flores: tallo más alto con una corola de cuatro pétalos en la punta
  if (flores) {
    for (let k = 0; k < 3; k++) {
      const ang = rnd() * Math.PI * 2, alto = 0.45 + rnd() * 0.2, inc = 0.15 + rnd() * 0.2;
      const [tx, ty, tz] = hoja(ang, alto, 0.018, inc);
      const r = 0.07 + rnd() * 0.03;
      for (let p = 0; p < 4; p++) {
        const a = p * Math.PI / 2 + rnd() * 0.3;
        pos.push(tx, ty, tz, tx + Math.cos(a) * r, ty + 0.02, tz + Math.sin(a) * r, tx + Math.cos(a + 0.9) * r, ty + 0.02, tz + Math.sin(a + 0.9) * r);
        col.push(1, 1, 1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1);
        fol.push(1, 1, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFollaje', new THREE.Float32BufferAttribute(fol, 1));
  return g;
}

// Piedra: un dodecaedro aplastado y deformado, más clara arriba
function piedra(semilla) {
  const g = new THREE.DodecahedronGeometry(0.22, 0);
  const p = g.attributes.position, v = new THREE.Vector3();
  // la geometría repite cada vértice en cada cara que lo usa: la deformación depende de la posición (no
  // del orden) para que las copias se muevan juntas y no se abran grietas
  const ruido = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + semilla * 13.3) * 43758.5453; return h - Math.floor(h); };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.8 + ruido(Math.round(v.x * 1000), Math.round(v.y * 1000), Math.round(v.z * 1000)) * 0.45;
    p.setXYZ(i, v.x * k * 1.25, Math.max(v.y * k * 0.6, -0.05), v.z * k);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), fol = new Float32Array(p.count).fill(1);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const c = 0.72 + 0.4 * clamp((y + 0.05) / 0.2, 0, 1); col.set([c, c, c], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFollaje', new THREE.BufferAttribute(fol, 1));
  g.deleteAttribute('uv');
  return g;
}

// Fardo de pasto: cilindro algo abombado, dos piolas más oscuras y las tapas con la espiral del enrollado.
// Queda parado sobre el eje Y; quien lo usa lo acuesta.
export function fardo(radio, largo) {
  const g = new THREE.CylinderGeometry(radio, radio, largo, 18, 12, false);
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), tapa = Math.abs(n.getY(i)) > 0.9;
    let c;
    if (tapa) {
      const r = Math.hypot(x, z) / radio;
      c = 0.74 + 0.1 * Math.sin(r * 22 + Math.atan2(z, x) * 0.5);
    } else {
      const f = y / (largo / 2), abombado = 1 + 0.07 * (1 - f * f);
      p.setXYZ(i, x * abombado, y, z * abombado);
      const piola = Math.min(Math.abs(Math.abs(f) - 0.5), 1);
      c = piola < 0.09 ? 0.6 : 0.96 + 0.06 * Math.sin(Math.atan2(z, x) * 9);
    }
    col.set([c, c * 0.98, c * 0.92], i * 3);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const FLORES = [[1.25, 1.05, 0.25], [1.2, 1.2, 1.15], [0.85, 0.6, 1.15], [1.2, 0.45, 0.35]]; // amarilla, blanca, lila, roja

export function sembrarOrillas(world, toonMat) {
  const t = world.track, rnd = mulberry32(404), W = t.W;
  const bosque = t.def.paisaje === 'bosque';
  const verdes = world.wet || bosque ? ['#4f7a36', '#5c8a3e', '#46702f', '#6a8f45'] : ['#6f9a45', '#7fa84d', '#8fae55', '#a3b25c'];
  const grises = ['#8a7f70', '#766d61', '#9a8d78', '#675f55'];
  const matHojas = materialVegetacion(toonMat); matHojas.side = THREE.DoubleSide;
  const matPiedra = materialVegetacion(toonMat);

  const matas = [], flores = [], piedras = [];
  const lejosDeTodo = (x, z) => !world.reservedHit(x, z);
  for (let i = 0; i < t.n; i += 1) {
    const s = t.samples[i];
    for (const lado of [-1, 1]) {
      // banquina de pasto entre el ripio y la zanja, y algo más allá del alambrado
      const n = 1 + Math.floor(rnd() * 2); // cada punto ya es un manchón de varias matas
      for (let k = 0; k < n; k++) {
        const lejos = rnd() < 0.35;
        const lat = lado * (lejos ? W + 9 + rnd() * 20 : W + 0.5 + rnd() * 6);
        const x = s.x + s.nx * lat + (rnd() - 0.5), z = s.z + s.nz * lat + (rnd() - 0.5);
        if (t.nearest(x, z, i).dist < W + 0.4 || !lejosDeTodo(x, z)) continue;
        // cada punto es un manchón de dos a cuatro matas juntas, como crece el pasto de verdad
        const flor = rnd() < 0.14, tono = Math.floor(rnd() * (flor ? FLORES.length : verdes.length));
        const cuantas = 2 + Math.floor(rnd() * 3);
        for (let m = 0; m < cuantas; m++) {
          const mx = x + (rnd() - 0.5) * 0.9, mz = z + (rnd() - 0.5) * 0.9;
          const o = { x: mx, z: mz, y: t.heightAt(mx, mz), rot: rnd() * 6.28, s: 0.75 + rnd() * 0.6, c: tono };
          (flor && m === 0 ? flores : matas).push(o);
        }
      }
      // piedras sueltas al borde del ripio
      if (rnd() < 0.55) {
        const lat = lado * (W - 0.2 + rnd() * 1.8);
        const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
        if (lejosDeTodo(x, z)) piedras.push({ x, z, y: t.heightAt(x, z) - 0.05, rot: rnd() * 6.28, s: 0.5 + rnd() * 1.1, c: Math.floor(rnd() * grises.length) }); // un poco enterradas
      }
    }
  }

  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), esc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  // Parcelas de 140 m con un InstancedMesh cada una. Con parcelas de 70 m y tres formas por tipo eran 180
  // mallas: en una placa integrada cada llamada de dibujo pesa, y sumaban 5 ms por cuadro con sólo 39 mil
  // triángulos. La variedad sale del giro, la escala y el color de cada ejemplar.
  const plantar = (lista, geo, mat, paleta, colorDe) => {
    const parcelas = new Map();
    lista.forEach((o) => { const k = Math.floor(o.x / 140) + ',' + Math.floor(o.z / 140); if (!parcelas.has(k)) parcelas.set(k, []); parcelas.get(k).push(o); });
    for (const lote of parcelas.values()) {
      const im = new THREE.InstancedMesh(geo, mat, lote.length);
      im.castShadow = false; im.receiveShadow = true;
      lote.forEach((o, i) => {
        e.set((o.inclina || 0), o.rot, 0); q.setFromEuler(e);
        M.compose(p.set(o.x, o.y, o.z), q, esc.set(o.s, o.s, o.s));
        im.setMatrixAt(i, M); im.setColorAt(i, colorDe ? colorDe(o) : col.set(paleta[o.c]));
      });
      im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
      world.add(im);
    }
  };
  plantar(matas, mata(1, 9), matHojas, verdes);
  plantar(flores, mata(10, 5, true), matHojas, null, (o) => col.setRGB(...FLORES[o.c]));
  plantar(piedras, piedra(7), matPiedra, grises);
  return { matas: matas.length, flores: flores.length, piedras: piedras.length };
}
