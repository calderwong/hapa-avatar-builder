#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
import shutil
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from echo_audio_analysis_cache import AudioAnalysisCache, MAX_SOURCE_SECONDS
from echo_reconstruction_alignment import reconstruction_waveform_alignment

ANALYSIS_VERSION = "hapa.stem-telemetry.numpy-rfft-events-cache.v6"
ABSOLUTE_ACTIVITY_FLOOR = 10 ** (-60 / 20)


def analysis_runtime_identity():
    executable = shutil.which("ffmpeg")
    if not executable:
        raise ValueError("ffmpeg is required for audio preparation")
    version = subprocess.run([executable, "-version"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15).stdout
    implementation = hashlib.sha256()
    for source in [Path(__file__), Path(__file__).with_name("echo_audio_analysis_cache.py"), Path(__file__).with_name("echo_reconstruction_alignment.py")]:
        implementation.update(source.read_bytes())
    return {"decoder": "ffmpeg", "decoderVersion": version.decode(errors="replace").splitlines()[0],
            "decoderVersionHash": hashlib.sha256(version).hexdigest(), "decoderBinaryHash": sha256_file(Path(executable).resolve()),
            "numpyVersion": np.__version__, "pythonVersion": sys.version.split()[0], "implementationHash": implementation.hexdigest()}


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def assert_same_stem_source(role, left, right):
    first, second = str(left or ""), str(right or "")
    if first == second:
        return
    a, b = Path(first).expanduser(), Path(second).expanduser()
    if first and second and a.is_file() and b.is_file() and sha256_file(a) == sha256_file(b):
        return  # Explicit byte-identical aliases retain both lineage records.
    raise ValueError(f"Ambiguous {role} stem sources; select one exact audio revision before preparation")


def decode(path: Path, sample_rate: int) -> np.ndarray:
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)], check=True, stdout=subprocess.PIPE, timeout=15)
    duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
    if not 0 < duration <= MAX_SOURCE_SECONDS or duration * sample_rate * 4 > 64 * 1024 ** 2:
        raise ValueError("Audio duration is unavailable or exceeds the 1800-second / 64 MiB resource budget")
    result = subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path), "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "pipe:1"
    ], check=True, stdout=subprocess.PIPE, timeout=120)
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
        "t": round(index * size / sample_rate, 8),
        # Preserve absolute amplitudes alongside display-normalized signals.
        # Per-input normalization makes a silent noise floor look energetic and
        # therefore cannot be used to choose a render-time stem binding.
        "rawRms": round(float(rms[index]), 9),
        "rawPeak": round(float(peak[index]), 9),
        "rms": round(float(rms_norm[index]), 5),
        "peak": round(float(peak_norm[index]), 5),
        "onset": round(float(onset[index]), 5),
        "bands": {name: round(float(values[index]), 5) for name, values in band_norm.items()},
        "silence": bool(rms[index] < ABSOLUTE_ACTIVITY_FLOOR and peak[index] < ABSOLUTE_ACTIVITY_FLOOR),
    } for index in range(frame_count)]
    normalization = {
        "method": "per-input-p99-clamp",
        "rmsP99": rms_scale,
        "peakP99": peak_scale,
        "onsetDeltaP99": onset_scale,
        "bandP99": {name: percentile_scale(values) for name, values in band_raw.items()},
    }
    return frames, normalization


