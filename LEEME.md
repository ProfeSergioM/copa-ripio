# Copa Ripio — Campeonato Fiat 600

Juego de carreras web (Three.js + Web Audio) con 20 Fiat 600 caricaturescos en pistas de
ripio rural. Todo es procedural: los autos, las pistas, el relieve, el decorado, el clima,
las texturas y el sonido se generan por código. No descarga nada.

## Arrancar

Necesita un servidor estático (los módulos ES no cargan desde `file://`):

```bash
python -m http.server 5173
```

y abrir <http://localhost:5173>. La dependencia `three` ya está en `node_modules`
(`npm install` si falta).

## Controles

| tecla | acción |
|---|---|
| Flechas / WASD | acelerar, frenar, doblar. Freno sostenido medio segundo con el auto parado = marcha atrás |
| Espacio | freno de mano |
| C | cámara (cerca, lejos, capó, TV) · V mirar atrás |
| P | modo foto: arrastrar con el mouse gira, la rueda acerca, Enter guarda un PNG |
| R | volver a la pista · H bocina · M silencio · Esc pausa (y salta la repetición) |
| Joystick | palanca izquierda, gatillos, A acelera, X frena, B freno de mano, Y cámara, Start pausa |

## El campeonato

Siete fechas con premios en plata y puntos 25-20-17… para los 20:

1. **Polvaredas, mañana** — 3 vueltas.
2. **Óvalo de Tierra del Club Social** — pista corta, 5 vueltas, todos pegados.
3. **Tormenta de verano** en Polvaredas — lluvia, barro (agarre 74 %), viento cruzado que
   lleva el polvo y la lluvia, público con paraguas, reflectores prendidos.
4. **Especial Camino del Cerro** — tramo de rally punto a punto contra el reloj. Los 19
   rivales corren el tramo "aparte" (simulación sin dibujar mientras carga) y sus tiempos
   aparecen en el HUD.
5. **Atardecer al revés** — Polvaredas en sentido inverso.
6. **Niebla en el Club Social** — el óvalo al revés con niebla espesa: apenas se ve el auto de
   adelante, faros y reflectores prendidos.
7. **Nocturna con reflectores** — la final, una vuelta más.

- **Rival de la fecha (★)**: el que está justo arriba tuyo en la tabla (en la primera, el
  más hábil). Te habla por globitos en la largada, cuando te pasa, cuando lo pasás y al
  final. Ganarle da +5 puntos y $500.
- **Taller de Cacho**: los premios ($250 a $3.000 por fecha, +$300 por mejor vuelta) se
  gastan en reparar el daño ($2.500 el auto entero, se puede reparar "lo que alcance") o
  en mejoras de dos niveles: motor preparado (+8 % de par), gomas anchas (+6 % de
  agarre), frenos de camión (+12 %). Si no reparás, corrés con las abolladuras y sus
  efectos.
- **Largada**: cada rival sale en su columna, con acelerador progresivo y un modelo de
  seguimiento por carril (mantiene distancia según velocidad, medido sobre la pista, así
  sirve en curva); no cambia de carril si hay alguien al lado y en pelotón va con cuidado.
  En el simulador los golpes fuertes en los primeros 20 s bajaron de 55 a 2.
- Al cruzar la meta no se espera al resto: los tiempos de los que faltan se estiman por
  distancia restante y ritmo (aparecen como "est." en la tabla).
- **Sectores y récords**: la vuelta se parte en tres sectores; al cruzar cada uno aparece el
  parcial con la diferencia (verde/rojo) contra tu récord personal de esa pista y sentido,
  guardado en `localStorage` (`coparipio.records`). En el tramo contrarreloj se compara con
  el mejor rival. Batir el récord muestra el cartel "¡Récord de la pista!".
- **Dificultad**: Tranqui, Normal, Picante e Infernal escalan la velocidad de curva, el
  frenado y el ritmo de los rivales; en Normal el mejor rival gira Polvaredas en ~64 s.
- **Carrera rápida** desde el menú: una fecha al azar con hora, clima y sentido al azar, con
  tus mejoras, sin tocar el campeonato.
- **Podio** al terminar cada carrera: los tres primeros sobre el podio frente a la tribuna,
  papelitos, bocinas y público; Esc o un toque lo salta.
- **Taller en 3D**: en Pintura y en el Taller tu auto gira a la izquierda del panel con sus
  abolladuras y colores actuales.
- **Récords** desde el menú: tabla con tu mejor vuelta por pista, sentido y modo, con
  parciales y fecha.
- **HUD**: el líder lleva un aro dorado con un "1" en el minimapa; aparecen flechas rojas a
  los costados cuando alguien viene a pasarte.
- **Celular**: controles táctiles (volante, acelerador, freno, freno de mano), HUD compacto
  y menos píxeles para mantener los cuadros.
- **IA calibrada por ensayo y error** (`herramientas/zigzag.mjs`, `traza.mjs`, `atascos.mjs`):
  con menos "sabiduría" de agarre (0,72) es igual de rápida y deja de irse afuera; postes
  finos sin colisión; con dificultad alta los rivales reciben algo más de par y agarre. Los
  rivales también se abollan y pierden piezas.
