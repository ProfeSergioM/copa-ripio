// Genera la malla del Fitito con ComfyUI (Hunyuan3D 2, imagen → 3D) por la API local y la guarda en assets/modelos/.
// Requisitos: Comfy Desktop abierto (API en http://127.0.0.1:8188) y el modelo
//   models/checkpoints/hunyuan3d-dit-v2.safetensors  (tencent/Hunyuan3D-2, carpeta hunyuan3d-dit-v2-0, model.fp16.safetensors)
// Uso: node herramientas/comfy_fitito.mjs assets/referencias/fiat600_tres_cuartos.jpg [--lado foto_lado.jpg] [--atras foto_atras.jpg] [--pasos 8] [--cfg 3.5] [--res 192] [--semilla 7] [--modelo hunyuan3d-dit-v2.safetensors]
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.COMFY || 'http://127.0.0.1:8188';
const args = process.argv.slice(2);
const img = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!img) { console.error('Falta la imagen de referencia (jpg/png, fondo liso, el auto de 3/4 o de costado).'); process.exit(1); }
// El modelo turbo multivista (que es el que hay) anda con pocos pasos; el 'dit-v2' normal quiere ~30.
const ckpt = opt('modelo', 'hunyuan3d-dit-v2-mv-turbo_fp16.safetensors');
const turbo = /turbo/i.test(ckpt), mv = /-mv/i.test(ckpt);
const steps = +opt('pasos', turbo ? 8 : 30), cfg = +opt('cfg', turbo ? 3.5 : 5.5), res = +opt('res', 192), seed = +opt('semilla', 7);
const lado = opt('lado', null), atras = opt('atras', null); // vistas extra opcionales (multivista)

async function main() {
  const stats = await fetch(API + '/system_stats').then(r => r.json()).catch(() => null);
  if (!stats) { console.error('No responde ComfyUI en ' + API + '. Abrí Comfy Desktop y volvé a probar.'); process.exit(2); }
  console.log('ComfyUI', stats.system?.comfyui_version || '', '·', stats.devices?.[0]?.name || '');
  // subir la imagen
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(img)]), path.basename(img));
  form.append('overwrite', 'true');
  const up = await fetch(API + '/upload/image', { method: 'POST', body: form }).then(r => r.json());
  const name = up.name || path.basename(img);
  // flujo (formato API): imagen → CLIP Vision → condicionamiento → muestreo → VAE → vóxeles → malla → GLB
  const upload = async (f) => { if (!f) return null; const fm = new FormData(); fm.append('image', new Blob([fs.readFileSync(f)]), path.basename(f)); fm.append('overwrite', 'true'); const r = await fetch(API + '/upload/image', { method: 'POST', body: fm }).then(r => r.json()); return r.name || path.basename(f); };
  const ladoName = await upload(lado), atrasName = await upload(atras);
  const wf = {
    1: { class_type: 'ImageOnlyCheckpointLoader', inputs: { ckpt_name: ckpt } },
    2: { class_type: 'LoadImage', inputs: { image: name } },
    3: { class_type: 'CLIPVisionEncode', inputs: { clip_vision: [1, 1], image: [2, 0], crop: 'center' } },
    4: mv ? { class_type: 'Hunyuan3Dv2ConditioningMultiView', inputs: { front: [3, 0] } } : { class_type: 'Hunyuan3Dv2Conditioning', inputs: { clip_vision_output: [3, 0] } },
    5: { class_type: 'EmptyLatentHunyuan3Dv2', inputs: { resolution: 3072, batch_size: 1 } },
    6: { class_type: 'KSampler', inputs: { model: [1, 0], positive: [4, 0], negative: [4, 1], latent_image: [5, 0], seed, steps, cfg, sampler_name: 'euler', scheduler: 'sgm_uniform', denoise: 1.0 } },
    7: { class_type: 'VAEDecodeHunyuan3D', inputs: { samples: [6, 0], vae: [1, 2], num_chunks: 8000, octree_resolution: res } },
    8: { class_type: 'VoxelToMesh', inputs: { voxel: [7, 0], algorithm: 'surface net', threshold: 0.6 } },
    9: { class_type: 'SaveGLB', inputs: { mesh: [8, 0], filename_prefix: 'mesh/fitito' } },
  };
  if (mv && ladoName) { wf[10] = { class_type: 'LoadImage', inputs: { image: ladoName } }; wf[11] = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: [1, 1], image: [10, 0], crop: 'center' } }; wf[4].inputs.left = [11, 0]; }
  if (mv && atrasName) { wf[12] = { class_type: 'LoadImage', inputs: { image: atrasName } }; wf[13] = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: [1, 1], image: [12, 0], crop: 'center' } }; wf[4].inputs.back = [13, 0]; }
  console.log('modelo', ckpt, '· pasos', steps, '· cfg', cfg, '· octree', res, mv ? '· multivista' : '');
  const q = await fetch(API + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf }) }).then(r => r.json());
  if (q.error) { console.error('ComfyUI rechazó el flujo:', JSON.stringify(q, null, 1)); process.exit(3); }
  const id = q.prompt_id; console.log('En cola', id, '… (la primera vez carga el modelo, tarda unos minutos)');
  let out = null;
  for (let i = 0; i < 900 && !out; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await fetch(API + '/history/' + id).then(r => r.json()).catch(() => ({}));
    const e = h[id];
    if (e && e.status && e.status.status_str === 'error') { console.error('Falló:', JSON.stringify(e.status.messages).slice(0, 800)); process.exit(4); }
    if (e && e.outputs) for (const k in e.outputs) { const o = e.outputs[k]; const f = (o.mesh || o['3d'] || o.result || [])[0]; if (f) out = f; }
    if (i % 10 === 9) process.stdout.write('.');
  }
  if (!out) { console.error('\nSe acabó el tiempo de espera.'); process.exit(5); }
  const url = API + '/view?filename=' + encodeURIComponent(out.filename) + '&subfolder=' + encodeURIComponent(out.subfolder || '') + '&type=' + (out.type || 'output');
  const buf = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
  fs.mkdirSync('assets/modelos', { recursive: true });
  const dest = 'assets/modelos/fitito_raw.glb'; fs.writeFileSync(dest, buf);
  console.log('\nListo:', dest, (buf.length / 1e6).toFixed(1), 'MB. Ahora: node herramientas/importar_casco.mjs', dest);
}
main().catch(e => { console.error(e); process.exit(9); });
