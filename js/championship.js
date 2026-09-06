// Campeonato: fechas, puntos, plata, taller (reparaciones y mejoras), rival y persistencia.
import { DRIVER_NAMES, LIVERY_COLORS } from './config.js';
import { mulberry32, clamp } from './util.js';

export const ROUNDS = [
  { name: 'Mañana en Polvaredas', desc: 'Sol bajo, ripio fresco y 20 fititos con ganas.', track: 'polvaredas', tod: 'morning', laps: 3, reverse: false, weather: 'dry', wind: [0.8, 0.3] },
  { name: 'Óvalo del Club Social', desc: 'Pista corta de tierra, todos pegados: más vueltas y más codazos.', track: 'ovalo', tod: 'noon', laps: 5, reverse: false, weather: 'dry', wind: [1.5, 0.5] },
  { name: 'Tormenta de verano', desc: 'Lluvia, barro y viento cruzado. Resbala todo y el polvo se vuela.', track: 'polvaredas', tod: 'storm', laps: 3, reverse: false, weather: 'rain', wind: [5, 3] },
  { name: 'Especial Camino del Cerro', desc: 'Tramo de rally punto a punto, solo contra el reloj. Los rivales corren su tramo aparte.', track: 'cerro', tod: 'noon', laps: 1, mode: 'timetrial', weather: 'dry', wind: [2, 0] },
  { name: 'Atardecer al revés', desc: 'Polvaredas en sentido inverso: la Tenaza cambia por completo.', track: 'polvaredas', tod: 'sunset', laps: 3, reverse: true, weather: 'dry', wind: [3, -1] },
  { name: 'Niebla en el Club Social', desc: 'Madrugada de niebla espesa en el óvalo: apenas se ve el auto de adelante. Faros y reflectores prendidos.', track: 'ovalo', tod: 'fog', laps: 4, reverse: true, weather: 'dry', wind: [0.3, 0.2] },
  { name: 'Nocturna con reflectores', desc: 'La gran final bajo las luces. Una vuelta más.', track: 'polvaredas', tod: 'dusk', laps: 4, reverse: false, weather: 'dry', wind: [0.5, 0.5] },
];
export const POINTS = [25, 20, 17, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1];
export const PRIZES = [3000, 2400, 2000, 1700, 1500, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 550, 500, 450, 400, 350, 300, 250];
export const RIVAL_BONUS = { points: 5, money: 500 };
export const BEST_LAP_MONEY = 300;
export const REPAIR_FULL = 2500;
export const UPGRADES = {
  motor: { name: 'Motor preparado', desc: '+8 % de par por nivel', costs: [1800, 3500], effect: (l) => 1 + 0.08 * l },
  gomas: { name: 'Gomas anchas', desc: '+6 % de agarre por nivel', costs: [1500, 3000], effect: (l) => 1 + 0.06 * l },
  frenos: { name: 'Frenos de camión', desc: '+12 % de frenada por nivel', costs: [1000, 2000], effect: (l) => 1 + 0.12 * l },
};
const KEY = 'coparipio.v2';

export function makeRoster(playerSpec) {
  const rnd = mulberry32(playerSpec.number * 131 + 7);
  const used = new Set([playerSpec.number]);
  const roster = [{ name: playerSpec.name, isPlayer: true, color: playerSpec.color, roofColor: playerSpec.roofColor, number: playerSpec.number, accessory: playerSpec.accessory, stripes: playerSpec.stripes, helmetColor: '#e2a33b', skill: 1, aggression: 0.5, seed: 1 }];
  const accessories = ['none', 'none', 'none', 'rack', 'lights', 'spoiler', 'antenna'];
  const helmets = ['#d94a3a', '#3f6fb5', '#f0c541', '#f5f1e8', '#2b1d14', '#6f8f4b'];
  DRIVER_NAMES.slice(0, 19).forEach((d, i) => {
    let num; do { num = 1 + Math.floor(rnd() * 99); } while (used.has(num)); used.add(num);
    const color = LIVERY_COLORS[(i + 3) % LIVERY_COLORS.length];
    roster.push({ name: d[0], isPlayer: false, color, roofColor: rnd() < 0.4 ? LIVERY_COLORS[Math.floor(rnd() * LIVERY_COLORS.length)] : color, number: num, accessory: accessories[Math.floor(rnd() * accessories.length)], stripes: rnd() < 0.4, helmetColor: helmets[Math.floor(rnd() * helmets.length)], skill: d[1], aggression: d[2], seed: 100 + i });
  });
  return roster;
}

