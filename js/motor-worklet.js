// Generador de explosiones de un cuatro cilindros, cuatro tiempos, para el AudioWorklet.
//
// El sintetizador anterior eran ondas de sierra y cuadradas atadas al régimen: un timbre fijo que sólo
// cambiaba de altura, y que sonaba a zumbido. Un motor de verdad son explosiones sueltas (cuatro cada dos
// vueltas) que salen por el caño. Acá cada explosión es un pulso de presión más una ráfaga de ruido, y los
// cuatro cilindros no son idénticos: cada uno empuja un poco distinto y llega un poco antes o después. Eso da
// la textura. El color del caño (resonancias fijas que no se mueven con el régimen) se agrega afuera, con
// filtros comunes.
//
// Parámetros (por bloque):
//   rpm        régimen ya multiplicado por el "pitch" del perfil
//   carga      0 suelto (freno motor) a 1 a fondo: con carga los pulsos son más fuertes y ásperos
//   aspereza   cuánto ruido lleva cada explosión (el rasgado del escape)
//   irregular  cuánto difieren los cilindros entre sí y de una vuelta a la otra
//   fallo      1 cuando el motor golpeado falla: se pierden explosiones
//   corte      1 mientras el limitador corta el encendido
class MotorProcesador extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 15000, automationRate: 'k-rate' },
      { name: 'carga', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'aspereza', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
      { name: 'irregular', defaultValue: 1, minValue: 0, maxValue: 3, automationRate: 'k-rate' },
      { name: 'fallo', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'corte', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(opciones) {
    super();
    this.semilla = ((opciones && opciones.processorOptions && opciones.processorOptions.semilla) || 1) >>> 0 || 1;
    this.fase = 0;            // posición dentro del ciclo de dos vueltas, de 0 a 1
    this.proxima = 0;         // índice de la próxima explosión (0..3)
    this.cil = [1, 0.92, 1.06, 0.97];        // fuerza propia de cada cilindro
    this.adelanto = [0, 0.008, -0.006, 0.004]; // corrimiento de cada encendido, en fracción de ciclo
    // explosiones en curso: hasta 6 a la vez
    this.edad = new Float32Array(6).fill(1e9);
    this.amp = new Float32Array(6); this.ancho = new Float32Array(6); this.ruido = new Float32Array(6); this.tauRuido = new Float32Array(6);
    this.libre = 0;
    this.lp = 0;       // filtro de un polo para el ruido (lo vuelve menos "siseo" y más "rasgado")
    this.dc = 0;       // para sacar la componente continua del tren de pulsos
  }

  azar() { // xorshift: rápido y con semilla, así antes y después suenan igual al grabar
    let x = this.semilla; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.semilla = x >>> 0;
    return this.semilla / 4294967296;
  }

  disparar(rpm, carga, aspereza, irregular, fallo, corte) {
    const k = this.proxima;
    let a = (0.62 + 0.38 * carga) * this.cil[k] * (1 + (this.azar() - 0.5) * 0.22 * irregular);
    // soltando a régimen alto: mezcla pobre, explosiones flojas y alguna que se pierde (el "burbujeo")
    if (carga < 0.15 && rpm > 2200) a *= this.azar() < 0.18 ? 0.2 : 0.65 + 0.3 * this.azar();
    if (fallo > 0.5 && this.azar() < 0.45) a *= 0.08;
    if (corte > 0.5) a *= 0.05;
    const intervalo = 30 / Math.max(rpm, 300); // segundos entre explosiones
    const i = this.libre; this.libre = (this.libre + 1) % 6;
    this.edad[i] = 0;
    this.amp[i] = a;
    // el pulso de presión: más corto que el intervalo, así tiene armónicos en los medios (el "put-put" del
    // ralentí y el rasgado arriba); con medio intervalo quedaba redondo y todo se iba a los graves
    this.ancho[i] = Math.min(0.005, Math.max(0.0009, intervalo * 0.3));
    // la ráfaga de ruido es el rasgado: crece con la carga y con la aspereza del perfil
    this.ruido[i] = a * aspereza * (0.25 + 0.95 * carga);
    this.tauRuido[i] = 0.0007 + 0.0016 * carga;
    // la próxima explosión, con su corrimiento propio y un poquito de azar
    this.proxima = (k + 1) % 4;
    for (let c = 0; c < 4; c++) this.cil[c] += (1 - this.cil[c]) * 0.002 + (this.azar() - 0.5) * 0.01 * irregular;
  }

  process(_entradas, salidas, p) {
    const out = salidas[0][0];
    if (!out) return true;
    const rpm = p.rpm[0], carga = p.carga[0], aspereza = p.aspereza[0], irregular = p.irregular[0], fallo = p.fallo[0], corte = p.corte[0];
    const dt = 1 / sampleRate, ciclo = rpm / 120; // ciclos de dos vueltas por segundo
    for (let n = 0; n < out.length; n++) {
      const antes = this.fase;
      this.fase += ciclo * dt;
      if (this.fase >= 1) this.fase -= 1;
      // ¿cruzamos el momento de la próxima explosión?
      const momento = this.proxima * 0.25 + this.adelanto[this.proxima] * irregular;
      const m = (momento + 1) % 1;
      const cruzo = antes <= this.fase ? (antes < m && m <= this.fase) : (antes < m || m <= this.fase);
      if (cruzo && rpm > 50) this.disparar(rpm, carga, aspereza, irregular, fallo, corte);
      // sumar las explosiones en curso
      let pres = 0, ruido = 0;
      for (let i = 0; i < 6; i++) {
        const e = this.edad[i];
        if (e > 0.03) continue;
        const w = this.ancho[i];
        if (e < w) pres += this.amp[i] * Math.sin(Math.PI * e / w);
        else pres -= this.amp[i] * 0.22 * Math.exp(-(e - w) / (w * 0.9)); // rebote de presión
        ruido += this.ruido[i] * Math.exp(-e / this.tauRuido[i]);
        this.edad[i] = e + dt;
      }
      const blanco = this.azar() * 2 - 1;
      this.lp += (blanco - this.lp) * 0.45;
      let y = pres * 0.8 + ruido * this.lp * 0.9;
      // fuera la continua (el tren de pulsos siempre empuja para el mismo lado)
      this.dc += (y - this.dc) * 0.0015;
      out[n] = y - this.dc;
    }
    for (let c = 1; c < salidas[0].length; c++) salidas[0][c].set(out);
    return true;
  }
}

registerProcessor('motor-explosiones', MotorProcesador);
