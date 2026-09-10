// Pilotos rivales: línea de carrera, velocidad objetivo por curvatura, esquive, errores y recuperación.
import { clamp, wrapAngle, lerp, sign, mulberry32 } from './util.js';
import { GRAVITY, CAR, SURFACES } from './config.js';
import { steerLimit, resetCarAt } from './physics.js';

// Línea de carrera aproximada (exterior-interior-exterior) por muestra.
export function buildRacingLine(track) {
  const s = track.samples, n = track.n, hw = track.hw;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let ahead = 0; for (let k = 14; k < 40; k++) ahead += s[track.wrap(i + k)].curvS; ahead /= 26;
    const now = s[i].curvS;
    raw[i] = 0.45 * hw * clamp(now * 42, -1, 1) - 0.35 * hw * clamp(ahead * 42, -1, 1);
  }
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let k = -18; k <= 18; k++) a += raw[track.wrap(i + k)]; line[i] = clamp(a / 37, -0.62 * hw, 0.62 * hw); }
  return line;
}

const _bar = [];

export class AIDriver {
  constructor(car, track, line, profile) {
    this.car = car; this.track = track; this.line = line;
    this.skill = profile.skill; this.aggr = profile.aggression; this.difficulty = profile.difficulty || 1;
    this.rnd = mulberry32(profile.seed || 1);
    this.bias = (this.rnd() - 0.5) * 3; this.biasTarget = this.bias; this.latTarget = null;
    this.reaction = 0.05 + (1 - this.skill) * 0.25 + this.rnd() * 0.12; // reflejos de piloto: casi como el jugador
    this.mistakeT = 4 + this.rnd() * 8; this.mistake = 0; this.mistakeSteer = 0;
    this.stuckT = 0; this.recoverT = 0; this.recoverSteer = 0; this.lostT = 0; this.slowT = 0; this.resets = 0;
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    // La dificultad no infla la estimación: la ventaja real viene del "tune" del auto (más agarre, par y frenos),
    // y la IA conoce ese agarre. Si la estimación crece más que el agarre real, entran pasados y se van afuera.
    const tune = profile.tune || { grip: 1, brake: 1 };
    this.speedFactor = (0.91 + 0.09 * this.skill) * (1 + Math.max(0, this.difficulty - 1) * (profile.sfk != null ? profile.sfk : 0.35)) * (profile.pace || 1);
    this.decel = 4.3 * (0.85 + 0.3 * this.skill) * (tune.brake || 1);
    // Cuánto agarre lateral cree tener el piloto. Medido con herramientas/agarre.mjs, el auto sostiene
    // ~0,55 g en curva sostenida, bastante menos que el µ nominal de las gomas: el modelo de deriva nunca
    // llega al tope. Con la estimación vieja entraba pasado a todas las curvas, iba con el volante al tope
    // derrapando y salía más lento que si hubiera pasado limpio.
    const MUK = profile.muk || 0.46;
    this.hs = profile.hs != null ? profile.hs : 0.015; // pérdida de agarre estimado en curvas rápidas (por m/s sobre 12)
    this.muKnown = SURFACES.gravel.grip * MUK * (0.9 + 0.12 * this.skill) * (tune.grip || 1);
    this.throttleSmooth = 0; this.honk = 0;
  }

  update(dt, cars, raceTime, greenTime) {
    const c = this.car, t = this.track, s = t.samples, n = t.n, inp = this.input;
    if (greenTime == null || raceTime < greenTime + this.reaction) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.handbrake = true; this.stuckT = -1.5; return inp; }
    const speed = c.speed;

    // deriva lenta del sesgo lateral: reparte a los autos por el ancho
    if (this.rnd() < dt * 0.06) this.biasTarget = (this.rnd() - 0.5) * 3;
    this.bias = lerp(this.bias, this.biasTarget, dt * 0.25);

