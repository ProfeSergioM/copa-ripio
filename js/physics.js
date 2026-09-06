// Física del auto (modelo bicicleta 2D + altura del terreno) y colisiones por impulsos.
import { CAR, SURFACES, GRAVITY } from './config.js';
import { clamp, lerp, sign, wrapAngle, dampTo } from './util.js';

export function createCar(id, x, z, heading) {
  return {
    id, x, z, y: 0, vy: 0, heading, vx: 0, vz: 0, yawRate: 0,
    steer: 0, throttle: 0, brake: 0, handbrake: false, reverse: false,
    gear: 0, rpm: CAR.idleRpm, shiftTimer: 0, misfireT: 0, misfireHold: 0,
    speed: 0, lateralV: 0, slipF: 0, slipR: 0, wheelspin: 0, airborne: false, airTime: 0, surface: 'gravel',
    accFwd: 0, accLat: 0, wheelAngle: 0,
    damage: { front: 0, rear: 0, left: 0, right: 0 }, engineHealth: 1, totalDamage: 0,
    trackIdx: -1, lateral: 0, along: 0, progress: 0, lap: 0, lapTime: 0, bestLap: null, lapTimes: [],
    halfPassed: false, finished: false, finishTime: null, raceDist: 0, wrongWay: 0,
    slipstream: 0, frozen: true, lastImpactT: -10, tune: { torque: 1, grip: 1, brake: 1 },
  };
}

export function resetCarAt(c, x, z, heading) {
  c.x = x; c.z = z; c.heading = heading; c.vx = c.vz = 0; c.yawRate = 0; c.vy = 0; c.airborne = false;
  c.steer = 0; c.gear = 0; c.rpm = CAR.idleRpm; c.reverse = false; c.wrongWay = 0;
}

// Ángulo máximo de dirección según velocidad: lo que el tren delantero puede aprovechar, con margen para cruzar el auto.
export function steerLimit(speedAbs, mu) {
  return clamp(Math.atan(CAR.wheelbase * mu * GRAVITY * 2.3 / Math.max(speedAbs * speedAbs, 1)), 0.13, CAR.maxSteer);
}

function torqueCurve(rpm) {
  const r = rpm / 1000;
  if (r < 1) return 0.65;
  if (r < 4) return 0.65 + 0.35 * (r - 1) / 3;
  if (r < 6.3) return 1 - 0.28 * (r - 4) / 2.3;
  return 0.6;
}