- **Repetición**: desde los resultados, "Ver repetición" muestra el golpe más grande de la
  carrera y la llegada con cámaras fijas de TV y franjas de cine.
- Se guarda en `localStorage` (`coparipio.v2`).

## Qué hay adentro

- **Física** (`js/physics.js`): modelo bicicleta con deriva (fuerzas laterales saturadas
  con `tanh`), círculo de fricción "blando" para poder acelerar en curva, motor con curva
  de par y caja automática de 4 marchas (cambia por velocidad de rueda, no por
  patinaje), transferencia de carga, pendientes, saltos, superficies (ripio, banquina,
  pasto, zanja) y piso mojado, rebufo, control de tracción de piloto (levanta el pie si
  la cola pasa de 40°), contravolante permitido cuando la cola se va, retención en
  pendiente. Colisiones por impulsos con rotación entre autos (3 círculos por auto) y
  contra barreras. Mejoras del taller como multiplicadores (`state.tune`).
- **Modelo del auto** (`js/car.js`): perfil extruido con bisel (trompa corta, techo abovedado,
  cola en curva), guardabarros abultados, faros redondos con aro, tomas de aire detrás de
  las custodias, tapa de motor con junta, rejilla de lamas, manija y emblema "600", faros
  traseros tipo gota que se prenden al frenar, luz de patente, escape que larga humito al
  acelerar y llamitas al soltar en alta, paragolpes con defensas, moldura y filetes de
  puerta con bisagras, guiños, limpiaparabrisas, piloto con torso y volante, tazas bombé,
  sombreado por vértices (bajos más oscuros) y sombra de contacto bajo el auto. El rival de
  la fecha lleva una estrella dorada flotando sobre el techo.
- **Daños** (`js/car.js` + `js/race.js`): la carrocería se abolla por vértices donde
  pega el golpe (ruido determinista por posición para que la chapa no se raje), pintura
  rayada, faros rotos, paragolpes/espejos/valijas que salen volando. Efectos: frente
  golpeado = el volante tira y gira menos; motor (atrás) = pierde fuerza y falla;
  laterales = arrastre y ruedas que bambolean. El daño se hereda entre fechas.
- **IA** (`js/ai.js`): línea de carrera exterior-interior-exterior, velocidad objetivo
  por curvatura con frenado anticipado, anticipación por curvatura (feed-forward)
  convertida a fracción del tope de dirección, esquive de autos, freno modulado en
  curva, errores según habilidad, recuperación cuando se atascan. Funciona en circuitos
  cerrados y tramos abiertos.
- **Pistas** (`js/track.js`): `CIRCUITS` con puntos de control `[x, z, altura]`,
  cerrados o abiertos, sectores con nombre y anclas del decorado. Marcas de neumáticos:
  lienzo a lo largo de la pista multiplicado sobre el ripio; los surcos se acumulan
  vuelta a vuelta por las huellas de las ruedas traseras.
- **Mundo** (`js/world.js`): cielo por shader (sol, estrellas, tormenta), terreno con
  cerros y textura de pasto, pinos, ombúes y álamos, banderines de colores en la tribuna, viñeta,
  tone mapping ACES, sombras de 3072 px concentradas alrededor del jugador, destello de
  lente del sol, faros reales (spotlights) del jugador de noche y con lluvia, ripio con
  piedras sombreadas, tribuna con 210 espectadores animados, sponsors, molino (gira más con
  viento), tanque, casa, vacas, puentecito, banderilleros con bandera amarilla,
  reflectores, nubes, pájaros, lluvia y viento, puestos de cámara de TV. Se desarma y se
  reconstruye al cambiar de pista.
- **Sonido** (`js/audio.js`): motor sintetizado de 4 cilindros con traqueteo, subgrave,
  rasgado de escape que sigue al régimen, silbido de caja y petardeo; 7 rivales audibles
  con Doppler y su propio ripio; piedritas contra los guardabarros, silbido del pasto,
  sacudones en los baches, lluvia sobre el techo con goteo, bocinas de la hinchada al pasar por la tribuna, rivales cercanos paneados, ripio/pasto/derrape, golpes, público, pájaros,
  bocinas y tarantela de acordeón en el menú.
- **Repetición** (`js/replay.js`): poses de los 20 autos a 20 Hz y lista de golpes;
  reproducción interpolada con la cámara de TV (`js/camera.js`).

## El alambrado

Un cerco rural de postes de madera con tres hilos de alambre rodea la pista por dentro y por fuera, a 10 m
de la banquina (`FENCE_D` en `js/track.js`, un poste por metro, tipo `fence`). Frena a cualquiera que se
vaya derecho al campo; se comprueba con `node herramientas/cerco.mjs`. Donde el circuito pasa cerca de sí mismo
el cerco se corta y lo cubre el del otro tramo. La tribuna y los árboles quedan del otro lado del alambre.

## La pista de lodo

