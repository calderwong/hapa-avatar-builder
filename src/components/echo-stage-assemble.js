// Assemble verified, contiguous Echo stage video chunks with the exact PCM
// master into an opaque Matroska file. No audio decoding, resampling or mixing.
import {createWebmMuxer,readEbml,WEBM_IDS as ID} from '../domain/webm-muxer.js';
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const children=(bytes,node)=>readEbml(bytes,node.dataAt,node.dataAt+node.size);
const uint=(bytes,node)=>{let n=0;for(let i=node.dataAt;i<node.dataAt+node.size;i++)n=n*256+bytes[i];return n;};
function parseMaster(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),str=(i,n)=>String.fromCharCode(...bytes.subarray(i,i+n));
 if(bytes.length<44||str(0,4)!=='RIFF'||str(8,4)!=='WAVE'||v.getUint32(4,true)+8>bytes.length)throw Error('Expected a complete PCM WAV master.');
 let fmt=null,data=null;
 for(let p=12;p+8<=bytes.length;){const id=str(p,4),size=v.getUint32(p+4,true),begin=p+8,end=begin+size;if(end>bytes.length)throw Error('Truncated WAV chunk.');
  if(id==='fmt '){if(fmt||size<16)throw Error('Invalid WAV format chunk.');fmt={format:v.getUint16(begin,true),channels:v.getUint16(begin+2,true),rate:v.getUint32(begin+4,true),blockAlign:v.getUint16(begin+12,true),bits:v.getUint16(begin+14,true)};}
  if(id==='data'){if(data)throw Error('Multiple WAV data chunks are unsupported.');data=bytes.subarray(begin,end);}
  p=end+(size%2);
 }
 if(!fmt||!data||fmt.format!==1||fmt.bits!==16||![1,2].includes(fmt.channels)||fmt.rate<8000||fmt.rate>192000||fmt.blockAlign!==fmt.channels*2||data.length%fmt.blockAlign)throw Error('Expected uncompressed 16-bit mono or stereo PCM.');
 return {...fmt,data,samples:data.length/fmt.blockAlign};
}
function videoBlocks(bytes,receipt){
 const top=readEbml(bytes),segment=top.find(e=>e.id===ID.Segment);if(!segment||segment.dataAt+segment.size>bytes.length)throw Error('Invalid video chunk container.');
 const segmentParts=children(bytes,segment),tracks=segmentParts.find(e=>e.id===ID.Tracks);
 const entry=tracks&&children(bytes,tracks).find(e=>e.id===ID.TrackEntry);
 const track=entry&&children(bytes,entry),codecId=track?.find(e=>e.id===ID.CodecID),video=track?.find(e=>e.id===ID.Video),videoParts=video&&children(bytes,video);
 const codecName=codecId?new TextDecoder().decode(bytes.subarray(codecId.dataAt,codecId.dataAt+codecId.size)):'';
 const expectedCodec=receipt.codec==='vp8'?'V_VP8':'V_VP9';
 if(codecName!==expectedCodec||!videoParts||uint(bytes,videoParts.find(e=>e.id===ID.PixelWidth)||{dataAt:0,size:0})!==receipt.width||uint(bytes,videoParts.find(e=>e.id===ID.PixelHeight)||{dataAt:0,size:0})!==receipt.height)throw Error('Video track metadata does not match its receipt.');
 const blocks=[];
 for(const cluster of segmentParts.filter(e=>e.id===ID.Cluster)){
  const parts=children(bytes,cluster),clock=parts.find(e=>e.id===ID.Timecode);if(!clock)throw Error('Video cluster has no timecode.');const base=uint(bytes,clock);
  for(const block of parts.filter(e=>e.id===ID.SimpleBlock)){
   if(block.size<5||bytes[block.dataAt]!==0x81)throw Error('Unsupported stage video block.');
   const view=new DataView(bytes.buffer,bytes.byteOffset+block.dataAt,block.size),flags=view.getUint8(3);if(flags&0x06)throw Error('Laced stage frames are unsupported.');
   const localMs=base+view.getInt16(1),index=blocks.length,expectedMs=Math.round(Math.round(index*1e6/receipt.fps)/1000);
   if(localMs!==expectedMs)throw Error('Video chunk timestamps do not match the fixed frame grid.');
   blocks.push({data:bytes.slice(block.dataAt+4,block.dataAt+block.size),keyframe:Boolean(flags&0x80)});
  }
 }
 if(blocks.length!==receipt.endFrameExclusive-receipt.startFrame||!blocks[0]?.keyframe)throw Error('Video chunk frame count or starting keyframe is invalid.');
 return blocks;
}
export async function assembleEchoStageMatroska({manifest,chunks,masterBytes,masterSha256,sampleCount,maxBytes=384*1024*1024,signal=null,onProgress=()=>{}}={}){
 if(!manifest||typeof manifest.key!=='string'||!manifest.key||!Number.isSafeInteger(manifest.frameCount)||manifest.frameCount<1||!Number.isSafeInteger(manifest.chunkFrames)||manifest.chunkFrames<1||manifest.chunkFrames>300||![24,30,60].includes(manifest.fps)||!Number.isSafeInteger(manifest.width)||!Number.isSafeInteger(manifest.height)||!Array.isArray(chunks)||!(masterBytes instanceof Uint8Array)||!/^[a-f0-9]{64}$/i.test(masterSha256||'')||!Number.isSafeInteger(sampleCount)||sampleCount<1||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>384*1024*1024)throw Error('A bound whole-song manifest, chunks and master are required.');
 if(await sha256(masterBytes)!==masterSha256.toLowerCase())throw Error('Master SHA-256 mismatch.');
 const master=parseMaster(masterBytes);if(master.samples!==sampleCount)throw Error('Master sample count does not match the timeline.');
 if(manifest.frameCount!==Math.ceil(master.samples*manifest.fps/master.rate))throw Error('Video does not cover the complete master duration.');
 const needed=Math.ceil(manifest.frameCount/manifest.chunkFrames);if(chunks.length!==needed)throw Error('Complete contiguous video chunks are required.');
 const codec=chunks[0]?.receipt?.codec,muxCodec=codec==='vp8'?'V_VP8':codec==='vp09.00.10.08'?'V_VP9':null;if(!muxCodec)throw Error('Unsupported video codec.');
 const muxer=createWebmMuxer({container:'matroska',video:{codec:muxCodec,width:manifest.width,height:manifest.height},audio:{codec:'pcm_s16le',sampleRate:master.rate,channels:master.channels}});
 let total=masterBytes.byteLength;
 for(let i=0;i<needed;i++){
  if(signal?.aborted)throw signal.reason||Error('Assembly cancelled.');const row=chunks[i],r=row?.receipt,start=i*manifest.chunkFrames,end=Math.min(manifest.frameCount,start+manifest.chunkFrames);
  if(r?.schemaVersion!=='hapa.echo.stage-video-chunk.v1'||r.key!==manifest.key||r.startFrame!==start||r.endFrameExclusive!==end||r.width!==manifest.width||r.height!==manifest.height||r.fps!==manifest.fps||r.codec!==codec||r.audio!==null||r.alpha!==false||!(row.blob instanceof Blob)||r.bytes!==row.blob.size||!/^[a-f0-9]{64}$/i.test(row.blobSha256||''))throw Error('Chunk receipt is incompatible with the manifest.');
  total+=row.blob.size;if(total>maxBytes)throw Error('Assembly exceeds its declared input limit.');const bytes=new Uint8Array(await row.blob.arrayBuffer());if(await sha256(bytes)!==row.blobSha256.toLowerCase())throw Error('Video chunk SHA-256 mismatch.');
  const frames=videoBlocks(bytes,r);frames.forEach((frame,j)=>muxer.addVideoChunk({...frame,timestampUs:Math.round((start+j)*1e6/manifest.fps)}));onProgress({phase:'video',chunks:i+1,totalChunks:needed});
 }
 const blockSamples=4096;for(let i=0;i<master.samples;i+=blockSamples){if(signal?.aborted)throw signal.reason||Error('Assembly cancelled.');const end=Math.min(master.samples,i+blockSamples);muxer.addAudioChunk({data:master.data.subarray(i*master.blockAlign,end*master.blockAlign),timestampUs:Math.round(i*1e6/master.rate)});}
 const durationUs=Math.round(Math.max(manifest.frameCount/manifest.fps,master.samples/master.rate)*1e6),output=muxer.finalize({durationUs});if(output.length>maxBytes)throw Error('Assembled file exceeds its declared output limit.');
 return {blob:new Blob([output],{type:'video/x-matroska'}),receipt:{schemaVersion:'hapa.echo.stage-matroska.v1',key:manifest.key,frames:manifest.frameCount,fps:manifest.fps,videoCodec:codec,audioCodec:'pcm_s16le',audioSamples:master.samples,audioSampleRate:master.rate,audioChannels:master.channels,masterSha256:masterSha256.toLowerCase(),durationUs,bytes:output.length,sha256:await sha256(output)}};
}
