// Batería de pruebas del juego, sin navegador. Uso: npm test   (o: node pruebas/todos.mjs [filtro])
//
// Corre la física, los pilotos y la carrera completa con las mismas piezas que usa el juego; lo único
// simulado es lo que depende del navegador (lienzos, sonido, pantalla). Termina con código 1 si algo falla.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// ---------- lo mínimo del navegador que piden los módulos al cargarse ----------
// Un lienzo que acepta cualquier llamada de dibujo y no hace nada
const lienzo = () => {
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k]
      : k === 'measureText' ? () => ({ width: 10 })
        : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} })
          : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener() {} };
};
const almacen = new Map();
globalThis.document = { createElement: lienzo, createElementNS: lienzo, getElementById: () => null, fonts: null };
globalThis.localStorage = { getItem: (k) => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
globalThis.location = { search: '?auto' }; // el auto del jugador maneja solo

const { Track, CIRCUITS } = await import('../js/track.js');
const { createCar, stepCar, collideCars, collideBarrier, calidadLargada } = await import('../js/physics.js');
const { AIDriver, buildRacingLine } = await import('../js/ai.js');
const { CAR, LARGADA, DRIVER_NAMES, SURFACES } = await import('../js/config.js');
const { Championship, ROUNDS, POINTS, PRIZES, UPGRADES, makeRoster } = await import('../js/championship.js');
const { Replay, STRIDE } = await import('../js/replay.js');
const { computeStageTimes } = await import('../js/stage.js');
const { t, setIdioma } = await import('../js/idioma.js');
const { Race } = await import('../js/race.js');
const { createCarVisual, disposeCarVisual, detachParts } = await import('../js/car.js');
const { Calidad, ESCALA_MINIMA } = await import('../js/calidad.js');
const THREE = await import('three');

// ---------- arnés ----------
const filtro = process.argv[2] || '';
let fallas = 0, hechas = 0;
const grupos = [];
const grupo = (nombre, f) => grupos.push([nombre, f]);
function comprobar(que, bien, detalle = '') {
  hechas++; if (!bien) fallas++;
  console.log(`  ${bien ? 'BIEN' : 'MAL '}  ${que}${detalle !== '' ? `  (${detalle})` : ''}`);
}
const entre = (v, a, b) => v >= a && v <= b;
const sano = (c) => [c.x, c.z, c.y, c.vx, c.vz, c.heading, c.yawRate, c.rpm, c.speed].every(Number.isFinite);
const pistas = {};
const pista = (id) => pistas[id] || (pistas[id] = new Track(id));
const DT = 1 / 120;
const pie = (acel, freno = 0, volante = 0, mano = false) => ({ steer: volante, throttle: acel, brake: freno, handbrake: mano });
function autoEnGrilla(track, i = 0) {
  const slot = track.gridSlot(i), c = createCar(i, slot.x, slot.z, slot.heading);
  c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = false; return c;
}

// ---------- física ----------
grupo('Física del auto', () => {
  const track = pista('ovalo');
  let c = autoEnGrilla(track);
  c.frozen = true; for (let i = 0; i < 240; i++) stepCar(c, track, DT, pie(1));
  const s0 = track.gridSlot(0);
  comprobar('en la grilla no se mueve aunque acelere', Math.hypot(c.x - s0.x, c.z - s0.z) < 0.01 && c.rpm > 3000, `${c.rpm.toFixed(0)} vueltas`);

  // acelerada en recta: de 0 a 60 km/h y velocidad a los 12 s
  c = autoEnGrilla(track); let tt = 0, t60 = null, tope = 0, marcha = 0;
  while (tt < 12) { stepCar(c, track, DT, pie(1)); tt += DT; if (t60 == null && c.speed * 3.6 >= 60) t60 = tt; tope = Math.max(tope, c.speed * 3.6); marcha = Math.max(marcha, c.gear); }
  comprobar('acelera de 0 a 60 km/h en un tiempo razonable', t60 != null && entre(t60, 2.5, 6), `${t60 && t60.toFixed(2)} s`);
  comprobar('velocidad máxima en la recta', entre(tope, 85, 135), `${tope.toFixed(0)} km/h`);
  comprobar('pasa los cambios', marcha >= 2, `marcha ${marcha + 1}`);

  // frenada desde 80 km/h
  c = autoEnGrilla(track); tt = 0; while (c.speed * 3.6 < 80 && tt < 15) { stepCar(c, track, DT, pie(1)); tt += DT; }
  const x0 = c.x, z0 = c.z; tt = 0; while (c.speed > 0.3 && tt < 10) { stepCar(c, track, DT, pie(0, 1)); tt += DT; }
  const dist = Math.hypot(c.x - x0, c.z - z0);
  comprobar('frena de 80 km/h a cero', entre(dist, 20, 60), `${dist.toFixed(1)} m en ${tt.toFixed(1)} s`);

  // marcha atrás: freno sostenido con el auto parado
  for (let i = 0; i < 240; i++) stepCar(c, track, DT, pie(0, 1));
  comprobar('el freno sostenido con el auto parado pone marcha atrás', c.reverse && c.speed < -0.5, `${(c.speed * 3.6).toFixed(0)} km/h`);
  for (let i = 0; i < 360; i++) stepCar(c, track, DT, pie(1));
  comprobar('acelerando vuelve a ir para adelante', !c.reverse && c.speed > 1);

  // entradas brutas durante un minuto: nada de valores rotos, y el auto no se escapa del mapa
  c = autoEnGrilla(pista('polvaredas')); const tp = pista('polvaredas'); const near = [], ev = [];
  let semilla = 12345; const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
  let entrada = pie(1), roto = false, lejos = 0;
  for (let k = 0; k < 120 * 60; k++) {
    if (k % 40 === 0) entrada = pie(azar() < 0.8 ? 1 : 0, azar() < 0.15 ? 1 : 0, Math.round(azar() * 2 - 1), azar() < 0.1);
    stepCar(c, tp, DT, entrada);
    tp.barriersNear(c.x, c.z, near); for (const b of near) collideBarrier(c, b, ev); ev.length = 0;
    if (!sano(c)) { roto = true; break; }
    lejos = Math.max(lejos, tp.nearest(c.x, c.z, c.trackIdx).dist);
  }
  comprobar('un minuto de volantazos al azar no rompe la física', !roto);
  comprobar('el alambrado no deja escapar al auto', lejos < tp.fenceD + 3, `máximo ${lejos.toFixed(1)} m del eje, cerco a ${tp.fenceD}`);

  // choque de frente entre dos autos: se separan, se frenan y queda registrado
  const a = createCar(0, 0, 0, 0), b = createCar(1, 0, 6, Math.PI); a.frozen = b.frozen = false;
  a.vz = 12; b.vz = -12; const golpes = [];
  for (let k = 0; k < 60; k++) { a.x += a.vx * DT; a.z += a.vz * DT; b.x += b.vx * DT; b.z += b.vz * DT; collideCars(a, b, golpes); }
  comprobar('dos autos de frente chocan y rebotan', golpes.length > 0 && a.vz < 6 && b.vz > -6 && b.z - a.z > 1.4, `fuerza ${golpes[0] && golpes[0].strength.toFixed(1)}`);
});

// ---------- largada ----------
grupo('Largada con técnica', () => {
  const track = pista('polvaredas'), slot = track.gridSlot(0);
  const largar = (revs) => {
    const c = createCar(0, slot.x, slot.z, slot.heading); c.y = track.heightAt(c.x, c.z); c.trackIdx = slot.idx; c.frozen = true;
    const p = revs ? (revs - CAR.idleRpm) / (CAR.redline * 0.97 - CAR.idleRpm) : 0;
    for (let i = 0; i < 360; i++) stepCar(c, track, DT, pie(p));
    c.frozen = false; let tt = 0; const x0 = c.x, z0 = c.z;
    while (Math.hypot(c.x - x0, c.z - z0) < 100 && tt < 20) { stepCar(c, track, DT, pie(1)); tt += DT; }
    return { t: tt, tipo: c.largada ? c.largada.tipo : '-' };
  };
  const nada = largar(0), perfecta = largar((LARGADA.desde + LARGADA.hasta) / 2), pasada = largar(6100);
  comprobar('en la franja la largada sale perfecta', perfecta.tipo === 'perfecta', perfecta.tipo);
  comprobar('la perfecta gana tiempo en 100 m', nada.t - perfecta.t > 0.15, `${(perfecta.t - nada.t).toFixed(2)} s`);
  comprobar('pasado de vueltas patina y pierde', pasada.tipo === 'patinada' && pasada.t > nada.t, `${(pasada.t - nada.t >= 0 ? '+' : '')}${(pasada.t - nada.t).toFixed(2)} s`);
  comprobar('sin acelerar es la largada de siempre', nada.tipo === 'normal');
  comprobar('la calidad baja de forma continua fuera de la franja', calidadLargada(LARGADA.desde - 1).calidad > 0.99 && calidadLargada(LARGADA.desde - LARGADA.borde / 2).calidad < 0.6);
});

// ---------- pilotos rivales: carrera de 20 en cada pista, con el auto que les da el juego ----------
function carreraIA(id, { inversa = false, dif = 1, segundos = 200 } = {}) {
  const track = new Track(id, { reverse: inversa }), line = buildRacingLine(track), L = track.length;
  const dd = dif - 1, emp = track.def.aiBoost || 1, cars = [];
  for (let i = 0; i < 20; i++) {
    const c = autoEnGrilla(track, i);
    c.tune = { torque: (1 + dd * 0.9) * emp, grip: (1.02 + dd * 0.9) * emp, brake: (1 + dd * 0.5) * emp };
    const d = DRIVER_NAMES[i];
    cars.push({ s: c, ai: new AIDriver(c, track, line, { skill: d[1], aggression: d[2], seed: 100 + i, difficulty: dif, tune: c.tune }), ultimo: 0, vueltas: [], tv: 0, fuera: 0, parado: 0 });
  }
  const estados = cars.map((c) => c.s), ev = [], near = [];
  let tt = 0, roto = false;
  for (let k = 0; k < Math.round(segundos / DT) && !roto; k++) {
    tt += DT;
    if (k % 2 === 0) for (const c of cars) c.entrada = c.ai.update(DT * 2, estados, tt, 0);
    for (const c of cars) stepCar(c.s, track, DT, c.entrada);
    for (let i = 0; i < 20; i++) { const a = cars[i].s; for (let j = i + 1; j < 20; j++) collideCars(a, cars[j].s, ev); track.barriersNear(a.x, a.z, near); for (const b of near) collideBarrier(a, b, ev); }
    ev.length = 0;
    for (const c of cars) {
      const s = c.s; c.tv += DT;
      if (!sano(s)) { roto = true; break; }
      if (s.progress > L * 0.4 && s.progress < L * 0.6) s.halfPassed = true;
      if (c.ultimo > L * 0.85 && s.progress < L * 0.15 && s.halfPassed) { s.halfPassed = false; if (tt > 2) c.vueltas.push(c.tv); c.tv = 0; }
      c.ultimo = s.progress;
      if (tt > 15 && (s.surface === 'grass' || s.surface === 'ditch')) c.fuera += DT;
      if (tt > 5 && Math.abs(s.speed) < 1) c.parado += DT;
    }
  }
  const total = cars.reduce((a, c) => a + c.vueltas.length, 0);
  const mejores = cars.filter((c) => c.vueltas.length).map((c) => Math.min(...c.vueltas));
  return {
    roto, total, menos: Math.min(...cars.map((c) => c.vueltas.length)),
    fuera: cars.reduce((a, c) => a + c.fuera, 0), parado: cars.reduce((a, c) => a + c.parado, 0), peorParado: Math.max(...cars.map((c) => c.parado)),
    reposiciones: cars.reduce((a, c) => a + c.ai.resets, 0), mejor: Math.min(...mejores), media: mejores.reduce((a, b) => a + b, 0) / mejores.length,
  };
}
grupo('Rivales: 20 autos en cada pista', () => {
  // [pista, inversa, dificultad, vueltas mínimas de cada auto en 200 s, mejor vuelta esperada]
  const casos = [['polvaredas', false, 1, 2, [54, 60]], ['polvaredas', true, 1, 2, [54, 60]], ['polvaredas', false, 1.14, 2, [51.5, 57]], ['polvaredas', false, 0.9, 2, [61, 68]],
    ['ovalo', false, 1, 4, [35, 39]], ['ovalo', true, 1, 4, [35, 39]], ['ovalo', false, 0.9, 4, [39.5, 43.5]]];
  for (const [id, inversa, dif, minimo, rango] of casos) {
    const r = carreraIA(id, { inversa, dif });
    const nombre = `${id}${inversa ? ' al revés' : ''}, dificultad ${dif}`;
    comprobar(`${nombre}: todos dan sus vueltas`, !r.roto && r.menos >= minimo, `mínimo ${r.menos}, total ${r.total}`);
    // Con el rumbo mal mezclado (el salto de 180° a -180°) acá se iban a la zanja más de un segundo por vuelta
    comprobar(`${nombre}: no se van al pasto`, r.fuera / Math.max(1, r.total) < 0.25, `${(r.fuera / Math.max(1, r.total)).toFixed(2)} s por vuelta`);
    comprobar(`${nombre}: nadie queda trabado`, r.reposiciones === 0 && r.peorParado < 8, `peor ${r.peorParado.toFixed(1)} s parado, ${r.reposiciones} reposiciones`);
    comprobar(`${nombre}: ritmo esperado`, entre(r.mejor, rango[0], rango[1]), `mejor ${r.mejor.toFixed(1)} s, media ${r.media.toFixed(1)} s`);
  }
});

grupo('Tramo de rally: los rivales corren aparte', async () => {
  const track = pista('cerro'), roster = makeRoster({ name: 'Vos', number: 7, color: '#fff', roofColor: '#fff', accessory: 'none', stripes: true });
  const tiempos = await computeStageTimes(track, roster, 1);
  const v = Object.values(tiempos);
  comprobar('los 19 rivales terminan el tramo', v.length === 19 && v.every((x) => Number.isFinite(x) && x < 230), `de ${Math.min(...v).toFixed(1)} a ${Math.max(...v).toFixed(1)} s`);
  comprobar('los tiempos no son todos iguales', Math.max(...v) - Math.min(...v) > 2);
});

// ---------- la trazada de carrera ----------
grupo('Trazada de los rivales', () => {
  for (const [id, inversa] of [['polvaredas', false], ['polvaredas', true], ['ovalo', false], ['cerro', false]]) {
    const tr = new Track(id, { reverse: inversa }), t0 = Date.now(), line = buildRacingLine(tr), ms = Date.now() - t0;
    const nombre = `${id}${inversa ? ' al revés' : ''}`, margen = tr.hw - 1.15;
    let max = 0, kEje = 0, kLinea = 0, salto = 0, usa = 0;
    for (let i = 0; i < tr.n; i++) {
      max = Math.max(max, Math.abs(line[i])); kEje += tr.samples[i].curvS ** 2; kLinea += line.curv[i] ** 2;
      if (i) salto = Math.max(salto, Math.abs(line[i] - line[i - 1]));
      if (Math.abs(line[i]) > 3) usa++;
    }
    comprobar(`${nombre}: no se sale del ripio`, max <= margen + 1e-3 && line.length === tr.n && line.curv.length === tr.n, `hasta ${max.toFixed(2)} m del eje, margen ${margen.toFixed(2)}`);
    comprobar(`${nombre}: es continua`, salto < 0.35 && [...line.curv].every(Number.isFinite), `salto máximo ${salto.toFixed(2)} m por metro`);
    // la razón de ser: menos curvatura que ir por el medio, usando el ancho
    comprobar(`${nombre}: dobla menos que el eje usando el ancho`, kLinea < kEje * (id === 'ovalo' ? 1 : 0.93) && usa > tr.n * 0.15, `curvatura cuadrática ${(100 * kLinea / kEje).toFixed(0)} % de la del eje, ${(100 * usa / tr.n).toFixed(0)} % del recorrido a más de 3 m`);
    comprobar(`${nombre}: se calcula rápido`, ms < 4000, `${ms} ms`);
    if (!tr.closed) comprobar(`${nombre}: sale y llega por el eje`, Math.abs(line[0]) < 0.05 && Math.abs(line[tr.n - 1]) < 0.05);
  }
});

// ---------- carrera completa con el gestor del juego ----------
function armarCarrera(ronda, extra = {}) {
  const track = new Track(ronda.track);
  const roster = makeRoster({ name: 'Vos', number: 7, color: '#8fd3e8', roofColor: '#f2e6c9', accessory: 'rack', stripes: true });
  const champ = new Championship(roster); champ.persist = false; champ.pickRival();
  const avisos = [], carteles = [];
  const mudo = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
  const burlas = [];
  const ui = new Proxy({ toast: (x) => avisos.push(x), banner: (x) => carteles.push(x), taunt: (quien, x) => burlas.push(x) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const world = { setTimeOfDay() {}, setStartLights() {}, raiseFlag() {}, night: false, foggy: false, grandstandPos: null, cheerLevel: 0 };
  const race = new Race({
    scene: new THREE.Scene(), track, world, audio: mudo, particles: { emit() {} }, debris: { spawn() {}, clear() {} }, ui,
    settings: { difficulty: 1 }, roster, round: ronda, gridOrder: champ.gridOrder(), champ,
    chase: { cam: { position: new THREE.Vector3(0, 50, 0) }, shake() {}, init: true }, stageTimes: extra.stageTimes || {},
  });
  return { race, avisos, carteles, burlas, champ, track };
}
grupo('Carrera completa (grilla, vueltas, llegada, resultados)', () => {
  const { race, avisos, carteles, burlas } = armarCarrera({ ...ROUNDS[1], laps: 2 }); // el óvalo, que es corto
  let resultados = null; race.onComplete = (r) => { resultados = r; };
  comprobar('arma los 20 autos con su piloto', race.cars.length === 20 && race.cars.filter((c) => c.isPlayer).length === 1 && race.cars.every((c) => c.isPlayer || c.ai));
  race.begin();
  const entrada = pie(0); let fases = new Set(), roto = false, movidoEnPrevia = 0;
  const p0 = { x: race.player.state.x, z: race.player.state.z };
  for (let k = 0; k < 60 * 400 && !resultados; k++) {
    race.update(1 / 60, entrada); fases.add(race.phase);
    if (race.phase === 'countdown') movidoEnPrevia = Math.max(movidoEnPrevia, Math.hypot(race.player.state.x - p0.x, race.player.state.z - p0.z));
    if (race.cars.some((c) => !sano(c.state))) { roto = true; break; }
  }
  const yo = race.player.state;
  comprobar('pasa por cuenta regresiva, carrera y llegada', fases.has('countdown') && fases.has('racing') && fases.has('finished'), [...fases].join(' → '));
  comprobar('nadie se mueve antes del verde', movidoEnPrevia < 0.05, `${movidoEnPrevia.toFixed(3)} m`);
  comprobar('ningún valor roto en toda la carrera', !roto);
  comprobar('el jugador completa sus vueltas', yo.finished && yo.lap === 2 && yo.lapTimes.length === 2, `vueltas ${yo.lapTimes.map((x) => x.toFixed(1)).join(' / ')}`);
  comprobar('las vueltas suman el tiempo de carrera', Math.abs(yo.lapTimes.reduce((a, b) => a + b, 0) - yo.finishTime) < 0.1);
  comprobar('entrega 20 resultados ordenados por tiempo', !!resultados && resultados.length === 20 && resultados.every((r, i) => r.position === i + 1 && (i === 0 || r.time >= resultados[i - 1].time)));
  comprobar('el jugador figura una sola vez', !!resultados && resultados.filter((r) => r.isPlayer).length === 1);
  comprobar('los que no llegaron quedan detrás de los que llegaron', !!resultados && (() => { const f = resultados.findIndex((r) => !r.finished); return f < 0 || resultados.slice(f).every((r) => !r.finished); })());
  comprobar('graba la repetición', race.replay.frames.length > 400 && race.replay.frames[0].length === 20 * STRIDE, `${race.replay.frames.length} cuadros`);
  comprobar('guarda el récord de la pista', !!JSON.parse(localStorage.getItem('coparipio.records') || '{}')['ovalo|nor|race']);
  comprobar('avisa la largada y la última vuelta', avisos.length > 0 && carteles.some((x) => /LTIMA VUELTA|LAST LAP/.test(x)), `${avisos.length} avisos, ${carteles.length} carteles`);
  // las burlas del rival, en inglés: todas traducidas y con el nombre del jugador puesto
  setIdioma('en'); burlas.length = 0;
  for (const tipo of ['start', 'passedYou', 'youPassed', 'lastLap', 'finishAhead', 'finishBehind', 'crash']) for (let k = 0; k < 12; k++) race.taunt(tipo);
  setIdioma('es');
  comprobar('las burlas del rival salen traducidas y con el nombre', burlas.length === 84 && burlas.every((x) => !/[¡¿ñáéíóú]|\{p\}/.test(x)) && burlas.some((x) => x.includes('Vos')), burlas.find((x) => /[¡¿ñáéíóú]|\{p\}/.test(x)) || '');
  // el orden en pista coincide con la distancia recorrida
  const orden = race.finalOrder();
  comprobar('las posiciones siguen a la distancia recorrida', orden.every((c, i) => i === 0 || c.state.finished || orden[i - 1].state.finished || orden[i - 1].state.raceDist >= c.state.raceDist));
  race.dispose();
});
// ---------- el auto apoyado en las pendientes ----------
grupo('El auto no se hunde en los desniveles', () => {
  const { race, track } = armarCarrera({ ...ROUNDS[0], laps: 1 });
  const auto = race.player, s = auto.state, v = auto.vis, p = new THREE.Vector3();
  // dónde tocan el piso las ruedas, y la trompa y la cola a la altura del zócalo (x a la izquierda, z adelante)
  const ruedas = [[0.64, 0, 1.0], [-0.64, 0, 1.0], [0.64, 0, -1.0], [-0.64, 0, -1.0]], puntas = [[0, 0.36, 1.6], [0, 0.36, -1.6]];
  const colocar = (i, lat = 0) => {
    const q = track.samples[i];
    s.x = q.x + q.nx * lat; s.z = q.z + q.nz * lat; s.heading = q.heading; s.trackIdx = i; s.y = track.heightAt(s.x, s.z, i);
    s.airborne = false; s.speed = 0; s.accFwd = 0; s.accLat = 0; s.vy = 0;
    auto.pisoP = null; auto.dinP = 0; auto.dinR = 0;
    race.syncVisuals(0.016); v.root.updateMatrixWorld(true);
    let ruedaPeor = 0, puntaPeor = -9;
    for (const r of ruedas) { p.set(r[0], r[1], r[2]).applyMatrix4(v.vis.matrixWorld); ruedaPeor = Math.max(ruedaPeor, Math.abs(p.y - track.heightAt(p.x, p.z, i))); }
    for (const r of puntas) { p.set(r[0], r[1], r[2]).applyMatrix4(v.vis.matrixWorld); puntaPeor = Math.max(puntaPeor, track.heightAt(p.x, p.z, i) - p.y); }
    return { ruedaPeor, puntaPeor, cabeceo: v.vis.rotation.x };
  };
  let subida = 0, bajada = 0; track.samples.forEach((q, i) => { if (q.slope > track.samples[subida].slope) subida = i; if (q.slope < track.samples[bajada].slope) bajada = i; });
  const enSubida = colocar(subida), enBajada = colocar(bajada);
  // rotation.x positivo baja la trompa: en subida tiene que ser negativo
  comprobar('en la subida más fuerte levanta la trompa', enSubida.cabeceo < -0.1 && enSubida.puntaPeor < 0, `pendiente ${(track.samples[subida].slope * 100).toFixed(0)} %, cabeceo ${enSubida.cabeceo.toFixed(2)}, trompa y cola a ${(-enSubida.puntaPeor * 100).toFixed(0)} cm del piso`);
  comprobar('en la bajada más fuerte la baja', enBajada.cabeceo > 0.1 && enBajada.puntaPeor < 0, `pendiente ${(track.samples[bajada].slope * 100).toFixed(0)} %, cabeceo ${enBajada.cabeceo.toFixed(2)}, trompa y cola a ${(-enBajada.puntaPeor * 100).toFixed(0)} cm del piso`);
  let rueda = 0, punta = -9, donde = 0;
  for (let i = 0; i < track.n; i += 2) for (const lat of [-4, 0, 4]) { const r = colocar(i, lat); rueda = Math.max(rueda, r.ruedaPeor); if (r.puntaPeor > punta) { punta = r.puntaPeor; donde = i; } }
  comprobar('en toda la pista las ruedas van sobre el piso', rueda < 0.06, `la más separada, ${(rueda * 100).toFixed(1)} cm`);
  comprobar('y ni la trompa ni la cola lo tocan', punta < 0, `lo más cerca, ${(-punta * 100).toFixed(0)} cm en ${track.sector(donde)}`);
  s.airborne = true; s.vy = 4; for (let k = 0; k < 60; k++) race.syncVisuals(0.016);
  comprobar('en el aire, subiendo, levanta la trompa', v.vis.rotation.x < -0.1, v.vis.rotation.x.toFixed(2));
  race.dispose();
});
grupo('Contrarreloj del cerro', async () => {
  const stageTimes = { 'Tito Carrasco': 95, 'Kiko Aravena': 130 };
  const { race } = armarCarrera(ROUNDS.find((r) => r.mode === 'timetrial'), { stageTimes });
  let resultados = null; race.onComplete = (r) => { resultados = r; };
  comprobar('corre un solo auto', race.cars.length === 1 && race.cars[0].isPlayer);
  race.begin();
  for (let k = 0; k < 60 * 300 && !resultados; k++) race.update(1 / 60, pie(0));
  const yo = race.player.state;
  comprobar('llega a la meta del tramo', yo.finished && entre(yo.finishTime, 60, 200), `${yo.finishTime && yo.finishTime.toFixed(1)} s`);
  comprobar('los resultados mezclan su tiempo con los de los rivales', !!resultados && resultados.length === 20 && resultados.every((r, i) => i === 0 || r.time >= resultados[i - 1].time));
  race.dispose();
});

// ---------- campeonato ----------
grupo('Campeonato', () => {
  const roster = makeRoster({ name: 'Vos', number: 7, color: '#fff', roofColor: '#000', accessory: 'none', stripes: false });
  comprobar('20 pilotos con números distintos', roster.length === 20 && new Set(roster.map((r) => r.number)).size === 20 && new Set(roster.map((r) => r.name)).size === 20);
  const c = new Championship(roster);
  const grilla = c.gridOrder();
  comprobar('la primera grilla tiene a todos una vez, el jugador en el medio', grilla.length === 20 && new Set(grilla).size === 20 && grilla.indexOf('Vos') === 11);
  const rival = c.pickRival();
  comprobar('el primer rival es el piloto más hábil', rival === 'Tito Carrasco', rival);
  // resultado: el jugador tercero, el rival quinto, con la mejor vuelta
  const otros = roster.filter((r) => !r.isPlayer && r.name !== rival).map((r) => r.name);
  const orden = [otros[0], otros[1], 'Vos', otros[2], rival, ...otros.slice(3)];
  const res = orden.map((name, i) => ({ name, position: i + 1, isPlayer: name === 'Vos', bestLap: 60 + i, damage: { front: 0.4, rear: 0, left: 0.2, right: 0 } }));
  const plata = c.money, premio = c.applyResults(res, { bestLapOverall: 'Vos' });
  comprobar('puntos y plata del tercero, con rival y mejor vuelta', premio.pts === POINTS[2] + 5 && premio.money === PRIZES[2] + 500 + 300 && c.money === plata + premio.money, `${premio.pts} pts, $${premio.money}`);
  comprobar('la tabla suma a todos y avanza la fecha', c.round === 1 && c.table.reduce((a, r) => a + r.points, 0) === POINTS.reduce((a, b) => a + b, 0) + 5);
  comprobar('el daño pasa a la fecha siguiente', Math.abs(c.damagePct() - 0.15) < 1e-9);
  const costo = c.repairCost(); c.repair();
  comprobar('reparar todo deja el auto en cero y cobra lo justo', c.damagePct() === 0 && c.money === plata + premio.money - costo, `$${costo}`);
  c.money = 100; c.damage.front = 1; const antes = c.damagePct(); c.repair();
  comprobar('sin plata suficiente repara lo que alcanza', c.money === 0 && c.damagePct() < antes && c.damagePct() > 0);
  c.money = UPGRADES.motor.costs[0]; const pudo = c.buy('motor'), noPudo = c.buy('gomas');
  comprobar('las mejoras se compran sólo si alcanza', pudo && !noPudo && c.tune().torque > 1 && c.tune().grip === 1 && c.money === 0);
  comprobar('la grilla siguiente sale de la tabla', c.gridOrder()[0] === otros[0] && c.gridOrder().length === 20);
  // el jugador quedó segundo (17 + 5 del rival = 22 puntos, contra 25 y 20): el rival pasa a ser el puntero
  comprobar('el rival siguiente es el que está justo arriba en la tabla', c.pickRival() === otros[0] && c.positionOf('Vos') === 2, c.rival);
  // los rivales preparan el auto a medida que avanza el campeonato
  const nuevo = new Championship(roster), final = new Championship(roster); final.round = ROUNDS.length - 1;
  comprobar('los rivales arrancan de fábrica y terminan preparados', nuevo.preparacionRivales() === 0 && final.preparacionRivales() === 1 && c.preparacionRivales() > 0 && c.preparacionRivales() < 0.3, `fecha 2: ${c.preparacionRivales().toFixed(2)}`);
  const rapida = new Championship(roster); rapida.persist = false; rapida.round = 5; rapida.upgrades = { motor: 2, gomas: 1, frenos: 0 };
  comprobar('en carrera rápida acompañan las mejoras del jugador, no la fecha', rapida.preparacionRivales() === 0.5);
  c.save(); const d = Championship.load();
  comprobar('guardar y cargar conserva todo', !!d && d.round === c.round && d.money === c.money && d.upgrades.motor === 1 && d.rival === c.rival && d.table.length === 20 && d.damagePct() === c.damagePct());
  for (let i = c.round; i < ROUNDS.length; i++) c.applyResults(res, {});
  comprobar('después de la última fecha el campeonato termina', c.done && c.round === ROUNDS.length && c.current === ROUNDS[ROUNDS.length - 1]);
  comprobar('todas las fechas usan pistas y horas que existen', ROUNDS.every((r) => CIRCUITS[r.track] && ['morning', 'noon', 'sunset', 'dusk', 'fog', 'storm'].includes(r.tod)));
});

// ---------- repetición ----------
grupo('Repetición', () => {
  const rp = new Replay(2);
  const auto = (x, rumbo) => ({ state: { x, y: 0, z: 0, heading: rumbo, steer: 0, wheelAngle: 0 }, vis: { vis: { rotation: { x: 0, z: 0 } } } });
  let tt = 0;
  for (let k = 0; k < 120; k++) { tt += 1 / 60; rp.record(1 / 60, [auto(tt * 10, 3.1), auto(0, tt < 1 ? 3.1 : -3.1)], tt); }
  comprobar('graba a 20 cuadros por segundo', entre(rp.frames.length, 39, 41), `${rp.frames.length} en 2 s`);
  const f = rp.frameAt((rp.times[10] + rp.times[11]) / 2);
  comprobar('interpola la posición entre dos cuadros', Math.abs(f[0] - (rp.frames[10][0] + rp.frames[11][0]) / 2) < 1e-4);
  // el rumbo que salta de 3,1 a -3,1 tiene que ir por el camino corto, sin pasar por cero
  const salto = rp.times.findIndex((_, i) => i > 0 && rp.frames[i][STRIDE + 3] < 0);
  const g = rp.frameAt((rp.times[salto - 1] + rp.times[salto]) / 2);
  comprobar('el rumbo cruza de 180° a -180° por el camino corto', Math.abs(Math.abs(g[STRIDE + 3]) - Math.PI) < 0.1, g[STRIDE + 3].toFixed(2));
  rp.addEvent(1, 0, 0, 5, false); rp.addEvent(1.5, 0, 0, 3, true);
  comprobar('el mejor momento prioriza los golpes del jugador', rp.bestMoment().time === 1.5);
});

// ---------- resolución automática ----------
grupo('Resolución automática', () => {
  // Una máquina de mentira: `placa` es cuántos cuadros da a resolución completa cuando lo que frena son los
  // píxeles (rinde más al achicar), y `tope` cuántos da como mucho por el procesador (no cambia con la escala).
  const maquina = (placa, tope = 60) => {
    const m = { placa, tope, cambios: [] };
    m.c = new Calidad((e) => m.cambios.push(e));
    m.cps = () => Math.min(m.tope, 60, m.placa / (m.c.escala * m.c.escala));
    m.correr = (segundos, cuenta = true) => { let t = 0; while (t < segundos) { const dt = 1 / m.cps(); m.c.cuadro(dt, cuenta); t += dt; } };
    return m;
  };
  let m = maquina(80); m.correr(60);
  comprobar('a 60 cuadros por segundo no toca nada', m.cambios.length === 0 && m.c.escala === 1);
  m = maquina(50); m.correr(60);
  comprobar('entre 45 y 57 tampoco', m.cambios.length === 0);
  // placa floja: 30 cuadros a resolución completa. Baja hasta pasar los 45 y ahí se queda.
  m = maquina(30); m.correr(4.3);
  comprobar('con la placa exigida baja un escalón cada dos segundos', m.cambios.length === 2 && Math.abs(m.c.escala - 0.87 * 0.87) < 1e-6, `escala ${m.c.escala.toFixed(3)}, ${m.cps().toFixed(0)} cuadros`);
  m.correr(60);
  comprobar('y se queda donde alcanza los 45', m.cps() >= 45 && m.c.escala > ESCALA_MINIMA && m.cambios.length <= 4, `escala ${m.c.escala.toFixed(2)}, ${m.cps().toFixed(0)} cuadros, ${m.cambios.length} cambios`);
  m = maquina(30); m.c.cuadro(1 / 30); for (let k = 0; k < 40; k++) { m.c.cuadro(0.6); m.correr(1.9); }
  comprobar('un tirón aislado reinicia la cuenta', m.cambios.length === 0);
  m.correr(60, false);
  comprobar('en el menú o con la pestaña oculta no mide', m.cambios.length === 0);
  m = maquina(10); m.correr(120);
  comprobar('nunca baja del mínimo', Math.abs(m.c.escala - ESCALA_MINIMA) < 1e-6 && Math.min(...m.cambios) >= ESCALA_MINIMA - 1e-6, m.c.escala.toFixed(2));
  // procesador frenado (notebook a batería): 29 cuadros con cualquier resolución
  m = maquina(200, 29); m.correr(60);
  comprobar('si bajar no da más cuadros, vuelve a la resolución completa y no insiste', m.c.escala === 1 && m.cambios.length === 2 && m.c.noSirve, `cambios: ${m.cambios.map((x) => x.toFixed(2)).join(' → ')}`);
  // mitad y mitad: la primera bajada sirve, la segunda ya no
  m = maquina(36, 44); m.correr(60);
  comprobar('conserva las bajadas que sirvieron y deshace la que no', Math.abs(m.c.escala - 0.87) < 1e-6, `cambios: ${m.cambios.map((x) => x.toFixed(2)).join(' → ')}`);
  // la máquina se recupera (se enchufa): vuelve a subir de a poco, y no antes de doce segundos buenos
  m = maquina(30); m.correr(30); const baja = m.c.escala, n = m.cambios.length; m.placa = 200;
  m.correr(11);
  comprobar('no sube antes de doce segundos buenos', m.cambios.length === n);
  m.correr(3);
  comprobar('después sube de a poco', m.cambios.length === n + 1 && Math.abs(m.c.escala - Math.min(1, baja * 1.1)) < 1e-6, m.c.escala.toFixed(3));
  m.correr(120);
  comprobar('y llega a la resolución completa', m.c.escala === 1);
  // la subida no aguanta: vuelve al nivel anterior, lo deja como techo y no insiste
  m = maquina(30); m.correr(30); const estable = m.c.escala; m.placa = 200; m.correr(13.5); // sube un escalón
  m.placa = 25; m.correr(5);                                                                 // y ahí no alcanza
  comprobar('si una subida no aguanta, ese nivel queda como techo', Math.abs(m.c.techo - estable) < 1e-6 && m.c.escala <= estable + 1e-6, `escala ${m.c.escala.toFixed(2)}, techo ${m.c.techo.toFixed(2)}`);
  m.placa = 30; m.correr(60); const k = m.cambios.length; m.placa = 200; m.correr(180);
  comprobar('y no vuelve a pasarlo aunque sobren cuadros: la imagen no va y viene', m.cambios.length === k && Math.abs(m.c.escala - estable) < 1e-6, `escala ${m.c.escala.toFixed(2)}`);
  m.c.fijar(0.8); m.c.fijar(1);
  comprobar('se puede fijar a mano (al apagar la opción)', m.c.escala === 1);
});

// ---------- el modelo del auto: cuántas llamadas de dibujo cuesta ----------
grupo('Modelo del auto', () => {
  for (const accessory of ['none', 'rack', 'lights', 'spoiler', 'antenna']) {
    const cv = createCarVisual({ color: '#d94a3a', roofColor: '#f2e6c9', number: 7, accessory, stripes: true, helmetColor: '#e2a33b', seed: 3 });
    let mallas = 0, sombra = 0, lejos = 0, tris = 0;
    cv.root.traverse((o) => { if (o.isMesh) { mallas++; if (o.castShadow) sombra++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    for (const m of cv.lod) m.visible = false;
    cv.root.traverseVisible((o) => { if (o.isMesh) lejos++; });
    // Cada malla es una llamada de dibujo por auto y por cuadro, y hay veinte autos. Antes de fusionar ruedas,
    // guardabarros y accesorios eran entre 58 y 65 mallas, con 18 a 25 en la pasada de sombras.
    comprobar(`accesorio ${accessory}: pocas mallas`, mallas <= 44 && lejos <= 24 && sombra <= 12, `${mallas} de cerca, ${lejos} de lejos, ${sombra} con sombra, ${Math.round(tris)} triángulos`);
    comprobar(`accesorio ${accessory}: cuatro ruedas que giran y dos faros`, cv.wheels.length === 4 && cv.wheels.filter((w) => w.steer).length === 2 && cv.headlights.length === 2 && cv.taillights.length === 2);
    const sueltas = detachParts(cv, { front: 1, rear: 1, left: 1, right: 1 });
    comprobar(`accesorio ${accessory}: las piezas se desprenden con el daño`, sueltas.length >= 4 && sueltas.every((p) => p.mesh && !p.mesh.parent), `${sueltas.length} piezas`);
    disposeCarVisual(cv);
  }
});

// ---------- pistas ----------
grupo('Pistas', () => {
  for (const id of Object.keys(CIRCUITS)) {
    const tr = pista(id);
    const saltoMax = Math.max(...tr.samples.map((s, i) => (i ? Math.hypot(s.x - tr.samples[i - 1].x, s.z - tr.samples[i - 1].z) : 0)));
    comprobar(`${id}: muestras parejas cada metro`, entre(saltoMax, 0.9, 1.1) && tr.samples.every((s) => Number.isFinite(s.curvS) && Number.isFinite(s.y)), `${tr.n} muestras, ${tr.length.toFixed(0)} m`);
    const nombres = new Set(tr.samples.map((_, i) => tr.sector(i)));
    comprobar(`${id}: todos los sectores aparecen`, nombres.size === tr.def.sectors.length, `${nombres.size} de ${tr.def.sectors.length}`);
    // consulta de la muestra más cercana, con y sin pista previa, desde puntos corridos del eje
    let mal = 0;
    for (let i = 0; i < tr.n; i += 7) { const s = tr.samples[i], x = s.x + s.nx * 4, z = s.z + s.nz * 4; const q = tr.nearest(x, z), h = tr.nearest(x, z, i); if (Math.abs(q.dist - 4) > 0.6 || q.idx !== h.idx) mal++; }
    comprobar(`${id}: ubica bien un punto a 4 m del eje`, mal <= 2, `${mal} fallas`);
    const g0 = tr.gridSlot(0), g19 = tr.gridSlot(19);
    comprobar(`${id}: la grilla entra en la pista`, tr.nearest(g0.x, g0.z).dist < tr.hw && tr.nearest(g19.x, g19.z).dist < tr.hw);
    comprobar(`${id}: las barreras quedan fuera del ripio`, tr.barriers.every((b) => tr.nearest(b.x, b.z).dist > tr.hw), `${tr.barriers.length} barreras`);
  }
  const inv = new Track('polvaredas', { reverse: true });
  comprobar('el sentido inverso conserva el largo y la meta', Math.abs(inv.length - pista('polvaredas').length) < 1 && Math.hypot(inv.samples[0].x - pista('polvaredas').samples[0].x, inv.samples[0].z - pista('polvaredas').samples[0].z) < 3);
  comprobar('las superficies tienen menos agarre cuanto más lejos del ripio', SURFACES.gravel.grip > SURFACES.shoulder.grip && SURFACES.shoulder.grip > SURFACES.grass.grip);
});

// ---------- idioma: todo texto que se muestra tiene traducción ----------
grupo('Idioma', () => {
  setIdioma('en');
  // palabras que se escriben igual en los dos idiomas
  const IGUALES = new Set(['Normal', 'km/h', 'Formula 600', 'FORMULA 600', 'Español', 'English', 'S1', 'S2', 'OK', 'Rival', 'rival', 'Motor', 'FIAT', 'CRONO', 'Pts', 'Pos', 'Esc', 'WhatsApp', 'ABCD']);
  const falta = new Set();
  const probar = (s) => { const x = String(s).trim(); if (!x || !/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{2}/.test(x) || IGUALES.has(x)) return; if (t(s) === s && t(x) === x) falta.add(x); };
  // 1. textos literales que el código pasa por t(), por los avisos de carrera o por los carteles
  const fuentes = fs.readdirSync(path.join(RAIZ, 'js')).filter((f) => f.endsWith('.js') && f !== 'idioma.js');
  for (const f of fuentes) {
    const src = leer('js/' + f);
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g)) probar(m[1].replace(/\\'/g, "'"));
    for (const m of src.matchAll(/\bt\(\s*[^()'`]*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) { probar(m[1]); probar(m[2]); }
    // avisos de carrera: say(clave, texto, tipo, pausa). Se toman los textos sueltos de cada llamada que llevan
    // espacio, signo o mayúscula; así quedan afuera las claves, los tipos y los nombres de superficie
    for (const m of src.matchAll(/\.say\(\s*'[^']*'\s*,([^;]*);/g)) for (const x of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (/[ ¡A-ZÁÉÍÓÚ]/.test(x[1])) probar(x[1]);
  }
  // 2. datos que se muestran: fechas, mejoras, pistas, sectores, burlas del rival
  for (const r of ROUNDS) { probar(r.name); probar(r.desc); }
  for (const u of Object.values(UPGRADES)) { probar(u.name); probar(u.desc); }
  for (const c of Object.values(CIRCUITS)) { probar(c.name); for (const s of c.sectors) probar(s[1]); }
  const burlas = leer('js/race.js').match(/const TAUNTS = \{([\s\S]*?)\n\};/);
  for (const m of burlas[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) probar(m[1]);
  const motores = leer('js/audio.js').match(/export const ENGINE_PROFILES = \{([\s\S]*?)\n\};/);
  for (const m of motores[1].matchAll(/(?:name|desc): '((?:[^'\\]|\\.)*)'/g)) probar(m[1]);
  // 3. todo el texto de index.html
  const html = leer('index.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/>([^<>]+)</g)) probar(m[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' '));
  for (const m of html.matchAll(/(?:placeholder|title)="([^"]+)"/g)) probar(m[1]);
  comprobar('no queda ningún texto sin traducir al inglés', falta.size === 0, falta.size ? `${falta.size} sin traducir` : '');
  for (const x of falta) console.log(`        falta: ${JSON.stringify(x)}`);
  comprobar('lo que no está en el diccionario vuelve tal cual', t('zzz texto inventado') === 'zzz texto inventado' && t(null) === null);
  setIdioma('es');
  comprobar('en español devuelve el original', t('Ajustes') === 'Ajustes');
});

// ---------- el HTML tiene todo lo que el código busca ----------
grupo('Pantallas', () => {
  const html = leer('index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const pedidos = new Set();
  for (const f of ['main.js', 'ui.js']) for (const m of leer('js/' + f).matchAll(/\$\('([\w-]+)'\)/g)) pedidos.add(m[1]);
  for (const m of leer('js/ui.js').matchAll(/this\.screens = \[([^\]]+)\]/g)) for (const x of m[1].matchAll(/'([\w-]+)'/g)) pedidos.add(x[1]);
  for (const m of (leer('js/main.js') + leer('js/ui.js')).matchAll(/(?:name|number|color|roof|stripes|accessory): '(\w+-[\w-]+)'/g)) pedidos.add(m[1]);
  const faltan = [...pedidos].filter((x) => !ids.has(x));
  comprobar('todos los elementos que usa el código existen en index.html', faltan.length === 0, faltan.length ? faltan.join(', ') : `${pedidos.size} elementos`);
  comprobar('no hay identificadores repetidos', ids.size === [...html.matchAll(/\bid="([^"]+)"/g)].length);
  // los módulos que importa el juego existen (un nombre mal escrito deja la pantalla en blanco)
  const rotos = [];
  for (const f of fs.readdirSync(path.join(RAIZ, 'js'))) for (const m of leer('js/' + f).matchAll(/from '(\.\/[^']+)'/g)) if (!fs.existsSync(path.join(RAIZ, 'js', m[1]))) rotos.push(`${f} → ${m[1]}`);
  comprobar('todos los módulos importados existen', rotos.length === 0, rotos.join(', '));
  const mapa = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  comprobar('el mapa de módulos apunta a archivos que están', Object.values(mapa).every((v) => fs.existsSync(path.join(RAIZ, v))), Object.keys(mapa).join(', '));
});

// ---------- correr ----------
const inicio = Date.now();
for (const [nombre, f] of grupos) {
  if (filtro && !nombre.toLowerCase().includes(filtro.toLowerCase())) continue;
  console.log(`\n${nombre}`);
  try { await f(); } catch (e) { fallas++; console.log(`  MAL   se cortó con un error: ${e.stack || e}`); }
}
console.log(`\n${hechas} comprobaciones, ${fallas} ${fallas === 1 ? 'falla' : 'fallas'}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
process.exit(fallas ? 1 : 0);
