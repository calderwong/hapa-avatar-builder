#!/usr/bin/env python3
"""Offline supplied-text alignment; launched only by the existing Atlas owner."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time
from importlib.metadata import version
import numpy as np
from audio_atlas_word_alignment import validate_alignment, RMS_FLOOR


def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write(file, value):
    temp = file.with_suffix(file.suffix + '.alignment.tmp')
    try:
        temp.write_text(json.dumps(value, allow_nan=False, ensure_ascii=False, separators=(',', ':')))
        temp.replace(file)
    finally:
        temp.unlink(missing_ok=True)


def main():
    if os.environ.get('HAPA_AUDIO_ATLAS_WORKER') != '1':
        raise RuntimeError('Owner role required')
    signal.alarm(590)
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    args = parser.parse_args()
    manifest_path = Path(args.manifest)
    manifest = json.loads(manifest_path.read_text())
    folder = manifest_path.parent
    request, config = manifest['alignment'], manifest['alignment_model']
    result = json.loads((folder / 'result.json').read_text())
    asset = next(a for a in result['assets'] if a['id'] == request['sourceId'])
    source = next(s for s in manifest['sources'] if s['id'] == asset['id'])
    if asset['status'] != 'ready' or digest(source['path']) != source['sha256']:
        raise RuntimeError('Alignment source missing or changed')
    if version('mlx-audio') != '0.3.1':
        raise RuntimeError('This alignment adapter requires qualified mlx-audio 0.3.1')
    model_path = Path(config['modelPath'])
    for name, expected in config['sha256'].items():
        if digest(model_path / name) != expected:
            raise RuntimeError('Alignment checkpoint changed: ' + name)
    for name in ['config.json', 'tokenizer_config.json']:
        if json.loads((model_path / name).read_text()).get('auto_map'):
            raise RuntimeError('Remote model code mapping refused')
    sr = asset['sample_rate_hz']
    clip_start, clip_end = request['startInputSample'], request['endInputSample']
    if not 0 <= clip_start < clip_end or clip_end - clip_start > 30 * 16000:
        raise RuntimeError('Invalid alignment excerpt')
    if clip_end * sr > asset['sample_count'] * 16000:
        raise RuntimeError('Alignment excerpt exceeds the source duration')
    started = time.monotonic()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('FFmpeg is unavailable')
    pcm_file = folder / 'alignment-input.f32'
    try:
        # Resample the prefix before cropping; do not seek a compressed container.
        subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '1',
          '-protocol_whitelist', 'file,pipe', '-t', str(clip_end / 16000 + 1), '-i', source['path'],
          '-ac', '1', '-af', f'aresample=16000,atrim=start_sample={clip_start}:end_sample={clip_end},asetpts=PTS-STARTPTS',
          '-f', 'f32le', '-y', str(pcm_file)], check=True, timeout=120,
          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        samples = np.fromfile(pcm_file, dtype='<f4')
        if len(samples) != clip_end - clip_start:
            raise RuntimeError('Decoded excerpt length differs from requested input samples')
        pcm_hash = digest(pcm_file)
    finally:
        pcm_file.unlink(missing_ok=True)
    source_offset = round(clip_start * sr / 16000)
    validation_args = dict(text=request['text'], pcm=samples, source_rate=sr,
                           source_sample_count=asset['sample_count'], crop_start_sample=source_offset)
    # Validate PCM and check silence before any model work. This check is not ASR.
    preflight = validate_alignment(items=[], **validation_args)
    items = []
    skipped = preflight['clip_rms'] < RMS_FLOOR
    if not skipped:
        def denied(*args, **kwargs):
            raise RuntimeError('Atlas alignment inference disables network and child execution')
        socket.socket.connect = denied
        subprocess.Popen = denied
        from transformers import AutoTokenizer
        original = AutoTokenizer.from_pretrained
        def local_tokenizer(*args, **kwargs):
            kwargs['trust_remote_code'] = False
            kwargs['local_files_only'] = True
            return original(*args, **kwargs)
        AutoTokenizer.from_pretrained = local_tokenizer
        from mlx_audio.stt import load
        model = load(model_path, strict=True)
        aligned = model.generate(audio=samples, text=request['text'], language='English')
        items = [{'text': item.text, 'start_seconds': item.start_time, 'end_seconds': item.end_time}
                 for item in aligned.items]
    raw = {'request': request, 'items': items, 'source_sha256': source['sha256'],
           'input_pcm_sha256': pcm_hash, 'model_repository': config['repository'],
           'model_revision': config['revision'], 'checkpoint_files': config['sha256'],
           'package_version': version('mlx-audio'), 'runtime': {'transformers': version('transformers'), 'mlx': version('mlx')},
           'inference_skipped': 'silent_or_below_energy_floor' if skipped else None,
           'network': 'disabled', 'quality_qualified': False}
    write(folder / 'forced-alignment-raw.json', raw)
    validation = validate_alignment(items=items, **validation_args)
    if skipped:
        validation['unresolved'] = [{'reason': 'silent_or_below_energy_floor', 'supplied_token_count': len(validation['supplied_tokens'])}]
    raw_hash = digest(folder / 'forced-alignment-raw.json')
    analysis_view = {**validation['analysis_view'], 'resampler': 'FFmpeg aresample, mono 16 kHz before crop',
                     'model_crop_start_sample': clip_start,
                     'source_crop_rounding_error_samples': source_offset - clip_start * sr / 16000}
    for row in validation['candidates']:
        result['observations'].append({
          'id': f"{asset['id']}:aligned-word:{row['model_token_index']}",
          'kind': 'hapa.audio.word_candidate', 'claim_type': 'model_inferred',
          'subject_id': asset['id'], 'timeline_id': asset['timeline_id'],
          'reference_sample_rate_hz': sr, 'shape': 'interval',
          'start_sample': row['start_sample'], 'end_sample': row['end_sample'],
          'payload': {'text': row['text'], 'normalized_text': row['normalized_text'],
                      'method': 'Qwen3 supplied-text alignment', 'supplied_token_index': row['supplied_token_index'],
                      'model_score': None, 'score_semantics': row['score_semantics']},
          'confidence': None, 'timing_uncertainty_samples': None, 'review_state': 'unreviewed',
          'provenance': {'run_id': manifest['id'], 'source_sha256': source['sha256'],
                         'model_revision': config['revision'], 'model_sha256': config['sha256']['model.safetensors'],
                         'package_version': version('mlx-audio'), 'analysis_view': analysis_view,
                         'evidence_asset_id': asset['id'], 'raw_evidence': 'forced-alignment-raw.json',
                         'raw_evidence_sha256': raw_hash, 'input_pcm_sha256': pcm_hash}})
    result['forced_alignment'] = {**validation, 'analysis_view': analysis_view,
       'source_asset_id': asset['id'], 'request': request, 'model_repository': config['repository'],
       'model_revision': config['revision'], 'raw_evidence_sha256': raw_hash,
       'input_pcm_sha256': pcm_hash, 'inference_skipped': raw['inference_skipped'],
       'notice': 'Supplied words placed against audio; not proof these words were performed. Zero-duration and unsupported words remain unresolved.'}
    result['coverage']['forced_word_alignment'] = {'state': validation['status'], 'method': 'Qwen3 supplied-text alignment',
       'candidate_count': len(validation['candidates']), 'unresolved_count': len(validation['unresolved']),
       'quality_qualified': False, 'scope': 'requested excerpt only', 'human_reviewed': False}
    elapsed = time.monotonic() - started
    result['forced_alignment']['elapsed_seconds'] = elapsed
    result['elapsed_seconds'] += elapsed
    master = result['assets'][0]
    result['real_time_factor'] = result['elapsed_seconds'] / (master['sample_count'] / master['sample_rate_hz'])
    if digest(source['path']) != source['sha256']:
        raise RuntimeError('Alignment source changed before publication')
    write(folder / 'result.json', result)
    print(json.dumps({'stage': 'alignment-complete', **result['coverage']['forced_word_alignment']}))


if __name__ == '__main__':
    main()
