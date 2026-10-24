import {spawn} from 'node:child_process';
import {access,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// One direct child, no shell/fork, no inherited interpreter hooks or retries.
export function voiceChild(executable,args,{cwd,timeout=180000,signal,env={}}={}) {
  if(process.env.HAPA_AVATAR_VOICE_WORKER==='1') throw new Error('Voice workers cannot spawn workers.');
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('Cancelled'));
    const child=spawn(executable,args,{cwd,shell:false,env:{HOME:os.homedir(),PATH:'/opt/homebrew/bin:/usr/bin:/bin',LANG:'en_US.UTF-8',TMPDIR:os.tmpdir(),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false',OMP_NUM_THREADS:'4',HAPA_AVATAR_VOICE_WORKER:'1',...env},stdio:['ignore','ignore','pipe']});
    let stderr='',reason=null,killTimer;
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-3000);});
    const stop=()=>{reason=signal?.aborted?'Cancelled':'Audio operation timed out';child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);};
    const timer=setTimeout(stop,timeout);signal?.addEventListener('abort',stop,{once:true});
    const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
    child.on('error',e=>{cleanup();reject(e);});
    child.on('close',code=>{cleanup();if(reason||code!==0)reject(new Error(reason||`Audio engine failed (${code}): ${stderr.slice(-1000)}`));else resolve();});
  });
}
export function createOmniVoiceProvider(config={}) {
  const root=config.root||process.env.HAPA_OMNIVOICE_ROOT;
  const model=config.model||'k2-fsa/OmniVoice';
  const cache=config.cache||path.join(os.homedir(),'.cache/huggingface/hub');
  const python=root&&path.join(root,'.venv/bin/python');
  async function checkpoint(){
    const repoDir=path.join(cache,`models--${model.replaceAll('/','--')}`);
    const revision=path.isAbsolute(model)?path.basename(model):(config.revision||(await readFile(path.join(repoDir,'refs/main'),'utf8')).trim());
    if(!path.isAbsolute(model)&&!/^[a-f0-9]{40}$/.test(revision))throw new Error('OmniVoice checkpoint revision is invalid.');
    const modelDir=path.isAbsolute(model)?model:path.join(repoDir,'snapshots',revision);
    for(const file of ['config.json','tokenizer.json','model.safetensors','audio_tokenizer/config.json','audio_tokenizer/model.safetensors','audio_tokenizer/preprocessor_config.json']){
      const info=await stat(path.join(modelDir,file));if(!info.isFile()||info.size<2)throw new Error(`OmniVoice checkpoint is incomplete: ${file}`);
    }
    return {modelDir,revision};
  }
  async function status(){
    try{
      if(!root)throw new Error('OmniVoice owner has not been configured.');
      await access(python);
      const {revision}=await checkpoint();
      return {id:'omnivoice',ready:true,label:'OmniVoice · local reference cloning',model,revision,downloads:false};
    }catch(e){return {id:'omnivoice',ready:false,label:'OmniVoice · local reference cloning',model,downloads:false,error:e.code==='ENOENT'?'OmniVoice environment or model is missing. Captures and scripts can still be saved.':e.message};}
  }
  return {status,async generate({text,reference,transcript,output,signal}){
    const state=await status();if(!state.ready)throw new Error(state.error);
    const {modelDir,revision}=await checkpoint();
    await voiceChild(python,['-m','omnivoice.cli.infer','--model',modelDir,'--text',text,'--ref_audio',reference,'--ref_text',transcript,'--output',output,'--num_step','32','--device',config.device||'mps'],{cwd:root,signal,timeout:240000,env:{PYTHONPATH:root,HF_HUB_CACHE:cache}});
    const bytes=await readFile(output);if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Engine did not return a WAV file.');
    return {provider:'omnivoice',model,revision,steps:32,synthetic:true};
  }};
}
