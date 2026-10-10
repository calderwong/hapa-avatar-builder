#!/usr/bin/env python3
"""Echo Album KREA-2 ALT LANE rollout — append-only, separate from the Flux/Klein lane.

Lane separation (hard rule):
  - Flux/Klein lane:   RENDER_LEDGER.jsonl          (engine klein9b-ref, identity-locked)
  - Krea-2 alt lane:   RENDER_LEDGER_KREA2.jsonl    (engine krea2-hybrid, symbol-forward)
  - Output prefix:     hapa-echo-krea2/ in Comfy output (never hapa-echo/)
  - Never mutates v3 song JSONs, claims, or variants.

Recipe = approved H1 hybrid (ALT_CRITIQUE_v1.md v2 pass, 9/10/9/9):
  protest-poster crest discipline + single-figure motion, result-state language,
  no mid-transformation beats, halftone/screen-print (not 'brushed-pixel'),
  counts restated verbatim, one symbol cluster per frame, text-safe negative.

Waves: wave1 = first hero frame per song (default). --all-shots later on request.
Crash-safe: resume by frame_id in lane ledger; disk floor; time window; per-frame try/except.
"""
import json, os, sys, time, uuid, urllib.request, datetime, shutil

SERVER = "http://127.0.0.1:8188"
ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
V3 = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3")
LANE_DIR = os.path.join(V3, "krea2-alt-lane")
LEDGER = os.path.join(LANE_DIR, "RENDER_LEDGER_KREA2.jsonl")
END_TIME = os.environ.get("KREA2_LANE_END", "07:30")
DISK_FLOOR_GB = 30
ALL_SHOTS = "--all-shots" in sys.argv

STYLE = ("Hapa Aesthetic: CRPG pixel-brushed comic book — hand-painted 16-bit RPG background art rendered "
         "with a visible pixel-brush texture, crisp dark ink linework over painterly color plates, sharp "
         "detailed foreground props, dithered gradients, dramatic chiaroscuro lighting, intricate environmental "
         "storytelling clutter, ultra-detailed, razor-sharp focus")
NEG = ("readable text, letters, words, subtitles, captions, logos, signage, watermark, photoreal skin, "
       "plastic 3d, extra limbs, malformed anatomy, blurry, oversaturated mush, duplicate figures, "
       "mirrored poses, cloned birds, identical repeated figures")

def api(path, data=None):
    req = urllib.request.Request(SERVER + path, method="POST" if data is not None else "GET")
    if data is not None:
        req.add_header("Content-Type", "application/json"); data = json.dumps(data).encode()
    with urllib.request.urlopen(req, data=data, timeout=1800) as r:
        return json.loads(r.read())

def disk_free_gb():
    st = os.statvfs("/System/Volumes/Data")
    return st.f_bavail * st.f_frsize / 1e9

def done_ids():
    ids = set()
    if os.path.exists(LEDGER):
        for line in open(LEDGER):
            try:
                r = json.loads(line)
                if r.get("ok"): ids.add(r["frame_id"])
            except Exception: pass
    return ids

def log(msg):
    print(datetime.datetime.now().strftime("%H:%M:%S"), msg, flush=True)

def build_prompt(data, k):
    """Per-song alt prompt derived from THIS song's own v3 keyframe fields.
    Framing device, palette, and composition archetype vary deterministically
    by song so no two frames share a signature badge. Fixed crest removed (v1 defect)."""
    import hashlib
    h = int(hashlib.sha256(k["id"].encode()).hexdigest(), 16)
    cast_names = "/".join(c["name"] for c in k.get("cast", [])) or "a lone figure"
    cast_colors = []
    for c in k.get("cast", []):
        cast_colors += {"red-reaper": ["crimson", "black"], "avatar-2": ["cyan", "navy"],
                        "avatar-3": ["sage green", "olive"], "pinokio-bella": ["cream", "gold"]}.get(c["avatarId"], [])
    palette = (cast_colors or ["violet", "cream", "molten gold"])[:3]

    FRAMES = [
        "no frame or border — full-bleed scene",
        "torn paper edges like a ripped poster fragment",
        "halftone sunburst rays radiating from behind the subject",
        "diagonal comic gutter slicing one corner of the composition",
        "vertical rain-streak panel texture over one third of the frame",
        "stacked horizon bands — sky, midground, foreground as flat color strata",
    ]
    ARCHETYPES = {
        "intro": "wide establishing composition, small figure, dominant environment",
        "build": "mid-shot composition, figure interacting with the prop, depth layers",
        "climax": "extreme low-angle close composition, prop or gesture fills the frame",
        "outro": "wide quiet composition, negative space, subject leaving frame edge",
    }
    framing = FRAMES[h % len(FRAMES)]
    arch = ARCHETYPES.get(k.get("act", "").strip(), "dynamic mid-shot composition, strong foreground silhouette")
    move = {"still": "frozen quiet moment, held breath", "attentive": "leaning-in posture, mid-step pause",
            "watchful": "coiled watchful stance, weight on back foot", "energetic": "full motion stride, arms driving",
            "explosive": "peak action freeze, debris suspended"}.get(k.get("energy", "").strip(), "clear single pose, unambiguous motion")
    prop = k.get("prop") or ""
    lyric = k.get("lyricLine", "")
    return (
        f"HAPA ECHO ALBUM alt key-frame for “{data['title']}” by Calder — symbolic poster, no likenesses. "
        f"SCENE, RESULT STATE (nothing mid-transformation): {k['scene']} — depicted as it has already become; fragments settled. "
        f"LOCATION detail foregrounded: {k['location']}" + (f", with the {prop} as the hero object" if prop else "") + ". "
        f"COMPOSITION: {arch}. CAMERA: {k['lens']}. FIGURE: one anonymous silhouette ({cast_names} as type, not likeness), {move}. "
        f"FRAMING: {framing}. "
        f"Focus: razor-sharp, fine linework, microscopic texture in wood grain, fabric weave, stone and foliage. "
        f"Lyric evidence off-image: “{lyric}” informs staging only. "
        f"{STYLE}."
    )

