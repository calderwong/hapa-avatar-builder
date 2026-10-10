#!/usr/bin/env python3
"""Krea-2 PROMPT EXPERIMENT SWEEP — learn the recipe for 'Hapa CRPG Pixel-Brushed Comic Book'.
Hypothesis under test: the per-song v2 'PALETTE: dominated by X' line forces monochrome alignment.
Controlled vectors, fixed anchor scene (bamboo grove + laundry + lone figure, from 'because-she-said-so'):
  V1 aesthetic vocabulary: 'screen-print poster' vs 'CRPG pixel-brushed comic' phrasing
  V2 palette language: 'dominated by' vs 'rich full palette with accents' vs none
  V3 sharp/detail injection: none vs sharp-focus/detail clause
  V4 sampler: steps 8 vs 12, cfg 1.0 vs 3.5
  V5 framing: roundel vignette vs full-bleed
Append-only ledger: krea2-alt-lane/EXPERIMENT_LEDGER.jsonl. Output: hapa-echo-exp/.
"""
import json, time, uuid, urllib.request, os, datetime

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
LANE = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3/krea2-alt-lane")
LEDGER = os.path.join(LANE, "EXPERIMENT_LEDGER.jsonl")
os.makedirs(LANE, exist_ok=True)
NEG = ("readable text, letters, words, subtitles, captions, logos, signage, watermark, photoreal skin, "
       "plastic 3d, extra limbs, malformed anatomy, blurry, oversaturated mush, duplicate figures, "
       "mirrored poses, cloned birds, identical repeated figures")

AESTHETIC_SCREENPRINT = ("Hapa Aesthetic: detailed comic-book screen-print — crisp ink linework, heavy "
    "halftone-dot shading, thick brush outlines, WPA-protest-poster flat color, cinematic rim light, 1990s anime-print grain")
AESTHETIC_CRPG = ("Hapa Aesthetic: CRPG pixel-brushed comic book — hand-painted 16-bit RPG background art "
    "rendered with a visible pixel-brush texture, crisp dark ink linework over painterly color plates, "
    "sharp detailed foreground props, dithered gradients, dramatic chiaroscuro lighting, intricate environmental "
    "storytelling clutter, ultra-detailed, razor-sharp focus")

SCENE = ("SCENE, RESULT STATE: a bamboo grove strung with drying laundry at dusk, laundry swaying still, "
    "one anonymous cloaked silhouette mid-stride on the stone path, a fire-control yoke leaning against a "
    "bamboo stalk as the hero prop")

def frame_roundel(): return "FRAMING: circular vignette spotlight on the central action."
def frame_full():   return "FRAMING: no frame or border — full-bleed scene."

def pal_dominant(c): return f"PALETTE: dominated by {' / '.join(c)} pulled from the scene itself."
def pal_accent(c):  return f"PALETTE: rich full-spectrum scene, natural greens browns and dusk sky, with {' / '.join(c)} only as small accent colors on the prop and trim."
def pal_none():     return ""

def sharp(): return "Focus: razor-sharp, fine linework, microscopic texture detail in fabric weave and bark."

JOBS = [
    {"id": "E01-baseline-v2",     "steps": 8,  "cfg": 1.0, "prompt": f"{SCENE}. {frame_roundel()} {pal_dominant(['cyan','navy'])} {AESTHETIC_SCREENPRINT}."},
    {"id": "E02-crpg-vocab",      "steps": 8,  "cfg": 1.0, "prompt": f"{SCENE}. {frame_roundel()} {pal_accent(['cyan','navy'])} {AESTHETIC_CRPG}."},
    {"id": "E03-crpg+sharp",      "steps": 8,  "cfg": 1.0, "prompt": f"{SCENE}. {frame_roundel()} {pal_accent(['cyan','navy'])} {sharp()} {AESTHETIC_CRPG}."},
    {"id": "E04-crpg+sharp+full", "steps": 8,  "cfg": 1.0, "prompt": f"{SCENE}. {frame_full()} {pal_accent(['crimson','gold'])} {sharp()} {AESTHETIC_CRPG}."},
    {"id": "E05-crpg-nopal",      "steps": 8,  "cfg": 1.0, "prompt": f"{SCENE}. {frame_full()} {sharp()} {AESTHETIC_CRPG}."},
    {"id": "E06-crpg-12steps",    "steps": 12, "cfg": 1.0, "prompt": f"{SCENE}. {frame_roundel()} {pal_accent(['cyan','navy'])} {sharp()} {AESTHETIC_CRPG}."},
    {"id": "E07-crpg-cfg3.5",     "steps": 8,  "cfg": 3.5, "prompt": f"{SCENE}. {frame_roundel()} {pal_accent(['cyan','navy'])} {sharp()} {AESTHETIC_CRPG}."},
    {"id": "E08-crpg-12-cfg2",    "steps": 12, "cfg": 2.0, "prompt": f"{SCENE}. {frame_full()} {pal_accent(['crimson','gold'])} {sharp()} {AESTHETIC_CRPG}."},
]

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def krea_wf(prompt, seed, steps, cfg):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-echo-exp/krea2-exp"}},
    }

done = set()
if os.path.exists(LEDGER):
    for line in open(LEDGER):
        try:
            r = json.loads(line)
            if r["ok"]: done.add(r["id"])
        except Exception: pass

for i, j in enumerate(JOBS):
    if j["id"] in done:
        print(f"{j['id']} done, skip", flush=True); continue
    t0 = time.time()
    try:
        r = api("/prompt", {"prompt": krea_wf(j["prompt"], 55000 + i, j["steps"], j["cfg"]), "client_id": str(uuid.uuid4())})
        pid = r["prompt_id"]
        while True:
            h = api(f"/history/{pid}")
            if pid in h: break
            time.sleep(3)
        e = h[pid]
        errs = [str(x.get("exception_message", x))[:150] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
        files = [f2["filename"] for o in e.get("outputs", {}).values() for f2 in o.get("images", [])]
        ok = e.get("status", {}).get("status_str") != "error" and not errs
    except Exception as ex:
        ok, errs, files = False, [str(ex)[:150]], []
    rec = {"id": j["id"], "ok": ok, "seconds": round(time.time() - t0, 1), "steps": j["steps"], "cfg": j["cfg"],
           "errors": errs, "files": files, "prompt": j["prompt"], "engine": "krea2-turbo",
           "at": datetime.datetime.now().isoformat()}
    with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
    print(json.dumps({"id": j["id"], "ok": ok, "sec": rec["seconds"], "files": files}), flush=True)
print("SWEEP_DONE", flush=True)
