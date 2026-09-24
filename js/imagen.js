// Posprocesado de la imagen: brillo alrededor de las luces y un viñeteado muy leve.
//
// El brillo (bloom) se calcula sobre la imagen en HDR, antes del mapeo de tonos. Lo delicado es el umbral:
// a pleno sol, la cara iluminada de un auto blanco llega a casi 3 veces el blanco de pantalla, así que un
// umbral bajo haría brillar los autos y el ripio de día. Por eso el umbral depende de la hora: alto con sol
// (sólo brillan el disco del sol y las luces encendidas, que emiten más fuerte) y bajo de noche, donde lo
// único intenso son faros, luces traseras, reflectores y el semáforo de largada.
//
// Costo, medido con el juego en pausa en una placa integrada Intel UHD a 972x914. Con multimuestreo sobre la
// textura HDR el efecto sumaba 15 ms por cuadro, casi todo por el multimuestreo. Sin él, con el brillo a un
// cuarto de resolución, el viñeteado dentro de la pasada de salida y FXAA para el serrucho, suma 4 ms sobre
// los 24 del dibujo normal.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Filtro de brillo propio. El de three pasa el píxel entero en cuanto supera el umbral, así que un destello
// de pocos píxeles muchísimo más fuerte que el resto (los faros del jugador sobre el barro con relieve, de
// noche) se convertía en una bola de luz enorme. Acá brilla sólo lo que excede el umbral, y con un tope.
const PASO_ALTO = `uniform sampler2D tDiffuse; uniform float luminosityThreshold; uniform float tope; varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    const vec3 luma = vec3(0.299, 0.587, 0.114);
    float v = dot(c, luma);
    c *= max(v - luminosityThreshold, 0.0) / max(v, 1e-4);
    float e = dot(c, luma);
    c *= min(1.0, tope / max(e, 1e-4));
    gl_FragColor = vec4(c, 1.0);
  }`;

// Viñeteado: se mete dentro de la pasada de salida (antes del mapeo de tonos) en vez de gastar otra pasada
// de pantalla completa. Oscurece apenas los bordes para cerrar el cuadro.
const VINETA = 'gl_FragColor = texture2D( tDiffuse, vUv );\n'
  + '\t\t\t{ vec2 dv = (vUv - 0.5) * vec2(1.0, 0.82); gl_FragColor.rgb *= 1.0 - 0.16 * smoothstep(0.32, 0.78, length(dv)); }';

// Ajuste del brillo según la hora: umbral en luminancia HDR, fuerza y radio del halo
const AMBIENTES = {
  dia: { umbral: 2.9, fuerza: 0.8, radio: 0.45 },
  atardecer: { umbral: 2.2, fuerza: 0.9, radio: 0.5 },
  niebla: { umbral: 1.5, fuerza: 1.0, radio: 0.7 },
  noche: { umbral: 1.15, fuerza: 1.05, radio: 0.55 },
};

export class Imagen {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.activa = false; this.composer = null;
  }

  // Se arma recién cuando hace falta: si el jugador lo tiene apagado no se crean texturas ni pasadas
  armar() {
    if (this.composer) return;
    const r = this.renderer, tam = r.getDrawingBufferSize(new THREE.Vector2());
    const destino = new THREE.WebGLRenderTarget(tam.x, tam.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, destino);
    this.render_ = new RenderPass(this.scene, this.camera);
    // a media resolución: el brillo es borroso de por sí, y así cuesta la cuarta parte
    this.bloom = new UnrealBloomPass(new THREE.Vector2(tam.x / 2, tam.y / 2), 0.8, 0.45, 2.9);
    const filtro = this.bloom.materialHighPassFilter;
    filtro.uniforms.tope = { value: 2.2 };
    filtro.fragmentShader = PASO_ALTO; filtro.needsUpdate = true;
    this.salida = new OutputPass();
    this.salida.material.fragmentShader = this.salida.material.fragmentShader.replace('gl_FragColor = texture2D( tDiffuse, vUv );', VINETA);
    this.salida.material.needsUpdate = true;
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.render_);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.salida);
    this.composer.addPass(this.fxaa);
    this.ajustarTam();
  }

  activar(si) {
    this.activa = !!si;
    if (this.activa) this.armar();
  }

  ajustarTam() {
    if (!this.composer) return;
    const r = this.renderer, tam = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(tam.x, tam.y);
    this.bloom.setSize(tam.x * pr / 2, tam.y * pr / 2);
    this.fxaa.material.uniforms.resolution.value.set(1 / (tam.x * pr), 1 / (tam.y * pr));
  }

  // tod: el preset de hora del día de world.js
  ambiente(tod) {
    const clave = !tod ? 'dia' : tod.night ? 'noche' : tod.foggy ? 'niebla' : (tod.sunI < 1.8 ? 'atardecer' : 'dia');
    this.clave = clave;
    this.pendiente = AMBIENTES[clave];
  }

  // A pleno sol el brillo casi no se nota (sólo el disco del sol y el semáforo) y cuesta 4 ms por cuadro en
  // una placa integrada: en esas carreras se dibuja directo. Donde sí cambia la imagen es al atardecer, con
  // niebla o lluvia y de noche.
  get rinde() { return this.activa && this.clave !== 'dia'; }

  dibujar() {
    if (!this.rinde) { this.renderer.render(this.scene, this.camera); return; }
    if (this.pendiente) { const a = this.pendiente; this.pendiente = null; this.bloom.threshold = a.umbral; this.bloom.strength = a.fuerza; this.bloom.radius = a.radio; }
    this.composer.render();
  }
}
