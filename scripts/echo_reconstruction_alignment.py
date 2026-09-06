"""Bounded PCM reconstruction diagnostics; never correct stems automatically."""
from __future__ import annotations
import numpy as np

VERSION = "echo.pcm-reconstruction-window-alignment.v1"


def waveform_window_alignment(reference, candidate, sample_rate, maximum_lag_seconds=2.0):
    n = min(len(reference), len(candidate))
    if sample_rate < 4000 or n < sample_rate or n > sample_rate * 12:
        return {"status": "insufficient-or-over-budget"}
    left = np.asarray(reference[:n], dtype=np.float64)
    right = np.asarray(candidate[:n], dtype=np.float64)
    if not np.all(np.isfinite(left)) or not np.all(np.isfinite(right)):
        return {"status": "invalid-samples"}
    if min(float(np.sqrt(np.mean(left ** 2))), float(np.sqrt(np.mean(right ** 2)))) < 1e-5:
        return {"status": "silence-or-insufficient-energy"}
    limit = min(int(round(maximum_lag_seconds * sample_rate)), n // 3)
    lags = np.arange(-limit, limit + 1)
    size = 1 << (2 * n - 1).bit_length()
    cross = np.fft.irfft(np.fft.rfft(left, size) * np.fft.rfft(right[::-1], size), size)[n - 1 + lags]
    def intervals(values, start, end):
        sums = np.r_[0., np.cumsum(values)]
        return sums[end] - sums[start]
    lstart, lend = np.maximum(lags, 0), n + np.minimum(lags, 0)
    rstart, rend = np.maximum(-lags, 0), n - np.maximum(lags, 0)
    count = n - np.abs(lags)
    a, b = intervals(left, lstart, lend), intervals(right, rstart, rend)
    aa, bb = intervals(left ** 2, lstart, lend), intervals(right ** 2, rstart, rend)
    denominator = np.sqrt(np.maximum(0, aa - a*a/count) * np.maximum(0, bb - b*b/count))
    correlation = np.divide(cross - a*b/count, denominator, out=np.zeros_like(cross), where=denominator > 1e-12)
    peak = int(np.argmax(correlation)); lag = int(lags[peak]); best = float(np.clip(correlation[peak], -1, 1))
    competitors = correlation[np.abs(lags-lag) > max(1, round(.005*sample_rate))]
    second = float(np.max(competitors)) if len(competitors) else 0.
    return {"status": "measured", "lagSamples": lag, "lagSeconds": lag/sample_rate,
            "correlation": best, "zeroLagCorrelation": float(np.clip(correlation[limit], -1, 1)),
            "peakMargin": best-second, "atSearchBoundary": abs(lag) == limit,
            "sampleCount": n, "precisionSeconds": 1/sample_rate}


def reconstruction_waveform_alignment(reference, candidate, sample_rate, maximum_lag_seconds=2.0):
    count = min(len(reference), len(candidate))
    base = {"version": VERSION, "method": "normalized-PCM-cross-correlation-of-complete-stem-reconstruction",
            "sampleRate": sample_rate, "maximumLagSeconds": maximum_lag_seconds,
            "lagConvention": "positive moves the reconstruction later on the master timeline",
            "automaticOriginCorrection": False, "individualStemOriginsVerified": False,
            "precisionSeconds": 1/sample_rate, "windowSeconds": 8, "maximumWindows": 8}
    if count < sample_rate * 3:
        return {**base, "status": "insufficient-duration", "windows": [], "proposedGroupOriginSeconds": None}
    length = min(count, sample_rate*8)
    starts = np.unique(np.linspace(0, count-length, min(8, max(1, count//length)), dtype=int))
    windows = [{"startSeconds": int(start)/sample_rate,
                **waveform_window_alignment(reference[start:start+length],candidate[start:start+length],sample_rate,maximum_lag_seconds)} for start in starts]
    reliable = [w for w in windows if w["status"] == "measured" and w["correlation"] >= .80
                and w["peakMargin"] >= .03 and not w["atSearchBoundary"]]
    lag = float(np.median([w["lagSeconds"] for w in reliable])) if reliable else None
    deviation = float(np.percentile([abs(w["lagSeconds"]-lag) for w in reliable],95)) if reliable else None
    coverage = (max(w["startSeconds"] for w in reliable)-min(w["startSeconds"] for w in reliable)+length/sample_rate)/(count/sample_rate) if reliable else 0.
    consistent = len(reliable) >= 3 and coverage >= .5 and deviation <= .002
    return {**base, "status": "consistent-reconstruction-lag" if consistent else "ambiguous-or-insufficient-evidence",
            "windows": windows, "reliableWindows": len(reliable), "observedCoverage": coverage,
            "lagDeviationP95Seconds": deviation, "proposedGroupOriginSeconds": lag if consistent else None,
            "thresholds": {"minimumCorrelation":.80,"minimumPeakMargin":.03,"minimumWindows":3,"minimumCoverage":.5,"maximumDeviationSeconds":.002},
            "truth": "measured-PCM-reconstruction-lag; this does not establish every individual stem origin"}
