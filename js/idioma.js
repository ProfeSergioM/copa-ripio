// Idioma del juego: español (original) e inglés. El diccionario está indexado por el texto en español,
// así que el código sigue leyéndose en español y `t('...')` devuelve la traducción cuando hace falta.
// `traducirDOM()` recorre index.html y cambia textos, marcadores y opciones; guarda el original en cada
// nodo para poder volver al español sin recargar.

const EN = {
  // ---------- menú y pantallas ----------
  'Formula 600 · Campeonato Fiat 600 en ripio': 'Formula 600 · Fiat 600 dirt-track championship',
  'Preparando la pista y calentando motores…': 'Prepping the track and warming up engines…',
  'CAMPEONATO FIAT 600': 'FIAT 600 CHAMPIONSHIP',
  'Polvo, abolladuras y 20 fititos a fondo': 'Dust, dents and 20 little Fiats flat out',
  'Continuar campeonato': 'Continue championship',
  'Nuevo campeonato': 'New championship',
  'Carrera rápida': 'Quick race',
  'Multijugador': 'Multiplayer',
  'Récords': 'Records',
  'Pintura y número': 'Paint and number',
  'Ajustes': 'Settings',
  'Cómo se juega': 'How to play',
  'Todo procedural: autos, pistas, clima, sonido. Sin descargas.': 'All procedural: cars, tracks, weather, sound. No downloads.',
  '¿Empezar un campeonato nuevo? Se borra el actual.': 'Start a new championship? The current one will be deleted.',

  // ---------- garaje ----------
  'Nombre del piloto': 'Driver name',
  'Número': 'Number',
  'Color': 'Colour',
  'Techo': 'Roof',
  'Accesorio': 'Accessory',
  'Ninguno': 'None',
  'Portaequipajes con valijas': 'Roof rack with suitcases',
  'Faros auxiliares de rally': 'Rally spotlights',
  'Alerón casero': 'Homemade spoiler',
  'Antena con banderín': 'Antenna with pennant',
  'Franjas': 'Stripes',
  'Listo': 'Done',
  'Vos': 'You',

  // ---------- taller ----------
  'Taller de Cacho': "Cacho's Workshop",
  'Plata:': 'Cash:',
  'Reparar todo': 'Repair everything',
  'Mejoras': 'Upgrades',
  'Volver al campeonato': 'Back to championship',
  'El auto está impecable': 'The car is spotless',
  'Al máximo': 'Maxed out',
  'Motor preparado': 'Tuned engine',
  '+8 % de par por nivel': '+8% torque per level',
  'Gomas anchas': 'Wide tyres',
  '+6 % de agarre por nivel': '+6% grip per level',
  'Frenos de camión': 'Truck brakes',
  '+12 % de frenada por nivel': '+12% braking per level',
  'Si no reparás, corrés con las abolladuras: el volante tira, el motor falla y las piezas sueltas se caen.':
    'If you skip repairs you race with the dents: the wheel pulls, the engine misfires and loose parts fall off.',
  'Los premios llegan al terminar cada fecha. Ganarle a tu rival paga $500 extra.':
    'Prize money arrives at the end of each round. Beating your rival pays $500 extra.',

  'Reparar lo que alcance': 'Repair what you can afford',
  'Sin plata para reparar': 'No cash to repair',
  'Corrés con el auto así.': 'You race with the car as it is.',
  // ---------- ajustes ----------
  'Dificultad de los rivales': 'Rival difficulty',
  'Tranqui': 'Easy',
  'Normal': 'Normal',
  'Picante': 'Spicy',
  'Infernal': 'Brutal',
  'Volumen general': 'Master volume',
  'Música del menú': 'Menu music',
  'Sombras': 'Shadows',
  'Vueltas por carrera': 'Laps per race',
  'Sonido del motor': 'Engine sound',
  'Idioma': 'Language',
  'Probar': 'Try it',
  'Volver': 'Back',
  'Grabado (muestras)': 'Recorded (samples)',
  'Loops grabados de un 4 cilindros, cruzados por régimen. El más realista.': 'Recorded loops of a 4-cylinder, crossfaded by revs. The most realistic.',
  'Fitito de fábrica': 'Stock little Fiat',
  'Sintetizador suave y redondo, escape original. Tranquilo y parejo.': 'Soft, round synth with the stock exhaust. Calm and even.',
  'Escape libre': 'Open exhaust',
  'Caño recto: rasposo, brillante y con petardeo al soltar.': 'Straight pipe: raspy, bright, and it pops when you lift.',
  'Preparado de picadas': 'Drag-strip tune',
  'Motor 1100 con dos carburadores: gira más alto, más nervioso.': '1100 engine with twin carbs: revs higher, more nervous.',
  'Grabado con escape libre': 'Recorded with open exhaust',
  'Las muestras grabadas más el rasgado del sintetizador encima. Con cuerpo.': 'The recorded samples plus the synth rasp on top. Full-bodied.',

  // ---------- ayuda ----------
  'Flechas / WASD': 'Arrows / WASD',
  'acelerar, frenar, doblar. Freno sostenido con el auto parado: marcha atrás.': 'accelerate, brake, steer. Hold the brake at a standstill to reverse.',
  'Espacio': 'Space',
  'freno de mano (para cruzar el auto en las horquillas).': 'handbrake (to swing the car through hairpins).',
  'cámara (cerca, lejos, capó, TV) ·': 'camera (near, far, hood, TV) ·',
  'mirar atrás ·': 'look back ·',
  'modo foto ·': 'photo mode ·',
  'volver a la pista ·': 'back to the track ·',
  'bocina ·': 'horn ·',
  'silencio ·': 'mute ·',
  'Esc': 'Esc',
  'pausa.': 'pause.',
  'También anda con': 'Also works with a',
  'joystick': 'gamepad',
  '(gatillos y palanca izquierda).': '(triggers and left stick).',
  'El': 'The',
  'Los': 'The',
  'ripio': 'gravel',
  'resbala: entrá suave, salí con el auto cruzado. Con lluvia resbala el doble. El pasto y las zanjas frenan mucho.':
    'is slippery: go in gently, come out sideways. Rain doubles it. Grass and ditches slow you right down.',
  'golpes se ven y se sienten': 'hits are visible and you feel them',
  '. El daño queda de una fecha a otra si no lo reparás en el': '. Damage carries between rounds unless you fix it at the',
  'Taller': 'Workshop',
  ', donde también comprás mejoras con los premios.': ', where you also buy upgrades with your prize money.',
  'Cada fecha tenés un': 'Every round you get a',
  'rival': 'rival',
  '(★): ganarle da 5 puntos y $500 extra. Se pica.': '(★): beating them gives 5 points and $500 extra. It gets personal.',
  'Ir pegado detrás de otro da': 'Tucking in behind another car gives you a',
  'rebufo': 'slipstream',
  '. Los saltos del lomo te dejan sin control en el aire.': '. The jumps leave you with no control in the air.',
  'Sonidos y texturas de terceros: motor, choque, viento y arranque (OpenGameArt, CC0), grava y pasto (Poly Haven, CC0). Chirrido de neumáticos: "Car tire squeal skid loop" de Bart Kelsey, OpenGameArt, CC-BY 3.0.':
    'Third-party sounds and textures: engine, crash, wind and starter (OpenGameArt, CC0), gravel and grass (Poly Haven, CC0). Tyre squeal: "Car tire squeal skid loop" by Bart Kelsey, OpenGameArt, CC-BY 3.0.',
  'Entendido': 'Got it',

  // ---------- campeonato ----------
  'Campeonato ·': 'Championship ·',
  'Posiciones': 'Standings',
  'Próxima fecha': 'Next round',
  '¡A correr!': "Let's race!",
  'Menú': 'Menu',
  'Correr otra vez la última': 'Race the last round again',
  'Campeonato terminado': 'Championship finished',
  'Podés empezar uno nuevo desde el menú, o correr de nuevo la última fecha.': 'You can start a new one from the menu, or race the last round again.',
  'Piloto': 'Driver',
  'Pts': 'Pts',
  'Victorias': 'Wins',
  'Última': 'Last',
  'Plata': 'Cash',
  'Daño del auto': 'Car damage',
  'Rival de la fecha': "Round's rival",
  'Fecha': 'Round',
  'de': 'of',
  'vueltas': 'laps',
  'sentido inverso': 'reverse direction',
  'sentido normal': 'normal direction',
  'contrarreloj, punto a punto': 'time trial, point to point',
  'lluvia y barro': 'rain and mud',
  'seco': 'dry',
  'viento': 'wind',

  // ---------- fechas ----------
  'Mañana en Polvaredas': 'Morning at Polvaredas',
  'Sol bajo, ripio fresco y 20 fititos con ganas.': 'Low sun, fresh gravel and 20 eager little Fiats.',
  'Óvalo del Club Social': 'Social Club Oval',
  'Pista corta de tierra, todos pegados: más vueltas y más codazos.': 'Short dirt oval, everyone bunched up: more laps and more elbows.',
  'Tormenta de verano': 'Summer storm',
  'Lluvia, barro y viento cruzado. Resbala todo y el polvo se vuela.': 'Rain, mud and crosswind. Everything slides and the dust blows away.',
  'Especial Camino del Cerro': 'Hill Road Special',
  'Tramo de rally punto a punto, solo contra el reloj. Los rivales corren su tramo aparte.': 'Point-to-point rally stage, just you against the clock. Rivals run their stage separately.',
  'Atardecer al revés': 'Sunset in reverse',
  'Polvaredas en sentido inverso: la Tenaza cambia por completo.': 'Polvaredas the other way round: the Pincer becomes a different corner.',
  'Niebla en el Club Social': 'Fog at the Social Club',
  'Madrugada de niebla espesa en el óvalo: apenas se ve el auto de adelante. Faros y reflectores prendidos.': 'Thick dawn fog on the oval: you can barely see the car ahead. Headlights and floodlights on.',
  'Nocturna con reflectores': 'Night race under floodlights',
  'La gran final bajo las luces. Una vuelta más.': 'The big finale under the lights. One extra lap.',

  // ---------- pistas y sectores ----------
  'Autódromo Rural de Polvaredas': 'Polvaredas Country Circuit',
  'Óvalo de Tierra del Club Social': 'Social Club Dirt Oval',
  'Recta de los Boxes': 'Pit Straight',
  'Curva del Sauce': 'Willow Bend',
  'Lomo de Burro': 'The Hump',
  'La Tenaza': 'The Pincer',
  'Bajada de los Álamos': 'Poplar Descent',
  'Curvón del Molino': 'Windmill Sweeper',
  'Recta del Molino': 'Windmill Straight',
  'Horquilla del Puente': 'Bridge Hairpin',
  'Recta de la Cantina': 'Canteen Straight',
  'Curva del Tanque': 'Water Tank Bend',
  'Contrarrecta': 'Back Straight',
  'Curva de la Cancha': 'Football Pitch Bend',
  'Salida del pueblo': 'Leaving the village',
  'Subida del Cerro': 'Hill Climb',
  'La Cumbre': 'The Summit',
  'Bajada de las Cabras': 'Goat Descent',
  'Vado del Arroyo': 'Creek Ford',
  'Llegada': 'Finish',

  // ---------- carga ----------
  'Trazando la pista': 'Laying out the track',
  'Armando la fecha': 'Setting up the round',
  'Armando la carrera en red': 'Setting up the online race',
  'Los rivales corren su tramo': 'Rivals are running their stage',
  '¡Listo!': 'Ready!',
  'Cielo': 'Sky',
  'Terreno': 'Terrain',
  'Ripio': 'Gravel',
  'Barreras': 'Barriers',
  'Tribuna': 'Grandstand',
  'Campo': 'Countryside',
  'Cámaras': 'Cameras',
  'Arboleda': 'Trees',
  'Detalles': 'Details',
  'Ambiente': 'Atmosphere',
  'Error al cargar: ': 'Loading error: ',

  // ---------- HUD y carrera ----------
  'Vuelta': 'Lap',
  'Mejor': 'Best',
  '· Récord': '· Record',
  'Salida': 'Start',
  'DAÑOS': 'DAMAGE',
  'MARCHA': 'GEAR',
  'REBUFO': 'SLIPSTREAM',
  '¡CONTRAMANO!': 'WRONG WAY!',
  '● REPETICIÓN': '● REPLAY',
  'Esc para saltar': 'Esc to skip',
  '📷 MODO FOTO': '📷 PHOTO MODE',
  'Arrastrá con el mouse para girar · rueda para acercar · Enter guarda la foto · P o Esc para volver':
    'Drag with the mouse to orbit · wheel to zoom · Enter saves the photo · P or Esc to go back',
  '¡VAMOS!': 'GO!',
  '¡ÚLTIMA VUELTA!': 'LAST LAP!',
  '¡RÉCORD DE LA PISTA!': 'TRACK RECORD!',
  '¡RÉCORD DEL TRAMO!': 'STAGE RECORD!',
  '¡Qué salto!': 'What a jump!',
  'Apretá R para volver a la pista': 'Press R to get back on track',
  'EL CHOQUE DEL DÍA': 'CRASH OF THE DAY',
  'ESPERANDO A LOS DEMÁS…': 'WAITING FOR THE OTHERS…',
  'ESPERANDO LA LARGADA…': 'WAITING FOR THE START…',
  '¡Foto guardada!': 'Photo saved!',
  'Silencio': 'Muted',
  'Sonido': 'Sound on',
  'PODIO · 1°': 'PODIUM · 1st',

  // ---------- pausa y resultados ----------
  'Pausa': 'Paused',
  'Seguir': 'Resume',
  'Reiniciar carrera': 'Restart race',
  'Abandonar': 'Retire',
  'Resultado': 'Result',
  'Ver repetición': 'Watch replay',
  'Ver campeonato': 'View championship',
  'Volver al menú': 'Back to menu',
  'Pos': 'Pos',
  'Tiempo': 'Time',
  'Tiempo del tramo': 'Stage time',
  'Mejor vuelta': 'Best lap',
  'Daño': 'Damage',
  'Terminaste': 'You finished',
  'Tu tiempo': 'Your time',
  'Premio': 'Prize',
  'puntos': 'points',
  '¡Ganaste! Los fititos de atrás comieron polvo.': 'You won! The little Fiats behind ate your dust.',
  '¡Podio! Casi, casi.': 'Podium! So close.',
  '¡Podio! Muy buena carrera.': 'Podium! Great race.',
  'Zona de puntos. Se puede mejorar.': 'In the points. Room to improve.',
  'Mitad de tabla. El auto quedó para el chapista.': 'Midfield. The car is one for the panel beater.',
  'Al menos llegaste entero… más o menos.': 'At least you finished in one piece… more or less.',
  'Mejor vuelta de la carrera: +$300': 'Fastest lap of the race: +$300',
  'te ganó': 'beat you',
  'Le ganaste a': 'You beat',
  'pts y': 'pts and',

  // ---------- récords ----------
  'Tus récords': 'Your records',
  'Pista': 'Track',
  'Sentido': 'Direction',
  'Modo': 'Mode',
  'inverso': 'reverse',
  'normal': 'normal',
  'contrarreloj': 'time trial',
  'carrera': 'race',
  'Todavía no hay récords. Salí a girar.': 'No records yet. Go do some laps.',

  // ---------- multijugador ----------
  'Tu piloto y tu auto': 'Your driver and car',
  'Nombre': 'Name',
  'Código a elección': 'Custom code',
  'Crear sala': 'Create room',
  'Código de la sala': 'Room code',
  'Unirse': 'Join',
  'al azar': 'random',
  'Link de la sala': 'Room link',
  'Hasta 8 personas, solo humanos: nada de rivales de IA. Funciona entre navegadores por WebRTC: cualquiera crea la sala (con el código que quiera, o uno al azar de 4 letras) y los demás entran con ese código.':
    'Up to 8 people, humans only: no AI rivals. It runs browser to browser over WebRTC: anyone creates the room (with the code they like, or a random 4-letter one) and the others join with that code.',
  'Sala': 'Room',
  'Copiar link': 'Copy link',
  'Compartir': 'Share',
  'WhatsApp': 'WhatsApp',
  'Quien abra el link entra directo a esta sala.': 'Anyone who opens the link joins this room directly.',
  'Pilotos': 'Drivers',
  'El anfitrión elige la fecha y larga.': 'The host picks the round and starts.',
  '¡Largar!': 'Start!',
  'Volver (salir de la sala)': 'Back (leave the room)',
  'Creá una sala o entrá con un código.': 'Create a room or join with a code.',
  'Creando sala…': 'Creating room…',
  'Conectado. Esperando que el anfitrión largue…': 'Connected. Waiting for the host to start…',
  'La sala está llena.': 'The room is full.',
  'Ya estás en esta sala desde este dispositivo (otra pestaña o ventana). Usá esa.': 'You are already in this room from this device (another tab or window). Use that one.',
  'El anfitrión se fue.': 'The host left.',
  'El anfitrión se desconectó: la carrera sigue sola': 'The host disconnected: the race carries on without them',
  'Nadie todavía': 'Nobody yet',
  '(anfitrión)': '(host)',
  '(vos)': '(you)',
  'El código: de 3 a 10 letras o números, sin espacios.': 'The code: 3 to 10 letters or numbers, no spaces.',
  'Escribí el código de la sala (de 3 a 10 letras o números).': 'Type the room code (3 to 10 letters or numbers).',
  'Link copiado': 'Link copied',
  'Link seleccionado: copialo con Ctrl+C': 'Link selected: copy it with Ctrl+C',
  'Entrando a la sala': 'Joining room',
  '¡Carrera de Fiat 600! Entrá a mi sala de Formula 600:': "Fiat 600 race! Join my Formula 600 room:",
  'No se pudo crear la sala: ': 'Could not create the room: ',
  'No se pudo entrar: ': 'Could not join: ',
  'Buscando la sala': 'Looking for room',
  'ya está en uso. Elegí otro.': 'is already taken. Pick another.',
  'No hay ninguna sala': 'There is no room',

  'EL GOLPE GRANDE': 'THE BIG HIT',
  'LA LLEGADA': 'THE FINISH',
  'Corre': 'Now running',
  ' (carrera rápida)': ' (quick race)',
  'Pasá el código a tus amigos.': 'Share the code with your friends.',
  '¡LLEGASTE!': 'YOU FINISHED!',
  '¡LLEGASTE P': 'YOU FINISHED P',
  '¡Mejor vuelta!': 'Best lap!',
  'Adelantaste a': 'You passed',
  'Te pasó': 'You were passed by',
  '¡Toque con': 'Contact with',
  'est.': 'est.',
  '#': '#',
  'El código': 'Code',
  'Jugador': 'Player',
  '¡Contra los fardos!': 'Into the hay bales!',
  '¡Contra las gomas!': 'Into the tyre wall!',
  '¡Cuidado con la vaca!': 'Mind the cow!',
  '¡Contra el poste!': 'Into the post!',
  // ---------- provocaciones del rival ----------
  '¡Te veo en la primera curva, pibe!': 'See you at turn one, kid!',
  'Hoy comés polvo, {p}.': "You're eating dust today, {p}.",
  'Ojo con los fardos, que muerden.': 'Watch the hay bales, they bite.',
  'Permiso, que llego tarde a la cantina.': "Excuse me, I'm late for the canteen.",
  '¡Chau {p}, saludos a tu chapista!': 'Bye {p}, say hi to your panel beater!',
  'Ese fitito tuyo anda a pedal, ¿no?': 'That little Fiat of yours is pedal-powered, right?',
  '¡Eh, eso no vale!': 'Hey, that does not count!',
  'Ya te voy a agarrar en la horquilla.': "I'll get you back at the hairpin.",
  'Suerte de principiante, {p}.': "Beginner's luck, {p}.",
  'Última vuelta, {p}. Sin llorar.': 'Last lap, {p}. No crying.',
  'Ahora sí, a ver quién es quién.': 'Now we find out who is who.',
  'Bien corrido, {p}. La próxima te gano igual.': 'Well driven, {p}. I will beat you next time anyway.',
  'Me distrajo una vaca. Nada más.': 'A cow distracted me. That is all.',
  'Te dije que ibas a comer polvo.': 'I told you that you would eat dust.',
  'Gracias por el rebufo, {p}.': 'Thanks for the slipstream, {p}.',
  '¡Cuidá la chapa, que no la pagás vos!': 'Mind the bodywork, you are not the one paying!',
  '¿Sacaste el carnet en una rifa?': 'Did you win your licence in a raffle?',
};

