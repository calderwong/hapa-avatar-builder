"""Disposable content-addressed audio analysis, separate from cut/lyric state."""
from __future__ import annotations
import hashlib
import json
import os
import uuid
from pathlib import Path
import numpy as np

VERSION = "echo-audio-resource-1"
MAX_SOURCE_SECONDS = 1800


def key_for(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def atomic_json(file, value):
    temporary = file.with_name(file.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("x") as handle:
            json.dump(value, handle, separators=(",", ":"), allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(file)
    finally:
        temporary.unlink(missing_ok=True)


def transient_events(samples, sample_rate):
    """5 ms energy-rise detections, never a fabricated musical beat grid.

    Precision records the analysis hop, not accuracy against human annotation.
    Refinement locates an amplitude crossing inside the winning hop. Sustained
    silence remains event-free, and no synthetic regular pulses are inserted.
    """
    hop = max(1, round(sample_rate * .005))
    if len(samples) < hop:
        return []
    count = int(np.ceil(len(samples) / hop))
    windows = np.pad(samples, (0, count * hop - len(samples))).reshape(count, hop)
    energy = np.sqrt(np.mean(windows ** 2, axis=1))
    rise = np.maximum(0, energy - np.r_[0., energy[:-1]])
    threshold = max(.003, float(np.percentile(rise, 95)) * .35)
    candidates = np.flatnonzero((rise >= threshold) & (energy >= .003))
    peaks = []
    separation = max(1, round(.06 * sample_rate / hop))
    for index in candidates:
        if peaks and index - peaks[-1] < separation:
            if rise[index] > rise[peaks[-1]]:
                peaks[-1] = int(index)
        else:
            peaks.append(int(index))
    scale = max(threshold, float(np.percentile(rise, 99)))
    events = []
    for index in peaks:
        window = np.abs(windows[index])
        crossings = np.flatnonzero(window >= max(.003, float(np.max(window)) * .1))
        sample = index * hop + (int(crossings[0]) if len(crossings) else 0)
        if sample >= len(samples):
            continue
        events.append({"kind": "transient", "atSeconds": sample / sample_rate,
                       "strength": min(1., float(rise[index]) / scale),
                       "precisionSeconds": hop / sample_rate,
                       "method": "5ms-rms-rise-amplitude-crossing.v1",
                       "truthStatus": "inferred-unreviewed", "confidence": None})
    return events


class AudioAnalysisCache:
    def __init__(self, root, analysis_version, max_bytes=2 * 1024 ** 3, runtime_identity=None):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.analysis_version = analysis_version
        self.runtime_identity = runtime_identity or {}
        self.max_bytes = max_bytes
        self.metrics = {"resourceHits": 0, "resourceBuilds": 0, "decodeCalls": 0, "corrupt": 0, "diagnosticHits": 0}

    def resource(self, source, audio_hash, fps, sample_rate, decode, analyze):
        key = key_for({"version": VERSION, "analyzer": self.analysis_version, "runtime": self.runtime_identity, "hash": audio_hash, "fps": fps, "sampleRate": sample_rate})
        metadata_file = self.root / (key + ".json")
        samples_file = self.root / (key + ".npy")
        try:
            if metadata_file.stat().st_size > 32 * 1024 ** 2 or samples_file.stat().st_size > MAX_SOURCE_SECONDS * sample_rate * 4 + 1024:
                raise ValueError("oversized cache")
            record = json.loads(metadata_file.read_text())
            if record["key"] != key or key_for(record["analysis"]) != record["analysisDigest"]:
                raise ValueError("analysis cache digest mismatch")
            # Verify cached PCM bytes before allowing them into reconstruction.
            digest = hashlib.sha256()
            with samples_file.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != record["samplesDigest"]:
                raise ValueError("PCM cache digest mismatch")
            samples = np.load(samples_file, mmap_mode="r", allow_pickle=False)
            if samples.dtype != np.dtype("float32") or samples.ndim != 1 or len(samples) > MAX_SOURCE_SECONDS * sample_rate:
                raise ValueError("invalid PCM cache shape")
            self.metrics["resourceHits"] += 1
            return key, samples, record["analysis"]
        except FileNotFoundError:
            pass
        except (ValueError, KeyError, TypeError, OSError, EOFError):
            self.metrics["corrupt"] += 1
        samples = decode(source, sample_rate)
        self.metrics["decodeCalls"] += 1
        if Path(source).is_file():
            source_digest = hashlib.sha256()
            with Path(source).open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    source_digest.update(chunk)
            if source_digest.hexdigest() != audio_hash:
                raise ValueError("Source changed during decoding; refusing to publish cached analysis")
        if len(samples) > MAX_SOURCE_SECONDS * sample_rate or not np.all(np.isfinite(samples)):
            raise ValueError("Audio exceeds the analysis duration budget or contains invalid samples")
        frames, normalization = analyze(samples, fps, sample_rate)
        analysis = {"frames": frames, "normalization": normalization, "events": transient_events(samples, sample_rate), "durationSeconds": len(samples) / sample_rate}
        temporary = samples_file.with_name(samples_file.name + "." + uuid.uuid4().hex + ".tmp")
        try:
            with temporary.open("xb") as handle:
                np.save(handle, samples.astype(np.float32, copy=False), allow_pickle=False)
                handle.flush(); os.fsync(handle.fileno())
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            temporary.replace(samples_file)
            atomic_json(metadata_file, {"key": key, "analysis": analysis, "analysisDigest": key_for(analysis), "samplesDigest": digest})
        finally:
            temporary.unlink(missing_ok=True)
        self.metrics["resourceBuilds"] += 1
        return key, samples, analysis

    def diagnostics(self, resource_keys, build):
        key = key_for({"version": self.analysis_version, "resources": resource_keys})
        file = self.root / ("diagnostics-" + key + ".json")
        try:
            if file.stat().st_size > 4 * 1024 ** 2:
                raise ValueError("oversized diagnostic")
            record = json.loads(file.read_text())
            if record["key"] != key or key_for(record["value"]) != record["digest"]:
                raise ValueError("invalid diagnostic digest")
            self.metrics["diagnosticHits"] += 1
            return record["value"]
        except FileNotFoundError:
            pass
        except (ValueError, KeyError, TypeError, OSError):
            self.metrics["corrupt"] += 1
        value = build()
        atomic_json(file, {"key": key, "value": value, "digest": key_for(value)})
        return value

    def prune(self, protected_keys):
        # Only completed known cache files; ignore concurrent temporary files.
        entries = []
        for file in self.root.iterdir():
            if file.suffix not in {".json", ".npy"} or len(file.stem.removeprefix("diagnostics-")) != 64:
                continue
            try:
                info = file.stat()
                entries.append((info.st_mtime, info.st_size, file))
            except FileNotFoundError:
                continue
        total = sum(size for _, size, _ in entries)
        for _, size, file in sorted(entries):
            if total <= self.max_bytes:
                break
            if file.stem in protected_keys:
                continue
            file.unlink(missing_ok=True)
            total -= size
        return {"bytes": total, "maxBytes": self.max_bytes}
