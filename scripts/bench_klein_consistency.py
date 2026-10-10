#!/usr/bin/env python3
"""Klein 9B character-consistency stress test.
Same character reference + same seed, wildly different scenes.
Identity should persist across scene changes."""
import json, time, uuid, urllib.request, sys
sys.path.insert(0, "/Users/calderwong/Desktop/hapa-avatar-builder/scripts")
from bench_media_node import workflow, api, wait_done

BELLA_REF = "chatgpt-image-jun-13-2026-03-56-34-pm-1-1781792045531-2423441.png"
GREEN_REF = "chatgpt-image-may-24-2026-10-26-52-pm-1-1781222050768-2735317.png"
NEG = "readable text, logo, UI, watermark, photoreal skin, extra limbs, malformed anatomy, nudity, cleavage exposure, collage, second character unless specified"

JOBS = [
    {"name": "bella-sceneA-greenhouse", "ref": BELLA_REF, "seed": 777,
     "prompt": "HAPA ECHO ALBUM music-video key-frame. SHOT: Bella alone in a cracked-glass greenhouse filled with white orchids, standing still, hands at her sides, lantern light. Single character only. STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering, ink linework, halftone shading, low-key intro lighting, cream-gold accent."},
    {"name": "bella-sceneB-rainy-overpass", "ref": BELLA_REF, "seed": 777,
     "prompt": "HAPA ECHO ALBUM music-video key-frame. SHOT: Bella alone on a rain-slick neon overpass at night, walking forward, coat of the same flowing red-and-cream fabric streaming behind her, neon reflections on wet concrete. Single character only. STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering, ink linework, halftone shading, night neon lighting, crimson accent."},
    {"name": "green-sceneA-teahouse", "ref": GREEN_REF, "seed": 888,
     "prompt": "HAPA ECHO ALBUM music-video key-frame. SHOT: Green the hooded ranger alone on a rooftop tea house above a copper city at dusk, kneeling and pouring tea, living-wood bow leaning against the railing. Single character only. STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering, ink linework, halftone shading, warm dusk light, living-green accent."},
    {"name": "green-sceneB-volcanic-shore", "ref": GREEN_REF, "seed": 888,
     "prompt": "HAPA ECHO ALBUM music-video key-frame. SHOT: Green the hooded ranger alone on a volcanic black-sand shore with steaming vents, drawing his living-wood bow at the horizon, ash falling like snow. Single character only. STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering, ink linework, halftone shading, hard rim light through steam, living-green accent."},
]

ledger = []
for j in JOBS:
    import bench_media_node as b
    b.REF_IMAGES["refs"] = [j["ref"]]
    wf = workflow("klein", j["prompt"], NEG, seed=j["seed"], steps=5)
    wf["9"]["inputs"]["filename_prefix"] = f"hapa-bench/consistency/{j['name']}"
    r = api("/prompt", {"prompt": wf, "client_id": str(uuid.uuid4())})
    t0 = time.time()
    res = wait_done(r["prompt_id"], t0)
    secs = time.time() - t0
    rec = {"job": j["name"], "seconds": round(secs, 1), "ok": res["ok"],
           "errors": [e[:200] for e in res.get("messages", [])], "files": [f for o in res["outputs"].values() for f in [i["filename"] for i in o.get("images", [])]]}
    print(json.dumps(rec), flush=True)
    ledger.append(rec)
print("STRESS_DONE", flush=True)
