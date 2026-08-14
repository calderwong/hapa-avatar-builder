#!/usr/bin/env python3
"""Download only Suno media identified as newly added by Echo reconciliation."""

from __future__ import annotations

import json
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

PLAYLIST_ID = "903148b6-5709-4511-9cfd-d34b23799da6"
LIBRARY = pathlib.Path("/Users/calderwong/Desktop/suno-library")
PLAYLIST_ROOT = LIBRARY / "playlists" / PLAYLIST_ID
sys.path.insert(0, str(LIBRARY))

from download_playlist_with_stems import download_url, ext_from_url_or_type, make_session, pick_audio_url  # noqa: E402


def load(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    manifest = load(PLAYLIST_ROOT / "manifest.json")
    reconciliation = load(PLAYLIST_ROOT / "hapa-avatar-builder-reconciliation.json")
    added_ids = {row["id"] for row in reconciliation.get("added", [])}
    songs = [row for row in manifest.get("songs", []) if row.get("id") in added_ids]
    if len(songs) != len(added_ids):
        raise RuntimeError(f"Resolved {len(songs)} of {len(added_ids)} newly added Suno IDs")

    _source, session = make_session()
    jobs = []
    for song in songs:
        metadata_path = pathlib.Path(song["metadataPath"])
        metadata = load(metadata_path)
        audio_url = pick_audio_url(metadata)
        if audio_url:
            jobs.append((song["id"], "master", audio_url, pathlib.Path(song["songPath"])))
        image_url = metadata.get("image_large_url") or metadata.get("image_url")
        if image_url:
            cover = pathlib.Path(song["localDir"]) / f"cover{ext_from_url_or_type(str(image_url))}"
            jobs.append((song["id"], "cover", image_url, cover))
        for stem in song.get("stems", []):
            if stem.get("audioUrl") and stem.get("localPath"):
                jobs.append((song["id"], "stem", stem["audioUrl"], pathlib.Path(stem["localPath"])))

    results = []
    failures = []

    def worker(job):
        song_id, kind, url, target = job
        local_session = session.__class__()
        local_session.headers.update(session.headers)
        local_session.cookies.update(session.cookies)
        path, size, status = download_url(local_session, url, target, overwrite=False)
        return {"songId": song_id, "kind": kind, "path": str(path), "bytes": size, "status": status}

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(worker, job): job for job in jobs}
        for index, future in enumerate(as_completed(futures), 1):
            job = futures[future]
            try:
                row = future.result()
                results.append(row)
                print(f"[{index}/{len(jobs)}] {row['status']} {row['kind']} {row['songId'][:8]}", flush=True)
            except Exception as error:
                failures.append({"songId": job[0], "kind": job[1], "target": str(job[3]), "error": str(error)})

    report = {
        "schemaVersion": "hapa.echo.suno-missing-media-download.v1",
        "playlistId": PLAYLIST_ID,
        "addedSongIds": sorted(added_ids),
        "songs": len(songs),
        "jobs": len(jobs),
        "downloaded": sum(row["status"] == "downloaded" for row in results),
        "existing": sum(row["status"] == "existing" for row in results),
        "failures": failures,
        "results": results,
    }
    report_path = PLAYLIST_ROOT / "missing-media-refresh-2026-08-13.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("songs", "jobs", "downloaded", "existing")}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
