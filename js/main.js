// Arranque: render, mundo por pista, entradas, máquina de estados
// (menú → campeonato/taller → carrera → resultados → repetición), modo foto.
import * as THREE from 'three';
import { Track, CIRCUITS } from './track.js';
import { World } from './world.js';
import { Race } from './race.js';
import { UI } from './ui.js';
import { GameAudio, ENGINE_PROFILES } from './audio.js';
import { Particles, Debris } from './particles.js';
import { ChaseCamera } from './camera.js';
import { Championship, ROUNDS, POINTS, makeRoster } from './championship.js';
import { computeStageTimes } from './stage.js';
import { LIVERY_COLORS, KEYS } from './config.js';
import { clamp, lerp } from './util.js';
import { STRIDE } from './replay.js';
import { Multiplayer } from './multiplayer.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'coparipio.settings';

const app = {
  state: 'loading', race: null, champ: null, tracks: {}, worldKey: null,
  settings: { difficulty: 1, volume: 0.8, music: true, shadows: true, laps: 3 },
  playerSpec: { name: 'Vos', number: 7, color: '#8fd3e8', roofColor: '#f2e6c9', accessory: 'none', stripes: true },
  keys: new Set(), input: { steer: 0, throttle: 0, brake: 0, handbrake: false }, steerRaw: 0, lookBack: false,
  touch: { left: false, right: false, gas: false, brake: false, hb: false }, isTouch: window.matchMedia && window.matchMedia('(pointer: coarse)').matches,
  replay: null, photoDrag: null,
};

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (s) { Object.assign(app.settings, s.settings || {}); Object.assign(app.playerSpec, s.playerSpec || {}); } } catch (e) { /* nada */ }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: app.settings, playerSpec: app.playerSpec })); } catch (e) { /* nada */ } }

function getTrack(id) {
  if (!app.tracks[id]) app.tracks[id] = new Track(id);
  return app.tracks[id];
}

// Construye (o reconstruye) el mundo para una fecha: pista, clima, viento.
async function prepareWorld(round, progress) {
  const key = `${round.track}|${round.weather}`;
  if (app.worldKey === key && app.world) { app.world.setTimeOfDay(round.tod); return; }
  if (app.race) { app.race.dispose(); app.race = null; }
  if (app.world) app.world.dispose();
  const track = app.track = getTrack(round.track);
  track.gripScale = 1;
  const world = app.world = new World(app.scene, track, app.renderer);
  await world.build(progress, { wet: round.weather === 'rain' });
  world.setWeather(round.weather, { x: round.wind[0], z: round.wind[1] });
  app.particles.wind = world.wind;
  app.debris.track = track;
  app.chase.setTrack(track, world.tvSpots);
  app.worldKey = key;
}

async function init() {
  loadSettings();
  const ui = app.ui = new UI();
  ui.showScreen('loading');
  const canvas = $('gl');
  const renderer = app.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, app.isTouch ? 1.3 : 2)); // en el celular, menos píxeles: más cuadros
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = app.settings.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const scene = app.scene = new THREE.Scene();
  const camera = app.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 1800);
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

  app.particles = new Particles(scene, 2500);
  app.debris = new Debris(scene, null);
  app.audio = new GameAudio(); app.audio.setEngineProfile(app.settings.engine || 'muestras');
  app.audio.volume = app.settings.volume; app.audio.musicOn = app.settings.music;
  app.chase = new ChaseCamera(camera, null);
  app.mp = new Multiplayer(app); app.mp.onLobby = renderLobby; app.mp.onStart = startMultiplayerRace; app.mp.onResults = onMpResults; app.mp.onHostGone = () => { app.ui.toast('El anfitrión se desconectó', 'bad', 4000); };
  app.champ = Championship.load();
  const round = app.champ ? app.champ.current : ROUNDS[0];
  ui.setLoading(0.05, 'Trazando la pista');
  await new Promise(r => setTimeout(r, 20));
  await prepareWorld(round, (f, txt) => ui.setLoading(0.1 + f * 0.85, txt));

  bindUI();
  bindInput();
  $('btn-continue').disabled = !app.champ;
  showcase();
  ui.setLoading(1, 'Listo');
  setTimeout(() => { ui.showScreen('menu'); app.state = 'menu'; }, 300);
  requestAnimationFrame(loop);
}