export function stepCar(c, track, dt, input) {
  const m = CAR.mass, g = GRAVITY;
  const h = c.heading;
  const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
  let vF = c.vx * fx + c.vz * fz, vL = c.vx * lx + c.vz * lz;
  const speedAbs = Math.abs(vF);

  // ---- posición en pista y superficie
  const near = track.nearest(c.x, c.z, c.trackIdx);
  c.trackIdx = near.idx; c.lateral = near.lateral; c.along = near.along; c.progress = near.progress;
  const surfName = track.surfaceAt(near.lateral);
  c.surface = surfName;
  const surf = SURFACES[surfName];
  let mu = surf.grip * c.tune.grip * (track.gripScale || 1) * (1 - 0.12 * Math.max(c.damage.left, c.damage.right));
  if (c.frozen) { input = { steer: input.steer, throttle: 0, brake: 0, handbrake: true }; c.vx = c.vz = 0; c.yawRate = 0; vF = vL = 0; }

  // ---- marcha atrás: freno sostenido medio segundo con el auto parado
  if (!c.reverse) {
    if (input.brake > 0.5 && speedAbs < 0.5 && input.throttle < 0.1) c.reverseT = (c.reverseT || 0) + dt; else c.reverseT = 0;
    if (c.reverseT > 0.5) { c.reverse = true; c.reverseT = 0; }
  } else if (input.throttle > 0.1 && speedAbs < 1.0) c.reverse = false;
  let throttle = c.reverse ? input.brake : input.throttle;
  let brake = c.reverse ? input.throttle : input.brake;
  const handbrake = !!input.handbrake;
  c.throttle = throttle; c.brake = brake; c.handbrake = handbrake;

  // ---- dirección
  // el ángulo máximo baja con la velocidad (lo que el tren delantero puede aprovechar, con margen para cruzar el auto)
  let maxSteer = steerLimit(speedAbs, mu) * (1 - 0.3 * c.damage.front);
  if (sign(input.steer) === sign(c.slipR)) maxSteer += Math.min(Math.abs(c.slipR), 0.45); // contravolante cuando la cola se va
  const bias = (c.damage.left - c.damage.right) * 0.05 * clamp(speedAbs / 8, 0, 1);
  const target = clamp(input.steer, -1, 1) * maxSteer + bias;
  const rate = CAR.steerRate * (0.5 + 0.5 * clamp(maxSteer / 0.3, 0, 1));
  c.steer += clamp(target - c.steer, -rate * dt, rate * dt);

  // ---- suelo, saltos
  const gy = track.heightAt(c.x, c.z, c.trackIdx);
  let landed = 0;
  if (!c.airborne) {
    const freeY = c.y + (c.vy - g * dt) * dt;
    if (gy < freeY - 0.03 && speedAbs > 5 && (gy - c.y) / dt < c.vy - g * 1.25 * dt) {
      c.airborne = true; c.airTime = 0; c.vy -= g * dt; c.y = freeY;
    } else {
      const nvy = clamp((gy - c.y) / dt, -30, 8); c.jolt = Math.max(c.jolt || 0, Math.abs(nvy - c.vy) * clamp(speedAbs / 8, 0, 1)); c.vy = nvy; c.y = gy; // un escalón hacia arriba no catapulta
    }
  } else {
    c.airTime += dt;
    c.vy -= g * dt; c.y += c.vy * dt;
    if (c.y <= gy) { landed = -c.vy; c.y = gy; c.vy = 0; c.airborne = false; }
  }

  // ---- motor y caja
  const R = CAR.wheelRadius;
  const ratio = c.reverse ? CAR.reverseRatio : CAR.gearRatios[c.gear];
  const wheelRpm = speedAbs / R * 60 / (2 * Math.PI);
  const rpmWheels = wheelRpm * ratio * CAR.finalDrive;
  let rpmTarget = Math.max(CAR.idleRpm, rpmWheels);
  if (c.wheelspin > 0) rpmTarget = lerp(rpmTarget, CAR.redline * 0.88, c.wheelspin * 0.8);
  if (c.airborne && throttle > 0.3) rpmTarget = CAR.redline;
  c.rpm = dampTo(c.rpm, rpmTarget, 16, dt);
  c.shiftTimer -= dt;
  if (!c.reverse) {
    if (rpmWheels > CAR.shiftUp && c.gear < CAR.gearRatios.length - 1 && c.shiftTimer <= 0) { c.gear++; c.shiftTimer = CAR.shiftTime; c.shifted = 1; }
    else if (rpmWheels < CAR.shiftDown && c.gear > 0 && c.shiftTimer <= 0) { c.gear--; c.shiftTimer = CAR.shiftTime * 0.6; c.shifted = -1; }
  } else c.gear = 0;
  c.engineHealth = 1 - 0.35 * c.damage.rear;
  let T = CAR.torqueMax * c.tune.torque * torqueCurve(c.rpm) * throttle * c.engineHealth;
  if (c.rpm > CAR.redline) T *= 0.4;
  if (c.shiftTimer > 0) T *= 0.55;
  // fallos de encendido con el motor golpeado
  if (c.damage.rear > 0.6) {
    c.misfireT -= dt;
    if (c.misfireT < 0) { c.misfireT = 0.4 + Math.random() * 2.5 * (1.4 - c.damage.rear); if (Math.random() < c.damage.rear * 0.8) c.misfireHold = 0.06 + 0.08 * c.damage.rear; }
    if (c.misfireHold > 0) { c.misfireHold -= dt; T *= 0.3; c.misfiring = true; } else c.misfiring = false;
  } else c.misfiring = false;
  let Fdrive = T * ratio * CAR.finalDrive / R * 0.92;
  // "control de tracción" de piloto: si la cola se va, levanta el pie
  Fdrive *= clamp(1 - (Math.abs(c.slipR) - 0.7) * 1.5, 0.55, 1);
  if (c.reverse) Fdrive = -Fdrive;

  // ---- cargas por eje (transferencia longitudinal)
  const transfer = clamp(m * c.accFwd * 0.45 * CAR.cgHeight / CAR.wheelbase, -m * g * 0.12, m * g * 0.12);
  const FzF = m * g * CAR.lr / CAR.wheelbase - transfer;
  const FzR = m * g * CAR.lf / CAR.wheelbase + transfer;
  let maxF = mu * FzF * 1.06, maxR = mu * FzR * 1.08; // gomas anchas de ripio

  // ---- fuerzas longitudinales
  const dirv = sign(vF) || 1;
  const Fb = brake * CAR.brakeForce * c.tune.brake;
  let FxR = Fdrive - clamp(Fb * 0.42, 0, maxR * 0.78) * dirv;
  let FxF = -clamp(Fb * 0.58, 0, maxF * 0.78) * dirv; // "ABS": nunca bloquea del todo
  let latScaleR = 1, latScaleF = 1;
  if (handbrake && speedAbs > 0.3) { FxR = -dirv * maxR * 0.85; latScaleR = 0.3; }
  c.wheelspin = 0; c.frontLock = false;
  if (Math.abs(FxR) > maxR) { c.wheelspin = Fdrive > 0 ? clamp((Math.abs(FxR) - maxR) / (maxR + 1), 0, 1) : 0; FxR = sign(FxR) * maxR * 0.9; latScaleR *= 0.93; }
  if (Math.abs(FxF) > maxF) FxF = sign(FxF) * maxF * 0.9;
  const latAvailF = Math.sqrt(Math.max(0, maxF * maxF - FxF * FxF)) * latScaleF;
  const latAvailR = Math.sqrt(Math.max(0, maxR * maxR - (FxR * 0.6) * (FxR * 0.6))) * latScaleR;

  // ---- fuerzas laterales (deriva)
  const vSafe = Math.max(speedAbs, 0.6);
  const slipF = Math.atan2(vL + c.yawRate * CAR.lf, vSafe) - c.steer;
  const slipR = Math.atan2(vL - c.yawRate * CAR.lr, vSafe);
  const Cf = CAR.corneringStiffness * FzF, Cr = CAR.corneringStiffness * FzR * 1.2;
  const FyF = -latAvailF * Math.tanh(Cf * slipF / (latAvailF + 1));
  const FyR = -latAvailR * Math.tanh(Cr * slipR / (latAvailR + 1));
  c.slipF = slipF; c.slipR = slipR; c.FyF = FyF; c.FyR = FyR; c.maxF = maxF; c.maxR = maxR; c.latAvailR = latAvailR; c.FxR = FxR; c.maxSteer = maxSteer;

  // ---- pendiente y resistencias
  const slope = track.slopeAt(c.x, c.z, c.trackIdx);
  c.gradF = slope.gx * fx + slope.gz * fz; c.gradL = slope.gx * lx + slope.gz * lz;
  const aSlopeF = -g * c.gradF, aSlopeL = -g * c.gradL;
  const drag = CAR.dragCoef * vF * speedAbs * (1 - 0.35 * c.slipstream);
  let rollC = CAR.rolling * surf.rolling * (1 + 0.6 * Math.max(c.damage.left, c.damage.right));
  if (near.dist > track.W + 32) rollC *= 6;
  const roll = rollC * m * g * dirv * clamp(speedAbs / 0.5, 0, 1);
  // arrastre de ralentí hacia adelante (no se va para atrás en las subidas) y retención con el auto parado
  if (!c.reverse && throttle < 0.05 && brake < 0.05 && vF < 3 && vF > -0.5) Fdrive += 900 * clamp(1 - vF / 3, 0, 1);
  const holdStill = throttle < 0.05 && speedAbs < 0.6 && !c.airborne;

  let aF, aL, yawAcc;
  const cs = Math.cos(c.steer), sn = Math.sin(c.steer);
  if (c.airborne) {
    aF = -drag / m; aL = 0; yawAcc = 0;
  } else {
    aF = (FxR + FxF * cs - FyF * sn * 0.7 - drag - roll) / m + aSlopeF;
    aL = (FyF * cs + FyR + FxF * sn) / m + aSlopeL;
    yawAcc = (CAR.lf * (FyF * cs + FxF * sn) - CAR.lr * FyR) / CAR.inertia - c.yawRate * 1.1;
  }
  // empuje suave hacia la pista si se va muy lejos
  if (near.dist > track.W + 36) { const s = -sign(near.lateral) * 3; const ax = s * track.samples[near.idx].nx, az = s * track.samples[near.idx].nz; aF += ax * fx + az * fz; aL += ax * lx + az * lz; }

  const vF0 = vF;
  if (holdStill) { aF -= vF * 8; }
  vF += (aF + c.yawRate * vL) * dt;
  vL += (aL - c.yawRate * vF) * dt;
  c.yawRate += yawAcc * dt;
  if (brake > 0 && throttle === 0 && sign(vF) !== sign(vF0) && vF0 !== 0) vF = 0;

  // mezcla cinemática a baja velocidad (evita temblores parado)
  const lowW = 1 - clamp(speedAbs / 5, 0, 1);
  if (!c.airborne && lowW > 0) {
    const yawKin = vF * Math.tan(c.steer) / CAR.wheelbase;
    const bl = lowW * clamp(dt * 30, 0, 1);
    c.yawRate = lerp(c.yawRate, yawKin, bl); vL = lerp(vL, 0, bl);
  }
  c.yawRate = clamp(c.yawRate, -4, 4);

  c.accFwd = dampTo(c.accFwd, (vF - vF0) / dt, 12, dt);
  c.accLat = dampTo(c.accLat, aL, 12, dt);
  c.speed = vF; c.lateralV = vL;
  c.vx = vF * fx + vL * lx; c.vz = vF * fz + vL * lz;
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.heading = wrapAngle(c.heading + c.yawRate * dt);
  c.wheelAngle += vF / R * dt;
  if (landed > 5) c.landedImpact = landed; else c.landedImpact = 0;

  // sentido contrario
  const s = track.samples[near.idx];
  const along = c.vx * s.tx + c.vz * s.tz;
  if (along < -3 && !c.finished) c.wrongWay = Math.min(c.wrongWay + dt, 5); else c.wrongWay = Math.max(0, c.wrongWay - dt * 2);
}

