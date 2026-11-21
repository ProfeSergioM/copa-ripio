// ¿Se hunde el auto en la pista? Recorre cada pista con el auto apoyado como lo dibuja el juego y mide
// cuánto quedan las cuatro ruedas, la trompa y la cola por debajo (o por encima) del piso.
// Uso: node herramientas/apoyo.mjs
//
// El cálculo de la pose es el mismo de Race.syncVisuals (sin el suavizado ni el cabeceo por acelerar):
// altura bajo cada eje y a cada lado, y de ahí cabeceo, rolido y altura.
import * as THREE from 'three';
import { Track, CIRCUITS } from '../js/track.js';
import { clamp } from '../js/util.js';

export function pose(track, x, z, heading, idx) {
  const sh = Math.sin(heading), ch = Math.cos(heading), y = track.heightAt(x, z, idx);
  const yF = track.heightAt(x + sh, z + ch, idx), yT = track.heightAt(x - sh, z - ch, idx);
  const yI = track.heightAt(x + ch * 0.64, z - sh * 0.64, idx), yD = track.heightAt(x - ch * 0.64, z + sh * 0.64, idx);
  return { y, cabeceo: clamp(-Math.atan2(yF - yT, 2), -0.5, 0.5), rolido: clamp(Math.atan2(yI - yD, 1.28), -0.4, 0.4), apoyo: clamp((yF + yT) / 2 - y, -0.12, 0.5) };
}

// puntos del auto en su propio sistema (x a la izquierda, y arriba, z adelante), a la altura en que tocan el piso
const PUNTOS = { 'rueda del. izq.': [0.64, 0, 1.0], 'rueda del. der.': [-0.64, 0, 1.0], 'rueda tras. izq.': [0.64, 0, -1.0], 'rueda tras. der.': [-0.64, 0, -1.0], trompa: [0, 0.36, 1.6], cola: [0, 0.36, -1.6] };

export function medir(track, modo = 'nuevo') {
  const raiz = new THREE.Group(), vis = new THREE.Group(); raiz.add(vis);
  const v = new THREE.Vector3();
  let peor = { hundido: 0 }, suma = 0, n = 0;
  const punta = track.closed ? 0 : 6; // en un tramo abierto, más allá de la largada y de la llegada no hay pista
  for (let i = punta; i < track.n - punta; i++) {
    const s = track.samples[i];
    for (const lat of [-3, 0, 3]) {
      const x = s.x + s.nx * lat, z = s.z + s.nz * lat;
      const p = pose(track, x, z, s.heading, i);
      raiz.position.set(x, p.y, z); raiz.rotation.y = s.heading;
      if (modo === 'viejo') { // lo que hacía antes: pendiente en el centro, con el signo que tenía
        const e = 0.6, sh = Math.sin(s.heading), ch = Math.cos(s.heading);
        const g = (track.heightAt(x + sh * e, z + ch * e, i) - track.heightAt(x - sh * e, z - ch * e, i)) / (2 * e);
        vis.rotation.set(clamp(Math.atan(g), -0.3, 0.3), 0, 0); vis.position.y = 0;
      } else { vis.rotation.set(p.cabeceo, 0, p.rolido); vis.position.y = p.apoyo; }
      raiz.updateMatrixWorld(true);
      for (const [nombre, q] of Object.entries(PUNTOS)) {
        v.set(q[0], q[1], q[2]).applyMatrix4(vis.matrixWorld);
        const piso = track.heightAt(v.x, v.z, i), limite = nombre.startsWith('rueda') ? 0 : 0; // la trompa y la cola no deben tocar el piso
        const hundido = piso + limite - v.y;
        if (nombre.startsWith('rueda')) { suma += Math.abs(hundido); n++; }
        if (hundido > peor.hundido) peor = { hundido, nombre, i, sector: track.sector(i), pendiente: s.slope };
      }
    }
  }
  return { peor, media: suma / n };
}

if (process.argv[1] && process.argv[1].endsWith('apoyo.mjs')) {
  for (const id of Object.keys(CIRCUITS)) {
    const track = new Track(id);
    for (const modo of ['viejo', 'nuevo']) {
      const r = medir(track, modo);
      console.log(`${id.padEnd(11)} ${modo}: ruedas a ${(r.media * 100).toFixed(1)} cm del piso en promedio · lo peor: ${r.peor.nombre || 'nada'} ${(r.peor.hundido * 100).toFixed(0)} cm bajo el piso${r.peor.sector ? ` en ${r.peor.sector} (pendiente ${(r.peor.pendiente * 100).toFixed(0)} %)` : ''}`);
    }
  }
}
