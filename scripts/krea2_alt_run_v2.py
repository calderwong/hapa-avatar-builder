#!/usr/bin/env python3
"""Krea-2 ALT RUN v2 — E+A hybrid spine with critic-pass-1 defect fixes.
Fixes applied (cite ALT_CRITIQUE_v1.md):
  F1 result-state language for transformation beats (no 'dissolving into' alone)
  F2 drop 'brushed-pixel', keep halftone/screen-print grain
  F3 text hygiene negative kept verbatim (Krea-2 proven 10/10)
  F4 counts restated verbatim ('exactly one lightning bolt')
  F5 one strong symbol cluster per frame
Output: hapa-echo-alt-v2/ + append-only RENDER_LEDGER_V2.jsonl (never touches v1 ledger).
"""
import json, time, uuid, urllib.request, os, datetime

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
LEDGER = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3/RENDER_LEDGER_V2.jsonl")
STYLE = ("Hapa Aesthetic: detailed comic-book screen-print — crisp ink linework, heavy halftone-dot "
         "shading, thick brush outlines, WPA-protest-poster flat color, cinematic rim light, "
         "1990s anime-print grain, violet/cream/molten-gold palette")
NEG = ("readable text, letters, words, subtitles, captions, logos, signage, watermark, photoreal skin, "
       "plastic 3d, extra limbs, malformed anatomy, blurry, oversaturated mush, duplicate figures")

JOBS = [
    {"id": "v2H1-dawn-leap-crest", "label": "H1 · E-spine + A-motion: dawn leap, closed crest",
     "prompt": f"Single dramatic splash: a wild young woman mid-stride running leaping up a ridge at dawn, arms thrust skyward, exactly one flock of starlings streaming behind her — every bird separated from the last, distinct wing positions, no mirrored repeats; the flock forms a rising arc. A closed heraldic crest frames the scene: wheat ears on the left and olive branch on the right meeting and tied with a crimson ribbon knot at the TOP center. Purple thunderhead clearing to molten-gold horizon, heavy halftone dot sky, ink spatter at frame edges. {STYLE}. Meaning: born wild, yearning to be free."},
    {"id": "v2H2-shatter-result-state", "label": "H2 · cage→music, result state",
     "prompt": f"Stone archway at sunrise: the cage gate is ALREADY broken — every iron bar has snapped, and each broken bar lies transformed: the fragments on the ground are solid black treble clefs and eighth notes, resting, settled, unmistakably musical notation scattered like debris. A dancer silhouette frozen at the peak of her leap directly in front of the low sun disc, exactly one sun, halo unobstructed behind her head. Her dress trails a continuous river of cream and crimson paint with NO outline around the pool, the paint flowing unbroken off the bottom edge. Purple mountain ridges receding. {STYLE}. Meaning: the bars became the song."},
    {"id": "v2H3-plant-in-crack", "label": "H3 · seed planted IN the crack, result state",
     "prompt": f"Close view: a hand pressing a glowing seed deep INTO a jagged crack in a concrete wall — fingers smeared with grit, the seed half-buried in the fissure itself, not in the palm. From that crack a luminous treble-clef sprout has already grown waist-high, wrapped in gold-green glow, a small heraldic shield the size of a coin fused at its base. Purple wildflowers and gold wheat erupt from the same crack. Above, exactly one white dove in flight trailing a crimson ribbon. Dawn light raking the wall, halftone dot shading on concrete. {STYLE}. Meaning: planting rights like seeds."},
]

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def krea_wf(prompt, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-echo-alt-v2/krea2-v2"}},
    }

done_ids = set()
if os.path.exists(LEDGER):
    with open(LEDGER) as f:
        for line in f:
            try:
                r = json.loads(line)
                if r.get("ok"): done_ids.add(r["frame_id"])
            except Exception: pass

for i, j in enumerate(JOBS):
    fid = f"alt2-{j['id']}"
    if fid in done_ids:
        print(f"{fid} already done, skipping", flush=True); continue
    t0 = time.time()
    try:
        r = api("/prompt", {"prompt": krea_wf(j["prompt"], 77000 + i), "client_id": str(uuid.uuid4())})
        pid = r["prompt_id"]
        while True:
            h = api(f"/history/{pid}")
            if pid in h: break
            time.sleep(3)
        e = h[pid]
        errs = [str(x.get("exception_message", x))[:150] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
        files = [i2["filename"] for o in e.get("outputs", {}).values() for i2 in o.get("images", [])]
        ok = e.get("status", {}).get("status_str") != "error" and not errs
    except Exception as ex:
        ok, errs, files = False, [str(ex)[:150]], []
    rec = {"frame_id": fid, "song": "dear-papa-song-i-knew-a-bella", "shot": "alt-v2",
           "ok": ok, "seconds": round(time.time() - t0, 1), "errors": errs, "files": files,
           "at": datetime.datetime.now().isoformat(), "engine": "krea2-alt-v2",
           "label": j["label"], "prompt": j["prompt"], "critique_ref": "ALT_CRITIQUE_v1.md"}
    with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
    print(json.dumps({"id": fid, "ok": ok, "sec": rec["seconds"], "files": files}), flush=True)
print("ALT_V2_DONE", flush=True)