def krea_wf(prompt, seed, idx):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 0]}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "5": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1344, "height": 768, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["6", 0], "seed": seed, "steps": 8, "cfg": 2.5, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["5", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": f"hapa-echo-krea2/krea2-crpg-{idx:04d}"}},
    }

def wait_done(pid):
    while True:
        h = api(f"/history/{pid}")
        if pid in h:
            e = h[pid]
            errs = [str(x.get("exception_message", x))[:200] for o in e.get("outputs", {}).values() for x in (o.get("errors") or [])]
            files = [i["filename"] for o in e.get("outputs", {}).values() for i in o.get("images", [])]
            return e.get("status", {}).get("status_str") != "error" and not errs, errs, files
        time.sleep(3)

def main():
    os.makedirs(LANE_DIR, exist_ok=True)
    hh, mm = map(int, END_TIME.split(":"))
    end = datetime.datetime.now().replace(hour=hh, minute=mm, second=0)
    if end <= datetime.datetime.now(): end += datetime.timedelta(days=1)
    done = done_ids()
    songs = json.load(open(os.path.join(V3, "index.json")))["songs"]
    songs.sort(key=lambda s: s.get("track", 999))

    jobs = []
    for s in songs:
        path = os.path.join(V3, s["songId"] + ".json")
        if not os.path.exists(path): continue
        data = json.load(open(path))
        seen_shots = set()
        for k in data["keyframes"]:
            if k["shot"] in seen_shots: continue
            seen_shots.add(k["shot"])
            if not ALL_SHOTS and len(seen_shots) > 1: break   # wave1: one hero per song
            if k.get("flags", {}).get("needsLyricGloss"): continue  # quarantine holds
            jobs.append((s, data, k))

    n_ok = n_err = n_skip = 0
    todo = [j for j in jobs if f"krea2::{j[2]['id']}" not in done]
    n_skip = len(jobs) - len(todo)
    idx0 = sum(1 for _ in open(LEDGER)) if os.path.exists(LEDGER) else 0  # collision-proof filename index across restarts
    log(f"krea2 lane start: {len(jobs)} jobs ({'all shots' if ALL_SHOTS else 'wave1 hero/song'}), {n_skip} done, {len(todo)} to render, end {end:%H:%M}, disk {disk_free_gb():.0f}GB")
    for i, (s, data, k) in enumerate(jobs):
        fid = f"krea2::{k['id']}"
        if fid in done: continue
        if datetime.datetime.now() >= end: log("time window reached"); break
        if disk_free_gb() < DISK_FLOOR_GB: log("DISK FLOOR — halting"); break
        prompt = build_prompt(data, k)
        seed = (hash(fid) % 100000) + 1
        t0 = time.time()
        try:
            r = api("/prompt", {"prompt": krea_wf(prompt, seed, idx0 + i + 1), "client_id": str(uuid.uuid4())})
            ok, errs, files = wait_done(r["prompt_id"])
        except Exception as ex:
            ok, errs, files = False, [str(ex)[:200]], []
        rec = {"frame_id": fid, "v3_frame_id": k["id"], "song": s["songId"], "title": data["title"],
               "track": s.get("track"), "shot": k["shot"], "countOrdinal": k.get("countOrdinal"),
               "engine": "krea2-turbo", "lane": "krea2-alt", "recipe": "crpg-v3",
               "ok": ok, "seconds": round(time.time() - t0, 1), "errors": errs, "files": files,
               "prompt": prompt, "seed": seed, "at": datetime.datetime.now().isoformat()}
        with open(LEDGER, "a") as f: f.write(json.dumps(rec) + "\n")
        done.add(fid)
        if ok: n_ok += 1
        else: n_err += 1
        log(f"[{n_ok+n_skip+n_err}/{len(jobs)}] {s['songId']} shot{k['shot']} ok={ok} {rec['seconds']}s")
    tally = {"lane": "krea2-alt", "ok": n_ok, "err": n_err, "skipped": n_skip, "total_jobs": len(jobs),
             "disk_free_gb": round(disk_free_gb(), 1), "at": datetime.datetime.now().isoformat()}
    with open(os.path.join(LANE_DIR, "last_tally.json"), "w") as f: json.dump(tally, f, indent=1)
    log(f"KREA2_LANE_DONE ok={n_ok} err={n_err} skip={n_skip}")

if __name__ == "__main__":
    main()