// ---------- Colisiones ----------
const CIRCLES = [-0.95, 0.1, 1.15];
const CR = 0.74;
const _pa = [], _pb = [];
function circles(c, out) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  for (let i = 0; i < 3; i++) { out[i] = out[i] || { x: 0, z: 0 }; out[i].x = c.x + fx * CIRCLES[i]; out[i].z = c.z + fz * CIRCLES[i]; }
  return out;
}

function pointVel(c, rx, rz) { return { x: c.vx + c.yawRate * rz, z: c.vz - c.yawRate * rx }; }

export function collideCars(a, b, events) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > 4.6 * 4.6) return;
  circles(a, _pa); circles(b, _pb);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const ddx = _pb[j].x - _pa[i].x, ddz = _pb[j].z - _pa[i].z;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 >= (2 * CR) ** 2 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const nx = ddx / d, nz = ddz / d, pen = 2 * CR - d;
    const px = _pa[i].x + nx * CR, pz = _pa[i].z + nz * CR;
    resolve(a, b, px, pz, nx, nz, pen, 0.25, events, 'car');
  }
}

export function collideBarrier(c, bar, events) {
  const dx = bar.x - c.x, dz = bar.z - c.z;
  if (dx * dx + dz * dz > (bar.r + 2.4) ** 2) return;
  circles(c, _pa);
  for (let i = 0; i < 3; i++) {
    const ddx = bar.x - _pa[i].x, ddz = bar.z - _pa[i].z;
    const d2 = ddx * ddx + ddz * ddz, rr = CR + bar.r;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const nx = ddx / d, nz = ddz / d, pen = rr - d;
    const px = _pa[i].x + nx * CR, pz = _pa[i].z + nz * CR;
    const e = bar.type === 'bale' ? 0.15 : 0.35;
    resolve(c, null, px, pz, nx, nz, pen, e, events, bar.type, bar);
  }
}

