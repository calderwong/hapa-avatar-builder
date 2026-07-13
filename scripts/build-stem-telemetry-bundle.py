#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

ANALYSIS_VERSION = "hapa.stem-telemetry.numpy-rfft.v1"


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode(path: Path, sample_rate: int) -> np.ndarray:
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "pipe:1"
    ], check=True, stdout=subprocess.PIPE)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def percentile_scale(values: np.ndarray, percentile: float = 99.0) -> float:
    value = float(np.percentile(values, percentile)) if len(values) else 1.0
    return max(1e-8, value)


def analyze(samples: np.ndarray, fps: int, sample_rate: int) -> tuple[list[dict], dict]:
    size = max(1, round(sample_rate / fps))
    frame_count = int(np.ceil(len(samples) / size))
    padded = np.pad(samples, (0, frame_count * size - len(samples)))
    windows = padded.reshape(frame_count, size)
    rms = np.sqrt(np.mean(np.square(windows), axis=1))
    peak = np.max(np.abs(windows), axis=1)
    rms_scale = percentile_scale(rms)
    peak_scale = percentile_scale(peak)
    rms_norm = np.clip(rms / rms_scale, 0, 1)
    peak_norm = np.clip(peak / peak_scale, 0, 1)
    delta = np.maximum(0, np.diff(rms_norm, prepend=rms_norm[0]))
    onset_scale = percentile_scale(delta)
    onset = np.clip(delta / onset_scale, 0, 1)
    spectrum = np.abs(np.fft.rfft(windows * np.hanning(size), axis=1))
    frequencies = np.fft.rfftfreq(size, 1 / sample_rate)
    band_masks = {
        "low": (frequencies >= 20) & (frequencies < 250),
        "mid": (frequencies >= 250) & (frequencies < 2000),
        "high": (frequencies >= 2000) & (frequencies <= sample_rate / 2),
    }
    band_raw = {name: np.mean(spectrum[:, mask], axis=1) if np.any(mask) else np.zeros(frame_count) for name, mask in band_masks.items()}
    band_norm = {name: np.clip(values / percentile_scale(values), 0, 1) for name, values in band_raw.items()}
    frames = [{
        "t": round(index / fps, 4),
        "rms": round(float(rms_norm[index]), 5),
        "peak": round(float(peak_norm[index]), 5),
        "onset": round(float(onset[index]), 5),
        "bands": {name: round(float(values[index]), 5) for name, values in band_norm.items()},
        "silence": bool(rms_norm[index] < 0.025 and peak_norm[index] < 0.05),
    } for index in range(frame_count)]
    normalization = {
        "method": "per-input-p99-clamp",
        "rmsP99": rms_scale,
        "peakP99": peak_scale,
        "onsetDeltaP99": onset_scale,
        "bandP99": {name: percentile_scale(values) for name, values in band_raw.items()},
    }
    return frames, normalization


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--graph-output", required=True)
    parser.add_argument("--fps", type=int, default=10)
    parser.add_argument("--sample-rate", type=int, default=8000)
    args = parser.parse_args()
    graph_path = Path(args.graph).resolve()
    output_path = Path(args.output).resolve()
    graph_output = Path(args.graph_output).resolve()
    graph = json.loads(graph_path.read_text())
    raw_stems = (graph.get("stems") or {}).get("items") or []
    ignored_inputs = []
    canonical: dict[str, dict] = {}
    for item in raw_stems:
        role = str(item.get("stemType") or item.get("title") or item.get("id") or "unknown").strip().lower().replace(" ", "-")
        # The director graph may carry the source archive beside the decoded
        # stems. It is lineage metadata, not an audio stem, and must not turn a
        # complete local stem set into a false missing-path failure.
        if role in {"archive-zip", "stem-archive", "stems-archive"} and not str(item.get("audioPath") or "").strip():
            ignored_inputs.append({"id": item.get("id"), "role": role, "reason": "non-audio-archive-lineage"})
            continue
        if role not in canonical:
            canonical[role] = {**item, "role": role, "aliases": [], "sourceLineage": []}
        canonical[role]["aliases"].append(str(item.get("title") or item.get("stemType") or item.get("id") or role))
        canonical[role]["sourceLineage"].append({"id": item.get("id"), "audioPath": item.get("audioPath")})
    stems = []
    decoded = []
    for role, item in canonical.items():
        audio_path = Path(str(item.get("audioPath") or "")).expanduser()
        if not audio_path.is_file():
            stems.append({"id": item.get("id"), "role": role, "status": "missing-path", "audioPath": str(audio_path), "aliases": item["aliases"], "sourceLineage": item["sourceLineage"], "frames": []})
            continue
        samples = decode(audio_path, args.sample_rate)
        frames, normalization = analyze(samples, args.fps, args.sample_rate)
        decoded.append(samples)
        stems.append({
            "id": item.get("id"), "role": role, "title": item.get("title") or item.get("stemType"), "audioPath": str(audio_path),
            "pathHash": hashlib.sha256(str(audio_path).encode()).hexdigest(), "audioHash": sha256_file(audio_path),
            "durationSeconds": round(len(samples) / args.sample_rate, 4), "aliases": sorted(set(item["aliases"])),
            "sourceLineage": item["sourceLineage"], "normalization": normalization, "status": "verified-local-analysis", "frames": frames,
        })
    usable = [stem for stem in stems if stem["status"] == "verified-local-analysis"]
    if decoded:
        minimum = min(map(len, decoded))
        master_samples = np.mean(np.stack([samples[:minimum] for samples in decoded]), axis=0)
        master_frames, master_normalization = analyze(master_samples, args.fps, args.sample_rate)
    else:
        master_frames, master_normalization = [], {}
    bundle = {
        "schemaVersion": "hapa.stem-telemetry-bundle.v1", "analysisVersion": ANALYSIS_VERSION,
        "truthStatus": "offline-decoded-local-stems", "songId": (graph.get("song") or {}).get("id"), "title": (graph.get("song") or {}).get("title"),
        "fps": args.fps, "sampleRate": args.sample_rate, "durationSeconds": max([stem.get("durationSeconds", 0) for stem in usable] or [0]),
        "canonicalStemCount": len(stems), "usableStemCount": len(usable), "duplicateInputCount": len(raw_stems) - len(ignored_inputs) - len(canonical),
        "ignoredInputCount": len(ignored_inputs), "ignoredInputs": ignored_inputs,
        "stems": stems,
        "masterMix": {"role": "master", "method": "mean-of-aligned-canonical-stems", "inputRoles": [stem["role"] for stem in usable], "normalization": master_normalization, "frames": master_frames},
        "renderTruth": {"preview": "this-bundle", "export": "this-bundle", "runtimeWebAudio": False},
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, indent=2) + "\n")
    bundle_hash = sha256_file(output_path)
    graph.setdefault("stems", {})["telemetryBundle"] = {
        "schemaVersion": bundle["schemaVersion"], "path": str(output_path), "hash": bundle_hash, "fps": args.fps,
        "durationSeconds": bundle["durationSeconds"], "truthStatus": bundle["truthStatus"],
    }
    graph["stems"]["renderSignalSource"] = "offline-stem-telemetry-bundle"
    graph["stems"]["runtimeWebAudioTruth"] = False
    graph_output.parent.mkdir(parents=True, exist_ok=True)
    graph_output.write_text(json.dumps(graph, indent=2) + "\n")
    result = {"ok": len(usable) == len(stems) and len(usable) > 0, "output": str(output_path), "graphOutput": str(graph_output), "bundleHash": bundle_hash, "canonicalStems": len(stems), "usableStems": len(usable), "ignoredInputs": len(ignored_inputs), "framesPerStem": len(usable[0]["frames"]) if usable else 0, "masterFrames": len(master_frames)}
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