def envelope_correlation(reference: np.ndarray, candidate: np.ndarray, sample_rate: int) -> dict:
    """Measure timing alignment without depending on mix gain or waveform polarity."""
    sample_count = min(len(reference), len(candidate))
    analysis_fps = 100
    frame_size = max(1, round(sample_rate / analysis_fps))
    frame_count = sample_count // frame_size
    empty = {
        "version": "rms-envelope-cross-correlation.v1",
        "analysisFps": analysis_fps,
        "maximumLagSeconds": 2.0,
        "zeroLagCorrelation": None,
        "bestCorrelation": None,
        "bestLagSeconds": None,
        "frameCount": frame_count,
    }
    if frame_count < analysis_fps:
        return empty

    def rms_envelope(samples: np.ndarray) -> np.ndarray:
        window = samples[:frame_count * frame_size].reshape(frame_count, frame_size)
        return np.sqrt(np.mean(np.square(window), axis=1))

    reference_envelope = rms_envelope(reference)
    candidate_envelope = rms_envelope(candidate)

    def correlation(left: np.ndarray, right: np.ndarray) -> float | None:
        if len(left) < analysis_fps:
            return None
        left_centered = left - np.mean(left)
        right_centered = right - np.mean(right)
        denominator = float(np.linalg.norm(left_centered) * np.linalg.norm(right_centered))
        if denominator <= 1e-12:
            return None
        value = float(np.dot(left_centered, right_centered) / denominator)
        return max(-1.0, min(1.0, value)) if np.isfinite(value) else None

    zero_lag = correlation(reference_envelope, candidate_envelope)
    maximum_lag_frames = min(round(2.0 * analysis_fps), frame_count - analysis_fps)
    best_correlation = zero_lag
    best_lag_frames = 0 if zero_lag is not None else None
    for lag_frames in range(-maximum_lag_frames, maximum_lag_frames + 1):
        if lag_frames == 0:
            continue
        if lag_frames > 0:
            left = reference_envelope[lag_frames:]
            right = candidate_envelope[:-lag_frames]
        else:
            shift = -lag_frames
            left = reference_envelope[:-shift]
            right = candidate_envelope[shift:]
        value = correlation(left, right)
        if value is not None and (best_correlation is None or value > best_correlation):
            best_correlation = value
            best_lag_frames = lag_frames

    return {
        **empty,
        "zeroLagCorrelation": round(zero_lag, 6) if zero_lag is not None else None,
        "bestCorrelation": round(best_correlation, 6) if best_correlation is not None else None,
        "bestLagSeconds": round(best_lag_frames / analysis_fps, 4) if best_lag_frames is not None else None,
    }


def reconstruction_role_alignment(
    reference: np.ndarray,
    candidates: list[np.ndarray],
    candidate_index: int,
    sample_rate: int,
) -> dict:
    """Measure whether shifting one stem improves the complete stem reconstruction.

    A stem's musical envelope is not expected to look like the full master. Directly
    correlating (for example) a sparse bass line to the mastered mix can therefore
    report the intentional distance between bass and drum hits as a file-origin
    offset. This diagnostic holds every other stem at the show origin and shifts
    exactly one role inside a polarity-independent RMS-power reconstruction. A
    material lag is reported only when that role shift improves the reconstructed
    mix's fit to the authoritative master.
    """
    analysis_fps = 100
    maximum_lag_seconds = 2.0
    sample_count = min([len(reference), *[len(candidate) for candidate in candidates]]) if candidates else 0
    frame_size = max(1, round(sample_rate / analysis_fps))
    frame_count = sample_count // frame_size
    empty = {
        "version": "rms-power-reconstruction-role-shift.v2",
        "analysisFps": analysis_fps,
        "maximumLagSeconds": maximum_lag_seconds,
        "zeroLagCorrelation": None,
        "bestCorrelation": None,
        "bestLagSeconds": None,
        "frameCount": frame_count,
        "reconstructionMethod": "root-mean-square-of-isolated-rms-envelopes",
        "roleCount": len(candidates),
    }
    if (
        frame_count < analysis_fps
        or candidate_index < 0
        or candidate_index >= len(candidates)
    ):
        return empty

    def rms_envelope(samples: np.ndarray) -> np.ndarray:
        windows = samples[:frame_count * frame_size].reshape(frame_count, frame_size)
        return np.sqrt(np.mean(np.square(windows), axis=1))

    def correlation(left: np.ndarray, right: np.ndarray) -> float | None:
        if len(left) < analysis_fps:
            return None
        left_centered = left - np.mean(left)
        right_centered = right - np.mean(right)
        denominator = float(np.linalg.norm(left_centered) * np.linalg.norm(right_centered))
        if denominator <= 1e-12:
            return None
        value = float(np.dot(left_centered, right_centered) / denominator)
        return max(-1.0, min(1.0, value)) if np.isfinite(value) else None

    reference_envelope = rms_envelope(reference)
    candidate_envelopes = np.stack([rms_envelope(candidate) for candidate in candidates])
    role_power = np.square(candidate_envelopes)
    selected_power = role_power[candidate_index]
    other_power = np.maximum(0, np.sum(role_power, axis=0) - selected_power)

    def reconstructed_envelope(lag_frames: int) -> np.ndarray:
        shifted_power = np.zeros_like(selected_power)
        if lag_frames > 0:
            shifted_power[lag_frames:] = selected_power[:-lag_frames]
        elif lag_frames < 0:
            shifted_power[:lag_frames] = selected_power[-lag_frames:]
        else:
            shifted_power[:] = selected_power
        return np.sqrt((other_power + shifted_power) / len(candidates))

    zero_lag = correlation(reference_envelope, reconstructed_envelope(0))
    maximum_lag_frames = min(round(maximum_lag_seconds * analysis_fps), frame_count - analysis_fps)
    best_correlation = zero_lag
    best_lag_frames = 0 if zero_lag is not None else None
    for lag_frames in range(-maximum_lag_frames, maximum_lag_frames + 1):
        if lag_frames == 0:
            continue
        value = correlation(reference_envelope, reconstructed_envelope(lag_frames))
        if value is not None and (best_correlation is None or value > best_correlation):
            best_correlation = value
            best_lag_frames = lag_frames

    return {
        **empty,
        "zeroLagCorrelation": round(zero_lag, 6) if zero_lag is not None else None,
        "bestCorrelation": round(best_correlation, 6) if best_correlation is not None else None,
        "bestLagSeconds": round(best_lag_frames / analysis_fps, 4) if best_lag_frames is not None else None,
    }


