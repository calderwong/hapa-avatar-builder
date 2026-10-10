"""Per-stem timing evidence. Proposals never change source bytes or applied clocks."""
from fractions import Fraction
import numpy as np
from echo_reconstruction_alignment import waveform_window_alignment

VERSION = 'hapa.audio-atlas.stem-alignment.v1'


def rational(value):
    return {'numerator': str(value.numerator), 'denominator': str(value.denominator)}


def leading_activity(samples, rate):
    # A threshold observation, not a declaration of artistic silence or decoder delay.
    hop = max(1, rate // 100)
    for start in range(0, len(samples), hop):
        if np.sqrt(np.mean(np.square(samples[start:start + hop], dtype=np.float64))) >= 1e-4:
            return {'seconds': start / rate, 'resolution_seconds': hop / rate,
                    'rms_threshold': 1e-4, 'state': 'activity_detected'}
    return {'seconds': None, 'resolution_seconds': hop / rate,
            'rms_threshold': 1e-4, 'state': 'no_activity_above_threshold'}


def stem_alignment(reference, candidate, rate=8000, *, source_rate=None, master_rate=None,
                   source_count=None, master_count=None):
    source_rate = source_rate or rate
    master_rate = master_rate or rate
    source_count = source_count if source_count is not None else len(candidate)
    master_count = master_count if master_count is not None else len(reference)
    base = {'schema_version': VERSION, 'method': 'windowed normalized PCM correlation with robust affine lag fit',
            'analysis_rate_hz': rate, 'source_rate_hz': source_rate, 'master_rate_hz': master_rate,
            'source_sample_count': source_count, 'master_sample_count': master_count,
            'lag_convention': 'positive places stem samples later on the master clock',
            'alignment_applied': False, 'quality_qualified': False, 'decoder_delay_seconds': None,
            'decoder_delay_notice': 'Correlation combines content offset and any residual decoder delay; it cannot separate them.',
            'missing_material': 'unknown; duration differences and unmatched windows do not prove missing musical content',
            'source_duration_seconds': source_count / source_rate,
            'master_duration_seconds': master_count / master_rate,
            'duration_difference_seconds': source_count / source_rate - master_count / master_rate,
            'thresholds': {'minimum_correlation': .18, 'minimum_peak_margin': .04,
                           'minimum_windows': 4, 'minimum_temporal_span_fraction': .5,
                           'maximum_fit_residual_seconds': .003, 'maximum_lag_seconds': 2},
            'windows': [], 'proposed_map': None, 'proposed_inverse_map': None,
            'uncertainty': {'calibrated': False, 'meaning': 'fit residuals describe measured window consistency, not a confidence interval'}}
    if rate != 8000 or min(source_rate, master_rate, source_count, master_count) <= 0:
        raise ValueError('Expected bounded 8 kHz analysis and positive source/master clocks')
    if max(len(reference), len(candidate)) > rate * 1800:
        raise ValueError('Analysis exceeds 30 minute budget')
    if not np.all(np.isfinite(reference)) or not np.all(np.isfinite(candidate)):
        raise ValueError('Non-finite PCM')
    base['leading_activity'] = leading_activity(candidate, rate)
    count = min(len(reference), len(candidate))
    length = rate * 4
    if count < length * 2:
        return {**base, 'status': 'insufficient_duration'}
    starts = np.unique(np.linspace(0, count - length, min(24, max(4, count // length)), dtype=int))
    for start in starts:
        item = waveform_window_alignment(reference[start:start+length], candidate[start:start+length], rate, 2)
        item.update({'source_start_sample': int(round(start * source_rate / rate)),
                     'source_end_sample': min(source_count, int(round((start+length) * source_rate / rate))),
                     'center_seconds': (int(start)+length/2) / rate})
        item['usable'] = bool(item['status'] == 'measured' and item['correlation'] >= .18
                              and item['peakMargin'] >= .04 and not item['atSearchBoundary'])
        base['windows'].append(item)
    good = [w for w in base['windows'] if w['usable']]
    base['usable_windows'] = len(good)
    base['tested_window_count'] = len(starts)
    base['usable_window_fraction'] = len(good) / len(starts)
    if len(good) < 4:
        return {**base, 'status': 'ambiguous_or_insufficient_evidence'}
    x = np.array([w['center_seconds'] for w in good])
    y = np.array([w['lagSeconds'] for w in good])
    slopes = [(y[j]-y[i])/(x[j]-x[i]) for i in range(len(x)) for j in range(i+1, len(x))]
    slope = float(np.median(slopes))
    intercept = float(np.median(y - slope*x))
    residual = np.abs(y - (slope*x+intercept))
    span = float((x.max()-x.min()+length/rate) / (count/rate))
    base.update({'offset_seconds': intercept, 'drift_ppm': slope*1e6,
                 'fit_residual_p95_seconds': float(np.percentile(residual, 95)),
                 'fit_residual_max_seconds': float(residual.max()),
                 'observed_span_fraction': span, 'measurement_grid_seconds': 1/rate})
    if span < .5 or residual.max() > .003 or abs(slope) > .01:
        return {**base, 'status': 'inconsistent_or_insufficient_span'}
    # Rational proposals in original decoded sample clocks, invertible without float loss.
    scale = (Fraction(1) + Fraction(str(slope)).limit_denominator(10**9)) * Fraction(master_rate, source_rate)
    offset = Fraction(str(intercept)).limit_denominator(10**9) * master_rate
    base.update({'status': 'affine_alignment_candidate',
                 'proposed_map': {'kind': 'affine', 'scale': rational(scale), 'offset_samples': rational(offset),
                                  'domain_start_sample': min(w['source_start_sample'] for w in good),
                                  'domain_end_sample': max(w['source_end_sample'] for w in good),
                                  'rounding': 'ties-even', 'status': 'unreviewed_proposal'},
                 'proposed_inverse_map': {'kind': 'affine', 'scale': rational(1/scale),
                                          'offset_samples': rational(-offset/scale), 'rounding': 'ties-even',
                                          'status': 'unreviewed_proposal'},
                 'limitations': ['sampled windows do not verify every source interval',
                                 'correlation can be confounded by leakage or shared/repeated content',
                                 'no automatic alignment, missing-content diagnosis, or acoustic accuracy certification']})
    return base
