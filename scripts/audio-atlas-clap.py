#!/usr/bin/env python3
"""Offline audio/text CLAP embeddings with a bounded, declared concept vocabulary."""
import os,sys,json,signal,socket,hashlib,time
from pathlib import Path
import numpy as np
from importlib.metadata import version
CONCEPTS=['spoken voice','singing voice','instrumental music','drums and percussion','bass guitar','acoustic guitar','electric guitar','piano','synthesizer','orchestral strings','brass instruments','soft music','energetic music','silence','crowd applause','environmental noise']
def digest(file):
 h=hashlib.sha256()
 with open(file,'rb') as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def main():
 if os.environ.get('HAPA_AUDIO_ATLAS_WORKER')!='1':raise RuntimeError('Owner role required')
 signal.alarm(590);started=time.monotonic();manifest=json.loads(Path(sys.argv[2]).read_text());folder=Path(sys.argv[2]).parent
 config=manifest['clap'];modelpath=Path(config['modelPath'])
 for name,expected in config['sha256'].items():
  if digest(modelpath/name)!=expected:raise RuntimeError('CLAP model or tokenizer changed')
 def denied(*args,**kwargs):raise RuntimeError('Atlas inference networking is disabled')
 socket.socket.connect=denied
 import torch,soxr
 torch.set_num_threads(1);torch.set_num_interop_threads(1)
 from transformers import ClapModel,ClapProcessor
 model=ClapModel.from_pretrained(str(modelpath),local_files_only=True,trust_remote_code=False).eval()
 processor=ClapProcessor.from_pretrained(str(modelpath),local_files_only=True,trust_remote_code=False)
 if manifest.get('operation')=='text-query':
  signal.alarm(110)
  if version('transformers')!=manifest['package_version']:raise RuntimeError('Text/audio Transformers versions differ')
  if not isinstance(manifest.get('text'),str) or not 1<=len(manifest['text'])<=500:raise RuntimeError('Invalid text query')
  prompt='The sound of '+manifest['text']+'.'
  if manifest.get('prompt')!=prompt:raise RuntimeError('Prompt identity mismatch')
  space='laion/clap-htsat-unfused:'+config['revision']+':'+config['sha256']['pytorch_model.bin']
  if manifest['embedding_space']!=space:raise RuntimeError('Text/audio spaces differ')
  with torch.inference_mode():
   inputs=processor(text=[prompt],return_tensors='pt',padding=True,truncation=False)
   count=int(inputs['attention_mask'].sum())
   if count>128:raise RuntimeError('Description exceeds 128 model tokens; shorten it')
   embedding=torch.nn.functional.normalize(model.get_text_features(**inputs),dim=-1).numpy()[0]
  raw={'query':manifest['text'],'prompt':prompt,'embedding':embedding.tolist(),'embedding_space':space,'model_hashes':config['sha256'],'package_version':version('transformers'),'torch_version':version('torch'),'token_count':count,'network':'disabled','elapsed_seconds':time.monotonic()-started}
  temp=folder/'text-embedding.tmp';temp.write_text(json.dumps(raw,allow_nan=False));temp.replace(folder/'text-embedding.json')
  print(json.dumps({'stage':'text-query-complete','token_count':count,'elapsed_seconds':raw['elapsed_seconds']}));return
 with torch.inference_mode():
  text_inputs=processor(text=['The sound of '+label+'.' for label in CONCEPTS],return_tensors='pt',padding=True)
  text=model.get_text_features(**text_inputs);text=torch.nn.functional.normalize(text,dim=-1).numpy()
 result=json.loads((folder/'result.json').read_text());asset=result['assets'][0];sr=asset['sample_rate_hz']
 pcm=np.memmap(folder/'reference.f32',dtype='<f4',mode='r').reshape(-1,asset['channels'])
 rows=[]
 for index,start in enumerate(range(0,len(pcm),10*sr)):
  end=min(len(pcm),start+10*sr);mono=np.mean(pcm[start:end],axis=1,dtype=np.float32)
  if sr!=48000:mono=soxr.resample(mono,sr,48000)
  # Explicit zero padding for the final short window; no repeat-padding or random crop.
  mono=np.pad(mono,(0,max(0,480000-len(mono))))[:480000]
  with torch.inference_mode():
   inputs=processor(audios=mono,sampling_rate=48000,return_tensors='pt')
   embedding=model.get_audio_features(**inputs);embedding=torch.nn.functional.normalize(embedding,dim=-1).numpy()[0]
  scores=embedding@text.T
  rows.append({'id':f'master:acoustic:{index}','start_sample':start,'end_sample':end,'embedding':embedding.tolist(),'scores':{name:float(score) for name,score in zip(CONCEPTS,scores)}})
  progress={'stage':'acoustic','role':f'CLAP window {index+1}','completed':end,'total':len(pcm)}
  temp=folder/'progress.tmp';temp.write_text(json.dumps(progress));temp.replace(folder/'progress.json')
 space='laion/clap-htsat-unfused:'+config['revision']+':'+config['sha256']['pytorch_model.bin']
 raw={'schema_version':'hapa.audio.clap.v1','embedding_space':space,'concepts':CONCEPTS,'text_embeddings':text.tolist(),'windows':rows,'score_semantics':'cosine similarity; not probability or verified instrument presence','package_version':version('transformers'),'elapsed_seconds':time.monotonic()-started,'network':'disabled','model_hashes':config['sha256']}
 (folder/'clap-raw.json').write_text(json.dumps(raw,allow_nan=False));rawhash=digest(folder/'clap-raw.json')
 for row in rows:
  top=sorted(row['scores'].items(),key=lambda pair:pair[1],reverse=True)[:3]
  result['observations'].append({'id':row['id'],'kind':'hapa.audio.semantic_candidate','claim_type':'model_inferred','subject_id':'master','timeline_id':asset['timeline_id'],'reference_sample_rate_hz':sr,'start_sample':row['start_sample'],'end_sample':row['end_sample'],'shape':'interval','payload':{'text':', '.join(x[0] for x in top),'ranked_concepts':[{'concept':label,'cosine_similarity':score} for label,score in top],'score_semantics':raw['score_semantics']},'confidence':None,'timing_uncertainty_samples':None,'review_state':'unreviewed','provenance':{'run_id':manifest['id'],'source_sha256':asset['source_sha256'],'model_revision':config['revision'],'embedding_space':space,'raw_evidence':'clap-raw.json','raw_evidence_sha256':rawhash,'evidence_asset_id':'master','analysis_view':{'sample_rate_hz':48000,'channels':1,'crop_start_sample':row['start_sample'],'valid_samples':row['end_sample']-row['start_sample'],'right_padding':'zero to ten seconds','map_numerator':sr,'map_denominator':48000,'rounding':'nearest'}}})
 result['acoustic_index']=raw
 result['coverage']['semantic_audio']={'state':'candidate','method':'CLAP bounded-vocabulary zero-shot ranking','quality_qualified':False}
 result['coverage']['acoustic_embeddings']={'state':'complete','method':'CLAP matching audio and text encoders','embedding_space':space,'window_count':len(rows),'retrieval_quality_qualified':False}
 result['elapsed_seconds']+=raw['elapsed_seconds'];result['real_time_factor']=result['elapsed_seconds']/(len(pcm)/sr)
 temp=folder/'result.clap.tmp';temp.write_text(json.dumps(result,allow_nan=False,separators=(',',':')));temp.replace(folder/'result.json')
 print(json.dumps({'stage':'clap-complete','windows':len(rows),'elapsed_seconds':raw['elapsed_seconds']}))
if __name__=='__main__':main()
