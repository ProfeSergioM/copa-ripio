// Resolución automática.
//
// En una notebook con placa integrada, y más si está con batería o en un plan de energía silencioso, el
// juego no llega a los 60 cuadros con la resolución completa. Durante la carrera se mira el promedio de
// cuadros cada dos segundos: si baja de 45 se achica la resolución interna un 13 % (hasta el 60 %), y si
// se sostiene arriba de 57 durante doce segundos se la sube de a poco. Si una subida no aguanta, se vuelve
// al nivel anterior y ese queda como techo: no se prueba de nuevo, así la imagen no va y viene. El tamaño
// en pantalla no cambia nunca; sólo cuántos píxeles se calculan.
//
// No toca el navegador: recibe los tiempos y avisa la escala nueva. Así se puede probar sin pantalla.
export const ESCALA_MINIMA = 0.6;

export class Calidad {
  // aplicar(escala): se llama cada vez que cambia la escala (1 = resolución completa)
  constructor(aplicar) {
    this.aplicar = aplicar;
    this.escala = 1; this.techo = 1;
    this.t = 0; this.cuadros = 0; this.buenas = 0; this.desdeSubida = 1e9;
    this.noSirve = false; this.cpsAlBajar = null; this.escalaAlBajar = 1;
  }

  fijar(e) {
    if (Math.abs(e - this.escala) < 1e-3) return;
    this.escala = e; this.buenas = 0;
    this.aplicar(e);
  }

  // real: segundos desde el cuadro anterior. cuenta: falso si este cuadro no dice nada del rendimiento
  // (menú, pausa, pestaña oculta). Un tirón aislado (carga, cambio de pestaña) tampoco cuenta y reinicia la ventana.
  cuadro(real, cuenta = true) {
    if (!cuenta || real > 0.25 || real <= 0) { this.t = 0; this.cuadros = 0; return; }
    this.t += real; this.cuadros++;
    if (this.t < 2) return;
    const cps = this.cuadros / this.t;
    this.t = 0; this.cuadros = 0; this.desdeSubida += 2;
    if (cps < 45) {
      this.buenas = 0;
      // la última subida no aguantó: se vuelve a donde andaba bien y no se insiste
      if (this.desdeSubida <= 6) { this.techo = this.previa; this.desdeSubida = 1e9; this.fijar(this.previa); }
      // La bajada anterior no ganó ni un 8 % de cuadros: lo que frena no es la cantidad de píxeles sino el
      // procesador (pasa con la notebook a batería). Se deshace esa bajada y no se vuelve a intentar: seguir
      // bajando sólo empeoraría la imagen.
      else if (this.cpsAlBajar != null && cps < this.cpsAlBajar * 1.08) { this.noSirve = true; this.cpsAlBajar = null; this.fijar(this.escalaAlBajar); }
      else if (!this.noSirve && this.escala > ESCALA_MINIMA + 1e-3) { this.cpsAlBajar = cps; this.escalaAlBajar = this.escala; this.fijar(Math.max(ESCALA_MINIMA, this.escala * 0.87)); }
      else this.cpsAlBajar = null;
      return;
    }
    this.cpsAlBajar = null;
    if (cps > 57) {
      if (++this.buenas >= 6 && this.escala < this.techo - 0.01) {
        this.previa = this.escala;
        this.fijar(Math.min(this.techo, this.escala * 1.1));
        this.desdeSubida = 0;
      }
    } else this.buenas = 0;
  }
}