const IDIOMAS = { es: null, en: EN };
let actual = 'es';

export function idiomaActual() { return actual; }
export function setIdioma(cod) { actual = IDIOMAS[cod] !== undefined ? cod : 'es'; }
// Traduce un texto (o lo devuelve tal cual si no está en el diccionario)
export function t(texto) {
  if (actual === 'es' || texto == null) return texto;
  const d = IDIOMAS[actual];
  const s = String(texto);
  if (d[s] != null) return d[s];
  // con espacios alrededor: se respetan (los fragmentos de la ayuda vienen con sangría)
  const limpio = s.trim();
  if (limpio && d[limpio] != null) return s.replace(limpio, d[limpio]);
  return texto;
}

// Recorre el documento y traduce textos, marcadores y opciones. Guarda el original para poder volver.
export function traducirDOM(raiz = document.body) {
  const it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const nodos = [];
  for (let n = it.nextNode(); n; n = it.nextNode()) nodos.push(n);
  for (const n of nodos) {
    if (n.parentNode && (n.parentNode.tagName === 'SCRIPT' || n.parentNode.tagName === 'STYLE')) continue;
    if (n.__es === undefined) { if (!n.nodeValue.trim()) continue; n.__es = n.nodeValue; }
    n.nodeValue = t(n.__es);
  }
  for (const el of raiz.querySelectorAll('[placeholder], [title]')) {
    for (const attr of ['placeholder', 'title']) {
      const v = el.getAttribute(attr); if (v == null) continue;
      const clave = '__es_' + attr;
      if (el[clave] === undefined) el[clave] = v;
      el.setAttribute(attr, t(el[clave]));
    }
  }
  if (document.title) {
    if (traducirDOM.__titulo === undefined) traducirDOM.__titulo = document.title;
    document.title = t(traducirDOM.__titulo);
  }
  document.documentElement.lang = actual;
}
