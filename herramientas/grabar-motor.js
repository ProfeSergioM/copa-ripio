// Grabación del motor fuera de tiempo real, para escuchar y medir cambios en el sonido sin depender de la
// placa de audio ni de la velocidad del navegador. Se usa desde la consola de la página del juego:
//
//   const g = await import('/herramientas/grabar-motor.js');
//   await g.registrar(app, 900);               // graba 900 cuadros del auto del jugador (con ?auto maneja solo)
//   const wav = await g.renderizar(app, g.recorrido(), 'preparado');
//   g.descargar(wav, 'motor.wav');             // o g.enviar(wav, 'motor.wav', 'http://127.0.0.1:8799')
//
// El recorrido guarda, cuadro a cuadro, lo que el motor necesita: régimen, acelerador, marcha y fallos.
// renderizar() arma un GameAudio sobre un OfflineAudioContext, apaga todo lo que no es motor (ripio, viento,
// público, pájaros) y le da los cuadros en sus tiempos exactos con suspend()/resume().
import { clamp } from '../js/util.js';

const CUADRO = 768; // muestras por cuadro a 48 kHz (16 ms); suspend() necesita múltiplos de 128

let _recorrido = [];
export const recorrido = () => _recorrido;

// Avanza el juego a mano y anota el estado del motor del jugador
export async function registrar(app, cuadros = 900, paso = 16) {
  _recorrido = [];
  const s = () => app.race.player.state;
  let marcha = s().gear;
  for (let i = 0; i < cuadros; i++) {
    app.tick(paso);
    const e = s();
    _recorrido.push({ rpm: e.rpm, acel: e.throttle, marcha: e.gear, cambio: e.gear !== marcha ? Math.sign(e.gear - marcha) : 0, fallo: !!e.misfiring, vel: e.speed });
    marcha = e.gear;
    if (i % 60 === 59) await new Promise((r) => setTimeout(r, 0)); // que la página respire
  }
  return _recorrido.length;
}

export async function renderizar(app, rec, perfil = 'preparado', { tasa = 48000, semilla = 7 } = {}) {
  const ClaseAudio = app.audio.constructor;
  const dur = rec.length * CUADRO / tasa;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * tasa), tasa);
  const au = new ClaseAudio();
  au.volume = 0.8; au.musicOn = false;
  au.init(ctx);
  au.setEngineProfile(perfil);
  if (au.listo) await au.listo; // el motor nuevo carga su procesador antes de sonar
  // esperar las muestras grabadas (las usan algunos perfiles)
  for (let k = 0; k < 100 && !au.samples; k++) await new Promise((r) => setTimeout(r, 30));
  // fuera todo lo que no es motor
  for (const v of [au.gravel, au.grass, au.skid, au.wind, au.rumble, au.swish, au.othersGravel, au.rain, au.crowd]) v && v.out.disconnect();
  for (const v of au.aiVoices) v.out.disconnect();
  if (au.skidSample) au.skidSample.g.disconnect();
  if (au.windSample) au.windSample.g.disconnect();
  au.birdT = 1e9; au.hornT = 1e9; au.state = 'race';
  // Math.random con semilla, para que antes y después tengan los mismos petardeos
  const azarOriginal = Math.random; let x = semilla;
  Math.random = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  try {
    rec.forEach((f, i) => {
      ctx.suspend((i * CUADRO) / tasa).then(() => {
        const jugador = { rpm: f.rpm, throttle: f.acel, speed: f.vel, surface: 'ninguna', airborne: false, lateralV: 0, wheelspin: 0, frontLock: false, jolt: 0, shifted: f.cambio, misfiring: f.fallo };
        au.update(CUADRO / tasa, jugador, null, null, { crowdDist: 1e9 });
        ctx.resume();
      });
    });
    const buf = await ctx.startRendering();
    return aWav(buf);
  } finally {
    Math.random = azarOriginal;
  }
}

function aWav(buf) {
  const n = buf.length, canales = buf.numberOfChannels, tasa = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * canales * 2));
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); out.setUint32(4, 36 + n * canales * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, canales, true); out.setUint32(24, tasa, true);
  out.setUint32(28, tasa * canales * 2, true); out.setUint16(32, canales * 2, true); out.setUint16(34, 16, true);
  txt(36, 'data'); out.setUint32(40, n * canales * 2, true);
  const datos = []; for (let c = 0; c < canales; c++) datos.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < canales; c++) { out.setInt16(o, clamp(datos[c][i], -1, 1) * 32767, true); o += 2; }
  return out.buffer;
}

export async function enviar(wav, nombre, url = 'http://127.0.0.1:8799') {
  const r = await fetch(`${url}/guardar?nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: wav });
  return r.text();
}

export function descargar(wav, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); a.download = nombre; a.click();
}
