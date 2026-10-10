#!/usr/bin/env python3
"""Bounded offline Qwen3-Omni excerpt listener. Original audio is never written."""
import argparse, hashlib, json, math, os, signal, socket, subprocess, sys, time
from pathlib import Path
from importlib.metadata import version

def sha(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def write(file,value):
    temp=file.with_suffix('.tmp');temp.write_text(json.dumps(value,allow_nan=False,separators=(',',':')));temp.replace(file)

def main():
    if os.environ.get('HAPA_AUDIO_ATLAS_WORKER')!='1':raise RuntimeError('Owner worker role required')
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);args=p.parse_args()
    signal.alarm(570);began=time.monotonic();manifest_file=Path(args.manifest);folder=manifest_file.parent;m=json.loads(manifest_file.read_text());c=m['config'];req=m['request'];source=m['source']
    def progress(stage,completed):
        value={'stage':stage,'completed':completed,'total':5,'role':'Local audio description'};write(folder/'progress.json',value);print(json.dumps(value),flush=True)
    blocked=[]
    for host in ['127.0.0.1','192.0.2.1']:
        with socket.socket() as s:
            s.settimeout(1)
            try:s.connect((host,8100 if host=='127.0.0.1' else 443))
            except PermissionError:blocked.append(host)
            else:raise RuntimeError('Required OS network denial is not active')
    def network_guard(event,args):
        if event in ('socket.connect','socket.getaddrinfo'):raise RuntimeError('Atlas inference networking is disabled')
    sys.addaudithook(network_guard)
    progress('verifying source',0)
    if sha(source['path'])!=req['source_sha256'] or source['sha256']!=req['source_sha256']:raise RuntimeError('Preserved source changed')
    if sha(sys.executable)!=c['python_sha256']:raise RuntimeError('Python executable changed')
    if not (1<=source['channels']<=8 and source['sample_count']*source['channels']*4<=512*1024**2):raise RuntimeError('Decoded source exceeds budget')
    temp=folder/'description-decode.f32'
    pcm_path=Path(source['pcm_path']) if source.get('pcm_path') else temp
    try:
        if pcm_path==temp:
            if sha(c['ffmpeg'])!=c['ffmpeg_sha256']:raise RuntimeError('Decoder changed')
            cmd=[c['ffmpeg'],'-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',source['path'],'-map','0:a:0','-t','1801','-f','f32le','-acodec','pcm_f32le','-y',str(temp)]
            subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=120,env={**{k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ},'HAPA_AUDIO_ATLAS_DECODER':'1'})
        if pcm_path.stat().st_size!=source['sample_count']*source['channels']*4 or sha(pcm_path)!=req['decoded_sha256']:raise RuntimeError('Decoded timeline differs from saved analysis')
        # The only permitted child (FFmpeg) is now terminal. Imports/inference may not spawn.
        def process_guard(event,args):
            if event in ('subprocess.Popen','os.system','os.fork','os.posix_spawn'):raise RuntimeError('Atlas listener may not create further processes')
        sys.addaudithook(process_guard)
        import numpy as np
        import scipy.signal
        progress('preparing excerpt',1)
        start,end=req['start_sample'],req['end_sample'];sr=req['source_sample_rate_hz']
        if not (isinstance(start,int) and isinstance(end,int) and 0<=start<end<=source['sample_count'] and end-start<=30*sr):raise RuntimeError('Invalid bounded source range')
        pcm=np.memmap(pcm_path,dtype='<f4',mode='r').reshape(-1,source['channels'])
        mono=pcm[start:end].mean(axis=1,dtype=np.float32)
        if not np.all(np.isfinite(mono)):raise RuntimeError('Nonfinite source audio')
        g=math.gcd(sr,16000);audio=scipy.signal.resample_poly(mono,16000//g,sr//g,window=('kaiser',5.0),padtype='constant').astype(np.float32)
        audio.tofile(folder/'model-input.f32');del pcm
        stats={'sha256':sha(folder/'model-input.f32'),'sample_rate_hz':16000,'channels':1,'sample_count':len(audio),'rms':float(np.sqrt(np.mean(audio.astype(np.float64)**2))),'peak':float(np.max(np.abs(audio))),'nonzero_sample_count':int(np.count_nonzero(audio))}
        raw={'manifest_sha256':sha(manifest_file),'worker_sha256':sha(__file__),'prompt':m['prompt'],'model_revision':c['revision'],'source_sha256':req['source_sha256'],'decoded_sha256':req['decoded_sha256'],'input_evidence':stats,'input_view':{'channel_policy':'arithmetic mean; no normalization','resampling':'scipy.signal.resample_poly Kaiser5 constant zero boundary','map_numerator':sr,'map_denominator':16000,'source_offset_samples':start},'network':{'os_sandbox':'deny network*','denied_connects':blocked,'python_audit':'socket and process creation denied','offline_env':{k:os.environ.get(k) for k in ['HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','HF_HUB_DISABLE_TELEMETRY']}},'packages':{k:version(k) for k in ['mlx','mlx-vlm','mlx-lm','transformers','torch','numpy','scipy']},'speech_generated':False,'model_executed':False,'response':'','eos_observed':True,'token_count':0,'inference_seconds':0}
        if stats['nonzero_sample_count']:
            progress('verifying model and runtime',2)
            for name,expected in c['sha256'].items():
                if sha(Path(c['modelPath'])/name)!=expected:raise RuntimeError('Semantic model hash mismatch: '+name)
            for name,expected in c['code_sha256'].items():
                if sha(Path(c['code_root'])/name)!=expected:raise RuntimeError('Semantic runtime code changed: '+name)
            import torch
            torch.set_num_threads(1);torch.set_num_interop_threads(1)
            import mlx.core as mx
            from mlx_vlm import load
            mx.random.seed(m['seed']);progress('loading local listener',3)
            model,processor=load(c['modelPath'],trust_remote_code=False,local_files_only=True)
            conversation=[{'role':'user','content':[{'type':'audio','audio':'source-excerpt'},{'type':'text','text':m['prompt']}]}]
            rendered=processor.apply_chat_template(conversation,add_generation_prompt=True,tokenize=False)
            inputs=processor(text=[rendered],audio=[audio],return_tensors='pt',padding=True,use_audio_in_video=False)
            mi={k:mx.array(v.numpy()) if hasattr(v,'numpy') else v for k,v in inputs.items()}
            if 'feature_attention_mask' in mi:mi['audio_feature_lengths']=mi['feature_attention_mask'].sum(axis=1).astype(mx.int32)
            progress('describing excerpt',4);started=time.monotonic()
            answer,speech=model.generate(mi['input_ids'],return_audio=False,thinker_max_new_tokens=min(1100,m['max_tokens']),thinker_temperature=0.0,**{k:mi[k] for k in ['input_features','feature_attention_mask','audio_feature_lengths'] if k in mi})
            tokens=answer.sequences[0,mi['input_ids'].shape[-1]:].tolist()
            raw.update({'model_executed':True,'rendered_prompt':rendered,'response':processor.decode(tokens,skip_special_tokens=True),'generated_token_ids':tokens,'token_count':len(tokens),'eos_observed':151645 in tokens,'speech_generated':speech is not None,'inference_seconds':time.monotonic()-started})
        if sha(source['path'])!=req['source_sha256']:raise RuntimeError('Preserved source changed during inference')
        raw['total_seconds']=time.monotonic()-began;write(folder/'raw.json',raw);progress('description complete',5)
    finally:
        if temp.exists():temp.unlink()
if __name__=='__main__':main()