    // ---- errores ocasionales
    this.mistakeT -= dt;
    if (this.mistakeT < 0) {
      this.mistakeT = 5 + this.rnd() * 10;
      if (this.rnd() < (1 - this.skill) * 0.7) { this.mistake = 0.4 + this.rnd() * 0.5; this.mistakeSteer = (this.rnd() - 0.5) * 0.9; }
    }
    if (this.mistake > 0) this.mistake -= dt;

    // ---- red de seguridad: perdido lejos del ripio o atascado mucho tiempo → vuelve al borde de la pista
    const sm = s[c.trackIdx];
    const farOff = Math.abs(c.lateral) > t.W + 7;
    if (Math.abs(speed) < 1.5) this.slowT += dt; else if (Math.abs(speed) > 5) this.slowT = Math.max(0, this.slowT - dt * 2);
    if (farOff && Math.abs(speed) < 6) this.lostT += dt; else this.lostT = Math.max(0, this.lostT - dt);
    if ((this.lostT > 5 || this.slowT > 6) && !c.finished && raceTime > greenTime + 6) {
      const side = sign(c.lateral) || 1, q = s[t.wrap(c.trackIdx + 4)];
      resetCarAt(c, q.x + q.nx * side * (t.hw - 1.4), q.z + q.nz * side * (t.hw - 1.4), q.heading);
      c.y = t.heightAt(c.x, c.z); c.trackIdx = q.idx != null ? q.idx : c.trackIdx;
      this.lostT = 0; this.slowT = 0; this.stuckT = 0; this.recoverT = 0; this.latTarget = null; this.resets++;
    }
    // ---- recuperación (atascado o mirando al revés)
    const headErr = wrapAngle(sm.heading - c.heading);
    if (Math.abs(speed) < 1.2 && !c.finished) this.stuckT += dt; else this.stuckT = 0;
    if (this.recoverT <= 0 && (this.stuckT > 1.6 || (Math.abs(headErr) > 2.2 && Math.abs(speed) < 6))) {
      this.recoverT = 1.4; this.recoverSteer = Math.abs(c.lateral) > t.W + 3 ? sign(c.lateral) : (-sign(headErr) || 1); this.stuckT = 0;
    }
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = this.recoverSteer; inp.handbrake = false;
      if (this.recoverT < 0.3 && Math.abs(speed) < 0.6) { inp.brake = 0; inp.throttle = 0.6; inp.steer = -this.recoverSteer * 0.6; }
      return inp;
    }

    // ---- punto objetivo (pure pursuit) sobre la línea de carrera
    const look = clamp(5 + Math.abs(speed) * 0.55, 7, 26);
    const li = t.wrap(c.trackIdx + Math.round(look));
    const tgt = s[li];
    let lat = this.line[li] + this.bias;
    // primeros metros: cada uno en su columna de largada, sin cruzarse
    if (this.gridLat == null) this.gridLat = c.lateral;
    const sinceGreen = raceTime - greenTime;
    if (sinceGreen < 12 && t.closed) { const w = clamp((sinceGreen - 5) / 7, 0, 1); lat = lerp(this.gridLat, lat, w); }
    if (c.lateral > t.W + 1 || c.lateral < -t.W - 1) {
      // afuera del ripio: si estoy del lado exterior de una curva con muro de gomas, sigo paralelo hasta que termine
      const cA = s[t.wrap(c.trackIdx + 6)].curvS;
      const outsideWall = Math.abs(cA) > 1 / 48 && Math.sign(c.lateral) === -Math.sign(cA) && Math.abs(c.lateral) > t.W + 6.5;
      lat = outsideWall ? Math.sign(c.lateral) * (t.W + 8.5) : 0;
      this.outsideWall = outsideWall;
    } else this.outsideWall = false;

    // ---- esquive de otros autos
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
    let brakeFor = 0, closest = null, closestDz = 1e9, followCap = 1e9, packAhead = 0, sideShift = 0;
    let leftBlocked = false, rightBlocked = false;
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z; if (dx * dx + dz * dz > 34 * 34) continue;
      const lz_ = dx * fx + dz * fz, lx_ = dx * lx + dz * lz;
      const oSpeed = o.vx * fx + o.vz * fz;
      const closing = speed - oSpeed;
      // medido sobre la pista (sirve también en curva)
      let dprog = o.progress - c.progress; if (t.closed) { if (dprog < -t.length / 2) dprog += t.length; if (dprog > t.length / 2) dprog -= t.length; }
      const dlat = o.lateral - c.lateral;
      if (Math.abs(dprog) < 4.5 && Math.abs(dlat) < 3.2) { if (dlat > 0) leftBlocked = true; else rightBlocked = true; }
      // seguimiento en mi carril: mantener distancia según velocidad (modelo de tránsito)
      if (dprog > 0.5 && dprog < 32 && Math.abs(dlat) < 2.4) {
        if (oSpeed < 2.5 && dprog > 2.5) {
          // auto casi parado adelante: es un obstáculo, lo esquivo en vez de frenar detrás
          sideShift += -Math.sign(dlat || (this.rnd() < 0.5 ? 1 : -1)) * (2.8 - Math.min(Math.abs(dlat), 2.8)) * 1.3;
          if (dprog < 8) followCap = Math.min(followCap, 6 + dprog);
        } else {
          const gap = 5 + Math.abs(speed) * (0.45 - 0.15 * this.aggr);
          if (dprog < gap + 8) followCap = Math.min(followCap, Math.max(dprog > 4 ? 3 : 0, oSpeed + (dprog - gap) * 1.2));
        }
        if (dprog < 20) packAhead++;
      }
      // alguien al lado: me corro un poco para no rozar
      if (Math.abs(dprog) < 4.5 && Math.abs(dlat) < 2.6 && Math.abs(dlat) > 0.05) sideShift += -Math.sign(dlat) * (2.6 - Math.abs(dlat)) * 0.6;
      if (lz_ < -2.5 || lz_ > 22 || Math.abs(lx_) > 4) continue;
      if (lz_ > 0 && lz_ < closestDz) { closestDz = lz_; closest = { o, lz_, lx_, closing }; }
      if (lz_ > 0 && lz_ < 5 && Math.abs(lx_) < 1.9 && closing > 1) brakeFor = Math.max(brakeFor, clamp((closing - 1) / 6, 0, 1) * (1 - 0.6 * this.aggr));
    }
    if (closest && sinceGreen > 4) {
      const w = clamp(1 - closest.lz_ / 20, 0, 1) * (closest.closing > -1 ? 1 : 0.3);
      const otherLat = closest.o.lateral;
      const room = 2.9;
      let side = (otherLat > c.lateral + 0.2) ? -1 : (otherLat < c.lateral - 0.2 ? 1 : (this.rnd() < 0.5 ? -1 : 1));
      if ((side > 0 && leftBlocked) || (side < 0 && rightBlocked)) side = 0; // no me tiro al carril ocupado
      if (side !== 0) { const want = clamp(otherLat + side * room, -t.hw + 0.4, t.hw - 0.4); lat = lerp(lat, want, w); }
    }
    // barreras fijas por delante (postes, banderilleros, árboles, vacas): me corro y bajo el ritmo
    t.barriersNear(c.x + fx * 6, c.z + fz * 6, _bar);
    let barBrake = 0;
    const onTrack = Math.abs(c.lateral) < t.hw + 0.5 && Math.abs(headErr) < 0.35;
    for (const b of _bar) {
      const bx = b.x - c.x, bz = b.z - c.z;
      const bl = bx * fx + bz * fz, bs = bx * lx + bz * lz;
      if (bl < -1 || bl > 12) continue;
      // si voy bien por el ripio, lo que está fuera de la cinta no me preocupa (fardos y postes del borde)
      if (onTrack && (b.lat != null ? Math.abs(b.lat) : t.nearest(b.x, b.z, c.trackIdx).dist) > t.hw + 0.3) continue;
      const corridor = 1.1 + b.r;
      if (Math.abs(bs) < corridor) { sideShift += -Math.sign(bs || 1) * (corridor - Math.abs(bs)) * 1.6; if (bl < 5) barBrake = Math.max(barBrake, 1 - bl / 5); }
    }
    const offRoad = Math.abs(c.lateral) > t.hw;
    lat = clamp(lat + clamp(sideShift, -2.5, 2.5), offRoad ? -t.W - 8 : -t.hw + 0.3, offRoad ? t.W + 8 : t.hw - 0.3);
    // el objetivo lateral se mueve de a poco (máx 2,5 m/s): sin bandazos
    if (this.latTarget == null || this.recoverT > 0) this.latTarget = lat;
    this.latTarget += clamp(lat - this.latTarget, -4 * dt, 4 * dt);
    lat = this.latTarget;
    const tx = tgt.x + tgt.nx * lat, tz = tgt.z + tgt.nz * lat;
    let targetHeading = Math.atan2(tx - c.x, tz - c.z);
    if (Math.abs(c.lateral) > t.W + 3 && !this.outsideWall) { targetHeading = sm.heading - Math.sign(c.lateral) * 0.45; } // afuera: paralelo al ripio, entrando de a poco (detrás del muro de gomas, sigue el punto objetivo)
    // dirección de la velocidad (permite contravolante en derrape)
    const vHead = Math.abs(speed) > 4 ? Math.atan2(c.vx, c.vz) : c.heading;
    const refHead = lerp(c.heading, vHead, 0.55);
    // ángulo: anticipación por curvatura del camino (feed-forward) + corrección de rumbo, convertido a fracción del tope
    const curvAhead = s[t.wrap(c.trackIdx + Math.round(clamp(Math.abs(speed) * 0.35, 3, 10)))].curvS;
    const ff = Math.atan(CAR.wheelbase * curvAhead) * 1.15;
    const err = wrapAngle(targetHeading - refHead);
    // El mismo agarre que usa la física: si no se cuenta la preparación del auto (tune.grip), el tope de
    // volante que calcula la IA queda por debajo del real y termina girando más de lo que pide, cruzándose
    // en la entrada de las curvas rápidas. Cuanto más preparado el auto, peor era el efecto.
    const mu = (SURFACES[c.surface] || SURFACES.gravel).grip * (c.tune ? c.tune.grip : 1) * (t.gripScale || 1)
      * (1 - 0.12 * Math.max(c.damage.left, c.damage.right));
    const lim = steerLimit(Math.abs(speed), mu);
    // pure pursuit geométrico: curvatura necesaria para pasar por el punto objetivo → ángulo de ruedas
    let steer = (ff + err * (1.3 + 0.5 * this.skill) - c.yawRate * 0.01) / lim;
    if (this.mistake > 0) steer += this.mistakeSteer;
    inp.steer = clamp(steer, -1, 1);

    // ---- velocidad permitida mirando adelante
    const g = GRAVITY, muK = this.muKnown * (t.gripScale || 1); // con lluvia saben que resbala
    // Integración hacia atrás desde 200 m adelante: en cada tramo, la frenada disponible es lo que deja
    // el círculo de fricción después de doblar (en una curva que se cierra casi no se puede frenar).
    const STEP = 2, N = 100, ds = STEP * t.step;
    let allowed = 45;
    for (let k = N; k >= 0; k -= STEP) {
      const q = s[t.wrap(c.trackIdx + k)];
      const curv = Math.abs(q.curvS) + 1e-4;
      let vc = Math.sqrt(muK * g / curv) * this.speedFactor;
      vc *= clamp(1 - this.hs * (vc - 12), 0.75, 1);
      if (q.slope < -0.06) vc *= 0.92; // bajadas: cuidado
      const latUse = clamp(allowed * allowed * curv / (muK * g), 0, 1);
      const aLong = this.decel * Math.sqrt(Math.max(0.12, 1 - latUse * latUse));
      allowed = Math.min(vc, Math.sqrt(allowed * allowed + 2 * aLong * ds));
    }
    allowed = Math.min(allowed, 40 * this.difficulty, followCap);
    if (packAhead >= 2) allowed *= packAhead >= 4 ? 0.9 : 0.95; // en el pelotón, con cuidado
    if (!t.closed && c.trackIdx > n - 30) allowed = Math.min(allowed, 4 + (n - c.trackIdx) * 0.6);
    this.allowed = allowed;
    if (c.surface === 'grass' || c.surface === 'ditch') {
      // afuera hay poco agarre y la zanja empuja hacia su fondo: en curva hay que ir despacio para poder salir
      const cOff = Math.abs(s[t.wrap(c.trackIdx + 8)].curvS);
      const vOff = 0.6 * Math.sqrt(mu * g / Math.max(cOff, 1 / 400));
      allowed = Math.min(allowed, this.outsideWall ? 10 : 14, vOff, c.surface === 'ditch' ? 9 : 14);
    }
    if (barBrake > 0) allowed = Math.min(allowed, 8 - barBrake * 5);
    if (this.mistake > 0 && this.mistakeSteer > 0.3) allowed += 6; // se pasa de rosca
    // Coasting: cuando sobra poca velocidad se levanta el pie y listo, no se toca el freno. El aire y la
    // rodadura ya bajan solos ~1 m/s², y el freno saca más de lo necesario, obliga a volver a acelerar y
    // encima se come el agarre. Es lo que hace una persona y por eso llega más rápido a la curva.
    const aLevante = 0.16 + 0.00086 * speed * speed; // m/s² que pierde el auto sin tocar nada
    const sobra = speed - allowed;
    let acc;
    if (sobra < 0) acc = -sobra * 1.4;
    else if (sobra < aLevante * 1.1) acc = 0; // de levantada
    else acc = -clamp((sobra - aLevante * 1.1) / 2.2, 0, 1);
    if (brakeFor > 0) acc = Math.min(acc, -brakeFor * 1.5);
    // el acelerador se suaviza; el freno responde al instante
    this.throttleSmooth = lerp(this.throttleSmooth, clamp(acc, 0, 1), clamp(dt * 6, 0, 1));
    inp.throttle = acc > 0 ? this.throttleSmooth : 0;
    if (sinceGreen < 2) inp.throttle *= 0.8 + 0.2 * clamp(sinceGreen / 2, 0, 1); // largada progresiva, breve
    inp.brake = acc < 0 ? clamp(-acc, 0, 1) : 0;
    if (acc <= 0) this.throttleSmooth = 0;
    // Frenar y doblar a la vez se paga caro: el freno va 58 % adelante, que es el mismo tren al que se le
    // pide el giro, así que el auto se va largo y al soltar se cruza. Se frena derecho y se dobla de
    // levantada; sólo si viene muy pasado se frena igual, aunque cueste.
    const latDemand = Math.abs(sm.curvS) * speed * speed / (mu * g);
    const emergencia = clamp((sobra - 3) / 6, 0, 1);
    inp.brake *= Math.max(emergencia, clamp(1.05 - latDemand * 1.9, 0, 1));
    // si la cola se va, levanta (y no frena, que empeora)
    const sl = Math.abs(c.slipR);
    if (sl > 0.12) { inp.throttle *= clamp(1 - (sl - 0.12) * 3, 0.15, 1); if (sl > 0.3) inp.brake = 0; }
    // en el aire no sirve de nada: suelta
    if (c.airborne) { inp.throttle = 0.3; inp.brake = 0; }
    inp.handbrake = false;
    return inp;
  }
}
