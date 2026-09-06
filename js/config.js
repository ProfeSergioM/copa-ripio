// Constantes del juego: el Fiat 600 caricaturesco y el mundo.

export const CAR = {
  mass: 720,            // kg (600 + piloto + mate)
  inertia: 820,         // kg·m² inercia de guiñada
  length: 3.2, width: 1.5,
  wheelbase: 2.0,
  lf: 1.08,             // CG → eje delantero (motor atrás, pero no tanto: es caricatura)
  lr: 0.92,
  wheelRadius: 0.32,
  cgHeight: 0.55,
  maxSteer: 0.42,       // rad a baja velocidad
  steerRate: 4.0,       // rad/s
  gearRatios: [3.4, 2.1, 1.4, 1.0],
  reverseRatio: 3.8,
  finalDrive: 5.4,
  torqueMax: 96,        // Nm (versión "preparada" de ripio)
  idleRpm: 950, redline: 6300, shiftUp: 5900, shiftDown: 2600,
  shiftTime: 0.12,
  brakeForce: 8500,
  dragCoef: 0.62,       // 0.5*rho*Cd*A aprox.
  rolling: 0.016,
  corneringStiffness: 9.5,   // × carga (N/rad)
};

export const SURFACES = {
  gravel:   { grip: 1.0, rolling: 1.0, dust: 1.0, name: 'ripio' },
  shoulder: { grip: 0.85, rolling: 1.4, dust: 1.6, name: 'banquina' },
  grass:    { grip: 0.62, rolling: 1.9, dust: 0.5, name: 'pasto' },
  ditch:    { grip: 0.6, rolling: 1.8, dust: 0.8, name: 'zanja' },
};

export const TRACK = {
  halfWidth: 6.0,       // ancho de ripio 12 m
  shoulder: 2.0,
  sampleStep: 1.0,
};

export const RACE = {
  cars: 20,
  laps: 3,
  countdown: 3,
  finishWait: 25,
};

export const GRAVITY = 9.81;

export const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  handbrake: ['Space'], camera: ['KeyC'], reset: ['KeyR'], pause: ['Escape'], mute: ['KeyM'],
  look: ['KeyV'], horn: ['KeyH'],
};

export const DRIVER_NAMES = [
  ['Tito Carrasco', 0.96, 0.6], ['La Pepa Ríos', 0.93, 0.5], ['Don Aurelio', 0.80, 0.2],
  ['Chico Bermúdez', 0.88, 0.9], ['Rulo Vidal', 0.90, 0.7], ['Manolo Tapia', 0.84, 0.4],
  ['Rita Espinoza', 0.92, 0.5], ['El Colo Fuentes', 0.86, 0.8], ['Ñato Herrera', 0.78, 0.6],
  ['Gaby Salinas', 0.89, 0.3], ['Peluca Morales', 0.83, 0.9], ['Tuca Gutiérrez', 0.87, 0.5],
  ['Pancho Ibáñez', 0.81, 0.7], ['Coca Villanueva', 0.91, 0.4], ['Beto Zamora', 0.85, 0.8],
  ['Nena Cifuentes', 0.94, 0.6], ['Cacho Bustamante', 0.79, 1.0], ['Lalo Quiroga', 0.82, 0.3],
  ['Juanita Poblete', 0.88, 0.5], ['Kiko Aravena', 0.76, 0.7],
]; // [nombre, habilidad, agresividad]

export const LIVERY_COLORS = [
  '#8fd3e8', '#f2e6c9', '#d94a3a', '#6f8f4b', '#f5f1e8', '#f0c541', '#ef8a3c', '#3f6fb5',
  '#7a2d3a', '#9aa3a8', '#2f8f7a', '#c76ba3', '#5a4a3a', '#e0d84a', '#4aa3df', '#b8473f',
  '#c9a26b', '#7c7ccf', '#3d3d3d', '#f7b7c8',
];

export const SPONSORS = ['YERBA EL RIPIO', 'NEUMÁTICOS DON PEPE', 'EMPANADAS LA TÍA', 'ACEITE TRUENO',
  'BUJÍAS RELÁMPAGO', 'TALLER CACHO', 'RADIO POLVAREDA', 'GASEOSAS PAMPA', 'FERRETERÍA EL TORNILLO', 'LUBRICANTES LA BOMBA'];
