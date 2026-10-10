#!/usr/bin/env python3
"""Krea-2 ALTERNATIVE RUN — pure Hapa aesthetic, no Builder characters.
Prompt variants exploring how to text-prompt the Brushed-Pixel/Detailed-Comic
look + lyric-symbol abstraction for 'I Knew a Bella'. Output: review grid."""
import json, time, uuid, urllib.request, os

SERVER = "http://127.0.0.1:8188"
OUT = os.path.expanduser("~/Desktop/hapa-avatar-builder/tools/echo-render-tracker/alt-runs")
os.makedirs(OUT, exist_ok=True)

AESTHETIC_MAX = ("Hapa Aesthetic: brushed-pixel texture over detailed comic-book rendering — "
 "crisp confident ink linework, halftone-dot shading, hand-brushed color plates with visible "
 "horizontal pixel drag, cinematic rim light, 1990s anime-print grain, saturated accents, dramatic panel-scale composition")
AESTHETIC_MIN = "Hapa Aesthetic: brushed pixel, detailed comic book, ink linework, halftone shading"
NEG = ("readable text, letters, numbers, logos, watermark, signature, photoreal skin, plastic 3D render, "
 "blurry mush, extra limbs, malformed anatomy, franchise character imitation, collage layout, human faces in focus")

# Lyric symbols of "I Knew a Bella": born wild / yearned to be free / shot down /
# Chiao Baby Chiao farewell / Gacha-Gnosis chance / USO stage & Jane / cracked glass, orchids, birds
VARIANTS = [
 {"id": "A-symbolic-stilllife-max", "steps": 5, "cfg": 1.0,
  "prompt": f"Empty birdcage with its door flung open, silk cream-and-crimson ribbon streaming out into a storm wind, white orchids blooming through the broken bars, one falling crimson petal caught mid-air, cracked glass shards floating, {AESTHETIC_MAX}. Meaning: a wild heart born free, farewell, chance taken. Single coherent scene, low-key intro lighting, cream-gold and crimson accents on deep green."},
 {"id": "B-wild-landscape", "steps": 5, "cfg": 1.0,
  "prompt": f"Vast storm-lit sea cliff at dusk, a single wild horse silhouette leaping the last ridge into open sky, mane streaming like ribbon, thunderhead bruised crimson and cream over a churning jade ocean, rain streaking in diagonal pixel drags, {AESTHETIC_MAX}. Meaning: born wild, yearning to be free. Epic wide vista, no people."},
 {"id": "C-uso-stage-memory", "steps": 5, "cfg": 1.0,
  "prompt": f"Abandoned 1940s USO stage after the last dance, one spotlight still burning on a empty microphone, a cream ballroom heel and a red silk flower left on scuffed boards, faded canvas banners without lettering, dust motes in the beam, {AESTHETIC_MAX}. Meaning: the song she sang, the farewell echo. Warm amber noir, no readable text anywhere."},
 {"id": "D-abstract-emotion", "steps": 5, "cfg": 1.0,
  "prompt": f"Abstract expression of a heart breaking through glass: a plane of cracked mirror shattering outward, behind it a torrent of crimson and cream silk ribbons bursting into freedom, halftone shockwaves rippling through emerald air, gold fragments suspended in the blast, {AESTHETIC_MAX}. No figures, pure symbolic energy, climax lighting, blown highlights."},
 {"id": "E-poster-emblem", "steps": 5, "cfg": 1.0,
  "prompt": f"Comic album-cover composition without any lettering: centered emblem of a songbird rising from a cracked porcelain teacup, wings unfurling into crimson and cream brush flames, orchid petals orbiting like satellites, deep green vignette, radial halftone burst behind, {AESTHETIC_MAX}. Iconic, symmetrical, poster-scale drama."},
 {"id": "F-symbolic-stilllife-minimal", "steps": 5, "cfg": 1.0,
  "prompt": f"Empty birdcage door flung open, cream and crimson ribbon streaming out into wind, white orchids through broken bars, falling crimson petal, cracked glass floating. {AESTHETIC_MIN}. Meaning: wild heart, freedom, farewell. Low-key light, green and crimson palette."},
 {"id": "G-symbolic-max-8steps", "steps": 8, "cfg": 1.0,
  "prompt": f"Empty birdcage with its door flung open, silk cream-and-crimson ribbon streaming out into a storm wind, white orchids blooming through the broken bars, one falling crimson petal caught mid-air, cracked glass shards floating, {AESTHETIC_MAX}. Meaning: a wild heart born free, farewell, chance taken. Single coherent scene, low-key intro lighting, cream-gold and crimson accents on deep green."},
]

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def wait_done(pid):
    while True:
        h = api(f"/history/{pid}")
        if pid in h:
            e = h[pid]
            errs = [str(x.get("exception_message", x))[:150] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
            files = [i["filename"] for o in e.get("outputs", {}).values() for i in o.get("images", [])]
            return e.get("status", {}).get("status_str") != "error" and not errs, errs, files
        time.sleep(3)

def wf(prompt, neg, seed, steps, cfg):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-alt/krea2-alt"}},
    }

ledger = []
for i, v in enumerate(VARIANTS):
    t0 = time.time()
    try:
        r = api("/prompt", {"prompt": wf(v["prompt"], NEG, 4200 + i, v["steps"], v["cfg"]), "client_id": str(uuid.uuid4())})
        ok, errs, files = wait_done(r["prompt_id"])
    except Exception as ex:
        ok, errs, files = False, [str(ex)[:150]], []
    rec = {"variant": v["id"], "ok": ok, "seconds": round(time.time() - t0, 1), "errors": errs, "files": files, "steps": v["steps"]}
    print(json.dumps(rec), flush=True)
    ledger.append(rec)
with open(os.path.join(OUT, "alt-ledger.json"), "w") as f:
    json.dump(ledger, f, indent=1)
print("ALT_DONE")