// Impulso 2D con rotación. b puede ser null (estático).
function resolve(a, b, px, pz, nx, nz, pen, e, events, type, bar) {
  const m = CAR.mass, I = CAR.inertia;
  if (a.kinematic && (!b || b.kinematic)) return;
  if (a.kinematic) { // a no se mueve: resolvemos como si b chocara contra un obstáculo
    resolve(b, null, px, pz, -nx, -nz, pen, e, events, 'car', null); return;
  }
  if (b && b.kinematic) { b = null; }
  const rax = px - a.x, raz = pz - a.z;
  const va = pointVel(a, rax, raz);
  let vbx = 0, vbz = 0, rbx = 0, rbz = 0, invMb = 0, invIb = 0, crossB = 0;
  if (b) { rbx = px - b.x; rbz = pz - b.z; const vb = pointVel(b, rbx, rbz); vbx = vb.x; vbz = vb.z; invMb = 1 / m; invIb = 1 / I; crossB = rbz * nx - rbx * nz; }
  const vrx = vbx - va.x, vrz = vbz - va.z;
  const vn = vrx * nx + vrz * nz;
  // separación posicional
  const corr = pen * (b ? 0.5 : 1.0);
  a.x -= nx * corr; a.z -= nz * corr;
  if (b) { b.x += nx * corr; b.z += nz * corr; }
  if (vn > 0) return;
  const crossA = raz * nx - rax * nz;
  const denom = 1 / m + invMb + crossA * crossA / I + crossB * crossB * invIb;
  const j = -(1 + e) * vn / denom;
  a.vx -= j * nx / m; a.vz -= j * nz / m; a.yawRate -= j * crossA / I;
  if (b) { b.vx += j * nx / m; b.vz += j * nz / m; b.yawRate += j * crossB * invIb; }
  // fricción
  const tx = -nz, tz = nx;
  const vt = vrx * tx + vrz * tz;
  const crossAt = raz * tx - rax * tz, crossBt = b ? rbz * tx - rbx * tz : 0;
  const denomT = 1 / m + invMb + crossAt * crossAt / I + crossBt * crossBt * invIb;
  let jt = -vt / denomT;
  const mu = type === 'bale' ? 0.7 : 0.45;
  jt = clamp(jt, -mu * Math.abs(j), mu * Math.abs(j));
  a.vx -= jt * tx / m; a.vz -= jt * tz / m; a.yawRate -= jt * crossAt / I;
  if (b) { b.vx += jt * tx / m; b.vz += jt * tz / m; b.yawRate += jt * crossBt * invIb; }
  const strength = -vn;
  if (strength > 2.0) events.push({ type, a, b, bar, px, pz, nx, nz, strength, j });
}

// Zona de la carrocería golpeada, según punto de contacto mundial.
export function impactZone(c, px, pz) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading), lx = Math.cos(c.heading), lz = -Math.sin(c.heading);
  const rx = px - c.x, rz = pz - c.z;
  const lz_ = rx * fx + rz * fz, lx_ = rx * lx + rz * lz;
  if (Math.abs(lz_) > 0.85 && Math.abs(lz_) > Math.abs(lx_) * 1.1) return lz_ > 0 ? 'front' : 'rear';
  return lx_ > 0 ? 'left' : 'right';
}

export function applyDamage(c, zone, amount) {
  c.damage[zone] = clamp(c.damage[zone] + amount, 0, 1);
  c.totalDamage = (c.damage.front + c.damage.rear + c.damage.left + c.damage.right) / 4;
}

export function repairCar(c) {
  c.damage.front = c.damage.rear = c.damage.left = c.damage.right = 0; c.totalDamage = 0; c.engineHealth = 1;
}

export const SURF = SURFACES;
