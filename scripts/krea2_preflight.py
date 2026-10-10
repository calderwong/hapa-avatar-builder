#!/usr/bin/env python3
"""Pre-flight A/B for recipe crpg-v3: same seed, cfg 1.0 / 2.0 / 2.5, Miss Blue hero.
Append-only ledger: krea2-alt-lane/PREFLIGHT_LEDGER.jsonl. Output: hapa-echo-preflight/."""
import json, time, uuid, urllib.request, os, datetime

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
LANE = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3/krea2-alt-lane")
LEDGER = os.path.join(LANE, "PREFLIGHT_LEDGER.jsonl")
NEG = ("readable text, letters, words, subtitles, captions, logos, signage, watermark, photoreal skin, "
       "plastic 3d, extra limbs, malformed anatomy, blurry, oversaturated mush, duplicate figures, "
       "mirrored poses, cloned birds, identical repeated figures")
PROMPT = ("HAPA ECHO ALBUM alt key-frame for \u201cMiss Blue\u201d by Calder \u2014 symbolic poster, no likenesses. "
    "SCENE, RESULT STATE: night market closing, wooden shutters half-down, stalls settled into stillness, "
    "one anonymous cloaked silhouette standing at the stall counter leaning in, a recording quill set down "
    "on the counter as the hero object, paper lanterns still glowing overhead as the last light. "
    "COMPOSITION: wide establishing composition, small figure, dominant environment. CAMERA: 50mm natural. "
    "FIGURE: one anonymous silhouette (Blue as type, not likeness), leaning-in posture, mid-step pause. "
    "FRAMING: no frame or border \u2014 full-bleed scene. "
    "Focus: razor-sharp, fine linework, microscopic texture in wood grain, paper lantern skin and fabric weave. "
    "Lyric evidence off-image: \u201cSee that Sun at your Back,\u201d informs staging only. "
    "Hapa Aesthetic: CRPG pixel-brushed comic book \u2014 hand-painted 16-bit RPG background art rendered with a "
    "visible pixel-brush texture, crisp dark ink linework over painterly color plates, sharp detailed foreground "
    "props, dithered gradients, dramatic chiaroscuro lighting, intricate environmental storytelling clutter, "
    "ultra-detailed, razor-sharp focus.")

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def wf(prompt, seed, cfg, idx):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": 8, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": f"hapa-echo-preflight/preflight-cfg{str(cfg).replace('.','')}-{idx}"}},
    }

for i, cfg in enumerate([1.0, 2.0, 2.5]):
    t0 = time.time()
    r = api("/prompt", {"prompt": wf(PROMPT, 4242, cfg, i+1), "client_id": str(uuid.uuid4())})
    pid = r["prompt_id"]
    while True:
        h = api(f"/history/{pid}")
        if pid in h: break
        time.sleep(3)
    e = h[pid]
    errs = [str(x.get("exception_message", x))[:150] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
    files = [f2["filename"] for o in e.get("outputs", {}).values() for f2 in o.get("images", [])]
    ok = e.get("status", {}).get("status_str") != "error" and not errs
    rec = {"id": f"pf-cfg{cfg}", "ok": ok, "seconds": round(time.time()-t0,1), "cfg": cfg, "steps": 8,
           "seed": 4242, "errors": errs, "files": files, "song": "dear-papa-song-miss-blue",
           "recipe": "crpg-v3-preflight", "at": datetime.datetime.now().isoformat()}
    with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)
print("PREFLIGHT_DONE", flush=True)
