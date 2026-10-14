import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateLivingLightRenderSnapshot} from '../../src/domain/echo-living-light-render-snapshot.js';

export async function verifyLivingLightPackageMedia(snapshot,packageRoot){
  validateLivingLightRenderSnapshot(snapshot);
  const root=await fs.realpath(packageRoot),seen=new Set(),files=[];
  for(const recipe of snapshot.recipes)for(const source of recipe.sources){
    if(seen.has(source.uri))continue;seen.add(source.uri);
    const file=await fs.realpath(path.join(root,source.uri));
    if(!file.startsWith(root+path.sep))throw Error('Living Light asset escapes its package.');
    const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==source.bytes)throw Error('Living Light asset size differs.');
    const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);
    if(hash.digest('hex')!==source.sha256)throw Error('Living Light asset digest differs.');
    files.push({...source,file});
  }
  return files;
}

/** Hapa-owned packaging adapter; native source stays in its existing owner. */
export async function packageHyperFramesLivingLight({snapshot,packageRoot,output,root,buildRuntime}){
  const files=await verifyLivingLightPackageMedia(snapshot,packageRoot);
  await fs.mkdir(path.join(output,'assets/living-light'),{recursive:true});
  await fs.mkdir(path.join(output,'assets/data'),{recursive:true});
  for(const source of files){
    const target=path.join(output,source.uri),temporary=target+'.copy-'+randomUUID();
    try{await fs.copyFile(source.file,temporary);await fs.rename(temporary,target);}
    finally{await fs.rm(temporary,{force:true});}
  }
  // Check copied bytes too: a source can change between its check and copying.
  await verifyLivingLightPackageMedia(snapshot,output);
  const build=buildRuntime|| (await import('vite')).build;
  await build({configFile:false,root,build:{outDir:path.join(output,'assets/runtime'),emptyOutDir:false,
    lib:{entry:path.join(root,'src/living-light/director-snapshot.js'),formats:['es'],fileName:()=> 'living-light.js'}}});
  await fs.writeFile(path.join(output,'assets/data/living-light.json'),JSON.stringify(snapshot));
  await fs.writeFile(path.join(output,'assets/data/living-light.js'),'window.HAPA_LIVING_LIGHT_SNAPSHOT='+JSON.stringify(snapshot).replaceAll('<','\\u003c')+';\n');
  return {snapshotDigest:snapshot.snapshotDigest,mediaCount:files.length,captureRoute:'hapa-prepared-electron-v1'};
}
