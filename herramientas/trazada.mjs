// La trazada de carrera de cada pista: cuánto se abre, radio mínimo contra el del eje y tiempo de cálculo.
// Uso: node herramientas/trazada.mjs
import { Track, CIRCUITS } from '../js/track.js';
import { buildRacingLine } from '../js/ai.js';
for (const id of Object.keys(CIRCUITS)) for (const inversa of [false, true]) {
  if (inversa && CIRCUITS[id].closed === false) continue;
  const track = new Track(id, { reverse: inversa });
  const t0 = performance.now(), line = buildRacingLine(track), ms = performance.now() - t0;
  let max = 0, kEje = 0, kLinea = 0, borde = 0;
  for (let i = 0; i < track.n; i++) { max = Math.max(max, Math.abs(line[i])); kEje = Math.max(kEje, Math.abs(track.samples[i].curvS)); kLinea = Math.max(kLinea, Math.abs(line.curv[i])); if (Math.abs(line[i]) > track.hw - 1.2) borde++; }
  // velocidad media posible con 0,5 g de agarre lateral, por el eje y por la trazada (sin contar frenadas)
  const vel = (k) => Math.min(30, Math.sqrt(0.5 * 9.81 / (Math.abs(k) + 1e-4)));
  let tEje = 0, tLinea = 0; for (let i = 0; i < track.n; i++) { tEje += 1 / vel(track.samples[i].curvS); tLinea += 1 / vel(line.curv[i]); }
  console.log(`${id.padEnd(11)}${inversa ? 'inv' : '   '} corrimiento máximo ${max.toFixed(2)} m · al borde ${(100 * borde / track.n).toFixed(0)} % · radio mínimo eje ${(1 / kEje).toFixed(1)} m, trazada ${(1 / kLinea).toFixed(1)} m · vuelta ideal sin frenar ${tEje.toFixed(1)} → ${tLinea.toFixed(1)} s · cálculo ${ms.toFixed(0)} ms`);
}
