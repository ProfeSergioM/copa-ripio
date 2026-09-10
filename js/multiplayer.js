// Multijugador: sala (anfitrión + invitados), plantel compartido, sincronización de estados a 20 Hz.
// El anfitrión simula los rivales de IA y su propio auto; cada invitado simula solo el suyo. Todo lo demás
// llega por red y se interpola. Los choques contra autos de otros se resuelven localmente (ellos no se mueven).
import { Net, randomCode } from './net.js';
import { t } from './idioma.js';
import { LIVERY_COLORS } from './config.js';
import { ROUNDS } from './championship.js';
import { mulberry32, wrapAngle, lerp, clamp } from './util.js';

const RATE = 1 / 20;
// Identidad del dispositivo (persistente en este navegador): evita que alguien entre dos veces a la misma sala.
export function deviceId() {
  try { let id = localStorage.getItem('coparipio.device'); if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('coparipio.device', id); } return id; } catch (e) { return 'anon'; }
}

export class Multiplayer {
  constructor(app) {
    this.app = app; this.net = new Net(); this.players = []; this.race = null; this.acc = 0; this.active = false; this.ready = new Set(); this.status = '';
    const n = this.net;
    n.on('join', (_, from) => { /* espera el hello con nombre y auto */ });
    n.on('hello', (m, from) => {
      if (this.net.role !== 'host') return;
      if (this.players.length >= 8) { n.send(from, { t: 'full' }); return; }
      if (m.device && this.players.some(p => p.device === m.device)) { n.send(from, { t: 'dup' }); return; } // mismo dispositivo ya adentro
      this.players.push({ id: from, name: m.name, spec: m.spec, device: m.device, local: false }); n.send(from, { t: 'welcome', id: from }); this.broadcastLobby();
    });
    n.on('update', (m, from) => { if (this.net.role !== 'host') return; const p = this.players.find(x => x.id === from); if (p) { p.name = m.name; p.spec = m.spec; this.broadcastLobby(); } });
    n.on('leave', (_, from) => { this.players = this.players.filter(p => p.id !== from); this.broadcastLobby(); if (this.race) this.dropCar(from); });
    n.on('lobby', (m) => { if (this.net.role === 'guest') { this.players = m.players.map(p => ({ ...p, local: p.id === this.net.myId })); this.roundIdx = m.roundIdx; this.onLobby && this.onLobby(); } });
    n.on('welcome', (m) => { this.status = t('Conectado. Esperando que el anfitrión largue…'); this.onLobby && this.onLobby(); });
    n.on('full', () => { this.status = t('La sala está llena.'); this.net.close(); this.players = []; this.onLobby && this.onLobby(); });
    n.on('dup', () => { this.status = t('Ya estás en esta sala desde este dispositivo (otra pestaña o ventana). Usá esa.'); this.net.close(); this.players = []; this.onLobby && this.onLobby(); });
    n.on('hostgone', () => { this.status = t('El anfitrión se fue.'); this.onLobby && this.onLobby(); if (this.active) this.onHostGone && this.onHostGone(); });
    n.on('start', (m) => { if (this.net.role === 'guest') { this.players = m.players.map(p => ({ ...p, local: p.id === this.net.myId })); this.onStart && this.onStart(m); } });
    n.on('ready', (_, from) => { this.ready.add(from); this.tryGo(); });
    n.on('go', () => { if (this.net.role === 'guest' && this.race) this.race.begin(); });
    n.on('s', (m, from) => { if (this.race) this.applyState(from, m.s, m.tm); });
    n.on('S', (m) => { if (this.race && this.net.role === 'guest') for (const k in m.c) this.applyIndex(+k, m.c[k], m.tm); });
    n.on('results', (m) => { if (this.net.role === 'guest') this.onResults && this.onResults(m.results); });
  }

