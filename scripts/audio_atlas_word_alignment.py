"""Pure validation for experimental supplied-text alignment; no inference or I/O.

Owned: Hapa adapter and validation. English token cleaning follows the observable
MLX Audio 0.3.1 Qwen aligner interface (letters/numbers/ASCII apostrophe).
Sound energy is an abstention gate, never evidence that supplied words were said.
"""
import math
import re
import unicodedata
from fractions import Fraction

VERSION = 'hapa.forced-word-alignment-validation.v1'
RMS_FLOOR = 1e-4


def supplied_tokens(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('invalid_supplied_text')
    tokens = []
    for match in re.finditer(r'\S+', text):
        cleaned = ''.join(c for c in match[0] if c == "'" or unicodedata.category(c)[0] in 'LN')
        if cleaned:
            tokens.append({'text': match[0], 'normalized': cleaned,
                           'text_start': match.start(), 'text_end': match.end()})
    if not tokens:
        raise ValueError('no_supplied_tokens')
    return tokens


def _integer(value, name, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError('invalid_' + name)
    return value


def _energy(samples):
    return math.sqrt(math.fsum(float(x) ** 2 for x in samples) / len(samples)) if len(samples) else 0.0


def validate_alignment(*, text, items, pcm, source_rate, source_sample_count,
                       crop_start_sample=0, input_rate=16000):
    """Return candidates and unresolved evidence on one source clock.

    pcm is exactly the mono normalized float clip sent to the model. Crop origin
    refers to the full decoded source, before crop/resample; no MP3 delay is
    invented. Caller must bind source/model/raw-output digests and verify inputs.
    This validator does not establish that the lyrics match the performance.
    """
    _integer(source_rate, 'source_rate', 1)
    _integer(source_sample_count, 'source_sample_count', 1)
    _integer(crop_start_sample, 'crop_start_sample')
    _integer(input_rate, 'input_rate', 1)
    if input_rate != 16000 or not 0 < len(pcm) <= 30 * input_rate:
        raise ValueError('invalid_analysis_clip')
    if crop_start_sample + Fraction(len(pcm) * source_rate, input_rate) > source_sample_count:
        raise ValueError('clip_outside_source')
    if any(not math.isfinite(float(x)) or abs(float(x)) > 1.0 for x in pcm):
        raise ValueError('invalid_normalized_pcm')
    if not isinstance(items, list) or len(items) > 1000 or any(not isinstance(x, dict) for x in items):
        raise ValueError('invalid_model_items')
    tokens = supplied_tokens(text)
    matches = [x.get('text') for x in items] == [x['normalized'] for x in tokens]
    rms = _energy(pcm)
    result = {'schema_version': VERSION, 'supplied_text': text, 'supplied_tokens': tokens,
              'transcript_match': matches, 'quality_qualified': False, 'confidence': None,
              'performed_text_verified': False, 'review_state': 'unreviewed',
              'clip_rms': rms, 'rms_floor': RMS_FLOOR, 'candidates': [], 'unresolved': [],
              'analysis_view': {'sample_rate_hz': input_rate, 'channels': 1,
                'map_numerator': source_rate, 'map_denominator': input_rate,
                'offset_samples': crop_start_sample, 'input_sample_count': len(pcm),
                'rounding': 'nearest ties to even, once at source sample',
                'source_reference_rate_hz': source_rate}}
    if not matches:
        result['unresolved'].append({'reason': 'supplied_token_sequence_mismatch',
                                     'model_token_count': len(items)})
    # Compare against all valid earlier endpoints, even if those tokens abstain.
    previous_end = Fraction(0)
    for index, item in enumerate(items):
        row = {'model_token_index': index, 'normalized_text': item.get('text'),
               'supplied_token_index': index if matches else None}
        reasons = []
        if not matches:
            reasons.append('supplied_token_sequence_mismatch')
        if rms < RMS_FLOOR:
            reasons.append('silent_or_below_energy_floor')
        values = [item.get('start_seconds'), item.get('end_seconds')]
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
            reasons.append('nonfinite_or_invalid_time')
        else:
            start, end = (Fraction(str(v)) for v in values)
            row['raw_start_seconds'], row['raw_end_seconds'] = values
            if not 0 <= start <= end <= Fraction(len(pcm), input_rate):
                reasons.append('outside_clip_or_reversed')
            elif start < previous_end:
                reasons.append('nonmonotonic_or_overlapping')
            if end >= start >= 0:
                previous_end = max(previous_end, end)
            if start == end:
                reasons.append('zero_duration')
            if not reasons:
                # Inspect the contained PCM window. It is not a speech detector.
                lo, hi = math.ceil(start * input_rate), math.floor(end * input_rate)
                local_rms = _energy(pcm[lo:hi])
                row['interval_rms'] = local_rms
                a = crop_start_sample + round(start * source_rate)
                b = crop_start_sample + round(end * source_rate)
                if local_rms < RMS_FLOOR:
                    reasons.append('interval_below_energy_floor')
                if not 0 <= a < b <= source_sample_count:
                    reasons.append('empty_or_outside_source_interval')
                if not reasons:
                    row.update(start_sample=a, end_sample=b,
                               text=tokens[index]['text'], confidence=None,
                               review_state='unreviewed', model_score=None,
                               score_semantics='forced alignment has no model confidence')
        if reasons:
            row['reasons'] = reasons
            result['unresolved'].append(row)
        else:
            result['candidates'].append(row)
    result['status'] = 'candidate' if result['candidates'] else 'unresolved'
    return result
