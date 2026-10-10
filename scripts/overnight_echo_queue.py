#!/usr/bin/env python3
"""Echo Album overnight render queue — optimal pipeline.
Klein 9B + character refs (ReferenceLatent Kontext) for identity-locked HERO frames:
one per shot, album track order, cast refs per frame, restated identity anchors.
Crash-safe: append-only ledger, resume by skipping completed ids, disk guard, time window.
Run: nohup python3 scripts/overnight_echo_queue.py >> logs/overnight-echo.log 2>&1 &
"""
import json, os, sys, time, uuid, urllib.request, urllib.error, datetime

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
V3 = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3")
LEDGER = os.path.join(V3, "RENDER_LEDGER.jsonl")
LOG = os.path.join(ROOT, "logs/overnight-echo.log")
END_TIME = os.environ.get("ECHO_QUEUE_END", "07:30")   # stop at 07:30 local
DISK_FLOOR_GB = 20
SIGNAGE_NEG = ", neon signage text, storefront signs, brand marks, emblem watermark, logo badge, readable text, subtitle, caption"

# Builder dossier images as identity refs (uploaded to Comfy input)
CAST_REF = {
    "red-reaper": "chatgpt-image-may-24-2026-03-04-38-pm-3-source-b0ef924803101e72.png",
    "avatar-2": "chatgpt-image-may-24-2026-07-21-01-pm-1-1781221375816-2014333.png",
    "avatar-3": "chatgpt-image-may-24-2026-10-26-52-pm-1-1781222050768-2735317.png",
    "pinokio-bella": "chatgpt-image-jun-13-2026-03-56-34-pm-1-1781792045531-2423441.png",
}
CAST_ANCHOR = {
    "red-reaper": "Red: red cap, black-and-red armor, worn cap, grounded protective silhouette, brown hair",
    "avatar-2": "Blue: short dark hair, navy Orion flight-suit with cyan accents, red earbud wire, precise warm navigator",
    "avatar-3": "Green: dark beard and mustache, olive/sage soft hood pulled up, green cloth tunic with frayed hem, brown leather baldric and bracers, bronze medallion pendant at chest, TAN trousers, brown lace-up boots, ornate carved wooden bow with green-fletched arrows, green leaf tattoo on left deltoid",
    "pinokio-bella": "Bella: same face, long dark center-parted hair worn down over shoulders, warm olive skin, red-and-cream flowing dance outfit, gold jewelry (hoop earrings, pendant, hip belt, bangles)",
}

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def disk_free_gb():
    st = os.statvfs("/System/Volumes/Data")
    return st.f_bavail * st.f_frsize / 1e9

def done_ids():
    ids = set()
    if os.path.exists(LEDGER):
        for line in open(LEDGER):
            try: ids.add(json.loads(line)["frame_id"])
            except Exception: pass
    return ids

def log(msg):
    print(datetime.datetime.now().strftime("%H:%M:%S"), msg, flush=True)

def klein_wf(prompt, negative, refs, seed, song_slug):
    wf = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-9b-comfy.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": 5, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": f"hapa-echo/{song_slug}"}},
    }
    prev = ["2", 0]
    for i, ref in enumerate(refs):
        wf[f"1{i}"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
        wf[f"2{i}"] = {"class_type": "VAEEncode", "inputs": {"pixels": [f"1{i}", 0], "vae": ["5", 0]}}
        wf[f"3{i}"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": prev, "latent": [f"2{i}", 0]}}
        prev = [f"3{i}", 0]
    wf["7"]["inputs"]["positive"] = prev
    return wf

def wait_done(pid):
    while True:
        h = api(f"/history/{pid}") if False else json.loads(urllib.request.urlopen(SERVER + f"/history/{pid}", timeout=60).read())
        if pid in h:
            e = h[pid]
            status = e.get("status", {})
            errs = []
            for out in e.get("outputs", {}).values():
                for err in out.get("errors", []) or []:
                    errs.append(str(err.get("exception_message", err))[:200])
            files = [i["filename"] for o in e.get("outputs", {}).values() for i in o.get("images", [])]
            return status.get("status_str") != "error" and not errs, errs, files
        time.sleep(3)

def main():
    hh, mm = map(int, END_TIME.split(":"))
    end = datetime.datetime.now().replace(hour=hh, minute=mm, second=0)
    if end <= datetime.datetime.now(): end += datetime.timedelta(days=1)
    done = done_ids()
    songs = json.load(open(os.path.join(V3, "index.json")))["songs"]
    songs.sort(key=lambda s: s.get("track", 999))
    n_ok = n_err = n_skip = 0
    log(f"queue start: {len(songs)} songs, {len(done)} already done, end {end:%H:%M}, disk {disk_free_gb():.0f}GB")
    for s in songs:
        if datetime.datetime.now() >= end: log("time window reached"); break
        if disk_free_gb() < DISK_FLOOR_GB: log("DISK FLOOR — halting"); break
        path = os.path.join(V3, s["songId"] + ".json")
        if not os.path.exists(path): continue
        data = json.load(open(path))
        song_slug = s["songId"].replace("dear-papa-song-", "")[:40]
        seen_shots = set()
        for k in data["keyframes"]:
            if datetime.datetime.now() >= end: break
            if disk_free_gb() < DISK_FLOOR_GB: log("DISK FLOOR — halting"); break
            if k["shot"] in seen_shots: continue          # hero frame = first frame of each shot
            seen_shots.add(k["shot"])
            fid = k["id"]
            if fid in done: n_skip += 1; continue
            if k.get("flags", {}).get("needsLyricGloss"):  # quarantined until glossed
                continue
            refs = [CAST_REF[c["avatarId"]] for c in k["cast"] if c["avatarId"] in CAST_REF][:2]
            anchors = "; ".join(CAST_ANCHOR[c["avatarId"]] for c in k["cast"] if c["avatarId"] in CAST_ANCHOR)
            prompt = (f"HAPA ECHO ALBUM music-video hero key-frame of “{data['title']}” by Calder. "
                      f"SHOT: {k['scene']}. LOCATION: {k['location']}. CAMERA: {k['lens']}. MOOD: {k['energy']}. "
                      f"IDENTITY LOCK — {anchors}. "
                      f"STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering, ink linework, halftone-dot shading, hand-brushed color plates, cinematic rim light. Single coherent scene, no collage.")
            seed = (hash(fid) % 100000) + 1
            t0 = time.time()
            try:
                r = api("/prompt", {"prompt": klein_wf(prompt, SIGNAGE_NEG.strip(", "), refs, seed, song_slug), "client_id": str(uuid.uuid4())})
                ok, errs, files = wait_done(r["prompt_id"])
            except Exception as ex:
                ok, errs, files = False, [str(ex)[:200]], []
                time.sleep(10)
            rec = {"frame_id": fid, "song": s["songId"], "shot": k["shot"], "ok": ok,
                   "seconds": round(time.time() - t0, 1), "errors": errs, "files": files,
                   "at": datetime.datetime.now().isoformat()}
            with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
            if ok: n_ok += 1; log(f"OK {fid} ({rec['seconds']}s) disk {disk_free_gb():.0f}GB")
            else: n_err += 1; log(f"ERR {fid}: {errs[:1]}")
            if (n_ok + n_err) % 10 == 0:
                os.system("python3 scripts/build_render_tracker.py >/dev/null 2>&1")
                log(f"progress: {n_ok} ok / {n_err} err / {n_skip} skip")
    log(f"queue end: {n_ok} ok / {n_err} err / {n_skip} skip")

if __name__ == "__main__":
    main()