  // ---------- sala ----------
  // custom: código elegido por el anfitrión (letras y números); si no, 4 letras al azar
  createRoom(name, spec, cb, custom) {
    const code = custom || randomCode();
    this.players = [{ id: 'host', name, spec: { ...spec }, device: deviceId(), local: true }]; this.roundIdx = 0;
    this.status = t('Creando sala…');
    this.net.host(code, () => { this.status = `${t('Sala')} ${code}. ${t('Pasá el código a tus amigos.')}`; cb && cb(null, code); this.onLobby && this.onLobby(); }, (e) => {
      this.status = e && e.type === 'unavailable-id' ? `${t('El código')} ${code} ${t('ya está en uso. Elegí otro.')}` : t('No se pudo crear la sala: ') + (e.type || e.message || e);
      this.net.close(); this.players = []; cb && cb(e); this.onLobby && this.onLobby();
    });
  }
  joinRoom(code, name, spec, cb) {
    this.status = t('Buscando la sala') + ' ' + code + '…';
    this.net.join(code, () => { this.net.sendHost({ t: 'hello', name, spec: { ...spec }, device: deviceId() }); cb && cb(null); }, (e) => {
      this.status = e && e.type === 'peer-unavailable' ? `${t('No hay ninguna sala')} ${code}.` : t('No se pudo entrar: ') + (e.type || e.message || e);
      this.net.close(); this.players = []; cb && cb(e); this.onLobby && this.onLobby();
    });
  }
  // el jugador cambió nombre, número o pintura desde el lobby
  updateSelf(name, spec) {
    if (!this.net.role) return;
    const me = this.players.find(p => p.local); if (me) { me.name = name; me.spec = { ...spec }; }
    if (this.net.role === 'host') this.broadcastLobby(); else { this.net.sendHost({ t: 'update', name, spec: { ...spec } }); this.onLobby && this.onLobby(); }
  }
  broadcastLobby() { if (this.net.role !== 'host') return; this.net.broadcast({ t: 'lobby', players: this.players.map(p => ({ id: p.id, name: p.name, spec: p.spec })), roundIdx: this.roundIdx }); this.onLobby && this.onLobby(); }
  setRound(i) { this.roundIdx = i; this.broadcastLobby(); }
  leave() { this.net.close(); this.players = []; this.active = false; this.race = null; }

  // ---------- largada ----------
  // Anfitrión: manda la configuración; todos arman la carrera; los invitados avisan "listo"; el anfitrión larga.
  hostStart() {
    const seed = Math.floor(Math.random() * 1e9);
    const payload = { t: 'start', roundIdx: this.roundIdx, seed, players: this.players.map(p => ({ id: p.id, name: p.name, spec: p.spec })) };
    this.ready.clear();
    this.net.broadcast(payload);
    this.onStart && this.onStart(payload);
  }
  markReady() { if (this.net.role === 'guest') this.net.sendHost({ t: 'ready' }); else { this.hostReady = true; this.tryGo(); } }
  tryGo() {
    if (this.net.role !== 'host' || !this.race || this.race.phase !== 'idle' || !this.hostReady) return;
    const guests = this.players.filter(p => !p.local).map(p => p.id);
    const all = guests.every(id => this.ready.has(id));
    if (all || (this.readyT && performance.now() - this.readyT > 20000)) { this.net.broadcast({ t: 'go' }); this.race.begin(); }
    else if (!this.readyT) { this.readyT = performance.now(); setTimeout(() => this.tryGo(), 20500); }
  }

  // Plantel: solo humanos, en orden de entrada. Igual en todos los peers.
  buildRoster(players, seed) {
    const rnd = mulberry32(seed);
    const used = new Set();
    const localId = this.net.role === 'host' ? 'host' : this.net.myId; // quién soy yo en esta máquina
    // El resto del juego indexa a los pilotos por nombre (grilla, resultados, tiempos), asi que dos
    // personas con el mismo nombre se pisaban y corrian un solo auto: aca se desempatan.
    const nombres = new Set();
    const roster = players.map((p, i) => {
      const spec = p.spec || {};
      let num = spec.number || 7; while (used.has(num)) num = 1 + Math.floor(rnd() * 99); used.add(num);
      let nombre = (p.name || '').trim() || `${t('Jugador')} ${i + 1}`;
      if (nombres.has(nombre)) { let k = 2; while (nombres.has(`${nombre} ${k}`)) k++; nombre = `${nombre} ${k}`; }
      nombres.add(nombre);
      return { name: nombre, isPlayer: p.id === localId, isHuman: true, netId: p.id, color: spec.color || LIVERY_COLORS[i], roofColor: spec.roofColor || spec.color, number: num, accessory: spec.accessory || 'none', stripes: !!spec.stripes, helmetColor: '#e2a33b', skill: 1, aggression: 0.5, seed: 1 + i };
    });
    return roster;
  }

