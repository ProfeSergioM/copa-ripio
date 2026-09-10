// Gestor de carrera: grilla, largada, física de los 20 autos, choques, daños, vueltas, posiciones, rival,
// contrarreloj, grabación de repetición, surcos en el ripio y visuales.
import * as THREE from 'three';
import { t } from './idioma.js';
import { createCar, stepCar, collideCars, collideBarrier, impactZone, applyDamage, resetCarAt } from './physics.js';
import { createCarVisual, disposeCarVisual, deformBody, detachParts, breakHeadlight, setHeadlights, setBrakeLights, setDirt, createRivalStar } from './car.js';
import { AIDriver, buildRacingLine } from './ai.js';
import { CAR, SURFACES, RACE } from './config.js';
import { clamp, formatTime, dampTo } from './util.js';
import { Replay, STRIDE } from './replay.js';

const FIXED = 1 / 120;
const _v = new THREE.Vector3();
const _near = [];

const TAUNTS = {
  start: ['¡Te veo en la primera curva, pibe!', 'Hoy comés polvo, {p}.', 'Ojo con los fardos, que muerden.'],
  passedYou: ['Permiso, que llego tarde a la cantina.', '¡Chau {p}, saludos a tu chapista!', 'Ese fitito tuyo anda a pedal, ¿no?'],
  youPassed: ['¡Eh, eso no vale!', 'Ya te voy a agarrar en la horquilla.', 'Suerte de principiante, {p}.'],
  lastLap: ['Última vuelta, {p}. Sin llorar.', 'Ahora sí, a ver quién es quién.'],
  finishAhead: ['Bien corrido, {p}. La próxima te gano igual.', 'Me distrajo una vaca. Nada más.'],
  finishBehind: ['Te dije que ibas a comer polvo.', 'Gracias por el rebufo, {p}.'],
  crash: ['¡Cuidá la chapa, que no la pagás vos!', '¿Sacaste el carnet en una rifa?'],
};

