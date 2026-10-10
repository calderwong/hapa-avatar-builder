#!/usr/bin/env python3
"""Echo keyframe local-model benchmark harness for ComfyUI.
Submits the same v3 keyframe prompt to different model stacks, times each,
saves outputs + a benchmark ledger. Usage:
  python3 bench_media_node.py --stack z-image|krea2|klein --count N --out DIR
"""
import argparse, json, time, urllib.request, uuid, os, sys

SERVER = "http://127.0.0.1:8188"
REF_IMAGES = {}

def api(path, data=None, method=None):
    url = SERVER + path
    req = urllib.request.Request(url, method=method or ("POST" if data else "GET"))
    if data is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1200) as r:
        return json.loads(r.read())

def workflow(stack, prompt_text, negative, seed=42, w=1344, h=768, steps=None, cfg=None):
    """Build API-format txt2img graphs per stack (ComfyUI 0.34 native nodes)."""
    if stack == "z-image":
        return {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["4", 0]}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 0]}},
            "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default"}},
            "5": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
            "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
            "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps or 8, "cfg": cfg or 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
            "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-bench/z-image"}},
        }
    if stack == "krea2":
        return {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["4", 0]}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 0]}},
            "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
            "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
            "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
            "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps or 8, "cfg": cfg or 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
            "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-bench/krea2"}},
        }
    if stack == "klein":
        # FLUX.2 Klein 9B via merged single-file UNet + qwen3_4b TE + flux2 VAE.
        # ref_images: optional list of uploaded character reference files -> ReferenceLatent (Kontext).
        wf = {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-9b-comfy.safetensors", "weight_dtype": "default"}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["4", 0]}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 0]}},
            "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default"}},
            "5": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
            "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
            "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": steps or 4, "cfg": cfg or 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
            "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
            "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "hapa-bench/klein"}},
        }
        refs = REF_IMAGES.get("refs", [])
        prev_cond = ["2", 0]
        for i, ref in enumerate(refs):
            wf[f"1{i}"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
            wf[f"2{i}"] = {"class_type": "VAEEncode", "inputs": {"pixels": [f"1{i}", 0], "vae": ["5", 0]}}
            wf[f"3{i}"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": prev_cond, "latent": [f"2{i}", 0]}}
            prev_cond = [f"3{i}", 0]
        if refs:
            wf["7"]["inputs"]["positive"] = prev_cond
            wf["9"]["inputs"]["filename_prefix"] = "hapa-bench/klein-ref"
        return wf
    raise SystemExit(f"unknown stack {stack}")

def wait_done(prompt_id, t0):
    while True:
        hist = api(f"/history/{prompt_id}")
        if prompt_id in hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            outputs = entry.get("outputs", {})
            return {"ok": status.get("status_str") != "error", "outputs": outputs,
                   "messages": [m[1] for m in status.get("messages", []) if m[0] == "execution_error"]}
        time.sleep(2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stack", required=True)
    ap.add_argument("--count", type=int, default=2)
    ap.add_argument("--prompt-file", default="/tmp/bench-prompt.txt")
    ap.add_argument("--negative-file", default="/tmp/bench-negative.txt")
    ap.add_argument("--ledger", default="/tmp/hapa-bench-ledger.json")
    ap.add_argument("--refs", default="", help="comma-separated uploaded image filenames to use as character references")
    a = ap.parse_args()
    REF_IMAGES["refs"] = [r for r in a.refs.split(",") if r]
    prompt = open(a.prompt_file).read().strip() if os.path.exists(a.prompt_file) else "a red-capped astronaut in a rain-slick neon city, comic book"
    negative = open(a.negative_file).read().strip() if os.path.exists(a.negative_file) else "text, logo, blurry"
    ledger = []
    for i in range(a.count):
        wf = workflow(a.stack, prompt, negative, seed=1000 + i)
        t0 = time.time()
        r = api("/prompt", {"prompt": wf, "client_id": str(uuid.uuid4())})
        pid = r["prompt_id"]
        print(f"[{a.stack}] submitted {pid}", flush=True)
        res = wait_done(pid, t0)
        secs = time.time() - t0
        files = []
        for nid, out in res["outputs"].items():
            for img in out.get("images", []):
                files.append(img["filename"])
        rec = {"stack": a.stack, "prompt_id": pid, "seconds": round(secs, 1), "ok": res["ok"],
               "errors": res.get("messages", [])[:1], "files": files}
        print(json.dumps(rec), flush=True)
        ledger.append(rec)
        with open(a.ledger, "a") as f:
            f.write(json.dumps(rec) + "\n")
    print("BENCH_DONE", flush=True)

if __name__ == "__main__":
    main()
