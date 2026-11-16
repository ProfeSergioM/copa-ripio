// Perfil de rendimiento dentro del navegador: cuánto tarda la lógica y cuánto el dibujo, con cuántas
// llamadas y triángulos. Sirve aunque la pestaña esté oculta, porque avanza el juego a mano con app.tick().
// Se usa desde la consola de la página (conviene abrirla con ?auto&mudo):
//
//   const p = await import('/herramientas/perfil.js');
//   await p.carrera(app, 0);          // arranca la fecha 0 del campeonato (no toca el campeonato guardado)
//   await p.avanzar(app, 20);         // 20 segundos de carrera
//   p.medir(app, 90);                 // medianas en milisegundos sobre 90 cuadros
//
// El dibujo se mide leyendo un píxel después de cada cuadro: sin eso el navegador devuelve el control antes
// de que la placa termine y los tiempos salen mentirosos. Esa lectura suma unos 5 ms fijos, así que lo que
// vale son las diferencias entre dos mediciones hechas una atrás de la otra, no el número suelto.
//
// Antes de medir, mirar el plan de energía de la máquina: con batería y el plan silencioso el procesador rinde
// entre tres y cinco veces menos y todos los números cambian (el mismo cuadro pasó de 17 a 55 ms). Con la
// pestaña oculta además los temporizadores van a uno por segundo: la carga tarda mucho más.
const CLAVE = 'coparipio.v2';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function carrera(app, ronda = 0, { ancho = 1280, alto = 720 } = {}) {
  // hay que esperar al menú: si se aprieta el botón durante la carga inicial, las dos cargas se pisan
  for (let k = 0; k < 600 && app.state !== 'menu'; k++) await espera(100);
  const guardado = localStorage.getItem(CLAVE);
  if (app.champ) app.champ.round = ronda;
  document.getElementById('btn-race').click();
  for (let k = 0; k < 600; k++) {
    await espera(100);
    if (app.state === 'race' && app.race && app.race.phase === 'countdown') break;
  }
  if (guardado == null) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, guardado);
  app.renderer.setPixelRatio(1); app.renderer.setSize(ancho, alto, false);
  app.camera.aspect = ancho / alto; app.camera.updateProjectionMatrix(); app.imagen.ajustarTam();
  return { estado: app.state, fase: app.race && app.race.phase, pista: app.track.def.id, hora: app.world.todName, autos: app.race.cars.length };
}

export async function avanzar(app, segundos, paso = 16.7) {
  const n = Math.round(segundos * 1000 / paso);
  for (let i = 0; i < n; i++) { app.tick(paso); if (i % 30 === 29) await espera(0); }
  return { t: +app.race.raceTime.toFixed(1), fase: app.race.phase, pos: app.race.player.position };
}

const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

// congelado: no avanza la simulación (dt = 0), así todos los cuadros dibujan lo mismo y se pueden comparar
export function medir(app, cuadros = 90, { congelado = false } = {}) {
  const r = app.renderer, gl = r.getContext(), px = new Uint8Array(4);
  const dibujarOriginal = app.imagen.dibujar.bind(app.imagen);
  let tDibujo = 0;
  app.imagen.dibujar = () => { const a = performance.now(); dibujarOriginal(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tDibujo = performance.now() - a; };
  r.info.autoReset = false;
  const total = [], dibujo = [], logica = [], llamadas = [], triangulos = [];
  try {
    for (let i = 0; i < cuadros; i++) {
      r.info.reset();
      const a = performance.now();
      app.tick(congelado ? 0 : 16.7);
      const d = performance.now() - a;
      total.push(d); dibujo.push(tDibujo); logica.push(d - tDibujo);
      llamadas.push(r.info.render.calls); triangulos.push(r.info.render.triangles);
    }
  } finally { app.imagen.dibujar = dibujarOriginal; r.info.autoReset = true; }
  const f = (x) => +x.toFixed(2);
  return {
    total: f(mediana(total)), dibujo: f(mediana(dibujo)), logica: f(mediana(logica)), peor: f(Math.max(...total)),
    llamadas: mediana(llamadas), triangulos: mediana(triangulos),
    geometrias: r.info.memory.geometries, texturas: r.info.memory.textures, programas: r.info.programs.length,
    particulas: app.particles.count, brillo: app.imagen.rinde,
  };
}

// Tiempo de cada parte de la lógica, repitiendo la misma llamada muchas veces
export function desglose(app, veces = 200) {
  const race = app.race, cam = app.camera, t = (f) => { const a = performance.now(); for (let i = 0; i < veces; i++) f(); return +((performance.now() - a) / veces).toFixed(3); };
  const h = race.hudData();
  return {
    carrera: t(() => race.update(1 / 60, app.input)),
    mundo: t(() => app.world.update(1 / 60, cam.position.x, cam.position.z, app.particles, cam.position.y)),
    particulas: t(() => app.particles.update(1 / 60)),
    hud: t(() => { const d = race.hudData(); app.ui.updateHUD(d); }),
    tablero: t(() => app.ui.drawSpeedo(h.kmh, h.rpm, 1 / 60, h)),
    minimapa: t(() => app.ui.drawMinimap(race.cars, race.player, h.leader)),
    sonido: t(() => app.audio.update(1 / 60, race.player.state, race.cars.map((c) => c.state), { x: cam.position.x, z: cam.position.z, heading: 0 }, { crowdDist: 100, rain: false })),
  };
}

// Cuenta qué se dibuja: mallas visibles agrupadas por material, para encontrar dónde se van las llamadas
export function censo(app, top = 25) {
  const cuenta = new Map();
  app.scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const clave = `${o.isInstancedMesh ? 'Inst' : o.type}|${m.type}|${m.color ? '#' + m.color.getHexString() : ''}|${o.geometry.type}`;
    const e = cuenta.get(clave) || { n: 0, sombra: 0 }; e.n++; if (o.castShadow) e.sombra++; cuenta.set(clave, e);
  });
  return [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, top).map(([k, e]) => `${e.n} (${e.sombra} con sombra) ${k}`);
}
