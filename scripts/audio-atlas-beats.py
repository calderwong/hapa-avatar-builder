#!/usr/bin/env python3
"""Offline Beat This CPU adapter. Same owner role; no process children."""
import os, json, sys, signal, socket, hashlib, time
from pathlib import Path
import numpy as np
from importlib.metadata import version
from audio_atlas_rhythm import analyze_rhythm

def digest(file):
 h=hashlib.sha256()
 with open(file,'rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def main():
 if os.environ.get('HAPA_AUDIO_ATLAS_WORKER')!='1':raise RuntimeError('Owner role required')
 signal.alarm(590)
 started=time.monotonic();manifest=json.loads(Path(sys.argv[2]).read_text());folder=Path(sys.argv[2]).parent
 config=manifest['beats'];checkpoint=Path(config['checkpoint'])
 if not checkpoint.is_file() or digest(checkpoint)!=config['sha256']:raise RuntimeError('Beat model missing or changed')
 def denied(*args,**kwargs):raise RuntimeError('Atlas inference networking is disabled')
 socket.socket.connect=denied
 import torch
 torch.set_num_threads(1);torch.set_num_interop_threads(1)
 from beat_this.inference import Audio2Beats
 result=json.loads((folder/'result.json').read_text());asset=result['assets'][0]
 pcm=np.memmap(folder/'reference.f32',dtype='<f4',mode='r').reshape(-1,asset['channels'])
 signal_mono=np.mean(pcm,axis=1,dtype=np.float32)
 tracker=Audio2Beats(checkpoint_path=str(checkpoint),device='cpu',float16=False,dbn=False)
 with torch.inference_mode():beats,downbeats=tracker(signal_mono,asset['sample_rate_hz'])
 raw={'beats_seconds':np.asarray(beats).tolist(),'downbeats_seconds':np.asarray(downbeats).tolist(),'model_sha256':config['sha256'],'model':'Beat This final0','package_version':version('beat-this'),'torch_version':version('torch'),'device':'cpu','network':'disabled','elapsed_seconds':time.monotonic()-started}
 (folder/'beat-this-raw.json').write_text(json.dumps(raw,allow_nan=False))
 evidence_hash=digest(folder/'beat-this-raw.json')
 for name,values in [('beat',beats),('downbeat',downbeats)]:
  for index,seconds in enumerate(values):
   sample=round(float(seconds)*asset['sample_rate_hz'])
   if not 0<=sample<asset['sample_count']:continue
   result['observations'].append({'id':f"master:{name}:{index}",'kind':f'hapa.audio.{name}_candidate','claim_type':'model_inferred','subject_id':'master','timeline_id':asset['timeline_id'],'reference_sample_rate_hz':asset['sample_rate_hz'],'shape':'instant','start_sample':sample,'end_sample':sample,'payload':{'text':name,'method':'Beat This final0 CPU minimal postprocessor'},'confidence':None,'timing_uncertainty_samples':None,'review_state':'unreviewed','provenance':{'run_id':manifest['id'],'source_sha256':asset['source_sha256'],'model_sha256':config['sha256'],'package_version':version('beat-this'),'evidence_asset_id':'master','raw_evidence':'beat-this-raw.json','raw_evidence_sha256':evidence_hash,'analysis_view':{'channels':1,'sample_rate_hz':22050,'resampler':'soxr HQ (upstream Audio2Frames)','map_numerator':asset['sample_rate_hz'],'map_denominator':22050,'offset_samples':0,'rounding':'nearest','time_origin':'upstream centered-spectrogram frame times'}}})
  result['coverage'][name+'s']={'state':'candidate','method':'Beat This final0 CPU','count':len(values),'human_reviewed':False,'quality_qualified':False}
 intervals=np.diff(np.asarray(beats,dtype=float));valid=intervals[intervals>0]
 result['beat_analysis']={**raw,'median_interbeat_bpm':float(60/np.median(valid)) if len(valid) else None,'quality_qualified':False,'notice':'Model candidates; meter and perceptual beat correctness require listening review.'}
 rhythm_started=time.monotonic();rhythm=analyze_rhythm(signal_mono,asset,result['observations']);rhythm.update({'elapsed_seconds':time.monotonic()-rhythm_started,'numpy_version':np.__version__,'beat_raw_evidence_sha256':evidence_hash,'helper_sha256':digest(Path(__file__).with_name('audio_atlas_rhythm.py'))})
 result['rhythm_analysis']=rhythm
 result['coverage']['rhythm']={'state':'candidate','method':rhythm['method'],'quality_qualified':False}
 result['elapsed_seconds']+=time.monotonic()-started;result['real_time_factor']=result['elapsed_seconds']/(asset['sample_count']/asset['sample_rate_hz'])
 temp=folder/'result.beats.tmp';temp.write_text(json.dumps(result,allow_nan=False,separators=(',',':')));temp.replace(folder/'result.json')
 print(json.dumps({'stage':'beats-complete','beats':len(beats),'downbeats':len(downbeats),'elapsed_seconds':raw['elapsed_seconds']}))
if __name__=='__main__':main()