// Fondo del menú: autos en la grilla, cámara orbitando.
function showcase() {
  if (app.race) app.race.dispose();
  const champ = app.champ || new Championship(makeRoster(app.playerSpec));
  const round = champ.done ? ROUNDS[ROUNDS.length - 1] : champ.current;
  const r = { ...round, laps: app.settings.laps, track: app.track.def.id, mode: 'race' };
  app.race = new Race({ scene: app.scene, track: app.track, world: app.world, audio: app.audio, particles: app.particles, debris: app.debris, ui: app.ui, settings: app.settings, roster: champ.roster, round: r, gridOrder: champ.gridOrder(), chase: app.chase, champ: app.champ, stageTimes: {} });
  app.race.phase = 'idle';
  app.audio.state = 'menu';
}

async function startRace(quick = false) {
  if (!app.champ) app.champ = new Championship(makeRoster(app.playerSpec));
  app.quick = quick;
  let champ = app.champ;
  if (quick) { champ = new Championship(makeRoster(app.playerSpec)); champ.persist = false; champ.round = Math.floor(Math.random() * ROUNDS.length); champ.money = app.champ.money; champ.upgrades = { ...app.champ.upgrades }; app.quickChamp = champ; }
  const roundIdx = champ.done ? ROUNDS.length - 1 : champ.round;
  let base = ROUNDS[roundIdx];
  if (quick) { // hora y clima al azar
    const tods = ['morning', 'noon', 'sunset', 'dusk', 'fog', 'storm'];
    const tod = tods[Math.floor(Math.random() * tods.length)];
    base = { ...base, tod, weather: tod === 'storm' ? 'rain' : (Math.random() < 0.15 ? 'rain' : 'dry'), reverse: Math.random() < 0.4, name: base.name + ' (carrera rápida)' };
    if (base.weather === 'rain' && base.tod !== 'storm') base.tod = 'storm';
  }
  const round = { ...base, laps: base.mode === 'timetrial' ? 1 : (roundIdx === ROUNDS.length - 1 ? app.settings.laps + 1 : base.laps === 5 ? app.settings.laps + 2 : app.settings.laps) };
  app.ui.showScreen('loading'); app.ui.setLoading(0.05, 'Armando la fecha'); app.state = 'loading';
  await new Promise(r => setTimeout(r, 30));
  if (app.race) { app.race.dispose(); app.race = null; }
  await prepareWorld(round, (f, txt) => app.ui.setLoading(0.1 + f * 0.6, txt));
  let stageTimes = {};
  if (round.mode === 'timetrial') {
    app.ui.setLoading(0.72, 'Los rivales corren su tramo');
    stageTimes = await computeStageTimes(app.track, champ.roster, app.settings.difficulty, (f, name) => app.ui.setLoading(0.72 + f * 0.26, `Corre ${name}`));
  }
  champ.pickRival(); champ.save();
  app.race = new Race({ scene: app.scene, track: app.track, world: app.world, audio: app.audio, particles: app.particles, debris: app.debris, ui: app.ui, settings: app.settings, roster: champ.roster, round, gridOrder: champ.gridOrder(), chase: app.chase, champ, stageTimes });
  app.race.onComplete = onRaceComplete;
  app.chase.init = false; app.chase.mode = 0;
  app.ui.showScreen(null); app.ui.showHUD(true); showTouch(true);
  app.state = 'race';
  app.audio.init();
  app.race.begin();
}

function onRaceComplete(results) {
  app.ui.showHUD(false); showTouch(false);
  if (app.mpActive && app.mp.isHost) app.mp.sendResults(results);
  if (app.race.mode !== 'timetrial') { startPodium(results); return; }
  finishResults(results);
}
function finishResults(results) {
  app.state = 'results';
  const bestLapOverall = [...results].filter(r => r.bestLap != null).sort((a, b) => a.bestLap - b.bestLap)[0];
  const champ = app.quick ? app.quickChamp : app.champ;
  const prize = champ.applyResults(results, { bestLapOverall: bestLapOverall ? bestLapOverall.name : null });
  $('btn-results-ok').textContent = app.quick ? 'Volver al menú' : 'Ver campeonato';
  app.lastResults = results;
  app.ui.renderResults(results, app.playerSpec.name, POINTS, prize, app.race.mode);
  $('btn-replay').disabled = app.race.replay.frames.length < 40;
  app.ui.showScreen('results');
  app.audio.state = 'menu';
}

