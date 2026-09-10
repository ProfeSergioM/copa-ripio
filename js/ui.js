// Interfaz: pantallas, HUD (velocímetro, minimapa, daños, orden, rival), taller, avisos, resultados y tablas.
import { formatTime, clamp, lerp } from './util.js';
import { t } from './idioma.js';
import { UPGRADES, REPAIR_FULL } from './championship.js';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');

export class UI {
  constructor() {
    this.screens = ['loading', 'menu', 'garage', 'settings', 'help', 'champ', 'pause', 'results', 'workshop', 'records', 'mp'];
    this.hudEl = $('hud');
    this.speedo = $('speedo').getContext('2d');
    this.minimap = $('minimap').getContext('2d');
    this.toasts = $('toasts');
    this.needle = 0; this.mapPath = null; this.lastOrderHTML = ''; this.lastRival = '';
    this.bannerTimer = null;
  }
  showScreen(name) { for (const s of this.screens) $(s).classList.toggle('hidden', s !== name); }
  setLoading(f, text) { $('loadbar').style.width = `${Math.round(f * 100)}%`; if (text) $('loading').querySelector('p').textContent = text + '…'; }
  showHUD(on) { this.hudEl.classList.toggle('hidden', !on); }
  overlay(id, on, text) { const el = $(id); el.classList.toggle('hidden', !on); if (text != null) el.querySelector('.ov-text').textContent = text; }

  // ---------- HUD ----------
  updateHUD(d) {
    $('hud-pos').textContent = d.timetrial ? 'CRONO' : 'P' + d.position; $('hud-total').textContent = d.timetrial ? '' : d.total;
    $('hud-pos').classList.toggle('small-pos', !!d.timetrial); $('hud-total-wrap').classList.toggle('hidden', !!d.timetrial);
    $('hud-lap').textContent = Math.min(d.lap + 1, d.laps); $('hud-laps').textContent = d.laps;
    $('hud-lapbox').classList.toggle('hidden', !!d.timetrial);
    $('hud-laptime').textContent = formatTime(d.lapTime); $('hud-best').textContent = formatTime(d.best); $('hud-record').textContent = formatTime(d.record);
    $('slipstream').classList.toggle('hidden', !d.slipstream);
    $('wrongway').classList.toggle('hidden', !d.wrongWay);
    if (d.order) {
      let html = '';
      for (const o of d.order) html += `<div class="order-row${o.me ? ' me' : ''}"><span class="p">${o.pos}</span><span class="chip" style="background:${o.color}"></span><span>${o.name}</span><span class="gap">${o.gap}</span></div>`;
      if (html !== this.lastOrderHTML) { $('hud-order').innerHTML = html; this.lastOrderHTML = html; }
    }
    const rv = d.rival ? `★ Rival: <b>${d.rival.name}</b> · P${d.rival.pos}` : '';
    if (rv !== this.lastRival) { $('hud-rival').innerHTML = rv; $('hud-rival').classList.toggle('hidden', !rv); this.lastRival = rv; }
    $('arrow-l').classList.toggle('hidden', !d.arrowL); $('arrow-r').classList.toggle('hidden', !d.arrowR);
    $('hud-stage').classList.toggle('hidden', !d.timetrial);
    if (d.timetrial) { $('hud-sector').textContent = t(d.sector); $('hud-stagebar').style.width = `${Math.round(clamp(d.progress, 0, 1) * 100)}%`; }
  }