export class Championship {
  constructor(roster) {
    this.roster = roster;
    this.round = 0;
    this.table = roster.map(r => ({ name: r.name, color: r.color, number: r.number, points: 0, wins: 0, last: null, results: [] }));
    this.money = 1500;
    this.upgrades = { motor: 0, gomas: 0, frenos: 0 };
    this.damage = { front: 0, rear: 0, left: 0, right: 0 };
    this.rival = null; this.rivalWins = 0; this.lastPrize = null;
  }
  get done() { return this.round >= ROUNDS.length; }
  get current() { return ROUNDS[Math.min(this.round, ROUNDS.length - 1)]; }
  get player() { return this.roster[0]; }
  standings() { return [...this.table].sort((a, b) => b.points - a.points || (b.wins - a.wins) || a.name.localeCompare(b.name)); }
  positionOf(name) { return this.standings().findIndex(r => r.name === name) + 1; }
  tune() { return { torque: UPGRADES.motor.effect(this.upgrades.motor), grip: UPGRADES.gomas.effect(this.upgrades.gomas), brake: UPGRADES.frenos.effect(this.upgrades.frenos) }; }
  damagePct() { const d = this.damage; return (d.front + d.rear + d.left + d.right) / 4; }
  repairCost() { return Math.round(this.damagePct() * REPAIR_FULL); }
  // repara lo que alcance con la plata (o todo si alcanza)
  repair() {
    const cost = this.repairCost(); if (cost <= 0) return 0;
    const spend = Math.min(cost, this.money);
    const frac = spend / cost;
    for (const k of Object.keys(this.damage)) this.damage[k] = clamp(this.damage[k] * (1 - frac), 0, 1);
    if (frac >= 0.999) for (const k of Object.keys(this.damage)) this.damage[k] = 0;
    this.money -= spend; this.save(); return spend;
  }
  canBuy(key) { const u = UPGRADES[key], l = this.upgrades[key]; return l < u.costs.length && this.money >= u.costs[l]; }
  buy(key) { if (!this.canBuy(key)) return false; this.money -= UPGRADES[key].costs[this.upgrades[key]]; this.upgrades[key]++; this.save(); return true; }

  // Rival de la fecha: el que está justo arriba en la tabla (o el más hábil en la primera)
  pickRival() {
    const me = this.player.name;
    const st = this.standings();
    const myPos = st.findIndex(r => r.name === me);
    let name;
    if (this.round === 0 || st.every(r => r.points === 0)) name = [...this.roster].filter(r => !r.isPlayer).sort((a, b) => b.skill - a.skill)[0].name;
    else if (myPos > 0) name = st[myPos - 1].name;
    else name = st[1].name;
    this.rival = name; return name;
  }

  // results: [{name, position, bestLap, damage:{...}, isPlayer}] ; extras: { bestLapOverall: name }
  applyResults(results, extras = {}) {
    const me = results.find(r => r.isPlayer);
    const rival = results.find(r => r.name === this.rival);
    const beatRival = !!(rival && me && me.position < rival.position);
    let money = PRIZES[me.position - 1] || 200, pts = POINTS[me.position - 1] || 0;
    if (beatRival) { money += RIVAL_BONUS.money; pts += RIVAL_BONUS.points; this.rivalWins++; }
    const bestLap = extras.bestLapOverall === me.name;
    if (bestLap) money += BEST_LAP_MONEY;
    for (const r of results) {
      const row = this.table.find(t => t.name === r.name); if (!row) continue;
      row.points += (r.isPlayer ? pts : (POINTS[r.position - 1] || 0)); row.last = r.position; row.results.push(r.position); if (r.position === 1) row.wins++;
    }
    this.money += money;
    if (me.damage) this.damage = { front: me.damage.front, rear: me.damage.rear, left: me.damage.left, right: me.damage.right };
    this.lastPrize = { money, pts, beatRival, bestLap, rival: this.rival, rivalPos: rival ? rival.position : null };
    if (!this.done) this.round++;
    this.save();
    return this.lastPrize;
  }
  gridOrder() {
    const names = this.roster.map(r => r.name);
    if (this.round === 0 || this.table.every(t => t.points === 0)) {
      const rnd = mulberry32(42); const ai = names.filter(n => n !== this.player.name);
      for (let i = ai.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ai[i], ai[j]] = [ai[j], ai[i]]; }
      ai.splice(11, 0, this.player.name); return ai;
    }
    return this.standings().map(t => t.name);
  }
  save() { if (this.persist === false) return; try { localStorage.setItem(KEY, JSON.stringify({ round: this.round, table: this.table, roster: this.roster, money: this.money, upgrades: this.upgrades, damage: this.damage, rival: this.rival, rivalWins: this.rivalWins })); } catch (e) { /* sin almacenamiento */ } }
  static load() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return null;
      const d = JSON.parse(raw); const c = new Championship(d.roster);
      Object.assign(c, { round: d.round, table: d.table, money: d.money ?? 1500, upgrades: d.upgrades || c.upgrades, damage: d.damage || c.damage, rival: d.rival || null, rivalWins: d.rivalWins || 0 });
      return c;
    } catch (e) { return null; }
  }
  static clear() { try { localStorage.removeItem(KEY); localStorage.removeItem('coparipio.v1'); } catch (e) { /* nada */ } }
}