function showChampionship() {
  if (!app.champ) app.champ = new Championship(makeRoster(app.playerSpec));
  const c = app.champ;
  if (!c.rival) c.pickRival();
  app.ui.renderStandings(c.standings(), app.playerSpec.name);
  app.ui.renderNextRound(c, ROUNDS);
  app.ui.showScreen('champ'); app.state = 'menu';
  $('btn-continue').disabled = false;
}

function showWorkshop() {
  const c = app.champ;
  const handlers = { repair: () => { c.repair(); app.ui.renderWorkshop(c, handlers); showcase(); }, buy: (k) => { c.buy(k); app.ui.renderWorkshop(c, handlers); } };
  app.ui.renderWorkshop(c, handlers);
  app.ui.showScreen('workshop');
}

// ---------- Multijugador ----------
// Cambios de nombre, número o pintura: se guardan, pasan al campeonato y al auto del menú
function applyPlayerSpec() {
  saveSettings();
  if (app.champ) { const me = app.champ.roster[0]; Object.assign(me, { name: app.playerSpec.name, color: app.playerSpec.color, roofColor: app.playerSpec.roofColor, accessory: app.playerSpec.accessory, stripes: app.playerSpec.stripes, number: app.playerSpec.number }); }
  clearTimeout(app.rebuildT); app.rebuildT = setTimeout(() => showcase(), 250);
}
const CODE_RE = /^[A-Z0-9]{3,10}$/;
function readCode(id) { const v = $(id).value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); $(id).value = v; return v; }
function showMp() {
  const sel = $('mp-round'); if (!sel.options.length) ROUNDS.forEach((r, i) => { if (r.mode !== 'timetrial') { const o = document.createElement('option'); o.value = i; o.textContent = `${r.name} · ${r.laps} vueltas`; sel.appendChild(o); } });
  app.ui.initPilotForm({ name: 'mp-name', number: 'mp-number', color: 'mp-color-swatches', roof: 'mp-roof-swatches', stripes: 'mp-stripes' }, app.playerSpec, LIVERY_COLORS, () => { applyPlayerSpec(); app.mp.updateSelf(app.playerSpec.name, app.playerSpec); renderLobby(); });
  app.ui.showScreen('mp'); app.state = 'menu'; renderLobby();
}
function renderLobby() {
  const mp = app.mp, host = mp.net.role === 'host', inRoom = !!mp.net.role;
  $('mp-status').textContent = mp.status || 'Creá una sala o entrá con un código.';
  $('mp-setup').classList.toggle('hidden', inRoom);
  $('mp-room').classList.toggle('hidden', !inRoom);
  $('mp-codebig').textContent = mp.net.code || '';
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  $('mp-players').innerHTML = mp.players.map(p => { const sp = p.spec || {}; return `<div class="order-row${p.local ? ' me' : ''}"><span class="chip" style="background:${sp.color || '#888'}"></span><span class="p">#${sp.number || '?'}</span><span>${esc(p.name)}${p.id === 'host' ? ' (anfitrión)' : ''}${p.local ? ' (vos)' : ''}</span></div>`; }).join('') || '<i>Nadie todavía</i>';
  $('mp-round').disabled = !host; $('mp-round').value = String(mp.roundIdx || 0);
  $('btn-mp-start').classList.toggle('hidden', !host);
  $('mp-hostnote').classList.toggle('hidden', host);
}
async function startMultiplayerRace(payload) {
  const mp = app.mp;
  const round = { ...ROUNDS[payload.roundIdx] };
  app.mpActive = true; app.quick = true;
  app.ui.showScreen('loading'); app.ui.setLoading(0.05, 'Armando la carrera en red'); app.state = 'loading';
  await new Promise(r => setTimeout(r, 30));
  if (app.race) { app.race.dispose(); app.race = null; }
  await prepareWorld(round, (f, txt) => app.ui.setLoading(0.1 + f * 0.8, txt));
  const roster = mp.buildRoster(payload.players, payload.seed);
  const champ = new Championship(roster); champ.persist = false; app.quickChamp = champ;
  app.race = new Race({ scene: app.scene, track: app.track, world: app.world, audio: app.audio, particles: app.particles, debris: app.debris, ui: app.ui, settings: app.settings, roster, round, gridOrder: roster.map(r => r.name), chase: app.chase, champ: null, stageTimes: {} });
  app.race.netHost = mp.isHost; app.race.netGuest = !mp.isHost;
  app.race.onComplete = onRaceComplete;
  mp.attach(app.race);
  app.chase.init = false; app.chase.mode = 0;
  app.ui.showScreen(null); app.ui.showHUD(true); showTouch(true);
  app.state = 'race';
  app.audio.init();
  app.ui.banner(mp.isHost ? 'ESPERANDO A LOS DEMÁS…' : 'ESPERANDO LA LARGADA…', 6000);
  mp.markReady();
}
function onMpResults(results) {
  if (!app.race || app.race.completed) return;
  app.race.completed = true; app.race.results = results;
  onRaceComplete(results);
}

