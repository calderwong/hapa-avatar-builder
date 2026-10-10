#!/usr/bin/env python3
"""Existing Atlas lifecycle owns this offline pYIN worker and one serial decoder."""
import os,json,sys,signal,socket,hashlib,time,subprocess,shutil,platform
from pathlib import Path
from importlib.metadata import version
import numpy as np
from audio_atlas_pitch import track_pitch

def digest(file):
 h=hashlib.sha256()
 with open(file,'rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def save(file,value):
 temp=file.with_suffix('.tmp');temp.write_text(json.dumps(value,allow_nan=False,separators=(',',':')));temp.replace(file)
def main():
 if os.environ.get('HAPA_AUDIO_ATLAS_WORKER')!='1':raise RuntimeError('Owner role required')
 signal.alarm(590);started=time.monotonic();manifest=json.loads(Path(sys.argv[2]).read_text());folder=Path(sys.argv[2]).parent
 config=manifest['pitch_runtime'];request=manifest['pitch']
 actual={k:version(k) for k in config['packages']}
 if actual!=config['packages']:raise RuntimeError('Pinned pitch runtime package versions changed')
 os.environ['NUMBA_CACHE_DIR']=str(folder.parent.parent/'pitch-numba-cache')
 os.environ['NUMBA_NUM_THREADS']='1'
 def denied(*args,**kwargs):raise RuntimeError('Atlas pitch networking disabled')
 socket.socket.connect=denied
 result=json.loads((folder/'result.json').read_text());asset=next(a for a in result['assets'] if a['id']==request['sourceId']);source=next(s for s in manifest['sources'] if s['id']==asset['id']);channel=request['channel']
 if asset['status']!='ready' or channel>=asset['channels']:raise ValueError('Requested pitch source/channel unavailable')
 if digest(source['path'])!=asset['source_sha256']:raise ValueError('Pitch source bytes changed')
 temp=folder/'pitch-input.f32';ffmpeg=shutil.which('ffmpeg')
 if not ffmpeg:raise ValueError('Existing FFmpeg required')
 try:
  args=[ffmpeg,'-nostdin','-v','error','-xerror','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-i',source['path'],'-map','0:a:0','-t','1801','-af',f'pan=mono|c0=c{channel},aresample=16000:resampler=swr:filter_size=64:phase_shift=10:linear_interp=0:exact_rational=1:cutoff=0.95','-f','f32le','-acodec','pcm_f32le','-y',str(temp)]
  try:
   subprocess.run(args,check=True,timeout=120,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ})
  except subprocess.CalledProcessError as error:
   raise RuntimeError('Pitch decoder failed: '+error.stderr.decode('utf8',errors='replace')[-2000:]) from None
  if temp.stat().st_size>1801*16000*4:raise ValueError('Pitch decode budget exceeded')
  y=np.memmap(temp,dtype='<f4',mode='r')
  def progress(index,total):save(folder/'progress.json',{'stage':'pitch','role':f"{asset['role']} pitch candidates",'completed':index,'total':total})
  pitch=track_pitch(y,asset['sample_rate_hz'],asset['sample_count'],progress)
  pitch.update({'source_asset_id':asset['id'],'source_sha256':asset['source_sha256'],'timeline_id':asset['timeline_id'],'source_channel':channel,'source_channel_count':asset['channels'],
   'analysis_input_sha256':digest(temp),'resampling':'FFmpeg swr filter_size=64 phase_shift=10 linear_interp=0 exact_rational=1 cutoff=0.95 to 16000 Hz; selected source channel only; container skip/discard; no extra trim or gain',
   'runtime':{'python':platform.python_version(),'packages':actual,'ffmpeg_sha256':digest(ffmpeg),'worker_sha256':digest(__file__),'helper_sha256':digest(Path(__file__).with_name('audio_atlas_pitch.py')),'network':'disabled','model_weights':'none; pYIN numerical algorithm'},'elapsed_seconds':time.monotonic()-started})
  del y
  if digest(source['path'])!=asset['source_sha256']:raise ValueError('Pitch source changed during analysis')
  result['pitch_analysis']=pitch;result['coverage']['pitch']={'state':'candidate','method':pitch['method'],'source_asset_id':asset['id'],'quality_qualified':False,'polyphonic_separation':False}
  result['elapsed_seconds']+=pitch['elapsed_seconds'];result['real_time_factor']=result['elapsed_seconds']/(result['assets'][0]['sample_count']/result['assets'][0]['sample_rate_hz'])
  save(folder/'result.json',result)
  print(json.dumps({'stage':'pitch-complete','frames':pitch['frame_count'],'voiced_frames':pitch['voiced_frame_count'],'elapsed_seconds':pitch['elapsed_seconds']}))
 finally:temp.unlink(missing_ok=True)
if __name__=='__main__':main()