  attach(race) {
    this.race = race; this.active = true; this.acc = 0; this.hostReady = false; this.readyT = 0;
    // qué auto es de quién
    for (const c of race.cars) { c.netId = c.spec.netId || null; if (c.spec.isHuman && !c.isPlayer) c.remote = true; if (!c.spec.isHuman && this.net.role === 'guest') c.remote = true; if (c.remote) { c.state.kinematic = true; c.state.frozen = false; c.ai = null; c.netTarget = null; } }
  }
  dropCar(netId) { const c = this.race.cars.find(x => x.netId === netId); if (c) { c.dropped = true; c.state.finished = true; c.state.finishTime = c.state.finishTime || 9999; } }

  // ---------- estados ----------
  pack(c) {
    const s = c.state;
    return [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +s.heading.toFixed(3), +s.vx.toFixed(2), +s.vz.toFixed(2), +s.steer.toFixed(2), +s.speed.toFixed(2), s.lap, +s.progress.toFixed(1), s.finished ? 1 : 0, s.finishTime ? +s.finishTime.toFixed(2) : 0, +s.throttle.toFixed(1), +s.brake.toFixed(1), s.airborne ? 1 : 0, +(s.totalDamage || 0).toFixed(2)];
  }
  applyIndex(i, arr, tm) { const c = this.race.cars[i]; if (c && c.remote) this.applyArr(c, arr, tm); }
  applyState(from, arr, tm) { const c = this.race.cars.find(x => x.netId === from); if (c && c.remote) this.applyArr(c, arr, tm); }
  applyArr(c, a, tm) {
    const s = c.state;
    c.netTarget = { x: a[0], y: a[1], z: a[2], heading: a[3], vx: a[4], vz: a[5], at: performance.now() };
    s.steer = a[6]; s.speed = a[7]; s.lap = a[8]; s.progress = a[9]; s.finished = !!a[10]; if (a[11]) s.finishTime = a[11]; s.throttle = a[12]; s.brake = a[13]; s.airborne = !!a[14]; s.netDamage = a[15];
    if (!c.netInit) { s.x = a[0]; s.y = a[1]; s.z = a[2]; s.heading = a[3]; c.netInit = true; }
  }
  // interpolación/extrapolación de los autos remotos, cada cuadro
  stepRemotes(dt) {
    const race = this.race, t = race.track;
    for (const c of race.cars) {
      if (!c.remote || !c.netTarget) continue;
      const s = c.state, g = c.netTarget;
      const age = Math.min(0.4, (performance.now() - g.at) / 1000);
      const px = g.x + g.vx * age, pz = g.z + g.vz * age;
      const k = clamp(dt * 10, 0, 1);
      s.x = lerp(s.x, px, k); s.z = lerp(s.z, pz, k); s.y = lerp(s.y, g.y, k);
      s.heading += wrapAngle(g.heading - s.heading) * k;
      s.vx = g.vx; s.vz = g.vz;
      s.wheelAngle += s.speed / 0.32 * dt;
      const near = t.nearest(s.x, s.z, s.trackIdx); s.trackIdx = near.idx; s.lateral = near.lateral; s.surface = t.surfaceAt(near.lateral);
      const L = t.length; s.raceDist = s.lap * L + s.progress - (s.progress > L * 0.7 && s.lap === 0 ? L : 0);
    }
  }
  tick(dt) {
    if (!this.race || !this.active) return;
    this.stepRemotes(dt);
    this.acc += dt; if (this.acc < RATE) return; this.acc = 0;
    const race = this.race, tm = performance.now();
    if (this.net.role === 'host') {
      const c = {}; race.cars.forEach((car, i) => { if (!car.remote || car.netTarget) c[i] = this.pack(car); });
      this.net.broadcast({ t: 'S', tm, c });
    } else {
      this.net.sendHost({ t: 's', tm, s: this.pack(race.player) });
    }
  }
  sendResults(results) { if (this.net.role === 'host') this.net.broadcast({ t: 'results', results: results.map(r => ({ ...r })) }); }
  get isHost() { return this.net.role === 'host'; }
}
export { ROUNDS };