// ---------- Podio ----------
function startPodium(results) {
  const race = app.race, world = app.world;
  const top = results.slice(0, 3).map(r => race.cars.find(c => c.name === r.name)).filter(Boolean);
  const g = world.grandstandPos, s = app.track.sampleAtFrac(app.track.def.scenery.grandstand);
  const cx = s.x + s.nx * -(app.track.W + 4.5), cz = s.z + s.nz * -(app.track.W + 4.5);
  const base = app.track.heightAt(cx, cz);
  const pod = new THREE.Group(); pod.position.set(cx, base, cz); pod.rotation.y = s.heading;
  const heights = [1.0, 0.7, 0.5], offs = [0, -3.2, 3.2], cols = ['#e2a33b', '#c9d0d6', '#b5733c'];
  heights.forEach((h, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.9, h, 4.4), new THREE.MeshToonMaterial({ color: cols[i] })); m.position.set(offs[i], h / 2, 0); m.castShadow = true; m.receiveShadow = true; pod.add(m); const t = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 4.4), new THREE.MeshToonMaterial({ color: '#fff3d6' })); t.position.set(offs[i], h + 0.03, 0); pod.add(t); });
  app.scene.add(pod);
  top.forEach((c, i) => { const v = c.vis.root; const wx = cx + Math.cos(s.heading) * offs[i], wz = cz - Math.sin(s.heading) * offs[i]; v.position.set(wx, base + heights[i], wz); v.rotation.y = s.heading; c.vis.vis.rotation.set(0, 0, 0); c.state.x = wx; c.state.z = wz; });
  app.podium = { pod, t: 0, cx, cz, base, heading: s.heading, dur: 8 };
  app.state = 'podium'; app.ui.showScreen(null);
  app.ui.overlay('replay-overlay', true, `PODIO · 1° ${results[0].name}`); $('replay-overlay').classList.add('letterbox');
  app.audio.state = 'replay'; app.audio.cheerNow(1.5); world.cheerLevel = 2;
  for (let k = 0; k < 3; k++) setTimeout(() => app.audio.horn(Math.random() - 0.5, true), 400 + k * 700);
  app.podiumResults = results;
}
function updatePodium(dt) {
  const P = app.podium; P.t += dt;
  const a = P.heading + Math.PI + Math.sin(P.t * 0.35) * 0.9, r = 11;
  app.camera.position.set(P.cx + Math.sin(a) * r, P.base + 3.2, P.cz + Math.cos(a) * r);
  app.camera.lookAt(P.cx, P.base + 1.2, P.cz); app.chase.setFov(40);
  // papelitos
  for (let k = 0; k < 6; k++) { const col = [[1, 0.3, 0.3], [1, 0.85, 0.2], [0.3, 0.6, 1], [0.4, 0.9, 0.4]][k % 4]; app.particles.emit(P.cx + (Math.random() - 0.5) * 12, P.base + 6 + Math.random() * 3, P.cz + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, -0.5, (Math.random() - 0.5) * 2, 0.18, 4, col[0], col[1], col[2], 1, 0, -1.2); }
  app.world.cheerLevel = 1.5;
  if (P.t > P.dur) endPodium();
}
function endPodium() {
  if (!app.podium) return;
  app.scene.remove(app.podium.pod); app.podium = null;
  app.ui.overlay('replay-overlay', false); $('replay-overlay').classList.remove('letterbox');
  finishResults(app.podiumResults);
}

