#!/usr/bin/env python3
"""Build/refresh the Echo render tracker data (ledger -> tracker-data.js).
Run once, or via launchd/cron every few minutes while queues run."""
import json, os, datetime

ROOT = os.path.expanduser("~/Desktop/hapa-avatar-builder")
V3 = os.path.join(ROOT, "data/echo-keyframe-prompt-baseline-v3")
SHOTS = os.path.expanduser("~/Desktop/hapa-cu/output/hapa-echo")
SHOTS_KREA2 = os.path.expanduser("~/Desktop/hapa-cu/output/hapa-echo-krea2")
OUT = os.path.join(ROOT, "tools/echo-render-tracker")

os.makedirs(OUT, exist_ok=True)
shots_link = os.path.join(OUT, "shots")
if not os.path.lexists(shots_link):
    os.symlink(SHOTS, shots_link)
shots_k2_link = os.path.join(OUT, "shots-krea2")
if not os.path.lexists(shots_k2_link):
    os.symlink(SHOTS_KREA2, shots_k2_link)

frames = []
if os.path.exists(os.path.join(V3, "RENDER_LEDGER.jsonl")):
    for line in open(os.path.join(V3, "RENDER_LEDGER.jsonl")):
        try:
            f = json.loads(line); f["_lane"] = "flux"; frames.append(f)
        except Exception: pass
KREA2_LEDGER = os.path.join(V3, "krea2-alt-lane", "RENDER_LEDGER_KREA2.jsonl")
krea2_frames = []
if os.path.exists(KREA2_LEDGER):
    for line in open(KREA2_LEDGER):
        try:
            f = json.loads(line); f["_lane"] = "krea2"; frames.append(f); krea2_frames.append(f)
        except Exception: pass

songs = json.load(open(os.path.join(V3, "index.json")))["songs"]
track = {s["songId"]: s.get("track", 999) for s in songs}
title = {s["songId"]: s["title"] for s in songs}

# hero shot estimate per song = distinct shots in v3 plan
plan_shots = {}
for s in songs:
    p = os.path.join(V3, s["songId"] + ".json")
    if os.path.exists(p):
        try:
            d = json.load(open(p))
            plan_shots[s["songId"]] = len({k["shot"] for k in d["keyframes"] if not k.get("flags", {}).get("needsLyricGloss")})
        except Exception: plan_shots[s["songId"]] = 0

runs = {}
for f in frames:
    run = (f.get("at") or "")[:10]
    r = runs.setdefault(run, {"ok": 0, "err": 0, "seconds": 0.0, "songs": set(), "first": f.get("at"), "last": f.get("at"), "krea2_ok": 0})
    r["ok" if f["ok"] else "err"] += 1
    if f.get("_lane") == "krea2" and f["ok"]: r["krea2_ok"] += 1
    r["seconds"] += f.get("seconds", 0)
    r["songs"].add(f["song"])
    r["first"] = min(r["first"] or f.get("at"), f.get("at"))
    r["last"] = max(r["last"] or f.get("at"), f.get("at"))
for r in runs.values():
    r["songs"] = sorted(r["songs"], key=lambda x: track.get(x, 999))

per_song = {}
for f in frames:
    if not f["ok"]: continue
    ps = per_song.setdefault(f["song"], {"done": 0, "shots": set(), "last": None, "krea2_done": 0})
    ps["done"] += 1
    if f.get("_lane") == "krea2": ps["krea2_done"] += 1
    ps["shots"].add(f.get("shot"))
    ps["last"] = max(ps["last"] or "", f.get("at") or "")

disk = os.statvfs("/System/Volumes/Data")
data = {
    "generated": datetime.datetime.now().isoformat(),
    "disk_free_gb": round(disk.f_bavail * disk.f_frsize / 1e9),
    "runs": [{"date": k, "ok": v["ok"], "err": v["err"], "avg": round(v["seconds"] / max(1, v["ok"] + v["err"]), 1),
              "songs": len(v["songs"]), "first": v["first"][11:16] if v["first"] else "", "last": v["last"][11:16] if v["last"] else "",
              "krea2_ok": v["krea2_ok"]}
             for k, v in sorted(runs.items())],
    "songs": [{"songId": s["songId"], "title": title[s["songId"]], "track": track[s["songId"]],
               "plan": plan_shots.get(s["songId"], 0),
               "done": per_song.get(s["songId"], {}).get("done", 0),
               "krea2_done": per_song.get(s["songId"], {}).get("krea2_done", 0),
               "last": (per_song.get(s["songId"], {}).get("last") or "")[11:16]}
              for s in sorted(songs, key=lambda x: track.get(x["songId"], 999))],
    "frames": [{"id": f["frame_id"], "song": f["song"], "shot": f.get("shot"), "ok": f["ok"],
                "sec": f.get("seconds"), "at": (f.get("at") or "")[11:16],
                "lane": f.get("_lane", "flux"),
                "dir": "shots-krea2" if f.get("_lane") == "krea2" else "shots",
                "file": (f.get("files") or [""])[0]}
               for f in reversed(frames)],
}
with open(os.path.join(OUT, "tracker-data.js"), "w") as f:
    f.write("window.TRACKER=" + json.dumps(data) + ";")
print("tracker data:", len(frames), "frames,", len(runs), "runs,", sum(p['done'] for p in per_song.values()), "ok frames")
