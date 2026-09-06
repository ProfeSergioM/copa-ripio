// Sonido 100% sintetizado con Web Audio: motores, ripio, derrape, golpes, público, pájaros, bocina y música de menú.
import { clamp, lerp } from './util.js';

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class GameAudio {
  constructor() { this.ctx = null; this.volume = 0.8; this.muted = false; this.musicOn = true; this.state = 'menu'; this.aiVoices = []; this.birdT = 1; this.crowdT = 0; this.popT = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.volume * 1.5;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -20; this.comp.ratio.value = 6; this.comp.knee.value = 12;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    // ruido blanco compartido
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.98 * b0 + 0.02 * w; d[i] = (w * 0.6 + b0 * 3) * 0.5; }
    this.noiseBuf = buf;
    this.engine = this.makeEngineVoice(true);
    this.engine.out.connect(this.master);
    for (let i = 0; i < 7; i++) { const v = this.makeEngineVoice(true); v.pan = ctx.createStereoPanner(); v.out.connect(v.pan); v.pan.connect(this.master); v.car = null; this.aiVoices.push(v); }
    this.gravel = this.noiseVoice(320, 0.8); this.gravel.out.connect(this.master);
    this.grass = this.noiseVoice(140, 0.6); this.grass.out.connect(this.master);
    this.skid = this.noiseVoice(1500, 3); this.skid.out.connect(this.master);
    this.wind = this.noiseVoice(500, 0.3); this.wind.out.connect(this.master);
    this.rumble = this.noiseVoice(95, 0.5); this.rumble.filter.type = 'lowpass'; this.rumble.out.connect(this.master); // retumbe grave de rodadura
    this.swish = this.noiseVoice(650, 1.2); this.swish.out.connect(this.master); this.pebbleT = 0;
    this.othersGravel = this.noiseVoice(260, 0.8); this.othersPan = ctx.createStereoPanner(); this.othersGravel.out.disconnect(); this.othersGravel.out.connect(this.othersPan); this.othersPan.connect(this.master);
    this.rain = this.noiseVoice(1400, 0.4); this.rain.filter.type = 'lowpass'; this.rain.out.connect(this.master); this.dripT = 0; this.hornT = 3;
    this.crowd = this.noiseVoice(900, 0.4); this.crowd.filter.type = 'bandpass'; this.crowd.out.connect(this.master);
    this.crowdLevel = 0; this.cheer = 0;
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
    this.musicNext = 0; this.musicStep = 0; this.musicTimer = null;
    this.startMusicScheduler();
    this.loadSamples();
  }

  // ---- muestras reales (CC0 de OpenGameArt): banco de motor por régimen, chirrido, choque, viento, arranque
  async loadSamples() {
    const ctx = this.ctx;
    const load = async (name) => { try { const r = await fetch('assets/sonidos/' + name); if (!r.ok) throw new Error(r.status); return await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('sin muestra', name, e); return null; } };
    const motor = await Promise.all([0, 1, 2, 3, 4, 5].map(i => load(`motor_${i}.wav`)));
    if (motor.every(Boolean)) {
      this.samples = { motor, fund: [42.8, 59.9, 64.5, 70.9, 71.5, 76.5], rpmAt: [900, 1900, 2900, 4000, 5100, 6300] };
      this.engine.sample = this.makeSampleLayers(this.engine);
      for (const v of this.aiVoices) v.sample = this.makeSampleLayers(v);
    }
    const [skid, crash, wind, start] = await Promise.all([load('chirrido.wav'), load('golpe.ogg'), load('viento.wav'), load('arranque.wav')]);
    this.crashBuf = crash; this.startBuf = start;
    if (skid) { const src = ctx.createBufferSource(); src.buffer = skid; src.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const g = ctx.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.master); src.start(); this.skidSample = { src, g }; }
    if (wind) { const src = ctx.createBufferSource(); src.buffer = wind; src.loop = true; const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.master); src.start(); this.windSample = { src, g }; }
  }
  // seis lazos en paralelo por voz; se mezclan los dos vecinos al régimen actual y se corrige la velocidad
  makeSampleLayers(voice) {
    const ctx = this.ctx, layers = [];
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.7;
    out.connect(lp); lp.connect(voice.pan || this.master);
    for (let i = 0; i < 6; i++) {
      const src = ctx.createBufferSource(); src.buffer = this.samples.motor[i]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(out); src.start(Math.random() * 0.3);
      layers.push({ src, g });
    }
    return { out, lp, layers };
  }
  setSampleEngine(sm, rpm, load, gain, misfire, doppler = 1) {
    const t = this.ctx.currentTime, S = this.samples;
    const r = clamp(rpm, 800, 6600);
    // tono objetivo: sube con las rpm (exagerado un poco para que se sienta la subida)
    const F = 40 * Math.pow(r / 900, 0.72) * doppler;
    let pos = 0; for (let i = 0; i < 5; i++) if (r >= S.rpmAt[i]) pos = i + clamp((r - S.rpmAt[i]) / (S.rpmAt[i + 1] - S.rpmAt[i]), 0, 1);
    for (let i = 0; i < 6; i++) {
      const w = Math.max(0, 1 - Math.abs(pos - i));
      const L = sm.layers[i];
      L.g.gain.setTargetAtTime(w, t, 0.04);
      if (w > 0) L.src.playbackRate.setTargetAtTime(clamp(F / S.fund[i], 0.45, 2.6), t, 0.03);
    }
    sm.lp.frequency.setTargetAtTime(1100 + load * 5000, t, 0.06);
    sm.out.gain.setTargetAtTime(gain * (0.45 + 0.55 * load) * (misfire ? 0.2 : 1), t, misfire ? 0.01 : 0.05);
  }
  engineStart() { if (!this.ctx || !this.startBuf) return; const src = this.ctx.createBufferSource(); src.buffer = this.startBuf; const g = this.ctx.createGain(); g.gain.value = 0.5; src.connect(g); g.connect(this.master); src.start(); }
  crashSample(strength, pan) { if (!this.crashBuf) return; const ctx = this.ctx; const src = ctx.createBufferSource(); src.buffer = this.crashBuf; src.playbackRate.value = 0.8 + Math.random() * 0.5; const g = ctx.createGain(); g.gain.value = clamp(strength / 10, 0.15, 1); const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); src.connect(g); g.connect(p); p.connect(this.master); src.start(); }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v * 1.5; }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 1.5; return this.muted; }

  makeEngineVoice(rich) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; filter.Q.value = 1.2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); } shaper.curve = curve;
    shaper.connect(filter); filter.connect(out);
    const oscs = [];
    const mk = (type, mult, gain) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(shaper); o.start(); oscs.push({ o, mult, g }); };
    mk('sawtooth', 1, 0.5); mk('square', 0.5, 0.35);
    if (rich) { mk('triangle', 2, 0.25); mk('sawtooth', 1.5, 0.12); mk('sine', 4.5, 0.045); /* silbido de la caja */ mk('sawtooth', 0.25, 0.22); /* subgrave */ }
    // rasgado de escape: ruido filtrado que sigue al régimen
    const rasp = ctx.createBufferSource(); rasp.buffer = this.noiseBuf; rasp.loop = true;
    const raspF = ctx.createBiquadFilter(); raspF.type = 'bandpass'; raspF.Q.value = 2.5; raspF.frequency.value = 400;
    const raspG = ctx.createGain(); raspG.gain.value = 0.18; rasp.connect(raspF); raspF.connect(raspG); raspG.connect(shaper); rasp.start();
    // vibrato de "traqueteo"
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 1.5; lfo.connect(lg);
    for (const { o } of oscs) lg.connect(o.frequency);
    lfo.start();
    return { out, filter, oscs, lfo, lg, raspF, raspG, rpm: 1000, load: 0 };
  }
  setEngine(v, rpm, load, gain, misfire, doppler = 1) {
    if (v.sample) { this.setSampleEngine(v.sample, rpm, load, gain * 1.15, misfire, doppler); gain *= 0.3; }
    const f = rpm / 30 * doppler; // 4 cilindros, 4 tiempos
    const t = this.ctx.currentTime;
    for (const { o, mult } of v.oscs) o.frequency.setTargetAtTime(f * mult, t, 0.03);
    if (v.raspF) { v.raspF.frequency.setTargetAtTime(f * 6 + 300, t, 0.05); v.raspG.gain.setTargetAtTime(0.06 + load * 0.2, t, 0.05); }
    const rn = clamp((rpm - 900) / 5500, 0, 1);
    v.filter.frequency.setTargetAtTime(280 + load * 1400 + rn * 2200, t, 0.05);
    v.lg.gain.setTargetAtTime(1 + rn * 3, t, 0.1);
    const g = gain * (0.35 + 0.65 * load) * (0.6 + 0.4 * rn) * (misfire ? 0.15 : 1);
    v.out.gain.setTargetAtTime(g, t, misfire ? 0.01 : 0.04);
  }

  noiseVoice(freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const out = ctx.createGain(); out.gain.value = 0;
    src.connect(filter); filter.connect(out); src.start();
    return { src, filter, out };
  }

  // ---- eventos puntuales
  burst(freq, q, gain, dur, pan = 0) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  tone(freq, type, gain, dur, pan = 0, slide = 1) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    o.connect(g); g.connect(p); p.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  impact(strength, pan = 0, soft = false) {
    if (!this.ctx) return;
    const s = clamp(strength / 12, 0.1, 1);
    if (soft) { this.burst(250, 0.5, 0.5 * s, 0.25, pan); return; }
    if (strength > 3) this.crashSample(strength, pan);
    this.burst(180, 0.7, 0.8 * s, 0.18, pan);
    this.burst(2600, 1.5, 0.35 * s, 0.09, pan);
    this.tone(70, 'sine', 0.6 * s, 0.25, pan, 0.5);
    if (s > 0.35) { this.tone(1900 + Math.random() * 600, 'triangle', 0.12 * s, 0.35, pan, 0.9); this.tone(3100 + Math.random() * 800, 'sine', 0.06 * s, 0.5, pan, 0.95); }
  }
  landing(strength) { if (this.ctx) { this.burst(150, 0.6, clamp(strength / 12, 0.1, 0.8), 0.25); } }
  gearShift() { if (this.ctx) this.burst(900, 2, 0.1, 0.05); }
  horn(pan = 0, ai = false) {
    if (!this.ctx) return;
    const base = ai ? 380 + Math.random() * 120 : 440;
    this.tone(base, 'sawtooth', 0.12, 0.45, pan, 1); this.tone(base * 1.26, 'square', 0.06, 0.45, pan, 1);
  }
  beep(final) { if (!this.ctx) return; this.tone(final ? 880 : 440, 'square', 0.2, final ? 0.7 : 0.18); }
  cheerNow(amount = 1) { this.cheer = Math.max(this.cheer, amount); if (this.ctx) { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(2000 + Math.random() * 1500, 'sine', 0.04, 0.4, Math.random() - 0.5, 1.4), i * 180 + Math.random() * 200); } }
  pop(pan = 0) { if (this.ctx) this.burst(500, 1.2, 0.25, 0.07, pan); }
  bird() { if (!this.ctx) return; const f = 2600 + Math.random() * 1800; const pan = Math.random() * 1.6 - 0.8; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) setTimeout(() => this.tone(f, 'sine', 0.05, 0.12, pan, 1.3), i * 130); }

  // ---- actualización por cuadro
  // player: estado físico del jugador; cars: lista de estados; cam: {x,z,heading}
  update(dt, player, cars, cam, opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const racing = this.state === 'race';
    // motor del jugador
    if (player) {
      const load = clamp(player.throttle * 0.9 + 0.1, 0.1, 1);
      this.setEngine(this.engine, player.rpm, racing ? load : 0.15, racing ? 0.62 : 0.14, player.misfiring);
      if (player.shifted) { this.gearShift(); player.shifted = 0; }
      // petardeo al soltar
      this.popT -= dt;
      if (racing && player.throttle < 0.1 && player.rpm > 4200 && this.popT < 0 && Math.random() < 0.3) { this.pop(); this.popT = 0.15; }
      // rodadura
      const sp = Math.abs(player.speed);
      const onGravel = player.surface === 'gravel' || player.surface === 'shoulder';
      const rough = player.airborne ? 0 : clamp(sp / 30, 0, 1);
      const ditch = player.surface === 'ditch';
      this.gravel.out.gain.setTargetAtTime(onGravel ? rough * 0.95 : (ditch ? rough * 0.6 : 0), t, 0.08);
      this.rumble.out.gain.setTargetAtTime(player.airborne ? 0 : rough * (onGravel ? 0.5 : 0.35), t, 0.1);
      this.gravel.filter.frequency.setTargetAtTime(180 + sp * 9, t, 0.1);
      this.grass.out.gain.setTargetAtTime(!onGravel && !player.airborne ? rough * 0.8 : 0, t, 0.08);
      this.swish.out.gain.setTargetAtTime(player.surface === 'grass' && !player.airborne ? rough * 0.22 : 0, t, 0.1);
      // piedritas que golpean los guardabarros: chasquidos al azar según velocidad
      if (onGravel && !player.airborne && sp > 4) { this.pebbleT -= dt; if (this.pebbleT < 0) { this.pebbleT = 0.4 / (1 + sp / 8); this.burst(1500 + Math.random() * 2500, 4, 0.05 + Math.random() * 0.05, 0.02 + Math.random() * 0.02, Math.random() - 0.5); } }
      // baches: sacudones del suelo (cambios bruscos de velocidad vertical)
      if (player.jolt > 1.5 && !player.airborne) { this.burst(110, 0.9, clamp(player.jolt / 12, 0.08, 0.5), 0.14); this.tone(60, 'sine', clamp(player.jolt / 20, 0.05, 0.3), 0.18, 0, 0.6); player.jolt = 0; }
      const slip = clamp((Math.abs(player.lateralV) - 2.5) / 6, 0, 1) + player.wheelspin * 0.7 + (player.frontLock ? 0.4 : 0);
      this.skid.out.gain.setTargetAtTime(player.airborne ? 0 : clamp(slip, 0, 1) * 0.18 * clamp(sp / 6, 0, 1), t, 0.05);
      this.wind.out.gain.setTargetAtTime(clamp(sp / 40, 0, 1) ** 2 * (this.windSample ? 0.04 : 0.12), t, 0.2);
      if (this.windSample) this.windSample.g.gain.setTargetAtTime(clamp(sp / 40, 0, 1) ** 2 * 0.35, t, 0.2);
      if (this.skidSample) this.skidSample.g.gain.setTargetAtTime(player.airborne ? 0 : clamp(slip, 0, 1) * 0.16 * clamp(sp / 6, 0, 1) * (onGravel ? 0.8 : 0.5), t, 0.05);
      // lluvia sobre el techo: siseo constante y goteo
      this.rain.out.gain.setTargetAtTime(opts.rain ? 0.09 : 0, t, 0.5);
      if (opts.rain) { this.dripT -= dt; if (this.dripT < 0) { this.dripT = 0.05 + Math.random() * 0.25; this.burst(3000 + Math.random() * 2500, 6, 0.04, 0.03, Math.random() - 0.5); } }
      // bocinas de la hinchada al pasar por la tribuna
      const cdd = opts.crowdDist ?? 200; this.hornT -= dt;
      if (racing && cdd < 55 && this.hornT < 0) { this.hornT = 1.5 + Math.random() * 4; const f = 280 + Math.random() * 160; this.tone(f, 'sawtooth', 0.07, 0.5 + Math.random() * 0.4, Math.random() - 0.5, 1); this.tone(f * 1.5, 'square', 0.03, 0.5, Math.random() - 0.5, 1); }
    }
    // motores rivales: los 4 más cercanos a la cámara
    if (cam && cars) {
      const near = [];
      let gSum = 0, panSum = 0;
      for (const c of cars) { if (c === player) continue; const d = Math.hypot(c.x - cam.x, c.z - cam.z); if (d < 90) near.push({ c, d }); }
      near.sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.aiVoices.length; i++) {
        const v = this.aiVoices[i], e = near[i];
        if (!e) { v.out.gain.setTargetAtTime(0, t, 0.1); continue; }
        const c = e.c;
        const rel = Math.atan2(c.x - cam.x, c.z - cam.z) - cam.heading;
        const pan = clamp(-Math.sin(rel) * 0.8, -1, 1);
        v.pan.pan.setTargetAtTime(pan, t, 0.1);
        // Doppler exagerado: se acerca = más agudo, se aleja = más grave
        const dx = (cam.x - c.x) / Math.max(e.d, 1), dz = (cam.z - c.z) / Math.max(e.d, 1);
        const vRel = c.vx * dx + c.vz * dz;
        const doppler = clamp(1 + vRel / 120, 0.8, 1.25);
        const gain = 0.7 / (1 + (e.d / 22) ** 2);
        this.setEngine(v, c.rpm, clamp(c.throttle, 0.15, 1), racing ? gain : gain * 0.4, c.misfiring, doppler);
        const gg = (Math.abs(c.speed) / 25) * 0.16 / (1 + (e.d / 16) ** 2); gSum += gg; panSum += pan * gg;
      }
      // ripio de los rivales cercanos (una sola voz sumada, paneada al promedio)
      this.othersGravel.out.gain.setTargetAtTime(racing ? clamp(gSum, 0, 0.45) : 0, t, 0.1);
      if (gSum > 0.001) this.othersPan.pan.setTargetAtTime(clamp(panSum / gSum, -1, 1), t, 0.2);
    }
    // público
    const cd = opts.crowdDist ?? 200;
    const base = racing ? 0.2 / (1 + (cd / 50) ** 2) + 0.02 : 0.05;
    this.crowdT -= dt;
    if (this.crowdT < 0) { this.crowdT = 0.25 + Math.random() * 0.4; this.crowdLevel = base * (0.7 + Math.random() * 0.6); }
    this.cheer = Math.max(0, this.cheer - dt * 0.6);
    this.crowd.out.gain.setTargetAtTime(this.crowdLevel * (1 + 4 * this.cheer), t, 0.2);
    this.crowd.filter.frequency.setTargetAtTime(700 + 500 * this.cheer, t, 0.3);
    // pájaros
    this.birdT -= dt;
    if (this.birdT < 0) { this.birdT = 2 + Math.random() * 6; if (!player || Math.abs(player.speed) < 12 || !racing) this.bird(); }
    // música
    const wantMusic = this.musicOn && this.state === 'menu' && !this.muted;
    this.musicGain.gain.setTargetAtTime(wantMusic ? 0.22 : 0, t, 0.4);
  }

  // ---- musiquita de menú (tarantela de acordeón sintético)
  startMusicScheduler() {
    const melody = [69, 76, 72, 69, 76, 72, 71, 76, 74, 71, 76, 74, 72, 76, 81, 79, 77, 76, 74, 77, 71, 76, 69, 0,
      69, 76, 72, 69, 76, 72, 71, 76, 74, 71, 76, 74, 72, 76, 81, 84, 83, 81, 79, 77, 76, 74, 72, 71];
    const bass = [57, 0, 0, 52, 0, 0, 52, 0, 0, 59, 0, 0, 57, 0, 0, 60, 0, 0, 52, 0, 0, 57, 0, 0,
      57, 0, 0, 52, 0, 0, 52, 0, 0, 59, 0, 0, 57, 0, 0, 60, 0, 0, 52, 0, 0, 57, 0, 0];
    const stepDur = 0.16;
    const tick = () => {
      const ctx = this.ctx; if (!ctx) return;
      while (this.musicNext < ctx.currentTime + 0.4) {
        const i = this.musicStep % melody.length;
        const t0 = Math.max(this.musicNext, ctx.currentTime);
        if (melody[i]) this.note(midiHz(melody[i]), t0, stepDur * 0.95, 'triangle', 0.5, true);
        if (bass[i]) this.note(midiHz(bass[i]), t0, stepDur * 2.6, 'square', 0.25, false);
        if (i % 3 === 0) this.note(midiHz(melody[i] ? melody[i] - 12 : 57), t0, stepDur * 0.5, 'sawtooth', 0.08, false);
        this.musicNext += stepDur; this.musicStep++;
      }
    };
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(tick, 120);
  }
  note(freq, t0, dur, type, gain, detune) {
    const ctx = this.ctx;
    const mk = (det) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.015); g.gain.setTargetAtTime(0.0001, t0 + dur * 0.7, dur * 0.15); o.connect(g); g.connect(this.musicGain); o.start(t0); o.stop(t0 + dur + 0.3); };
    mk(0); if (detune) mk(9);
  }
}