export class Race {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, track, world, audio, particles, debris, ui, settings, roster, round, gridOrder, chase, champ, stageTimes
    this.cars = []; this.events = [];
    this.mode = this.round.mode || 'race';
    this.phase = 'idle';
    this.time = 0; this.raceTime = 0; this.greenTime = null; this.countT = 0; this.countShown = -1;
    this.laps = this.mode === 'timetrial' ? 1 : this.round.laps; this.acc = 0; this.orderT = 0; this.playerFinishT = null;
    this.lastToast = {}; this.stuckT = 0; this.offTrackT = 0;
    this.track.setDirection(!!this.round.reverse);
    this.line = buildRacingLine(this.track);
    this.world.setTimeOfDay(this.round.tod);
    this.world.setStartLights(0, false);
    this.wet = (this.track.gripScale || 1) < 1;
    this.rivalName = this.champ ? this.champ.rival : null;
    // sectores de cronometraje (tercios de vuelta) y récord personal de la pista
    this.sectorFracs = [1 / 3, 2 / 3];
    this.recordKey = `${this.track.def.id}|${this.track.reverse ? 'inv' : 'nor'}|${this.mode}`;
    this.record = loadRecord(this.recordKey);
    this.curSplits = []; this.sectorIdx = 0;
    this.buildCars();
    this.replay = new Replay(this.cars.length);
    this.ui.prepareMinimap(this.track);
  }

  buildCars() {
    const byName = new Map(this.roster.map(r => [r.name, r]));
    const order = this.mode === 'timetrial' ? this.gridOrder.filter(n => byName.get(n).isPlayer) : this.gridOrder;
    order.forEach((name, i) => {
      const r = byName.get(name);
      const slot = this.track.gridSlot(i);
      const state = createCar(i, slot.x, slot.z, slot.heading);
      state.y = this.track.heightAt(slot.x, slot.z); state.trackIdx = slot.idx;
      const vis = createCarVisual({ color: r.color, roofColor: r.roofColor, number: r.number, accessory: r.accessory, stripes: r.stripes, helmetColor: r.helmetColor, seed: r.seed });
      this.scene.add(vis.root);
      setHeadlights(vis, this.world.night || this.wet || this.world.foggy);
      const car = { state, vis, name: r.name, color: r.color, isPlayer: r.isPlayer, spec: r, ai: null, dustAcc: 0, smokeAcc: 0, position: i + 1, prevPosition: i + 1, honkT: 0, gridSlot: i, lastLapProgress: 0, markAcc: 0, isRival: r.name === this.rivalName };
      if (!r.isPlayer) {
        const dd = this.settings.difficulty - 1;
        // Empuje propio de la pista: en circuitos fáciles (el óvalo) los rivales van con más auto
        const emp = this.track.def.aiBoost || 1;
        state.tune = { torque: (1 + dd * 0.9) * emp, grip: (1.02 + dd * 0.9) * emp, brake: (1 + dd * 0.5) * emp };
        car.ai = new AIDriver(state, this.track, this.line, { skill: r.skill, aggression: r.aggression, seed: r.seed, difficulty: this.settings.difficulty, tune: state.tune });
      }
      else if (this.champ) { state.tune = this.champ.tune(); this.applyCarriedDamage(car, this.champ.damage); }
      if (r.isPlayer && (this.world.night || this.wet || this.world.foggy)) {
        for (const sx of [-0.48, 0.48]) {
          const sp = new THREE.SpotLight('#ffe9b0', 90, 45, 0.55, 0.5, 1.4); sp.position.set(sx, 0.9, 1.5);
          const tgt = new THREE.Object3D(); tgt.position.set(sx * 1.5, 0.2, 14); vis.vis.add(tgt); sp.target = tgt; vis.vis.add(sp);
        }
      }
      this.cars.push(car);
    });
    this.player = this.cars.find(c => c.isPlayer);
    this.rival = this.cars.find(c => c.isRival) || null;
    if (this.rival) { this.star = createRivalStar(); this.scene.add(this.star); }
    this.syncVisuals(0);
  }

  // Daño que viene de fechas anteriores (si no se reparó en el taller): lo aplica y lo dibuja.
  applyCarriedDamage(car, dmg) {
    if (!dmg) return;
    const s = car.state;
    const spots = { front: [0, 0.7, 1.55, 0, 0, -1], rear: [0, 0.8, -1.5, 0, 0, 1], left: [0.75, 0.8, 0.2, -1, 0, 0], right: [-0.75, 0.8, 0.2, 1, 0, 0] };
    for (const zone of ['front', 'rear', 'left', 'right']) {
      const d = clamp(dmg[zone] || 0, 0, 1); if (d <= 0.02) continue;
      applyDamage(s, zone, d);
      const p = spots[zone];
      for (let k = 0; k < 1 + Math.floor(d * 3); k++) deformBody(car.vis, new THREE.Vector3(p[0] + (Math.random() - 0.5) * 0.6, p[1] + (Math.random() - 0.5) * 0.4, p[2] + (Math.random() - 0.5) * 0.6), new THREE.Vector3(p[3], p[4], p[5]), 0.08 + d * 0.2);
      if (zone === 'front' && d > 0.35) breakHeadlight(car.vis, Math.random() < 0.5 ? -1 : 1);
    }
    detachParts(car.vis, s.damage);
  }

  begin() {
    this.phase = 'countdown'; this.countT = -1.2; this.countShown = -1;
    this.audio.state = 'race';
    this.audio.engineStart();
  }

  taunt(kind) {
    if (!this.rival) return;
    const list = TAUNTS[kind]; if (!list) return;
    const txt = list[Math.floor(Math.random() * list.length)].replace('{p}', this.player.name);
    this.ui.taunt(this.rival.name, t(txt).replace('{p}', this.player.name));
  }
  sayTaunt(kind, cooldown) { const now = this.time; if (this.lastToast['taunt'] && now - this.lastToast['taunt'] < cooldown) return; this.lastToast['taunt'] = now; this.taunt(kind); }

  // ---------- Bucle ----------
  update(dt, input) {
    this.time += dt;
    if (this.phase === 'countdown') {
      this.countT += dt;
      const n = Math.floor(this.countT);
      if (n >= 0 && n < RACE.countdown && n !== this.countShown) { this.countShown = n; this.ui.countdown(RACE.countdown - n); this.audio.beep(false); this.world.setStartLights(n + 1, false); }
      if (this.countT >= RACE.countdown) {
        this.phase = 'racing'; this.raceTime = 0; this.greenTime = 0; this.ui.countdown(t('¡VAMOS!'), true); this.audio.beep(true); this.world.setStartLights(3, true);
        setTimeout(() => this.ui.countdown(null), 900); for (const c of this.cars) c.state.frozen = false; this.audio.cheerNow(0.8);
        if (this.mode !== 'timetrial') setTimeout(() => this.taunt('start'), 2500);
      }
    }
    if (this.phase === 'racing' || this.phase === 'finished') this.raceTime += dt;

    const pIn = this.player.state.finished || this.phase === 'idle' ? null : input;
    for (const c of this.cars) {
      if (c.remote) continue;
      if (c.isPlayer && pIn) c.input = pIn;
      else if (c.isPlayer && this.mode === 'timetrial' && c.state.finished) c.input = { steer: 0, throttle: 0, brake: 1, handbrake: false };
      else {
        if (!c.ai) c.ai = new AIDriver(c.state, this.track, this.line, { skill: 0.85, aggression: 0.3, seed: 7, difficulty: 1 });
        c.input = c.ai.update(dt, this.cars.map(x => x.state), this.raceTime, this.phase === 'idle' ? null : this.greenTime);
      }
    }
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= FIXED && steps < 8) {
      this.acc -= FIXED; steps++;
      for (const c of this.cars) if (!c.remote) stepCar(c.state, this.track, FIXED, c.input);
      this.collide();
    }
    this.processEvents();
    if (this.phase !== 'idle') { this.lapLogic(dt); this.finishLogic(dt); this.replay.record(dt, this.cars, this.raceTime); }
    this.orderT -= dt; if (this.orderT <= 0) { this.orderT = 0.2; this.computeOrder(); }
    this.playerFeedback(dt);
    this.syncVisuals(dt);
    if (this.track.marks) this.track.marks.update(dt);
    this.world.cheerLevel = Math.max(0, (this.world.cheerLevel || 0) - dt * 0.5);
  }

  collide() {
    const cars = this.cars, n = cars.length, ev = this.events;
    for (let i = 0; i < n; i++) {
      const a = cars[i].state;
      for (let j = i + 1; j < n; j++) collideCars(a, cars[j].state, ev);
      if (cars[i].remote) continue;
      this.track.barriersNear(a.x, a.z, _near);
      for (const b of _near) collideBarrier(a, b, ev);
    }
  }

  processEvents() {
    const ev = this.events; if (!ev.length) return;
    const byState = new Map(this.cars.map(c => [c.state, c]));
    for (const e of ev) {
      const A = byState.get(e.a), B = e.b ? byState.get(e.b) : null;
      const soft = e.type === 'bale';
      const factor = e.type === 'car' ? 1 : e.type === 'bale' ? 0.45 : e.type === 'tires' ? 0.8 : 1.15;
      const dmg = clamp((e.strength - 4) / 40, 0, 0.2) * factor;
      this.hit(A, e.px, e.pz, -e.nx, -e.nz, e.strength, dmg * (A.isPlayer ? 1 : 1.5));
      if (B) this.hit(B, e.px, e.pz, e.nx, e.nz, e.strength, dmg * (B.isPlayer ? 1 : 1.5));
      const p = this.player.state;
      const involved = A === this.player || B === this.player;
      const d = Math.hypot(e.px - p.x, e.pz - p.z);
      if (this.phase !== 'idle') this.replay.addEvent(this.raceTime, e.px, e.pz, e.strength, involved);
      if (involved || d < 45) {
        const pan = involved ? (e.px - p.x) * Math.cos(p.heading) - (e.pz - p.z) * Math.sin(p.heading) : 0;
        this.audio.impact(e.strength * (involved ? 1 : 0.5 / (1 + d / 20)), -pan * 0.3, soft);
      }
      if (involved && e.strength > 2.5) this.chase.shake(e.strength / 14);
      if (involved && e.strength > 3) {
        const other = A === this.player ? B : A;
        const txt = other ? `${t('¡Toque con')} ${other.name}!` : t(e.type === 'bale' ? '¡Contra los fardos!' : e.type === 'tires' ? '¡Contra las gomas!' : e.type === 'cow' ? '¡Cuidado con la vaca!' : '¡Contra el poste!');
        this.say('hit', txt, 'bad', 1.2);
        if (other && other.ai && Math.random() < 0.35 && other.honkT <= 0) { other.honkT = 4; setTimeout(() => this.audio.horn(0, true), 300); }
        if (other && other.isRival && e.strength > 5) this.sayTaunt('crash', 8);
      }
      if (e.strength > 6) { this.world.raiseFlag(e.px, e.pz, 4); if (d < 90) { this.audio.cheerNow(0.5); this.world.cheerLevel = 1; } }
      const s = clamp(e.strength / 8, 0.2, 1.5), y = (A ? A.state.y : 0);
      for (let k = 0; k < 6 * s; k++) this.particles.emit(e.px, y + 0.5, e.pz, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.12, 0.25 + Math.random() * 0.2, 1, 0.85, 0.3, 0.9, 0);
      for (let k = 0; k < 4 * s; k++) this.particles.emit(e.px, y + 0.4, e.pz, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.9, 0.8 + Math.random(), 0.8, 0.7, 0.5, 0.45, 2);
    }
    ev.length = 0;
  }

  hit(car, px, pz, nx, nz, strength, dmg) {
    const s = car.state;
    if (dmg <= 0) return;
    if (this.time - s.lastImpactT < 0.3) return;
    s.lastImpactT = this.time;
    const zone = impactZone(s, px, pz);
    applyDamage(s, zone, dmg);
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading), lx = Math.cos(s.heading), lz = -Math.sin(s.heading);
    const rx = px - s.x, rz = pz - s.z;
    const local = new THREE.Vector3(rx * lx + rz * lz, 0.55 + Math.random() * 0.35, rx * fx + rz * fz - 0.12);
    const dir = new THREE.Vector3(nx * lx + nz * lz, 0, nx * fx + nz * fz);
    deformBody(car.vis, local, dir, clamp(dmg * 1.3, 0.06, 0.3));
    if (zone === 'front' && s.damage.front > 0.3 && Math.random() < 0.6) { if (breakHeadlight(car.vis, local.x > 0 ? -1 : 1) && car.isPlayer) this.say('hl', 'Faro roto', 'bad', 3); }
    if (zone === 'rear' && s.damage.rear > 0.6 && car.isPlayer) this.say('eng', 'Motor golpeado: pierde fuerza', 'bad', 6);
    for (const p of detachParts(car.vis, s.damage)) {
      this.debris.spawn(p.mesh, p.x, p.y, p.z, s.vx * 0.6 + (Math.random() - 0.5) * 4, 3 + Math.random() * 3, s.vz * 0.6 + (Math.random() - 0.5) * 4);
      if (car.isPlayer) this.say('part', '¡Se te cayó una pieza!', 'bad', 3);
    }
  }

  // ---------- Vueltas y posiciones ----------
  // Cruce de sector del jugador: muestra la diferencia contra el récord (o contra el mejor rival en el tramo)
  checkSectors(prev, p) {
    const s = this.player.state, L = this.track.length;
    if (this.raceTime < 1 || s.finished) return;
    const k = this.sectorIdx;
    if (k < this.sectorFracs.length && prev < this.sectorFracs[k] * L && p >= this.sectorFracs[k] * L) {
      const split = s.lapTime;
      this.curSplits[k] = split;
      let ref = null;
      if (this.mode === 'timetrial') { const best = Math.min(...Object.values(this.stageTimes || { a: Infinity })); if (isFinite(best)) ref = best * this.sectorFracs[k]; }
      else if (this.record && this.record.splits && this.record.splits[k] != null) ref = this.record.splits[k];
      this.ui.split(k + 1, split, ref == null ? null : split - ref);
      this.sectorIdx++;
    }
  }
  lapLogic(dt) {
    const L = this.track.length, open = !this.track.closed;
    for (const c of this.cars) {
      const s = c.state;
      if (c.remote) { c.lastLapProgress = s.progress; continue; }
      if (s.finished) continue;
      const p = s.progress, prev = c.lastLapProgress;
      if (c.isPlayer) this.checkSectors(prev, p);
      if (open) {
        s.raceDist = p;
        if (p >= L - 3 && this.raceTime > 1) {
          s.lapTimes.push(s.lapTime); s.bestLap = s.lapTime; s.lap = 1;
          if (c.isPlayer) { const ref = this.record ? this.record.bestLap : null; if (ref == null || s.lapTime < ref) { this.record = { bestLap: s.lapTime, splits: [this.curSplits[0], this.curSplits[1]], when: Date.now() }; saveRecord(this.recordKey, this.record); if (ref != null) this.ui.banner(t('¡RÉCORD DEL TRAMO!'), 2200); } }
          this.finishCar(c);
        }
        c.lastLapProgress = p;
        continue;
      }
      if (p > L * 0.4 && p < L * 0.6) s.halfPassed = true;
      if (prev > L * 0.85 && p < L * 0.15 && s.halfPassed) {
        s.halfPassed = false;
        if (this.raceTime > 1) {
          s.lap++; s.lapTimes.push(s.lapTime);
          if (s.bestLap == null || s.lapTime < s.bestLap) { s.bestLap = s.lapTime; if (c.isPlayer && s.lap > 1) this.say('best', `${t('¡Mejor vuelta!')} ${formatTime(s.lapTime)}`, 'good', 0); }
          else if (c.isPlayer) this.say('lap', `Vuelta ${formatTime(s.lapTime)}`, '', 0);
          if (c.isPlayer) {
            const ref = this.record ? this.record.bestLap : null;
            this.ui.split(3, s.lapTime, ref == null ? null : s.lapTime - ref);
            if (ref == null || s.lapTime < ref) { this.record = { bestLap: s.lapTime, splits: [this.curSplits[0], this.curSplits[1]], when: Date.now() }; saveRecord(this.recordKey, this.record); if (ref != null) this.ui.banner(t('¡RÉCORD DE LA PISTA!'), 2200); }
            this.curSplits = []; this.sectorIdx = 0;
          }
          s.lapTime = 0;
          if (c.isPlayer) { this.audio.cheerNow(0.6); this.world.cheerLevel = 0.8; if (s.lap === this.laps - 1) { this.ui.banner(t('¡ÚLTIMA VUELTA!')); this.sayTaunt('lastLap', 5); } }
          if (s.lap >= this.laps) this.finishCar(c);
        }
      } else if (prev < L * 0.15 && p > L * 0.85 && s.lap > 0) { s.lap--; s.halfPassed = true; }
      c.lastLapProgress = p;
      s.raceDist = s.lap * L + p - (p > L * 0.7 && !s.halfPassed ? L : 0);
    }
    if (this.phase === 'racing' || this.phase === 'finished') for (const c of this.cars) if (!c.state.finished && !c.remote) c.state.lapTime += dt;
  }
  finishCar(c) {
    const s = c.state; s.finished = true; s.finishTime = this.raceTime;
    if (c.ai) c.ai.speedFactor *= 0.75;
    if (c.isPlayer) {
      this.playerFinishT = this.raceTime; this.phase = 'finished';
      if (this.mode === 'timetrial') this.ui.banner(`${t('¡LLEGASTE!')} ${formatTime(this.raceTime)}`, 4000);
      else this.ui.banner(`${t('¡LLEGASTE P')}${c.position}!`, 4000);
      this.audio.cheerNow(1); this.world.cheerLevel = 1.5;
      if (c.position === 1) this.audio.horn(0, false);
      if (this.rival) setTimeout(() => this.taunt(this.rival.state.finished && this.rival.state.finishTime < s.finishTime ? 'finishBehind' : 'finishAhead'), 1500);
    }
  }
  finishLogic(dt) {
    if (this.netGuest) return; // en red, los resultados los decide el anfitrión
    if (this.playerFinishT == null && !(this.netHost && this.cars.some(c => c.isPlayer && c.state.finished))) return;
    if (this.playerFinishT == null) return;
    const allDone = this.cars.every(c => c.state.finished);
    // no se espera al resto: a los 3 s se estiman los tiempos de los que faltan
    const wait = this.netHost ? 30 : 3; // en red se espera a los humanos (hasta 30 s)
    const humansDone = this.cars.filter(c => c.spec.isHuman).every(c => c.state.finished);
    if (allDone || (this.netHost ? humansDone : false) || this.raceTime - this.playerFinishT > wait || this.skipRequested) this.complete();
  }
  complete() {
    if (this.completed) return; this.completed = true;
    if (this.mode === 'timetrial') {
      const rows = [{ name: this.player.name, color: this.player.color, time: this.player.state.finishTime, finished: true, isPlayer: true, damage: { ...this.player.state.damage }, bestLap: this.player.state.finishTime }];
      for (const r of this.roster) if (!r.isPlayer) rows.push({ name: r.name, color: r.color, time: this.stageTimes[r.name] || 999, finished: true, isPlayer: false, damage: null, bestLap: this.stageTimes[r.name] || 999 });
      rows.sort((a, b) => a.time - b.time);
      this.results = rows.map((r, i) => ({ ...r, position: i + 1 }));
    } else {
      // los que no llegaron: tiempo estimado por distancia restante y ritmo medio (con algo de azar)
      const total = this.laps * this.track.length;
      for (const c of this.cars) {
        const s = c.state; if (s.finished) continue;
        const pace = Math.max(8, s.raceDist / Math.max(1, this.raceTime));
        s.finishTime = this.raceTime + Math.max(0, total - s.raceDist) / pace * (1 + (Math.random() - 0.5) * 0.06);
        s.estimated = true;
      }
      const order = [...this.cars].sort((a, b) => a.state.finishTime - b.state.finishTime);
      this.results = order.map((c, i) => ({ name: c.name, color: c.color, position: i + 1, finished: !c.state.estimated, time: c.state.finishTime, bestLap: c.state.bestLap, damage: { ...c.state.damage }, isPlayer: c.isPlayer }));
    }
    this.onComplete && this.onComplete(this.results);
  }
  finalOrder() {
    return [...this.cars].sort((a, b) => {
      if (a.state.finished && b.state.finished) return a.state.finishTime - b.state.finishTime;
      if (a.state.finished) return -1; if (b.state.finished) return 1;
      return b.state.raceDist - a.state.raceDist;
    });
  }
  computeOrder() {
    const order = this.finalOrder();
    order.forEach((c, i) => { c.prevPosition = c.position; c.position = i + 1; });
    this.order = order;
    const me = this.player;
    if (this.phase === 'racing' && !me.state.finished && this.raceTime > 3 && this.mode !== 'timetrial') {
      if (me.position < me.prevPosition) {
        const passed = order[me.position];
        if (passed) { this.say('pass', `${t('Adelantaste a')} ${passed.name}`, 'good', 1.5); if (passed.isRival) this.sayTaunt('youPassed', 6); }
        if (this.nearGrandstand()) { this.audio.cheerNow(0.7); this.world.cheerLevel = 1; }
      } else if (me.position > me.prevPosition) {
        const by = order[me.position - 2];
        if (by) { this.say('passed', `${t('Te pasó')} ${by.name}`, 'bad', 1.5); if (by.isRival) this.sayTaunt('passedYou', 6); }
      }
    }
  }
  nearGrandstand() { const g = this.world.grandstandPos; return g && Math.hypot(this.player.state.x - g.x, this.player.state.z - g.z) < 60; }

  say(key, text, kind, cooldown) {
    const now = this.time;
    if (cooldown && this.lastToast[key] && now - this.lastToast[key] < cooldown) return;
    this.lastToast[key] = now; this.ui.toast(text, kind);
  }

  playerFeedback(dt) {
    const p = this.player.state;
    if (this.phase !== 'racing') return;
    let slip = 0;
    for (const c of this.cars) {
      if (c === this.player) continue;
      const o = c.state; const dx = o.x - p.x, dz = o.z - p.z; const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * Math.cos(p.heading) - dz * Math.sin(p.heading));
      if (ahead > 3 && ahead < 14 && side < 2.2 && Math.abs(p.speed) > 12) slip = Math.max(slip, 1 - side / 2.2);
    }
    p.slipstream = dampTo(p.slipstream, slip, 4, dt);
    if (p.surface === 'grass' || p.surface === 'ditch') { this.offTrackT += dt; if (this.offTrackT > 1.2) { this.say('grass', p.surface === 'ditch' ? '¡A la zanja!' : '¡Al pasto!', 'bad', 6); this.offTrackT = -4; } } else this.offTrackT = Math.max(0, this.offTrackT);
    if (p.landedImpact > 5) { this.audio.landing(p.landedImpact); this.chase.shake(0.4); this.say('jump', t('¡Qué salto!'), 'good', 5); }
    if (Math.abs(p.speed) < 2 && this.raceTime > 5 && !p.finished) { this.stuckT += dt; if (this.stuckT > 4) { this.say('stuck', t('Apretá R para volver a la pista'), '', 8); this.stuckT = 0; } } else this.stuckT = 0;
    for (const c of this.cars) if (Math.abs(c.state.speed) < 2 && this.raceTime > 6 && !c.state.finished) this.world.raiseFlag(c.state.x, c.state.z, 1);
  }

  resetPlayer() {
    const p = this.player.state;
    const back = this.track.wrap(p.trackIdx - 4), q = this.track.samples[back];
    resetCarAt(p, q.x + q.nx * clamp(p.lateral, -3, 3), q.z + q.nz * clamp(p.lateral, -3, 3), q.heading);
    p.y = this.track.heightAt(p.x, p.z); this.chase.init = false;
  }

  // ---------- Visuales ----------
  syncVisuals(dt) {
    const camX = this.chase.cam.position.x, camZ = this.chase.cam.position.z;
    this.updateStar(dt);
    const mud = this.wet;
    for (const c of this.cars) {
      const s = c.state, v = c.vis;
      v.root.position.set(s.x, s.y, s.z); v.root.rotation.y = s.heading;
      // nivel de detalle: de lejos se ocultan los adornos (cromados, paragolpes, piloto, tazas)
      const dCam2 = (s.x - camX) ** 2 + (s.z - camZ) ** 2;
      // un rival pegado a la cámara se ve como un manchón que tapa la pantalla: no se dibuja
      v.root.visible = c.isPlayer || dCam2 > 2.4 * 2.4;
      if (v.lod) { const cerca = c.isPlayer || dCam2 < 30 * 30; if (cerca !== v.lodCerca) { v.lodCerca = cerca; for (const m of v.lod) m.visible = cerca; } }
      let pitch = clamp(Math.atan(s.gradF || 0) - s.accFwd * 0.012, -0.3, 0.3), roll = clamp(-Math.atan(s.gradL || 0) - s.accLat * 0.02, -0.3, 0.3);
      if (s.airborne) pitch = clamp(-s.vy * 0.05, -0.35, 0.35);
      const bump = (!s.airborne && Math.abs(s.speed) > 3) ? Math.sin(this.time * 37 + c.gridSlot) * 0.006 * SURFACES[s.surface].rolling * clamp(Math.abs(s.speed) / 15, 0, 1) : 0;
      v.vis.rotation.x = dampTo(v.vis.rotation.x, pitch, 8, dt || 0.016); v.vis.rotation.z = dampTo(v.vis.rotation.z, roll, 8, dt || 0.016);
      v.vis.position.y = bump;
      setBrakeLights(v, s.brake > 0.2 || s.handbrake);
      // el barro se va pegando a la carrocería (más rápido con lluvia y fuera del ripio); la reparación lo limpia
      if (!s.airborne && Math.abs(s.speed) > 3) { c.dirt = Math.min(1, (c.dirt || 0) + dt * Math.abs(s.speed) / 25 * (s.surface === 'gravel' ? 0.045 : 0.09) * (mud ? 2.5 : 1)); setDirt(v, c.dirt); }
      for (const w of v.wheels) {
        w.spin.rotation.x = s.wheelAngle;
        if (w.steer) w.group.rotation.y = s.steer;
        const sd = w.side > 0 ? s.damage.left : s.damage.right;
        w.group.rotation.z = sd > 0.6 ? Math.sin(s.wheelAngle) * 0.12 * sd : 0;
      }
      // surcos: huellas de las ruedas traseras cada ~0.7 m
      if (dt > 0 && this.track.marks && !s.airborne && (s.surface === 'gravel' || s.surface === 'shoulder')) {
        c.markAcc += Math.abs(s.speed) * dt;
        if (c.markAcc > 0.7) {
          c.markAcc = 0;
          const strength = clamp(0.15 + Math.abs(s.lateralV) / 6 + s.wheelspin * 0.6 + s.brake * 0.3, 0, 1);
          const cosH = Math.cos(s.heading - this.track.samples[s.trackIdx].heading);
          for (const side of [-1, 1]) this.track.marks.mark(s.progress - 0.9, s.lateral + side * 0.66 * cosH, strength);
        }
      }
      const d2 = (s.x - camX) ** 2 + (s.z - camZ) ** 2;
      if (d2 < 140 * 140 && dt > 0) {
        const surf = SURFACES[s.surface];
        const sp = Math.abs(s.speed);
        if (!s.airborne && sp > 2) {
          const slide = clamp(Math.abs(s.lateralV) / 4, 0, 1.5) + s.wheelspin;
          const rate = surf.dust * (0.25 + slide) * clamp(sp / 18, 0, 1.4) * (mud ? 14 : 17);
          c.dustAcc += rate * dt;
          const fx = Math.sin(s.heading), fz = Math.cos(s.heading), lx = Math.cos(s.heading), lz = -Math.sin(s.heading);
          const col = mud ? [0.36, 0.28, 0.18] : (s.surface === 'grass' || s.surface === 'ditch' ? [0.55, 0.6, 0.35] : [0.52, 0.4, 0.26]);
          while (c.dustAcc >= 1) {
            c.dustAcc--;
            const side = Math.random() < 0.5 ? 1 : -1;
            const x = s.x - fx * 0.9 + lx * side * 0.7, z = s.z - fz * 0.9 + lz * side * 0.7;
            if (mud) this.particles.emit(x, s.y + 0.3, z, -s.vx * 0.2 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, -s.vz * 0.2 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 0.5 + Math.random() * 0.4, col[0], col[1], col[2], 0.8, 0.2);
            else this.particles.emit(x, s.y + 0.25, z, -s.vx * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, -s.vz * 0.15 + (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.5, 1.1 + Math.random() * 1.2 + slide * 0.5, col[0], col[1], col[2], 0.32, 2.4);
          }
        }
        if (s.landedImpact > 4) for (let k = 0; k < 10; k++) this.particles.emit(s.x, s.y + 0.2, s.z, (Math.random() - 0.5) * 5, Math.random() * 2, (Math.random() - 0.5) * 5, 1, 1.5, 0.82, 0.7, 0.5, 0.4, 2.5);
        if (!s.airborne && s.surface === 'gravel' && sp > 8 && Math.random() < dt * (6 + sp * 0.4 + s.wheelspin * 20)) { const fx = Math.sin(s.heading), fz = Math.cos(s.heading), lx = Math.cos(s.heading), lz = -Math.sin(s.heading); const side = Math.random() < 0.5 ? 1 : -1; this.particles.emit(s.x - fx * 1.0 + lx * side * 0.7, s.y + 0.2, s.z - fz * 1.0 + lz * side * 0.7, -s.vx * 0.35 + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 3, -s.vz * 0.35 + (Math.random() - 0.5) * 4, 0.08, 0.9, 0.3, 0.22, 0.13, 1, 0, -9.8); }
        if (s.throttle > 0.6 && Math.random() < dt * 8) { _v.copy(v.exhaustAnchor).applyMatrix4(v.root.matrixWorld); this.particles.emit(_v.x, _v.y, _v.z, -s.vx * 0.3, 0.6, -s.vz * 0.3, 0.3, 0.5, 0.5, 0.5, 0.5, 0.3, 1.5); }
        if (s.throttle < 0.1 && s.rpm > 4200 && Math.random() < dt * 3) { _v.copy(v.exhaustAnchor).applyMatrix4(v.root.matrixWorld); for (let k = 0; k < 3; k++) this.particles.emit(_v.x, _v.y, _v.z, -s.vx * 0.5 + (Math.random() - 0.5), 0.3, -s.vz * 0.5 + (Math.random() - 0.5), 0.22, 0.12, 1, 0.6, 0.15, 0.95, 0); }
        if (c.remote && s.netDamage > 0.5 && Math.random() < dt * 4) { _v.copy(v.smokeAnchor).applyMatrix4(v.root.matrixWorld); this.particles.emit(_v.x, _v.y, _v.z, 0, 1, 0, 0.6, 1.5, 0.4, 0.4, 0.42, 0.5, 2); }
        if (s.damage.rear > 0.45) {
          c.smokeAcc += (s.damage.rear - 0.3) * 18 * dt;
          _v.copy(v.smokeAnchor).applyMatrix4(v.root.matrixWorld);
          while (c.smokeAcc >= 1) { c.smokeAcc--; const dark = s.damage.rear > 0.8 ? 0.2 : 0.45; this.particles.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.6, 1.0 + Math.random(), (Math.random() - 0.5) * 0.6, 0.6, 1.6 + Math.random(), dark, dark, dark + 0.02, 0.5, 2.2); }
        }
        if (c.honkT > 0) c.honkT -= dt;
      }
    }
  }

  updateStar(dt) {
    if (!this.star || !this.rival) return;
    const r = this.rival.vis.root;
    this.star.position.set(r.position.x, r.position.y + 2.35 + Math.sin(this.time * 3) * 0.12, r.position.z);
    this.star.rotation.y += (dt || 0.016) * 1.6;
  }
  // Poses desde un cuadro de repetición (interpolado)
  applyReplayFrame(f) {
    if (!f) return;
    this.updateStar(0.016);
    this.cars.forEach((c, i) => {
      const k = i * STRIDE, v = c.vis;
      v.root.position.set(f[k], f[k + 1], f[k + 2]); v.root.rotation.y = f[k + 3];
      v.vis.rotation.x = f[k + 4]; v.vis.rotation.z = f[k + 5];
      for (const w of v.wheels) { w.spin.rotation.x = f[k + 7]; if (w.steer) w.group.rotation.y = f[k + 6]; }
    });
  }

  hudData() {
    const p = this.player, s = p.state;
    const order = this.order || this.cars;
    const rows = [];
    if (this.mode === 'timetrial') {
      const times = Object.entries(this.stageTimes || {}).map(([name, t]) => ({ name, t })).sort((a, b) => a.t - b.t);
      const mine = s.finished ? s.finishTime : null;
      let rank = 1; if (mine != null) rank = times.filter(x => x.t < mine).length + 1;
      times.slice(0, 5).forEach((x, i) => rows.push({ pos: i + 1, name: x.name, color: (this.roster.find(r => r.name === x.name) || {}).color || '#888', me: false, gap: formatTime(x.t) }));
      rows.push({ pos: mine != null ? rank : '–', name: p.name, color: p.color, me: true, gap: formatTime(mine != null ? mine : s.lapTime) });
      return { position: mine != null ? rank : '–', total: times.length + 1, lap: 0, laps: 1, lapTime: s.lapTime, best: null, record: this.record ? this.record.bestLap : null, gear: s.gear, reverse: s.reverse, damage: s.damage, slipstream: false, wrongWay: s.wrongWay > 1.5, order: rows, kmh: s.speed * 3.6, rpm: (s.rpm - 800) / (CAR.redline - 800), timetrial: true, sector: this.track.sector(s.trackIdx), progress: s.progress / this.track.length };
    }
    const show = new Set([0, 1, 2, 3, 4]);
    const myIdx = order.indexOf(p);
    show.add(myIdx - 1); show.add(myIdx); show.add(myIdx + 1);
    if (this.rival) show.add(order.indexOf(this.rival));
    // ¿alguien viene a pasarme? (atrás, cerca y más rápido)
    let arrowL = false, arrowR = false;
    for (const c of this.cars) {
      if (c === p) continue;
      const o = c.state; let dp = o.progress - s.progress; const L = this.track.length; if (this.track.closed) { if (dp < -L / 2) dp += L; if (dp > L / 2) dp -= L; }
      if (dp < -1 && dp > -14 && o.speed > s.speed + 0.5) { if (o.lateral > s.lateral) arrowL = true; else arrowR = true; }
    }
    const leader = order[0];
    for (const i of [...show].filter(i => i >= 0 && i < order.length).sort((a, b) => a - b)) {
      const c = order[i];
      let gap = '';
      if (i > 0) { const dd = leader.state.raceDist - c.state.raceDist; gap = c.state.finished && leader.state.finished ? '+' + (c.state.finishTime - leader.state.finishTime).toFixed(1) + 's' : '+' + Math.round(dd) + 'm'; }
      rows.push({ pos: i + 1, name: c.name + (c.isRival ? ' ★' : ''), color: c.color, me: c === p, gap });
    }
    return { position: p.position, total: this.cars.length, lap: s.lap, laps: this.laps, lapTime: s.lapTime, best: s.bestLap, record: this.record ? this.record.bestLap : null, gear: s.gear, reverse: s.reverse, damage: s.damage, slipstream: s.slipstream > 0.5, wrongWay: s.wrongWay > 1.5, order: rows, kmh: s.speed * 3.6, rpm: (s.rpm - 800) / (CAR.redline - 800), rival: this.rival ? { name: this.rival.name, pos: this.rival.position } : null, arrowL, arrowR, leader: order[0] };
  }

  dispose() {
    for (const c of this.cars) { this.scene.remove(c.vis.root); disposeCarVisual(c.vis); }
    if (this.star) { this.scene.remove(this.star); this.star.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.compartido) o.material.dispose(); }); }
    this.debris.clear();
  }
}

// Récords personales por pista (localStorage)
const RECORDS_KEY = 'coparipio.records';
function loadRecord(key) { try { const all = JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}'); return all[key] || null; } catch (e) { return null; } }
function saveRecord(key, rec) { try { const all = JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}'); all[key] = rec; localStorage.setItem(RECORDS_KEY, JSON.stringify(all)); } catch (e) { /* nada */ } }
