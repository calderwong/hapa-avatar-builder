#!/usr/bin/env python3
"""Krea-2 ALTERNATIVE RUN — aesthetic benchmark, no avatar refs.
Five prompting strategies for the same lyric moment; human picks the winner.
Song: 'I Knew a Bella' — symbols: born wild / freedom / Bella Ciao / purple+gold dawn / planting rights like seeds."""
import json, time, uuid, urllib.request, os, sys

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
LEDGER = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3/RENDER_LEDGER.jsonl")
NEG = "readable text, letters, words, subtitles, captions, logos, signage, watermark, photoreal skin, plastic 3d, extra limbs, malformed anatomy, blurry, oversaturated mush"

STYLE_CORE = "Hapa Aesthetic: brushed-pixel texture over detailed comic-book rendering — crisp ink linework, halftone-dot shading, hand-brushed color plates with visible horizontal pixel drag, cinematic rim light, 1990s anime-print grain"

JOBS = [
    {"id": "altA-minimal", "label": "A · Minimal style-tag", "prompt":
     f"A wild young woman made of wind and brambles running through a field of broken chains at dawn, arms raised, long dark hair dissolving into starlings. Purple sky, gold horizon. {STYLE_CORE}."},
    {"id": "altB-symbol-dense", "label": "B · Symbol-dense poem", "prompt":
     f"An open hand planting a glowing seed into a crack in a concrete wall; the sprout is a treble clef wearing a tiny shield; around it, purple wildflowers and gold wheat grow through old military dog tags and a cracked porcelain teacup; a single white pigeon lifts off carrying a red ribbon; dawn light breaking through storm clouds. {STYLE_CORE}."},
    {"id": "altC-lyric-anchor", "label": "C · Lyric-anchored emotion", "prompt":
     f"Born wild, yearning to be free: a silhouette of a dancer mid-leap between a cage door swinging open and a golden sunrise over purple mountains; the cage bars shatter into musical notes; her flowing dress trails into a river of cream and crimson paint. {STYLE_CORE}."},
    {"id": "altD-panel-layout", "label": "D · Comic-panel composition", "prompt":
     f"A single dramatic comic-book splash page moment: extreme low angle of a raised fist releasing a flock of gold-painted sparrows against a violet thunderstorm sky, rain streaking in halftone diagonals, one lightning bolt as the only straight line; poster-scale graphic energy, ink spatter at panel edges. {STYLE_CORE}."},
    {"id": "altE-poster-halftone", "label": "E · Protest-poster halftone", "prompt":
     f"Vintage protest poster energy: a stylized lioness and a woman back to back in a field of purple poppies, bold two-tone palette of deep violet, cream, and molten gold, heavy halftone dot gradient sky, thick brush outlines, wheat and olive branches framing like a crest, dawn light. {STYLE_CORE}."},
]

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def krea_wf(prompt, seed, slug):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": f"hapa-echo-alt/{slug}"}},
    }

import datetime
for j in JOBS:
    r = api("/prompt", {"prompt": krea_wf(j["prompt"], 31337, j["id"]), "client_id": str(uuid.uuid4())})
    pid = r["prompt_id"]; t0 = time.time()
    print(f"{j['id']} submitted {pid}", flush=True)
    while True:
        h = api(f"/history/{pid}")
        if pid in h: break
        time.sleep(3)
    e = h[pid]
    errs = [str(x.get("exception_message", x))[:150] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
    files = [i["filename"] for o in e.get("outputs", {}).values() for i in o.get("images", [])]
    ok = e.get("status", {}).get("status_str") != "error" and not errs
    rec = {"frame_id": f"alt-{j['id']}", "song": "dear-papa-song-i-knew-a-bella", "shot": "alt",
           "ok": ok, "seconds": round(time.time() - t0, 1), "errors": errs, "files": files,
           "at": datetime.datetime.now().isoformat(), "engine": "krea2-alt", "label": j["label"], "prompt": j["prompt"]}
    with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
    print(json.dumps({"id": j["id"], "ok": ok, "sec": rec["seconds"], "files": files}), flush=True)
print("ALT_RUN_DONE", flush=True)