La cinta se pinta con un lodo procedural (`makeMudTextures` en `js/track.js`): manchones húmedos oscuros,
costras secas claras, cinco huellas de rueda serpenteantes, piedritas y charcos que reflejan el cielo. Va
acompañado de un mapa de rugosidad (charcos y huellas brillan al sol) y, encima, la foto de grava multiplicada
para el detalle fino. Los colores por vértice agregan manchones grandes por ruido. Las marcas de neumáticos
oscurecen más y son más anchas. El polvo es marrón y los autos levantan terrones. Además, el barro se va
pegando a la carrocería y los guardabarros (uniforme `uDirt` por auto, `setDirt` en `js/car.js`): más rápido
con lluvia y fuera del ripio; la reparación en el taller lo limpia.

## Cómo frena la IA

La velocidad permitida se planifica integrando hacia atrás 200 m de pista con el círculo de fricción:
en cada tramo solo queda para frenar lo que no se usa para doblar, así que en curvas que se cierran
(Curvón, Tenaza) frenan antes. El agarre que estima cada piloto es `0.76 × agarre real × (0.9 + 0.12 × habilidad)`,
descontando 1,5 % por cada m/s por encima de 12 m/s (a fondo, la cola tiene menos agarre lateral). La dificultad
no infla esa estimación: la ventaja viene del "tune" real del auto (par, agarre y frenos), que la IA conoce.
Fuera del ripio van despacio (9 m/s en la zanja) para poder salir, y un auto perdido o trabado más de
5–6 s vuelve al borde de la pista. Se calibra con `herramientas/solo2.mjs` (un auto) y `herramientas/fuera.mjs`
(20 autos: segundos fuera de pista por vuelta y por sector; `DIF=1.14 CIRCUITO=ovalo REVERSE=1 DIAG=1`).

## Multijugador

Desde el menú, **Multijugador**: uno crea la sala con el código que quiera (3 a 10 letras o números)
o recibe uno de 4 letras al azar; los demás
entran con el código (hasta 8 personas, solo humanos: en red no corren rivales de IA).
El anfitrión elige la fecha y larga. En la misma pantalla cada uno cambia nombre, número, colores
y franjas; el cambio se ve al instante en la lista de la sala de todos.

Funciona entre navegadores por **WebRTC con PeerJS** (`js/net.js`): el servidor público
de PeerJS solo presenta a los jugadores, después los datos viajan directo entre ellos, así
que sirve desde GitHub Pages sin servidor propio. Protocolo (`js/multiplayer.js`):

- Cada uno simula solo su auto; el anfitrión además arbitra la largada y los resultados.
- Estados a 20 Hz (posición, rumbo, velocidad, vuelta, progreso): los invitados le mandan el
  suyo al anfitrión y el anfitrión reparte el de todos. Los autos remotos se interpolan y
  extrapolan; son cuerpos "cinemáticos": te frenan al chocarlos pero no se mueven.
- Los resultados los decide el anfitrión (espera hasta 30 s a los humanos) y los reparte.

## Publicar en GitHub Pages

El sitio es estático: basta con subir la carpeta. `lib/` trae `three` y PeerJS empaquetados
(no hace falta `node_modules` en producción). El repo `ProfeSergioM/copa-ripio` publica
`main` en <https://profesergiom.github.io/copa-ripio/>.

## Assets de terceros

En `assets/` (ver `assets/CREDITOS.md`): banco de 6 grabaciones de motor por régimen,
choque, viento y arranque (OpenGameArt, CC0); chirrido de neumáticos (OpenGameArt,
**CC-BY 3.0**, acreditado en "Cómo se juega"); fotos de grava y pasto con normales (Poly
Haven, CC0). El motor mezcla las dos grabaciones vecinas al régimen con fundido cruzado y
cambio de velocidad, y deja el sintetizador de fondo; si las muestras no cargan, sigue todo
con el sintetizador y las texturas dibujadas.

## Herramientas (sin navegador)

```bash
node herramientas/simular.mjs 250            # carrera de 20 IA + pruebas de manejo + bot de teclado
CIRCUITO=ovalo node herramientas/simular.mjs 120
node herramientas/simular.mjs 250 reverse    # sentido inverso
node herramientas/solo.mjs 0.9               # traza por segundo de un piloto IA (habilidad 0.9)
node herramientas/giro.mjs 60 2 1            # fuerzas en un giro a fondo desde 60 km/h
node herramientas/curva.mjs                  # aceleración en curva con volante fijo
node herramientas/tramo.mjs 6                # tiempos de 6 pilotos IA en el tramo del cerro
```

Sirven para calibrar física e IA con números antes de tocar el juego.

## Ajustes rápidos

- `js/config.js`: masa, par motor, caja, agarre por superficie, pilotos, colores,
  sponsors, teclas.
- `js/physics.js`: el factor `0.6` en `latAvailR` decide cuánto agarre lateral se come la
  tracción (más alto = más cola al acelerar); `steerLimit` el tope de dirección por
  velocidad.
- `js/championship.js`: fechas (`ROUNDS`), premios, precios del taller y mejoras.
- `js/track.js` → `CIRCUITS`: trazados y decorado por pista.