  // Tablero único: daños a la izquierda, reloj en el medio y marcha a la derecha, todo en un lienzo.
  drawSpeedo(kmh, rpmFrac, dt, d) {
    const g = this.speedo, W = 376, H = 184;
    const tinta = '#2b1d14', crema = 'rgba(255,243,214,0.94)';
    g.clearRect(0, 0, W, H);
    // caja del tablero
    const caja = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    caja(3, 3, W - 6, H - 6, 22); g.fillStyle = crema; g.fill(); g.lineWidth = 5; g.strokeStyle = tinta; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';

    // ---- daños: silueta del auto por zonas
    const dmg = (d && d.damage) || { front: 0, rear: 0, left: 0, right: 0 };
    const colDmg = (v) => v < 0.25 ? '#8bc34a' : v < 0.5 ? '#f0c541' : v < 0.75 ? '#ef8a3c' : '#d94a3a';
    const dx = 20, dy = 40, dw = 54, dh = 100;
    const zona = (x, y, w, h, r, v) => { caja(x, y, w, h, r); g.fillStyle = colDmg(v); g.fill(); g.lineWidth = 2.5; g.strokeStyle = tinta; g.stroke(); };
    zona(dx + 11, dy, 32, 21, 8, dmg.front);
    zona(dx, dy + 23, 11, 46, 4, dmg.left);
    zona(dx + 43, dy + 23, 11, 46, 4, dmg.right);
    zona(dx + 11, dy + 71, 32, 21, 8, dmg.rear);
    caja(dx + 16, dy + 26, 22, 40, 6); g.fillStyle = 'rgba(43,29,20,.35)'; g.fill();
    g.fillStyle = tinta; g.font = '700 12px Fredoka, sans-serif';
    g.fillText(t('DAÑOS'), dx + dw / 2, 26);

    // ---- separadores
    g.strokeStyle = 'rgba(43,29,20,.25)'; g.lineWidth = 2;
    for (const x of [96, 300]) { g.beginPath(); g.moveTo(x, 22); g.lineTo(x, H - 22); g.stroke(); }

    // ---- reloj
    const cx = 198, cy = 146, R = 92;
    const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
    g.beginPath(); g.arc(cx, cy, R - 14, a0, a1); g.lineWidth = 11; g.strokeStyle = '#a08c6b'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R - 14, a0, a0 + (a1 - a0) * clamp(rpmFrac, 0, 1)); g.strokeStyle = rpmFrac > 0.92 ? '#d94a3a' : '#e2a33b'; g.stroke();
    g.fillStyle = tinta; g.font = 'bold 12px Fredoka, sans-serif';
    for (let v = 0; v <= 160; v += 20) {
      const a = a0 + (a1 - a0) * v / 160;
      const largo = v % 40 === 0 ? 11 : 6;
      const x1 = cx + Math.cos(a) * (R - 25), y1 = cy + Math.sin(a) * (R - 25), x2 = cx + Math.cos(a) * (R - 25 - largo), y2 = cy + Math.sin(a) * (R - 25 - largo);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = v % 40 === 0 ? 3 : 2; g.strokeStyle = v >= 120 ? '#d94a3a' : tinta; g.stroke();
      if (v % 40 === 0) g.fillText(v, cx + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48));
    }
    this.needle = lerp(this.needle, clamp(kmh, 0, 165), clamp(dt * 12, 0, 1));
    const na = a0 + (a1 - a0) * this.needle / 160;
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 10, cy - Math.sin(na) * 10); g.lineTo(cx + Math.cos(na) * (R - 30), cy + Math.sin(na) * (R - 30));
    g.lineWidth = 5; g.strokeStyle = '#c94f2a'; g.lineCap = 'round'; g.stroke();
    g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fillStyle = tinta; g.fill();
    g.font = 'bold 32px Fredoka, sans-serif'; g.fillStyle = tinta; g.fillText(Math.round(Math.abs(kmh)), cx, 38);
    g.font = '600 11px Fredoka, sans-serif'; g.fillText('km/h', cx, 62);

    // ---- marcha
    const gx = 338;
    g.font = '700 12px Fredoka, sans-serif'; g.fillStyle = tinta; g.fillText(t('MARCHA'), gx, 26);
    caja(gx - 26, 46, 52, 58, 12); g.fillStyle = '#e6d9b8'; g.fill(); g.lineWidth = 3; g.strokeStyle = tinta; g.stroke();
    g.font = 'bold 40px Fredoka, sans-serif'; g.fillStyle = tinta;
    g.fillText(d ? (d.reverse ? 'R' : (d.gear + 1)) : 'N', gx, 77);
  }

  prepareMinimap(track) {
    const b = track.bounds, pad = 18, S = 220;
    const sx = (S - pad * 2) / Math.max(1, b.maxX - b.minX), sz = (S - pad * 2) / Math.max(1, b.maxZ - b.minZ);
    const sc = Math.min(sx, sz);
    const ox = (S - (b.maxX - b.minX) * sc) / 2, oz = (S - (b.maxZ - b.minZ) * sc) / 2;
    this.mapFn = (x, z) => [ox + (x - b.minX) * sc, oz + (z - b.minZ) * sc];
    const p = new Path2D();
    const last = track.closed ? track.n : track.n - 1;
    for (let i = 0; i <= last; i += 3) { const s = track.samples[track.wrap(i)]; const [x, y] = this.mapFn(s.x, s.z); if (i === 0) p.moveTo(x, y); else p.lineTo(x, y); }
    if (track.closed) p.closePath(); this.mapPath = p;
    const s0 = track.samples[0]; this.mapStart = { p: this.mapFn(s0.x, s0.z), nx: s0.nx, nz: s0.nz };
  }
  drawMinimap(cars, player, leader) {
    const g = this.minimap; g.clearRect(0, 0, 220, 220);
    if (!this.mapPath) return;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 11; g.strokeStyle = '#2b1d14'; g.stroke(this.mapPath);
    g.lineWidth = 7; g.strokeStyle = '#d9b878'; g.stroke(this.mapPath);
    const st = this.mapStart; g.beginPath(); g.moveTo(st.p[0] - st.nx * 6, st.p[1] - st.nz * 6); g.lineTo(st.p[0] + st.nx * 6, st.p[1] + st.nz * 6); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    for (const c of cars) {
      if (c === player) continue;
      const [x, y] = this.mapFn(c.state.x, c.state.z);
      const lead = c === leader;
      g.beginPath(); g.arc(x, y, c.isRival || lead ? 4.5 : 3.2, 0, 7); g.fillStyle = c.color; g.fill(); g.lineWidth = c.isRival || lead ? 2 : 1.2; g.strokeStyle = c.isRival ? '#c94f2a' : lead ? '#e2a33b' : '#2b1d14'; g.stroke();
      if (lead) { g.fillStyle = '#2b1d14'; g.font = 'bold 9px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', x, y + 0.5); }
    }
    if (player) {
      const [x, y] = this.mapFn(player.state.x, player.state.z);
      g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#c94f2a'; g.stroke();
    }
  }

  toast(text, kind = '', ms = 2600) {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
  }
  // Parcial de sector: S1/S2 o vuelta completa (3), con diferencia contra el récord
  split(k, time, delta) {
    const el = $('hud-split');
    const sign = delta == null ? '' : delta < 0 ? '−' : '+';
    const dtxt = delta == null ? 'sin referencia' : `${sign}${Math.abs(delta).toFixed(2)}`;
    el.innerHTML = `<span class="sk">${k === 3 ? 'VUELTA' : 'S' + k}</span> <span class="st">${formatTime(time)}</span> <span class="sd">${dtxt}</span>`;
    el.className = 'hud-box split ' + (delta == null ? '' : delta < 0 ? 'good' : 'bad');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.splitTimer); this.splitTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  taunt(name, text) {
    const el = $('taunt'); el.innerHTML = `<b>${name}:</b> ${text}`; el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.tauntTimer); this.tauntTimer = setTimeout(() => el.classList.add('hidden'), 4200);
  }
  countdown(text, go = false) {
    const el = $('countdown');
    if (text == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); el.classList.toggle('go', go); el.textContent = text;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  }
  banner(text, ms = 2500) {
    const el = $('banner'); el.textContent = text; el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ---------- Tablas ----------
  renderStandings(rows, playerName) {
    let h = `<table><tr><th>#</th><th>${t('Piloto')}</th><th class="num">${t('Pts')}</th><th class="num">${t('Victorias')}</th><th class="num">${t('Última')}</th></tr>`;
    rows.forEach((r, i) => { h += `<tr class="${r.name === playerName ? 'me' : ''}"><td>${i + 1}</td><td><span class="chip" style="background:${r.color}"></span>${r.name} <small>#${r.number}</small></td><td class="num">${r.points}</td><td class="num">${r.wins}</td><td class="num">${r.last ? 'P' + r.last : '–'}</td></tr>`; });
    $('standings').innerHTML = h + '</table>';
  }
  renderNextRound(champ, ROUNDS) {
    const el = $('next-round'), index = Math.min(champ.round, ROUNDS.length - 1), round = ROUNDS[index];
    $('champ-money').innerHTML = `${t('Plata')}: <b>${money(champ.money)}</b> · ${t('Daño del auto')}: <b>${Math.round(champ.damagePct() * 100)} %</b> · ${t('Rival de la fecha')}: <b>${champ.rival || '–'}</b>`;
    if (champ.done) { el.innerHTML = `<b>${t('Campeonato terminado')}</b>${t('Podés empezar uno nuevo desde el menú, o correr de nuevo la última fecha.')}`; $('btn-race').textContent = t('Correr otra vez la última'); }
    else {
      $('btn-race').textContent = t('¡A correr!');
      const clima = round.weather === 'rain' ? '🌧 ' + t('lluvia y barro') : '☀ ' + t('seco');
      const modo = round.mode === 'timetrial' ? t('contrarreloj, punto a punto') : `${round.laps} ${t('vueltas')} · ${t(round.reverse ? 'sentido inverso' : 'sentido normal')}`;
      el.innerHTML = `<b>${t('Fecha')} ${index + 1} ${t('de')} ${ROUNDS.length}</b>${t(round.name)}<br>${t(round.desc)}<br><small>${modo} · ${clima} · ${t('viento')} ${Math.round(Math.hypot(round.wind[0], round.wind[1]) * 3.6)} km/h</small>`;
    }
    $('champ-round-title').textContent = `${t('Fecha')} ${index + 1}/${ROUNDS.length}`;
  }
  renderResults(results, playerName, pointsTable, prize, mode) {
    const me = results.find(r => r.name === playerName);
    const frases = ['¡Ganaste! Los fititos de atrás comieron polvo.', '¡Podio! Casi, casi.', '¡Podio! Muy buena carrera.', 'Zona de puntos. Se puede mejorar.', 'Mitad de tabla. El auto quedó para el chapista.', 'Al menos llegaste entero… más o menos.'].map(t);
    const idx = me.position === 1 ? 0 : me.position === 2 ? 1 : me.position === 3 ? 2 : me.position <= 8 ? 3 : me.position <= 14 ? 4 : 5;
    let extra = '';
    if (prize) {
      extra = `<br><small>${t('Premio')} ${money(prize.money)} · +${prize.pts} ${t('puntos')}`;
      if (prize.rival) extra += prize.beatRival ? ` · ★ ${t('Le ganaste a')} ${prize.rival} (P${prize.rivalPos}): +${5} ${t('pts y')} $500` : ` · ${prize.rival} ${t('te ganó')} (P${prize.rivalPos})`;
      if (prize.bestLap) extra += ' · ' + t('Mejor vuelta de la carrera: +$300');
      extra += '</small>';
    }
    $('results-summary').innerHTML = `${mode === 'timetrial' ? `${t('Tu tiempo')} <b>${formatTime(me.time)}</b> · ` : ''}${t('Terminaste')} <b>P${me.position}</b> · ${frases[idx]}${extra}`;
    let h = `<table><tr><th>${t('Pos')}</th><th>${t('Piloto')}</th><th class="num">${t(mode === 'timetrial' ? 'Tiempo del tramo' : 'Tiempo')}</th><th class="num">${t('Mejor vuelta')}</th><th class="num">${t('Daño')}</th><th class="num">${t('Pts')}</th></tr>`;
    for (const r of results) {
      h += `<tr class="${r.name === playerName ? 'me' : ''}"><td>${r.position}</td><td><span class="chip" style="background:${r.color}"></span>${r.name}</td><td class="num">${formatTime(r.time)}${r.finished ? '' : ' <small>(est.)</small>'}</td><td class="num">${mode === 'timetrial' ? '–' : formatTime(r.bestLap)}</td><td class="num">${r.damage ? Math.round((r.damage.front + r.damage.rear + r.damage.left + r.damage.right) / 4 * 100) + '%' : '–'}</td><td class="num">${(pointsTable[r.position - 1] || 0) + (r.name === playerName && prize && prize.beatRival ? 5 : 0)}</td></tr>`;
    }
    $('results-table').innerHTML = h + '</table>';
  }

  // ---------- Récords personales ----------
  renderRecords(CIRCUITS) {
    let all = {}; try { all = JSON.parse(localStorage.getItem('coparipio.records') || '{}'); } catch (e) { /* nada */ }
    const rows = Object.entries(all).map(([k, r]) => { const [id, dir, mode] = k.split('|'); return { track: t((CIRCUITS[id] || { name: id }).name), dir: t(dir === 'inv' ? 'inverso' : 'normal'), mode: t(mode === 'timetrial' ? 'contrarreloj' : 'carrera'), best: r.bestLap, s1: r.splits && r.splits[0], s2: r.splits && r.splits[1], when: r.when }; });
    rows.sort((a, b) => a.track.localeCompare(b.track) || a.dir.localeCompare(b.dir));
    let h = `<table><tr><th>${t('Pista')}</th><th>${t('Sentido')}</th><th>${t('Modo')}</th><th class="num">${t('Mejor vuelta')}</th><th class="num">S1</th><th class="num">S2</th><th>${t('Fecha')}</th></tr>`;
    for (const r of rows) h += `<tr><td>${r.track}</td><td>${r.dir}</td><td>${r.mode}</td><td class="num"><b>${formatTime(r.best)}</b></td><td class="num">${r.s1 != null ? r.s1.toFixed(2) : '–'}</td><td class="num">${r.s2 != null ? r.s2.toFixed(2) : '–'}</td><td>${r.when ? new Date(r.when).toLocaleDateString('es-AR') : '–'}</td></tr>`;
    if (!rows.length) h += `<tr><td colspan="7">${t('Todavía no hay récords. Salí a girar.')}</td></tr>`;
    $('records-table').innerHTML = h + '</table>';
  }

  // ---------- Taller (plata, reparaciones, mejoras) ----------
  renderWorkshop(champ, handlers) {
    const d = champ.damage;
    const col = (v) => v < 0.25 ? '#8bc34a' : v < 0.5 ? '#f0c541' : v < 0.75 ? '#ef8a3c' : '#d94a3a';
    $('ws-money').textContent = money(champ.money);
    $('ws-front').style.fill = col(d.front); $('ws-rear').style.fill = col(d.rear); $('ws-left').style.fill = col(d.left); $('ws-right').style.fill = col(d.right);
    const cost = champ.repairCost();
    $('ws-damage').textContent = `${t('Daño')} ${Math.round(champ.damagePct() * 100)} %`;
    const btn = $('btn-repair');
    if (cost <= 0) { btn.textContent = t('El auto está impecable'); btn.disabled = true; }
    else if (champ.money >= cost) { btn.textContent = `${t('Reparar todo')} (${money(cost)})`; btn.disabled = false; }
    else if (champ.money > 0) { btn.textContent = `${t('Reparar lo que alcance')} (${money(champ.money)} ${t('de')} ${money(cost)})`; btn.disabled = false; }
    else { btn.textContent = `${t('Sin plata para reparar')} (${money(cost)}). ${t('Corrés con el auto así.')}`; btn.disabled = true; }
    btn.onclick = () => { handlers.repair(); };
    let h = '';
    for (const [key, u] of Object.entries(UPGRADES)) {
      const l = champ.upgrades[key], max = u.costs.length;
      const next = l < max ? u.costs[l] : null;
      h += `<div class="upgrade"><div><b>${t(u.name)}</b> <span class="lvl">${'●'.repeat(l)}${'○'.repeat(max - l)}</span><br><small>${t(u.desc)}</small></div>
        <button class="btn ${champ.canBuy(key) ? 'primary' : ''}" data-key="${key}" ${champ.canBuy(key) ? '' : 'disabled'}>${next == null ? t('Al máximo') : money(next)}</button></div>`;
    }
    $('upgrades').innerHTML = h;
    $('upgrades').querySelectorAll('button').forEach(b => { b.onclick = () => handlers.buy(b.dataset.key); });
    $('ws-note').textContent = champ.damagePct() > 0.05 && champ.money < cost ? t('Si no reparás, corrés con las abolladuras: el volante tira, el motor falla y las piezas sueltas se caen.') : t('Los premios llegan al terminar cada fecha. Ganarle a tu rival paga $500 extra.');
  }

  // ---------- Taller estético ----------
  initGarage(spec, colors, onChange) {
    this.initPilotForm({ name: 'in-name', number: 'in-number', color: 'color-swatches', roof: 'roof-swatches', accessory: 'in-accessory', stripes: 'in-stripes' }, spec, colors, onChange);
  }
  // Mismo formulario (nombre, número, colores, franjas) en el garaje y en el lobby multijugador
  initPilotForm(ids, spec, colors, onChange) {
    const mk = (containerId, key) => {
      const c = $(containerId); c.innerHTML = '';
      for (const col of colors) {
        const s = document.createElement('div'); s.className = 'swatch' + (spec[key] === col ? ' sel' : ''); s.style.background = col;
        s.onclick = () => { spec[key] = col; [...c.children].forEach(ch => ch.classList.remove('sel')); s.classList.add('sel'); onChange(); };
        c.appendChild(s);
      }
    };
    mk(ids.color, 'color'); mk(ids.roof, 'roofColor');
    $(ids.name).value = spec.name; $(ids.number).value = spec.number; $(ids.stripes).checked = !!spec.stripes;
    $(ids.name).oninput = (e) => { spec.name = e.target.value.trim() || t('Vos'); onChange(); };
    $(ids.number).onchange = (e) => { spec.number = clamp(parseInt(e.target.value) || 7, 1, 99); e.target.value = spec.number; onChange(); };
    $(ids.stripes).onchange = (e) => { spec.stripes = e.target.checked; onChange(); };
    if (ids.accessory) { $(ids.accessory).value = spec.accessory; $(ids.accessory).onchange = (e) => { spec.accessory = e.target.value; onChange(); }; }
  }
}