def main() -> int:
    started = time.perf_counter()
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", required=True)
    parser.add_argument("--master", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--graph-output", required=True)
    parser.add_argument("--fps", type=int, default=10)
    parser.add_argument("--sample-rate", type=int, default=8000)
    parser.add_argument("--cache-dir", default=str(Path(__file__).resolve().parents[1] / "data/cache/stem-analysis"))
    args = parser.parse_args()
    if not 1 <= args.fps <= 60 or not 4000 <= args.sample_rate <= 48000:
        parser.error("Analysis fps must be 1–60 and sample rate 4000–48000")
    runtime_identity = analysis_runtime_identity()
    cache = AudioAnalysisCache(args.cache_dir, ANALYSIS_VERSION, runtime_identity=runtime_identity)
    resource_keys = []
    decoded_bytes = 0
    sparse_events = []
    graph_path = Path(args.graph).resolve()
    master_path = Path(args.master).expanduser().resolve()
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
        else:
            assert_same_stem_source(role, canonical[role].get("audioPath"), item.get("audioPath"))
        canonical[role]["aliases"].append(str(item.get("title") or item.get("stemType") or item.get("id") or role))
        canonical[role]["sourceLineage"].append({"id": item.get("id"), "audioPath": item.get("audioPath")})
    if len(canonical) > 32:
        raise ValueError("Stem analysis exceeds the 32-resource budget")
    stems = []
    decoded: list[tuple[str, np.ndarray]] = []
    for role, item in canonical.items():
        audio_path = Path(str(item.get("audioPath") or "")).expanduser()
        if not audio_path.is_file():
            stems.append({"id": item.get("id"), "role": role, "status": "missing-path", "audioPath": str(audio_path), "aliases": item["aliases"], "sourceLineage": item["sourceLineage"], "frames": []})
            continue
        audio_hash = sha256_file(audio_path)
        key, samples, analysis = cache.resource(audio_path, audio_hash, args.fps, args.sample_rate, decode, analyze)
        if sha256_file(audio_path) != audio_hash:
            raise ValueError("Stem source changed during analysis")
        decoded_bytes += samples.nbytes
        if decoded_bytes > 512 * 1024 ** 2:
            raise ValueError("Selected audio exceeds the 512 MiB reconstruction working-set budget")
        resource_keys.append({"role": role, "key": key})
        frames, normalization = analysis["frames"], analysis["normalization"]
        sparse_events.extend({**event, "resourceId": str(item.get("id") or role), "audioHash": audio_hash} for event in analysis["events"])
        decoded.append((role, samples))
        stems.append({
            "id": item.get("id"), "role": role, "title": item.get("title") or item.get("stemType"), "audioPath": str(audio_path),
            "pathHash": hashlib.sha256(str(audio_path).encode()).hexdigest(), "audioHash": audio_hash,
            "durationSeconds": round(len(samples) / args.sample_rate, 4), "aliases": sorted(set(item["aliases"])),
            "sourceLineage": item["sourceLineage"], "normalization": normalization, "status": "verified-local-analysis", "frames": frames,
        })
    usable = [stem for stem in stems if stem["status"] == "verified-local-analysis"]
    if master_path.is_file():
        master_hash = sha256_file(master_path)
        key, master_samples, analysis = cache.resource(master_path, master_hash, args.fps, args.sample_rate, decode, analyze)
        if sha256_file(master_path) != master_hash:
            raise ValueError("Master source changed during analysis")
        decoded_bytes += master_samples.nbytes
        if decoded_bytes > 512 * 1024 ** 2:
            raise ValueError("Selected audio exceeds the 512 MiB reconstruction working-set budget")
        resource_keys.append({"role": "master", "key": key})
        master_frames, master_normalization = analysis["frames"], analysis["normalization"]
        master_duration = round(len(master_samples) / args.sample_rate, 4)
        sparse_events.extend({**event, "resourceId": "master", "audioHash": master_hash} for event in analysis["events"])
    else:
        master_samples = np.array([], dtype="<f4")
        master_frames, master_normalization = [], {}
        master_duration = 0
        master_hash = None
    decoded_by_role = dict(decoded)
    decoded_samples = [samples for _, samples in decoded]
    decoded_index_by_role = {role: index for index, (role, _) in enumerate(decoded)}
    def build_diagnostics():
        role_diagnostics = {}
        for stem in stems:
            stem_role = stem.get("role")
            samples = decoded_by_role.get(stem_role)
            if samples is not None and len(master_samples):
                role_diagnostics[stem_role] = reconstruction_role_alignment(
                    master_samples,
                    decoded_samples,
                    decoded_index_by_role[stem_role],
                    args.sample_rate,
                )
        reconstruction = {
            "available": False,
            "method": "mean-of-isolated-stems",
            "pearsonCorrelation": None,
            "sampleCount": 0,
            "alignment": envelope_correlation(np.array([], dtype="<f4"), np.array([], dtype="<f4"), args.sample_rate),
        }
        if decoded and len(master_samples):
            minimum = min([len(master_samples), *map(len, decoded_samples)])
            reconstructed = np.mean(np.stack([samples[:minimum] for samples in decoded_samples]), axis=0)
            master_window = master_samples[:minimum]
            if minimum > 1 and float(np.std(reconstructed)) > 1e-12 and float(np.std(master_window)) > 1e-12:
                correlation = float(np.corrcoef(master_window, reconstructed)[0, 1])
            else:
                correlation = None
            reconstruction = {
                "available": True,
                "method": "mean-of-isolated-stems",
                "pearsonCorrelation": round(correlation, 6) if correlation is not None and np.isfinite(correlation) else None,
                "sampleCount": minimum,
                "alignment": envelope_correlation(master_window, reconstructed, args.sample_rate),
                "waveformAlignment": {
                    **reconstruction_waveform_alignment(master_window, reconstructed, args.sample_rate),
                    "masterAudioHash": master_hash,
                    "stemAudioHashes": [stem["audioHash"] for stem in usable],
                },
            }
        return {"roles": role_diagnostics, "reconstruction": reconstruction}
    diagnostics = cache.diagnostics(resource_keys, build_diagnostics)
    for stem in stems:
        if stem["role"] in diagnostics["roles"]:
            stem["masterAlignmentDiagnostic"] = diagnostics["roles"][stem["role"]]
    reconstruction = diagnostics["reconstruction"]
    bundle = {
        "schemaVersion": "hapa.stem-telemetry-bundle.v1", "analysisVersion": ANALYSIS_VERSION,
        "truthStatus": "offline-decoded-local-stems", "songId": (graph.get("song") or {}).get("id"), "title": (graph.get("song") or {}).get("title"),
        "fps": args.fps, "sampleRate": args.sample_rate, "durationSeconds": master_duration,
        "canonicalStemCount": len(stems), "usableStemCount": len(usable), "duplicateInputCount": len(raw_stems) - len(ignored_inputs) - len(canonical),
        "ignoredInputCount": len(ignored_inputs), "ignoredInputs": ignored_inputs,
        "stems": stems,
        "sparseEvents": sorted(sparse_events, key=lambda event: event["atSeconds"]),
        "analysisSettings": {"transientHopSeconds": .005, "beatTracking": "not-inferred-from-display-envelope", "resourceCacheVersion": "echo-audio-resource-1", "runtimeIdentity": runtime_identity},
        "masterMix": {
            "role": "master", "method": "authoritative-registry-master", "audioPath": str(master_path), "audioHash": master_hash,
            "durationSeconds": master_duration, "normalization": master_normalization, "frames": master_frames,
            "isolatedStemReconstructionDiagnostic": reconstruction,
        },
        "renderTruth": {"preview": "authoritative-master-plus-isolated-stems", "export": "authoritative-master-plus-isolated-stems", "runtimeWebAudio": False, "masterAudioHash": master_hash},
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
    result = {"ok": len(usable) == len(stems) and len(master_frames) > 0 and master_hash is not None, "output": str(output_path), "graphOutput": str(graph_output), "bundleHash": bundle_hash, "canonicalStems": len(stems), "usableStems": len(usable), "ignoredInputs": len(ignored_inputs), "framesPerStem": len(usable[0]["frames"]) if usable else 0, "masterFrames": len(master_frames), "masterAudioHash": master_hash}
    result["elapsedMs"] = round((time.perf_counter() - started) * 1000, 3)
    result["analysisCache"] = {**cache.metrics, **cache.prune({item["key"] for item in resource_keys})}
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
