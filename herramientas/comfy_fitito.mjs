// Genera la malla del Fitito con ComfyUI (Hunyuan3D 2, imagen → 3D) por la API local y la guarda en assets/modelos/.
// Requisitos: Comfy Desktop abierto (API en http://127.0.0.1:8188) y el modelo
//   models/checkpoints/hunyuan3d-dit-v2.safetensors  (tencent/Hunyuan3D-2, carpeta hunyuan3d-dit-v2-0, model.fp16.safetensors)
// Uso: node herramientas/comfy_fitito.mjs assets/referencias/fiat600_lado.jpg [--pasos 30] [--cfg 5.5] [--res 256] [--semilla 7]
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.COMFY || 'http://127.0.0.1:8188';
const args = process.argv.slice(2);
const img = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!img) { console.error('Falta la imagen de referencia (jpg/png, fondo liso, el auto de 3/4 o de costado).'); process.exit(1); }
const steps = +opt('pasos', 30), cfg = +opt('cfg', 5.5), res = +opt('res', 256), seed = +opt('semilla', 7), ckpt = opt('modelo', 'hunyuan3d-dit-v2.safetensors');

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
  const wf = {
    1: { class_type: 'ImageOnlyCheckpointLoader', inputs: { ckpt_name: ckpt } },
    2: { class_type: 'LoadImage', inputs: { image: name } },
    3: { class_type: 'CLIPVisionEncode', inputs: { clip_vision: [1, 1], image: [2, 0], crop: 'center' } },
    4: { class_type: 'Hunyuan3Dv2Conditioning', inputs: { clip_vision_output: [3, 0] } },
    5: { class_type: 'EmptyLatentHunyuan3Dv2', inputs: { resolution: 3072, batch_size: 1 } },
    6: { class_type: 'KSampler', inputs: { model: [1, 0], positive: [4, 0], negative: [4, 1], latent_image: [5, 0], seed, steps, cfg, sampler_name: 'euler', scheduler: 'sgm_uniform', denoise: 1.0 } },
    7: { class_type: 'VAEDecodeHunyuan3D', inputs: { samples: [6, 0], vae: [1, 2], num_chunks: 8000, octree_resolution: res } },
    8: { class_type: 'VoxelToMesh', inputs: { voxel: [7, 0], algorithm: 'surface net', threshold: 0.6 } },
    9: { class_type: 'SaveGLB', inputs: { mesh: [8, 0], filename_prefix: 'mesh/fitito' } },
  };
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
