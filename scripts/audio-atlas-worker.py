#!/usr/bin/env python3
"""Local Atlas measurements. Existing Echo DSP/reconstruction remains the owner."""
import argparse, hashlib, json, os, platform, shutil, signal, subprocess, sys, time
from pathlib import Path
import numpy as np
from echo_audio_analysis_cache import transient_events
from echo_reconstruction_alignment import reconstruction_waveform_alignment
from audio_atlas_stem_alignment import stem_alignment
from audio_atlas_spectrogram import spectrogram
from audio_atlas_harmony import analyze_harmony
from audio_atlas_technical import technical, loudness_args, parse_loudness
from audio_atlas_structure import analyze_structure, structure_observations

VERSION = 'hapa.audio-atlas.measurements.v2'
MAX_SECONDS = 1800

def sha(file):
    h = hashlib.sha256()
    with open(file, 'rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''): h.update(b)
    return h.hexdigest()

def command(args, timeout=120, stderr=False):
    # No shell, recursive Python/Node entry, model loading, or network protocol.
    result = subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, env={k: os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ})
    return result.stderr if stderr else result.stdout

def write(file, data):
    tmp = file.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, allow_nan=False, separators=(',',':')))
    tmp.replace(file)

WHISPER_RETRY_GAINS = (1.0, .5, .25)

