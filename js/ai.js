// Pilotos rivales: línea de carrera, velocidad objetivo por curvatura, esquive, errores y recuperación.
import { clamp, wrapAngle, lerp, sign, mulberry32 } from './util.js';
import { GRAVITY, CAR, SURFACES, LARGADA } from './config.js';
import { steerLimit, resetCarAt } from './physics.js';

// Trazada de carrera: la línea de menor curvatura que entra en el ancho del ripio. Entra abierta, toca el
// vértice y sale abierta, que es lo que hace una persona; en una curva de 90° y 20 m de radio en el eje,
// usar el ancho de la pista lleva el radio real a más de 40 m, o sea un 40 % más de velocidad con el mismo
// agarre. La línea vieja se movía apenas 3,7 m hacia cada lado según la curvatura del eje, y la velocidad de
// cada curva se calculaba con el radio del eje y no con el de la trazada: los pilotos doblaban todo como si
// fueran por el medio, y darles mejor auto casi no los hacía más rápidos (45 % más de motor y agarre bajaba
// la vuelta apenas un 4 %).
//
// Se resuelve con puntos de control cada tantos metros, de grueso a fino. En cada nivel se minimiza la suma
// de los cuadrados de la segunda diferencia de los puntos (la curvatura), moviendo cada punto sobre la normal
// de la pista y sin salirse del margen: es un problema cuadrático con topes, y alcanza con pasar punto por
// punto hasta que no se mueven más.
//
// Devuelve el corrimiento lateral por muestra, como antes, y le cuelga `curv`: la curvatura con signo de la
// trazada en cada muestra (positiva = dobla a la izquierda, igual que curvS).
export function buildRacingLine(track) {
  // se calcula una vez por pista y sentido (el tramo del cerro tarda casi un segundo) y queda guardada en ella
  const clave = track.reverse ? 'inv' : 'nor', guardadas = track._trazadas || (track._trazadas = {});
  if (guardadas[clave]) return guardadas[clave];
  const s = track.samples, n = track.n, cerrada = track.closed;
  const margen = track.hw - 1.15; // el auto mide 1,5 m de ancho: la rueda de afuera queda a 40 cm del borde
  let ctrl = null;                // corrimientos del nivel anterior, para arrancar el siguiente
  for (const paso of [32, 16, 8, 4]) {
    const m = Math.max(8, Math.round((cerrada ? n : n - 1) / paso) + (cerrada ? 0 : 1));
    const en = (k) => (cerrada ? Math.round(k * n / m) % n : Math.min(n - 1, Math.round(k * (n - 1) / (m - 1))));
    const a = new Float64Array(m), cx = new Float64Array(m), cz = new Float64Array(m), nx = new Float64Array(m), nz = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const q = s[en(k)]; cx[k] = q.x; cz[k] = q.z; nx[k] = q.nx; nz[k] = q.nz;
      if (ctrl) { // interpolar el nivel anterior
        const f = cerrada ? k * ctrl.length / m : k * (ctrl.length - 1) / (m - 1), i0 = Math.floor(f), u = f - i0;
        const v0 = ctrl[cerrada ? i0 % ctrl.length : Math.min(i0, ctrl.length - 1)], v1 = ctrl[cerrada ? (i0 + 1) % ctrl.length : Math.min(i0 + 1, ctrl.length - 1)];
        a[k] = v0 + (v1 - v0) * u;
      }
    }
    const W = (k) => (cerrada ? ((k % m) + m) % m : k);
    const desde = cerrada ? 0 : 2, hasta = cerrada ? m : m - 2; // en un tramo abierto las puntas quedan en el eje
    const w = new Float64Array(m).fill(1), h0 = (cerrada ? n : n - 1) / (cerrada ? m : m - 1);
    const X = (k) => cx[k] + nx[k] * a[k], Z = (k) => cz[k] + nz[k] * a[k];
    for (let it = 0; it < 6000; it++) {
      // PESOS
      if (it % 8 === 0) for (let k = 0; k < m; k++) {
        const p = W(k - 1), q = W(k + 1);
        const h = (Math.hypot(X(k) - X(p), Z(k) - Z(p)) + Math.hypot(X(q) - X(k), Z(q) - Z(k))) / 2 || h0;
        w[k] = (h0 / h) ** 3;
      }
      let mov = 0;
      for (let k = desde; k < hasta; k++) {
        const a2 = W(k - 2), a1 = W(k - 1), b1 = W(k + 1), b2 = W(k + 2);
        // segundas diferencias en el punto anterior, en este y en el siguiente
        const ax = X(a2) - 2 * X(a1) + X(k), az = Z(a2) - 2 * Z(a1) + Z(k);
        const mx = X(a1) - 2 * X(k) + X(b1), mz = Z(a1) - 2 * Z(k) + Z(b1);
        const bx = X(k) - 2 * X(b1) + X(b2), bz = Z(k) - 2 * Z(b1) + Z(b2);
        const gx = w[a1] * ax - 2 * w[k] * mx + w[b1] * bx, gz = w[a1] * az - 2 * w[k] * mz + w[b1] * bz;
        const paso = -(gx * nx[k] + gz * nz[k]) / (w[a1] + 4 * w[k] + w[b1]);
        const nuevo = clamp(a[k] + paso * 1.4, -margen, margen); // sobrerrelajado: llega antes
        mov = Math.max(mov, Math.abs(nuevo - a[k])); a[k] = nuevo;
      }
      if (mov < 1e-5) break;
    }
    ctrl = a;
  }
  // de los puntos de control a cada muestra, con una curva suave entre ellos
  const m = ctrl.length, line = new Float32Array(n);
  const C = (k) => ctrl[cerrada ? ((k % m) + m) % m : clamp(k, 0, m - 1)];
  for (let i = 0; i < n; i++) {
    const f = cerrada ? i * m / n : i * (m - 1) / (n - 1), k = Math.floor(f), u = f - k;
    const p0 = C(k - 1), p1 = C(k), p2 = C(k + 1), p3 = C(k + 2);
    line[i] = clamp(0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u), -margen, margen);
  }
  // curvatura de la trazada: cuánto gira la tangente entre un tramo de 4 m y el siguiente, suavizada
  const px = (i) => { const j = track.wrap(i); return s[j].x + s[j].nx * line[j]; }, pz = (i) => { const j = track.wrap(i); return s[j].z + s[j].nz * line[j]; };
  const cruda = new Float32Array(n), D = 4;
  for (let i = 0; i < n; i++) {
    const x0 = px(i - D), z0 = pz(i - D), x1 = px(i), z1 = pz(i), x2 = px(i + D), z2 = pz(i + D);
    const t1x = x1 - x0, t1z = z1 - z0, t2x = x2 - x1, t2z = z2 - z1, l1 = Math.hypot(t1x, t1z) || 1, l2 = Math.hypot(t2x, t2z) || 1;
    cruda[i] = (t2x * t1z - t2z * t1x) / (l1 * l2) / ((l1 + l2) / 2);
  }
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) { let c = 0; for (let k = -4; k <= 4; k++) c += cruda[track.wrap(i + k)]; curv[i] = c / 9; }
  line.curv = curv;
  guardadas[clave] = line;
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
    // Por debajo de la dificultad normal los pilotos además entran más despacio a las curvas: con sólo quitarles
    // auto casi no se notaba. Con 0,9 (Tranqui) quedan cerca de lo que era el nivel normal antes de la trazada.
    const calma = 1 - Math.max(0, 1 - this.difficulty) * 1.8;
    this.speedFactor = (0.91 + 0.09 * this.skill) * (1 + Math.max(0, this.difficulty - 1) * (profile.sfk != null ? profile.sfk : 0.35)) * calma * (profile.pace || 1);
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
    if (greenTime == null || raceTime < greenTime + this.reaction) {
      inp.brake = 0; inp.steer = 0; inp.handbrake = true; this.stuckT = -1.5;
      // En la grilla acelera en vacío buscando la franja del cuentavueltas. La puntería depende de la habilidad
      // y los más agresivos apuntan más arriba, así que algunos se pasan y patinan.
      if (c.frozen) {
        if (this.revObjetivo == null) {
          // con estos errores la mitad sale perfecta, un cuarto bien, uno de cada seis corto y uno de cada diez patina
          const error = (this.rnd() + this.rnd() + this.rnd() - 1.5) * 2 * (450 + (1 - this.skill) * 3200);
          this.revObjetivo = clamp((LARGADA.desde + LARGADA.hasta) / 2 + (this.aggr - 0.5) * 1000 + error, 1500, CAR.redline * 0.97);
        }
        const pie = (this.revObjetivo - CAR.idleRpm) / (CAR.redline * 0.97 - CAR.idleRpm);
        inp.throttle = clamp(pie + (this.revObjetivo - c.rpm) * 0.00015, 0, 1);
      } else inp.throttle = 0;
      return inp;
    }
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
    // La velocidad de cada curva sale de la curvatura de la trazada, que es más suave que la del eje. Eso vale
    // mientras el auto va por la trazada: corrido de ella (pasando a otro, en el pelotón de la largada) se
    // vuelve de a poco a la curvatura del eje, que es la más cerrada de las dos.
    const kl = this.line.curv || null;
    const fuera = clamp((Math.abs(c.lateral - this.line[c.trackIdx]) - 1.5) / 2.5, 0, 1);
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
    lat = clamp(lat + clamp(sideShift, -2.5, 2.5), offRoad ? -t.W - 8 : -t.hw + 0.75, offRoad ? t.W + 8 : t.hw - 0.75);
    // el objetivo lateral se mueve de a poco (máx 2,5 m/s): sin bandazos
    if (this.latTarget == null || this.recoverT > 0) this.latTarget = lat;
    this.latTarget += clamp(lat - this.latTarget, -4 * dt, 4 * dt);
    lat = this.latTarget;
    const tx = tgt.x + tgt.nx * lat, tz = tgt.z + tgt.nz * lat;
    let targetHeading = Math.atan2(tx - c.x, tz - c.z);
    if (Math.abs(c.lateral) > t.W + 3 && !this.outsideWall) { targetHeading = sm.heading - Math.sign(c.lateral) * 0.45; } // afuera: paralelo al ripio, entrando de a poco (detrás del muro de gomas, sigue el punto objetivo)
    // dirección de la velocidad (permite contravolante en derrape)
    const vHead = Math.abs(speed) > 4 ? Math.atan2(c.vx, c.vz) : c.heading;
    // Mezcla de dos ángulos: hay que ir por el camino corto. Con una interpolación común, cuando el rumbo y la
    // velocidad caían uno a cada lado del salto de 180° a -180° (cualquier tramo que apunta al sur) el resultado
    // apuntaba para atrás, el piloto volanteaba a tope de un lado al otro y terminaba en la zanja.
    const refHead = c.heading + wrapAngle(vHead - c.heading) * 0.55;
    // ángulo: anticipación por curvatura del camino (feed-forward) + corrección de rumbo, convertido a fracción del tope
    const iAd = t.wrap(c.trackIdx + Math.round(clamp(Math.abs(speed) * 0.35, 3, 10)));
    const curvAhead = kl ? lerp(kl[iAd], s[iAd].curvS, fuera) : s[iAd].curvS;
    const ff = Math.atan(CAR.wheelbase * curvAhead) * 1.15;
    const err = wrapAngle(targetHeading - refHead);
    // El mismo agarre que usa la física: si no se cuenta la preparación del auto (tune.grip), el tope de
    // volante que calcula la IA queda por debajo del real y termina girando más de lo que pide, cruzándose
    // en la entrada de las curvas rápidas. Cuanto más preparado el auto, peor era el efecto.
    const mu = (SURFACES[c.surface] || SURFACES.gravel).grip * (c.tune ? c.tune.grip : 1) * (t.gripScale || 1)
      * (1 - 0.12 * Math.max(c.damage.left, c.damage.right));
    const lim = steerLimit(Math.abs(speed), mu);
    // pure pursuit geométrico: curvatura necesaria para pasar por el punto objetivo → ángulo de ruedas
    // La corrección de rumbo se afloja con la velocidad (entera hasta 43 km/h, a la mitad a 86). Con la misma
    // mano a cualquier velocidad, a 100 km/h un error de tres grados pedía seis veces el agarre que hay: el
    // volante iba de tope a tope, la cola se soltaba al entrar a las curvas rápidas y terminaban en trompo.
    const mano = clamp(12 / Math.max(Math.abs(speed), 1), 0.35, 1);
    let steer = (ff + err * (1.3 + 0.5 * this.skill) * mano - c.yawRate * 0.01) / lim;
    if (this.mistake > 0) steer += this.mistakeSteer;
    inp.steer = clamp(steer, -1, 1);

    // ---- velocidad permitida mirando adelante
    const g = GRAVITY, muK = this.muKnown * (t.gripScale || 1); // con lluvia saben que resbala
    // Integración hacia atrás desde 200 m adelante: en cada tramo, la frenada disponible es lo que deja
    // el círculo de fricción después de doblar (en una curva que se cierra casi no se puede frenar).
    const STEP = 2, N = 100, ds = STEP * t.step;
    let allowed = 45;
    for (let k = N; k >= 0; k -= STEP) {
      const iq = t.wrap(c.trackIdx + k), q = s[iq];
      const kc = Math.abs(q.curvS), kt = kl ? Math.abs(kl[iq]) : kc;
      const curv = kt + (Math.max(kc, kt) - kt) * fuera + 1e-4;
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
    const latDemand = Math.abs(kl ? lerp(kl[c.trackIdx], sm.curvS, fuera) : sm.curvS) * speed * speed / (mu * g);
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
