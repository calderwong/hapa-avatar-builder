import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {echoProjectLivingLightCues} from '../src/domain/echo-living-light-cues.js';
import {createLivingLightService} from './living-light-service.mjs';
import {readEchoSavedCut} from './echo-saved-cut-reader.mjs';
import {prepareSongCardLivingLight} from './song-card-living-light.mjs';

/** Reuse the managed renderer's package before certifying an exact saved cut.
 * The derived certificate watches metadata and copied bytes; no authoring write. */
export async function prepareEchoReadinessLivingLight({project,root,variantsRoot,cacheRoot,signal,ownerFactory}={}) {
 if(!echoProjectLivingLightCues(project).length)return null;
 const owner=ownerFactory?ownerFactory():createLivingLightService({root,storePath:process.env.HAPA_LIVING_LIGHT_AUTHORING_STORE,
  resolveCut:(songId,cutId)=>readEchoSavedCut({root,variantsRoot,songId,cutId})});
 try {
  const prepared=await prepareSongCardLivingLight({project,root,owner,cacheRoot,signal});
  const evidence=[];
  for (const source of prepared.additionalSources) {
   const file=path.resolve(source.path),before=fs.statSync(file),hash=crypto.createHash('sha256');
   for await (const bytes of fs.createReadStream(file)) { signal?.throwIfAborted(); hash.update(bytes); }
   const after=fs.statSync(file);
   const key=stat=>['hapa.echo.living-light-input.v1',file,String(stat.dev),String(stat.ino),stat.size,stat.mtimeMs,stat.ctimeMs].join('\0');
   if(!after.isFile()||!after.size||key(before)!==key(after))throw Error('Living Light input changed during certification.');
   const digest='sha256:'+hash.digest('hex');
   if(source.expectedContentSha256&&source.expectedContentSha256!==digest)throw Error('Living Light input bytes differ from their package.');
   evidence.push({path:file,kind:source.inputRole,inputClass:source.inputRole,signatureKey:digest,statIdentityKey:key(after),routeBindings:[]});
  }
  return {...prepared,evidence};
 }finally{owner.close?.();}
}
