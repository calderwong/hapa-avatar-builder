// Read-only access to a previously prepared, master-bound Campfire spectrum.
// It never generates analysis, follows user-supplied paths or mutates the store.
import fs from 'node:fs';import path from 'node:path';
export function readCampfireSpectrum(root,result){
 const master=result?.assets?.find(asset=>asset.id==='master'),hash=String(master?.source_sha256||'').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(hash))throw Object.assign(Error('The Atlas master identity is unavailable.'),{statusCode:422});
 const file=path.join(root,'data','campfire-spectra',`${hash}.json`);let raw;
 try{const stat=fs.statSync(file);if(!stat.isFile()||stat.size>8*1024*1024)throw Error('invalid spectrum size');raw=fs.readFileSync(file,'utf8');}
 catch(error){if(error.code==='ENOENT')throw Object.assign(Error('No prepared Campfire spectrum for this master.'),{statusCode:404});throw error;}
 const value=JSON.parse(raw),frames=value?.frames;
 if(value.schema!=='echo-fire.master-spectrum.v1'||value.masterSha256!==hash||!Number.isFinite(value.hopSeconds)||value.hopSeconds<=0||!Array.isArray(frames)||frames.length<1||frames.length>20000||frames.some(frame=>!Array.isArray(frame)||frame.length!==32||frame.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))throw Object.assign(Error('Prepared Campfire spectrum is invalid or belongs to a different master.'),{statusCode:422});
 return value;
}
