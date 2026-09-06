// Copia automática del perfil del casco para herramientas/casco.mjs (no se usa en el juego).
export function bodyShapeForTools(T) {
  const sh = new T.Shape();
  // Fiat 600: capó corto que cae redondo ("trompa de bulldog"), parabrisas parado, cabina alta y larga,
  // luneta empinada y cola panzona (el motor va atrás), sin la caída larga de un Renault 4CV.
  sh.moveTo(1.42, 0.36);
  sh.splineThru([
    new T.Vector2(1.5, 0.5), new T.Vector2(1.5, 0.7), new T.Vector2(1.42, 0.9), new T.Vector2(1.26, 1.02),
    new T.Vector2(1.02, 1.08), new T.Vector2(0.76, 1.12), new T.Vector2(0.56, 1.17), new T.Vector2(0.4, 1.38),
    new T.Vector2(0.18, 1.48), new T.Vector2(-0.3, 1.53), new T.Vector2(-0.78, 1.49), new T.Vector2(-1.04, 1.36),
    new T.Vector2(-1.24, 1.12), new T.Vector2(-1.42, 0.9), new T.Vector2(-1.56, 0.72), new T.Vector2(-1.63, 0.54),
    new T.Vector2(-1.56, 0.36),
  ]);
  sh.lineTo(-1.42, 0.36);
  sh.absarc(-1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(0.58, 0.36);
  sh.absarc(1.0, 0.32, 0.42, Math.PI, 0, true);
  sh.lineTo(1.42, 0.36);
  return sh;
}