// ---------- Repetición ----------
function startReplay() {
  const race = app.race, rp = race.replay;
  if (!rp || rp.frames.length < 40) return;
  const segs = [];
  const best = rp.bestMoment();
  const finishT = race.playerFinishT != null ? race.playerFinishT : rp.duration;
  if (best && best.strength > 4) segs.push({ from: Math.max(rp.start, best.time - 5), to: Math.min(rp.duration, best.time + 5), text: best.player ? 'EL GOLPE GRANDE' : 'EL CHOQUE DEL DÍA', cam: 'tv' });
  segs.push({ from: Math.max(rp.start, finishT - 8), to: Math.min(rp.duration, finishT + 2.5), text: 'LA LLEGADA', cam: 'tv' });
  app.replay = { segs, i: 0, t: segs[0].from, frame: new Float32Array(race.cars.length * STRIDE), prev: null };
  app.state = 'replay';
  app.ui.showScreen(null); app.ui.showHUD(false);
  app.ui.overlay('replay-overlay', true, segs[0].text);
  $('replay-overlay').classList.add('letterbox');
  app.chase.mode = 3; app.chase.tvSpot = null;
  app.audio.state = 'replay';
}
function endReplay() {
  app.replay = null; app.ui.overlay('replay-overlay', false); $('replay-overlay').classList.remove('letterbox');
  app.state = 'results'; app.ui.showScreen('results'); app.audio.state = 'menu';
}
function updateReplay(dt) {
  const r = app.replay, race = app.race, rp = race.replay;
  r.t += dt;
  let seg = r.segs[r.i];
  if (r.t > seg.to) { r.i++; if (r.i >= r.segs.length) return endReplay(); seg = r.segs[r.i]; r.t = seg.from; app.chase.tvSpot = null; app.ui.overlay('replay-overlay', true, seg.text); }
  const f = rp.frameAt(r.t, r.frame);
  race.applyReplayFrame(f);
  const pi = race.cars.indexOf(race.player) * STRIDE;
  const car = { x: f[pi], y: f[pi + 1], z: f[pi + 2], heading: f[pi + 3], speed: 0, vx: 0, vz: 0, trackIdx: -1 };
  if (r.prev) { car.vx = (car.x - r.prev.x) / dt; car.vz = (car.z - r.prev.z) / dt; car.speed = Math.hypot(car.vx, car.vz); }
  r.prev = { x: car.x, z: car.z };
  car.trackIdx = app.track.nearest(car.x, car.z, r.lastIdx ?? -1).idx; r.lastIdx = car.trackIdx;
  app.chase.updateTV(dt, car);
  // polvo de todos los autos según lo que se mueven
  if (r.prevFrame) {
    for (let i = 0; i < race.cars.length; i++) {
      const k = i * STRIDE, sp = Math.hypot(f[k] - r.prevFrame[k], f[k + 2] - r.prevFrame[k + 2]) / dt;
      if (sp > 4 && Math.random() < dt * sp * 0.6) app.particles.emit(f[k], f[k + 1] + 0.25, f[k + 2], (Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5, 0.9, 1.4, 0.82, 0.7, 0.5, 0.3, 2.4);
    }
  }
  r.prevFrame = r.prevFrame || new Float32Array(f.length); r.prevFrame.set(f);
}

// ---------- Modo foto ----------
function enterPhoto() {
  if (app.state !== 'race') return;
  app.state = 'photo'; app.ui.showHUD(false); app.ui.overlay('photo-overlay', true, '');
  app.audio.state = 'pause';
}
function exitPhoto() {
  if (app.state !== 'photo') return;
  app.state = 'race'; app.ui.showHUD(true); app.ui.overlay('photo-overlay', false); app.audio.state = 'race'; app.lastT = performance.now();
}
function savePhoto() {
  app.renderer.render(app.scene, app.camera);
  const url = app.renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = `formula600-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove();
  app.ui.overlay('photo-overlay', true, '¡Foto guardada!');
  setTimeout(() => { if (app.state === 'photo') app.ui.overlay('photo-overlay', true, ''); }, 1500);
}

function bindUI() {
  const ui = app.ui;
  const gesture = () => app.audio.init();
  document.addEventListener('pointerdown', gesture, { once: true }); document.addEventListener('keydown', gesture, { once: true });
  $('btn-continue').onclick = () => { showChampionship(); };
  $('btn-new').onclick = () => { if (app.champ && !confirm('¿Empezar un campeonato nuevo? Se borra el actual.')) return; Championship.clear(); app.champ = new Championship(makeRoster(app.playerSpec)); app.champ.save(); showChampionship(); showcase(); };
  $('btn-garage').onclick = () => { ui.initGarage(app.playerSpec, LIVERY_COLORS, () => applyPlayerSpec()); ui.showScreen('garage'); app.orbitCar = true; };
  $('btn-garage-back').onclick = () => {
    app.orbitCar = false;
    saveSettings();
    if (app.champ) { const me = app.champ.roster[0]; Object.assign(me, { color: app.playerSpec.color, roofColor: app.playerSpec.roofColor, accessory: app.playerSpec.accessory, stripes: app.playerSpec.stripes, number: app.playerSpec.number }); const row = app.champ.table.find(t => t.name === me.name); if (row) { row.color = me.color; row.number = me.number; } app.champ.save(); }
    showcase(); ui.showScreen('menu');
  };
  const fillEngine = () => { const sel = $('in-engine'); if (!sel.options.length) for (const [k, v] of Object.entries(ENGINE_PROFILES)) { const o = document.createElement('option'); o.value = k; o.textContent = v.name; sel.appendChild(o); } sel.value = app.settings.engine || 'muestras'; $('engine-desc').textContent = (ENGINE_PROFILES[sel.value] || {}).desc || ''; };
  $('in-engine').onchange = (e) => { app.settings.engine = e.target.value; app.audio.setEngineProfile(app.settings.engine); $('engine-desc').textContent = ENGINE_PROFILES[app.settings.engine].desc; saveSettings(); };
  $('btn-engine-test').onclick = () => { app.audio.init(); app.audio.setEngineProfile(app.settings.engine || 'muestras'); app.audio.previewEngine(); };
  $('btn-settings').onclick = () => { fillEngine(); $('in-difficulty').value = String(app.settings.difficulty); $('in-volume').value = app.settings.volume; $('in-music').checked = app.settings.music; $('in-shadows').checked = app.settings.shadows; $('in-laps').value = app.settings.laps; ui.showScreen('settings'); };
  $('btn-settings-back').onclick = () => {
    app.settings.difficulty = parseFloat($('in-difficulty').value); app.settings.volume = parseFloat($('in-volume').value); app.settings.music = $('in-music').checked; app.settings.shadows = $('in-shadows').checked; app.settings.laps = parseInt($('in-laps').value);
    app.audio.setVolume(app.settings.volume); app.audio.musicOn = app.settings.music; app.renderer.shadowMap.enabled = app.settings.shadows; app.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    saveSettings(); ui.showScreen('menu');
  };
  $('in-volume').oninput = (e) => app.audio.setVolume(parseFloat(e.target.value));
  $('btn-help').onclick = () => ui.showScreen('help');
  $('btn-help-back').onclick = () => ui.showScreen('menu');
  $('btn-champ-back').onclick = () => ui.showScreen('menu');
  $('btn-workshop').onclick = () => { showcase(); app.orbitCar = true; showWorkshop(); };
  $('btn-workshop-back').onclick = () => { app.orbitCar = false; showChampionship(); };
  $('btn-race').onclick = () => startRace();
  $('btn-resume').onclick = () => resume();
  $('btn-restart').onclick = () => { if (app.mpActive) { resume(); return; } startRace(app.quick); };
  $('btn-quit').onclick = () => { app.ui.showHUD(false); showTouch(false); if (app.mpActive) { app.mpActive = false; app.quick = false; app.mp.leave(); showcase(); app.ui.showScreen('menu'); app.state = 'menu'; return; } showcase(); showChampionship(); };
  $('btn-results-ok').onclick = () => { showcase(); if (app.mpActive) { app.mpActive = false; app.quick = false; app.mp.race = null; app.mp.active = false; showMp(); } else if (app.quick) { app.quick = false; app.ui.showScreen('menu'); app.state = 'menu'; } else showChampionship(); };
  $('btn-mp').onclick = () => showMp();
  $('btn-mp-back').onclick = () => { app.mp.leave(); app.ui.showScreen('menu'); };
  $('btn-mp-create').onclick = () => { app.audio.init(); const custom = readCode('mp-newcode'); if (custom && !CODE_RE.test(custom)) { app.mp.status = 'El código: de 3 a 10 letras o números, sin espacios.'; renderLobby(); return; } app.mp.createRoom(app.playerSpec.name, app.playerSpec, () => renderLobby(), custom || null); renderLobby(); };
  $('btn-mp-join').onclick = () => { app.audio.init(); const code = readCode('mp-code'); if (!CODE_RE.test(code)) { app.mp.status = 'Escribí el código de la sala (de 3 a 10 letras o números).'; renderLobby(); return; } app.mp.joinRoom(code, app.playerSpec.name, app.playerSpec, () => renderLobby()); renderLobby(); };
  $('mp-round').onchange = (e) => app.mp.setRound(parseInt(e.target.value));
  $('btn-mp-start').onclick = () => { if (app.mp.players.length < 1) return; app.mp.hostStart(); };
  $('btn-quick').onclick = () => startRace(true);
  $('btn-records').onclick = () => { app.ui.renderRecords(CIRCUITS); app.ui.showScreen('records'); };
  $('btn-records-back').onclick = () => ui.showScreen('menu');
  // controles táctiles: cada botón sostiene su tecla mientras el dedo está encima
  for (const b of document.querySelectorAll('.tc-btn')) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); app.touch[k] = true; b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); app.touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }
  $('btn-replay').onclick = () => startReplay();
  // mouse para el modo foto
  const canvas = $('gl');
  canvas.addEventListener('pointerdown', (e) => { if (app.state === 'photo') app.photoDrag = { x: e.clientX, y: e.clientY }; if (app.state === 'podium') endPodium(); });
  window.addEventListener('pointermove', (e) => { if (app.state === 'photo' && app.photoDrag) { app.chase.photo.yaw -= (e.clientX - app.photoDrag.x) * 0.008; app.chase.photo.pitch += (e.clientY - app.photoDrag.y) * 0.005; app.photoDrag = { x: e.clientX, y: e.clientY }; } });
  window.addEventListener('pointerup', () => { app.photoDrag = null; });
  canvas.addEventListener('wheel', (e) => { if (app.state === 'photo') { app.chase.photo.dist *= e.deltaY > 0 ? 1.1 : 0.9; e.preventDefault(); } }, { passive: false });
}

function pause() { if (app.state !== 'race') return; app.state = 'pause'; app.ui.showScreen('pause'); app.audio.state = 'pause'; }
function showTouch(on) { $('touch').classList.toggle('hidden', !(on && app.isTouch)); }
function resume() { if (app.state !== 'pause') return; app.state = 'race'; app.ui.showScreen(null); app.audio.state = 'race'; app.lastT = performance.now(); showTouch(true); }

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    app.keys.add(e.code);
    if (KEYS.pause.includes(e.code)) {
      if (app.state === 'race') pause(); else if (app.state === 'pause') resume();
      else if (app.state === 'replay') endReplay(); else if (app.state === 'photo') exitPhoto(); else if (app.state === 'podium') endPodium();
    }
    if (e.code === 'KeyP') { if (app.state === 'race') enterPhoto(); else if (app.state === 'photo') exitPhoto(); }
    if (e.code === 'Enter' && app.state === 'photo') savePhoto();
    if (KEYS.camera.includes(e.code) && app.state === 'race') app.chase.cycle();
    if (KEYS.reset.includes(e.code) && app.state === 'race') app.race.resetPlayer();
    if (KEYS.mute.includes(e.code)) { const m = app.audio.toggleMute(); app.ui.toast(m ? 'Silencio' : 'Sonido', '', 1200); }
    if (KEYS.horn.includes(e.code) && app.state === 'race') app.audio.horn(0, false);
    if (e.code === 'Enter' && app.state === 'race' && app.race.playerFinishT != null) app.race.skipRequested = true;
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => app.keys.delete(e.code));
  window.addEventListener('blur', () => app.keys.clear());
}

function readInput(dt) {
  const k = app.keys, inp = app.input;
  const down = (list) => list.some(c => k.has(c));
  const tc = app.touch;
  let steer = (down(KEYS.left) || tc.left ? 1 : 0) - (down(KEYS.right) || tc.right ? 1 : 0);
  let throttle = down(KEYS.up) || tc.gas ? 1 : 0, brake = down(KEYS.down) || tc.brake ? 1 : 0, hb = down(KEYS.handbrake) || tc.hb;
  app.lookBack = down(KEYS.look);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = -ax;
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    if (rt > 0.05) throttle = rt; if (lt > 0.05) brake = lt;
    if (p.buttons[0] && p.buttons[0].pressed) throttle = 1; if (p.buttons[2] && p.buttons[2].pressed) brake = 1;
    if (p.buttons[1] && p.buttons[1].pressed) hb = true;
    if (p.buttons[3] && p.buttons[3].pressed && !app.padY) { app.chase.cycle(); } app.padY = p.buttons[3] && p.buttons[3].pressed;
    if (p.buttons[9] && p.buttons[9].pressed && !app.padStart) { if (app.state === 'race') pause(); else if (app.state === 'pause') resume(); } app.padStart = p.buttons[9] && p.buttons[9].pressed;
  }
  const rate = steer !== 0 ? 5 : 9;
  app.steerRaw = lerp(app.steerRaw, steer, clamp(dt * rate, 0, 1));
  inp.steer = Math.abs(steer) > 0.2 && Math.abs(steer) < 1 ? steer : app.steerRaw;
  inp.throttle = throttle; inp.brake = brake; inp.handbrake = hb;
  return inp;
}

let frames = 0, fpsT = 0;
function loop(now) { requestAnimationFrame(loop); tick(now); }
app.tick = (dtMs) => tick((app.lastT || performance.now()) + dtMs);
function tick(now) {
  const dt = Math.min((now - (app.lastT || now)) / 1000, 0.05); app.lastT = now;
  const race = app.race;
  if (app.state === 'pause' || app.state === 'loading') { if (app.world) app.renderer.render(app.scene, app.camera); return; }
  if (app.state === 'photo') {
    app.chase.updatePhoto(race.player.state);
    app.world.update(0, app.camera.position.x, app.camera.position.z, null, app.camera.position.y);
    app.renderer.render(app.scene, app.camera); return;
  }
  if (app.state === 'replay') {
    updateReplay(dt);
  } else if (app.state === 'race' || app.state === 'results') {
    const input = readInput(dt);
    if (app.mpActive) app.mp.tick(dt);
    race.update(dt, input);
    if (app.state === 'race') {
      app.chase.update(dt, race.player.state, app.lookBack);
      const h = race.hudData();
      app.ui.updateHUD(h); app.ui.drawSpeedo(h.kmh, h.rpm, dt); app.ui.drawMinimap(race.cars, race.player, h.leader);
    } else app.chase.update(dt, race.player.state, false);
  } else if (app.state === 'podium') {
    updatePodium(dt);
  } else if (race) {
    race.update(dt, app.input);
    if (app.orbitCar && race.player) { const p = race.player.state; app.chase.orbitT += dt * 0.35; const a = app.chase.orbitT, r = 7.8; app.camera.position.set(p.x + Math.cos(a) * r, p.y + 2.2, p.z + Math.sin(a) * r); app.camera.lookAt(p.x, p.y + 0.7, p.z); app.camera.rotateY(-0.16); app.chase.setFov(42); }
    else { const g = app.track.gridSlot(7); app.chase.orbit(dt, g.x, g.z, app.track.heightAt(g.x, g.z)); }
  }
  const cam = app.camera;
  app.world.update(dt, cam.position.x, cam.position.z, app.particles, cam.position.y);
  app.particles.update(dt); app.debris.update(dt);
  if (race) {
    const p = race.player.state;
    const gs = app.world.grandstandPos;
    const dir = cam.getWorldDirection(_dir);
    app.audio.update(dt, p, race.cars.map(c => c.state), { x: cam.position.x, z: cam.position.z, heading: Math.atan2(dir.x, dir.z) }, { crowdDist: gs ? Math.hypot(p.x - gs.x, p.z - gs.z) : 200, rain: !!app.world.raining });
  }
  app.renderer.render(app.scene, app.camera);
  frames++; fpsT += dt; if (fpsT > 2) { app.fps = frames / fpsT; frames = 0; fpsT = 0; }
}
const _dir = new THREE.Vector3();

init().catch(e => { console.error(e); const p = document.querySelector('#loading p'); if (p) p.textContent = 'Error al cargar: ' + e.message; });
window.app = app;