def finite_json(value):
    """Raw evidence stays JSON-compliant: non-finite model scalars become null."""
    if isinstance(value, dict): return {k: finite_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [finite_json(v) for v in value]
    if isinstance(value, (float, np.floating)): return float(value) if np.isfinite(value) else None
    if isinstance(value, np.integer): return int(value)
    return value

def nonfinite_segments(transcript):
    return [s for s in transcript.get('segments', []) if not np.isfinite(float(s.get('avg_logprob', 0.)))]

def transcribe_finite(transcribe, samples, gains=WHISPER_RETRY_GAINS):
    """The 4-bit Whisper decoder can emit NaN logits for particular 30 s windows
    (token 0 "!" loops with avg_logprob NaN). That is input-exact, so a quieter
    copy of the same audio decodes normally. Keep the attempt with the fewest
    NaN windows, then drop any that remain instead of publishing their junk."""
    best = None; attempts = []
    for gain in gains:
        transcript = transcribe(samples if gain == 1.0 else samples * np.float32(gain))
        bad = len(nonfinite_segments(transcript)); attempts.append({'input_gain': gain, 'nonfinite_segments': bad})
        if best is None or bad < best[1]: best = (transcript, bad, gain)
        if not bad: break
    transcript, _, gain = best
    dropped = nonfinite_segments(transcript)
    dropped_ids = {id(s) for s in dropped}
    transcript = {**transcript, 'segments': [s for s in transcript.get('segments', []) if id(s) not in dropped_ids]}
    if dropped: transcript['text'] = ''.join(s.get('text', '') for s in transcript['segments'])
    return transcript, {'input_gain': gain, 'attempts': attempts, 'dropped_nonfinite_segments': len(dropped)}

def features(pcm, sr):
    hop = max(1, round(sr / 10))
    frames = []
    previous = 0.
    for start in range(0, len(pcm), hop):
        window = pcm[start:start+hop].astype(np.float64)
        rms = np.sqrt(np.mean(window * window, axis=0))
        peak = np.max(np.abs(window), axis=0)
        mono = np.mean(window, axis=1)
        spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
        frequencies = np.fft.rfftfreq(len(mono), 1/sr)
        energy = float(np.sqrt(np.mean(mono*mono)))
        frames.append({'start_sample':start,'end_sample':start+len(window),
          'rms':rms.tolist(),'peak':peak.tolist(),'minimum':np.min(window,axis=0).tolist(),
          'maximum':np.max(window,axis=0).tolist(), 'onset_strength':max(0.,energy-previous),
          'spectral_centroid_hz':float(np.dot(spectrum,frequencies)/spectrum.sum()) if spectrum.sum()>1e-12 else None})
        previous = energy
    return {'hop_samples':hop,'window_samples':hop,'centered':False,'first_frame_sample':0,
            'units':{'rms':'linear full scale','peak':'linear full scale','spectral_centroid_hz':'Hz'},
            'normalization':'none','channel_axis':'source channel order','frames':frames}

def main():
    if os.environ.get('HAPA_AUDIO_ATLAS_WORKER') != '1': raise ValueError('Worker requires its owner role')
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);args=p.parse_args()
    manifest=json.loads(Path(args.manifest).read_text()); out=Path(args.manifest).parent
    started=time.monotonic(); ffmpeg=shutil.which('ffmpeg');ffprobe=shutil.which('ffprobe')
    if not ffmpeg or not ffprobe: raise ValueError('Existing ffmpeg and ffprobe are required')
    result={'schema_version':VERSION,'run_id':manifest['id'],'song_id':manifest['song']['id'],
      'title':manifest['song']['title'],'policy':{'scope':'local-private','external_upload':False},
      'runtime':{'python':platform.python_version(),'numpy':np.__version__,
        'ffmpeg':command([ffmpeg,'-version'],15).decode().splitlines()[0], 'ffmpeg_sha256':sha(ffmpeg)},
      'assets':[],'observations':[],'coverage':{},'supplied_lyrics':manifest['song']['lyrics'],
      'imported_word_candidates':manifest['song'].get('lyricTimings',[]),
      'word_timing_notice':'Existing imported candidates; matched=false remains interpolation. Source alignment is not newly verified.'}
    master=None; reconstruction=None; reconstruction_count=0; vocal_source=None
    for index, source in enumerate(manifest['sources']):
        write(out/'progress.json',{'stage':'analyzing','completed':index,'total':len(manifest['sources']),'role':source['role']})
        asset={'id':source['id'],'role':source['role'],'source_sha256':source['sha256'],'source_uri':source['uri'], 'claim_type':'measured'}
        temp=out/f'decode-{index}.f32'
        try:
            if sha(source['path']) != source['sha256']: raise ValueError('source_changed_before_decode')
            probe=json.loads(command([ffprobe,'-v','error','-select_streams','a:0','-show_entries','stream=sample_rate,channels:format=duration','-of','json',source['path']],15))
            stream=probe['streams'][0];sr=int(stream['sample_rate']);channels=int(stream['channels']);duration=float(probe['format']['duration'])
            if not (0<duration<=MAX_SECONDS and 1<=channels<=8 and 8000<=sr<=192000 and duration*sr*channels*4<=512*1024**2): raise ValueError('source_exceeds_bounded_decode_budget')
            command([ffmpeg,'-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',source['path'],'-map','0:a:0','-t',str(MAX_SECONDS+1),'-f','f32le','-acodec','pcm_f32le','-y',str(temp)])
            if temp.stat().st_size>512*1024**2: raise ValueError('decoded_byte_budget_exceeded')
            pcm=np.memmap(temp,dtype='<f4',mode='r').reshape(-1,channels)
            if not len(pcm) or not np.all(np.isfinite(pcm)): raise ValueError('invalid_pcm')
            asset.update({'status':'ready','sample_rate_hz':sr,'channels':channels,'sample_count':len(pcm),
              'decoded_sha256':sha(temp),'decoder_delay_policy':'ffmpeg container skip/discard metadata; no additional trim',
              'timeline_id':f"pcm:{sha(temp)}:{sr}:{channels}",
              'time_map':{'kind':'identity','numerator':1,'denominator':1,'offset_samples':0,'rounding':'nearest',
                          'target':'own decoded timeline','master_alignment':'identity' if index==0 else 'unverified'},
              'features':features(pcm,sr)})
            technical_result=technical(pcm,sr)
            technical_result.update({'source_asset_id':asset['id'],'source_sha256':asset['source_sha256'],'timeline_id':asset['timeline_id']})
            if channels in (1,2):
                try:
                    raw=command(loudness_args(ffmpeg,temp,sr,channels),120,stderr=True)
                    technical_result['loudness']=parse_loudness(raw,len(pcm),sr,channels)
                except Exception as e:
                    technical_result['loudness']={'status':'failed','reason':str(e)[:500]}
            else:
                technical_result['loudness']={'status':'unsupported','reason':'Only explicit mono/stereo weighting is qualified in this profile.'}
            asset['technical']=technical_result
            spectrum, pixels=spectrogram(pcm,sr)
            spectral_file=out/f"spectrogram-{source['id']}.u8"
            pixels.tofile(spectral_file);del pixels
            spectrum.update({'source_asset_id':asset['id'],'source_sha256':asset['source_sha256'],
                'timeline_id':asset['timeline_id'],'artifact':spectral_file.name,
                'artifact_sha256':sha(spectral_file),'byte_length':spectral_file.stat().st_size})
            asset['spectrogram']=spectrum
            # Bounded 8 kHz analysis view. Its rational coordinate map is explicit.
            stride=max(1,sr//8000); analysis_rate=sr/stride
            mono=np.mean(pcm[::stride],axis=1).astype(np.float32)
            for event in transient_events(mono,analysis_rate):
                sample=min(len(pcm)-1,round(event['atSeconds']*sr))
                result['observations'].append({'id':f"{source['id']}:transient:{sample}",'kind':'hapa.audio.transient',
                  'claim_type':'derived','subject_id':source['id'],'timeline_id':asset['timeline_id'],
                  'reference_sample_rate_hz':sr,'start_sample':sample,'end_sample':sample,'shape':'instant',
                  'payload':{'strength':event['strength'],'method':event['method']},
                  'provenance':{'run_id':manifest['id'],'source_sha256':source['sha256'],'analysis_view':{'stride':stride,'anti_alias_filter':False,'purpose':'energy transients'},'evidence_asset_id':source['id']},
                  'confidence':None,'timing_uncertainty_samples':None,'review_state':'unreviewed'})
            # Use the established Echo reconstruction diagnostic at 8 kHz.
            low=out/f'low-{index}.f32'
            command([ffmpeg,'-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',source['path'],'-t',str(MAX_SECONDS+1),'-ac','1','-ar','8000','-f','f32le','-y',str(low)])
            samples=np.fromfile(low,dtype='<f4');low.unlink()
            if index==0:
                master=samples; reconstruction=np.zeros_like(master)
                harmony_started=time.monotonic()
                harmony=analyze_harmony(samples,sr,asset['sample_count'])
                harmony.update({'source_sha256':asset['source_sha256'],'timeline_id':asset['timeline_id'],
                    'runtime':{'helper_sha256':sha(Path(__file__).with_name('audio_atlas_harmony.py')),'analysis_input_sha256':hashlib.sha256(samples.astype('<f4').tobytes()).hexdigest()},
                    'elapsed_seconds':time.monotonic()-harmony_started})
                result['harmony_analysis']=harmony
                result['coverage']['harmony']={'state':'candidate','method':harmony['method'],'quality_qualified':False}
                structure=analyze_structure(samples,sr,asset['sample_count'])
                structure.update({'source_sha256':asset['source_sha256'],'timeline_id':asset['timeline_id']})
                write(out/'structure-raw.json',structure)
                structure.pop('_raw_features')
                structure.update({'raw_evidence':'structure-raw.json','raw_evidence_sha256':sha(out/'structure-raw.json')})
                result['musical_structure']=structure
                result['observations'].extend(structure_observations(structure,asset,manifest['id'],structure['raw_evidence_sha256']))
                result['coverage']['sections']={'state':'candidate','method':structure['method'],'quality_qualified':False,'functional_labels':False}

                # Immutable decoded reference evidence, retaining every source channel.
                del pcm
                temp.rename(out/'reference.f32')
            else:
                asset['alignment_evidence'] = stem_alignment(master, samples, 8000,
                    source_rate=sr, master_rate=result['assets'][0]['sample_rate_hz'],
                    source_count=asset['sample_count'], master_count=result['assets'][0]['sample_count'])
                asset['alignment_evidence'].update({'source_asset_id': asset['id'],
                    'source_timeline_id': asset['timeline_id'], 'source_sha256': source['sha256'],
                    'master_timeline_id': result['assets'][0]['timeline_id'],
                    'master_sha256': result['assets'][0]['source_sha256'],
                    'resampling': 'ffmpeg mono 8000 Hz; container skip/discard applied; no extra trim'})
                n=min(len(reconstruction),len(samples));reconstruction[:n]+=samples[:n];reconstruction_count+=1
                del pcm
            if sha(source['path']) != source['sha256']: raise ValueError('source_changed_during_decode')
        except Exception as e:
            if index==0: raise
            result['observations']=[o for o in result['observations'] if o['subject_id']!=source['id']]
            asset={'id':source['id'],'role':source['role'],'source_sha256':source['sha256'],'status':'failed','error':str(e)[:500]}
        finally:
            temp.unlink(missing_ok=True)
            (out/f'low-{index}.f32').unlink(missing_ok=True)
        result['assets'].append(asset)
        if source['role'].lower() in ('vocals','lead vocals') and asset['status']=='ready': vocal_source=(source,asset)
    if reconstruction_count:
        result['stem_alignment']={**reconstruction_waveform_alignment(master,reconstruction,8000),
          'stem_count':reconstruction_count,'declared_stem_count':len(manifest['sources'])-1,
          'residual_rms':float(np.sqrt(np.mean((master-reconstruction)**2))),
          'master_rms':float(np.sqrt(np.mean(master**2))), 'alignment_applied':False}
    else: result['stem_alignment']={'status':'not_available','alignment_applied':False}
    result['individual_stem_alignment'] = [a['alignment_evidence'] for a in result['assets'] if 'alignment_evidence' in a]
    result['coverage']['individual_stem_alignment'] = {'state': 'candidate' if result['individual_stem_alignment'] else 'not_available',
        'method': 'per-stem windowed PCM lag/drift evidence', 'alignment_applied': False, 'quality_qualified': False,
        'evaluated_stems': len(result['individual_stem_alignment']), 'declared_stems': len(manifest['sources'])-1}
    for name in ['waveform','rms','sample_peak','spectral_centroid','transients','spectrogram']:
        result['coverage'][name]={'state':'complete' if all(a['status']=='ready' for a in result['assets']) else 'partial','method':VERSION}
    result['coverage']['technical_audio']={'state':'complete' if all(a.get('technical',{}).get('loudness',{}).get('status')=='complete' for a in result['assets']) else 'partial','method':'hapa.pcm-technical.v1; FFmpeg loudnorm input statistics','noise_isolated':False,'clipping_confirmed':False}
    result['coverage']['word_timing']={'state':'imported_unverified','method':'existing Echo lyric candidates','new_inference':False}
    for name in ['phonemes','syllables','beats','downbeats','semantic_audio','acoustic_embeddings','notes','diarization']:
        result['coverage'][name]={'state':'unsupported','reason':'No qualified adapter wired in this profile; no inferred absence.'}
    if manifest.get('model'):
        write(out/'progress.json',{'stage':'transcribing','completed':len(result['assets']),'total':len(result['assets']),'role':'MLX Whisper vocal candidate'})
        source,asset=vocal_source or (manifest['sources'][0],result['assets'][0])
        asr_audio=out/'asr-16000.f32'
        try:
            # Local array input prevents mlx_whisper from spawning its own unbounded decoder.
            command([ffmpeg,'-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',source['path'],'-t',str(MAX_SECONDS+1),'-ac','1','-ar','16000','-f','f32le','-y',str(asr_audio)])
            samples=np.fromfile(asr_audio,dtype='<f4')
            model=manifest['model'];model_path=Path(model['path'])
            if sha(model_path/'weights.npz')!=model['weights_sha256'] or sha(model_path/'config.json')!=model['config_sha256']: raise ValueError('model_changed')
            import socket
            def denied(*args,**kwargs): raise RuntimeError('Atlas inference has networking disabled')
            socket.socket.connect=denied
            import mlx_whisper
            from importlib.metadata import version
            transcript,decode=transcribe_finite(lambda audio: mlx_whisper.transcribe(audio,path_or_hf_repo=str(model_path),word_timestamps=True,language='en',temperature=0.,condition_on_previous_text=False,verbose=None),samples)
            transcript=finite_json(transcript)
            write(out/'whisper-raw.json',transcript)
            words=[]
            for segment in transcript.get('segments',[]):
                for word in segment.get('words',[]):
                    if word.get('start') is None or word.get('end') is None: continue
                    start=round(float(word['start'])*asset['sample_rate_hz']);end=round(float(word['end'])*asset['sample_rate_hz'])
                    if not 0<=start<end<=asset['sample_count']: continue
                    observation={'id':f"{asset['id']}:word:{len(words)}",'kind':'hapa.audio.word_candidate','claim_type':'model_inferred',
                      'subject_id':asset['id'],'timeline_id':asset['timeline_id'],'reference_sample_rate_hz':asset['sample_rate_hz'],
                      'start_sample':start,'end_sample':end,'shape':'interval','payload':{'text':word['word'],'model_score':word.get('probability'),'score_semantics':'uncalibrated Whisper word probability'},
                      'provenance':{'run_id':manifest['id'],'source_sha256':source['sha256'],'model_revision':model['revision'],'weights_sha256':model['weights_sha256'],
                        'analysis_view':{'sample_rate_hz':16000,'channels':1,'map_numerator':asset['sample_rate_hz'],'map_denominator':16000,'offset_samples':0,'rounding':'nearest'},'evidence_asset_id':asset['id'],'raw_evidence':'whisper-raw.json','raw_evidence_sha256':sha(out/'whisper-raw.json')},
                      'confidence':None,'timing_uncertainty_samples':None,'review_state':'unreviewed'}
                    words.append(observation)
            result['observations'].extend(words)
            result['transcript_candidate']={'text':transcript.get('text',''),'source_asset_id':asset['id'],'word_count':len(words),
              'method':'mlx-whisper word timestamps','model_revision':model['revision'],'weights_sha256':model['weights_sha256'],
              'package_version':version('mlx-whisper'),'language':'en','quality_qualified':False,'network':'disabled','source_timeline_only':True,'decode':decode}
            result['coverage']['word_timing']={'state':'candidate','method':'MLX Whisper word timestamps','new_inference':True,'human_reviewed':False,'phoneme_or_syllable_timing':False}
        except Exception as e:
            result['coverage']['word_timing']={'state':'failed','error':str(e)[:500],'imported_candidates_preserved':True}
        finally: asr_audio.unlink(missing_ok=True)
    result['elapsed_seconds']=time.monotonic()-started
    result['real_time_factor']=result['elapsed_seconds']/(len(master)/8000)
    write(out/'result.json',result)
    write(out/'progress.json',{'stage':'complete','completed':len(result['assets']),'total':len(result['assets'])})

if __name__=='__main__':
    signal.alarm(590)
    main()
