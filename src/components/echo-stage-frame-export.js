// Shared Echo owner adapter for opaque fixed-step stage frames. It encodes one
// bounded video-only chunk; the caller owns checkpointing, durable publication,
// master-audio mux, source identity and eventual export admission.
import { createWebmMuxer } from '../domain/webm-muxer.js';
export const ECHO_STAGE_CHUNK_SCHEMA='hapa.echo.stage-video-chunk.v1';
export async function exportEchoStageChunk({stage,startFrame=0,endFrameExclusive,signal=null,onProgress=()=>{},maxBytes=128*1024*1024}={}) {
  const {width,height,fps,frameCount,key}=stage||{};
  if(!stage?.renderFrame||typeof key!=='string'||!key||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<64||height<64||width>3840||height>2160||![24,30,60].includes(fps)||
     !Number.isSafeInteger(frameCount)||!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(endFrameExclusive)||startFrame<0||endFrameExclusive<=startFrame||endFrameExclusive>frameCount||endFrameExclusive-startFrame>300||stage.position!==startFrame)
    throw Error('A compatible sequential stage and bounded frame range are required.');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024)throw Error('Invalid encoded chunk size limit.');
  if(typeof VideoEncoder!=='function'||typeof VideoFrame!=='function')throw Error('WebCodecs video encoding is unavailable.');
  const bitrate=Math.floor(Math.min(12_000_000,Math.max(800_000,8_000_000*(width*height/(1920*1080))**.75)));
  let codec='vp09.00.10.08',muxCodec='V_VP9';
  if(!(await VideoEncoder.isConfigSupported({codec,width,height,bitrate,framerate:fps})).supported){codec='vp8';muxCodec='V_VP8';if(!(await VideoEncoder.isConfigSupported({codec,width,height,bitrate,framerate:fps})).supported)throw Error('No supported VP8 or VP9 encoder for this stage profile.');}
  const muxer=createWebmMuxer({video:{codec:muxCodec,width,height}});let encoderError=null,encodedBytes=0;
  const encoder=new VideoEncoder({output(chunk){try{encodedBytes+=chunk.byteLength;if(encodedBytes>maxBytes)throw Error('Encoded chunk exceeds the declared limit.');const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);muxer.addVideoChunk({data,timestampUs:chunk.timestamp,keyframe:chunk.type==='key'});}catch(error){encoderError=error;}},error(error){encoderError=error;}});
  try{
    encoder.configure({codec,width,height,bitrate,framerate:fps,latencyMode:'quality'});
    for(let i=startFrame;i<endFrameExclusive;i++){
      if(signal?.aborted)throw signal.reason||new Error('Export cancelled.');if(encoderError)throw encoderError;
      const rendered=await stage.renderFrame(i);
      if(rendered?.index!==i||!rendered.canvas)throw Error('Stage returned the wrong frame.');
      const relative=i-startFrame,timestamp=Math.round(relative*1e6/fps),duration=Math.round((relative+1)*1e6/fps)-timestamp;
      const frame=new VideoFrame(rendered.canvas,{timestamp,duration});try{encoder.encode(frame,{keyFrame:relative===0||relative%(fps*2)===0});}finally{frame.close();}
      while(encoder.encodeQueueSize>6){if(signal?.aborted)throw signal.reason||new Error('Export cancelled.');if(encoderError)throw encoderError;await new Promise(resolve=>setTimeout(resolve,2));}
      onProgress({frame:i+1,endFrameExclusive});
    }
    await encoder.flush();if(encoderError)throw encoderError;
    const bytes=muxer.finalize({durationUs:Math.round((endFrameExclusive-startFrame)*1e6/fps)});
    if(bytes.byteLength>maxBytes)throw Error('Muxed chunk exceeds the declared limit.');
    return {blob:new Blob([bytes],{type:'video/webm'}),receipt:{schemaVersion:ECHO_STAGE_CHUNK_SCHEMA,key,startFrame,endFrameExclusive,width,height,fps,codec,bitrate,bytes:bytes.byteLength,audio:null,alpha:false}};
  } finally {if(encoder.state!=='closed')encoder.close();}
}
