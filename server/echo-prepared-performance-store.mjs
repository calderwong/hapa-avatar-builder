import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { normalizeHyperFramesStemRole } from '../src/domain/hyperframes-visualizer-runtime.js';
import {livingLightStemSelection} from '../src/domain/living-light-stem-selection.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plainHash = value => String(value || '').replace(/^sha256:/, '');
const assetPolicy = 'living-light-assets-v1';
const pointerName = (hash, policy, songId, selection=null) => policy === assetPolicy ? `assets-${hash}-${digest(songId)}${selection?'-'+livingLightStemSelection(selection):''}.json` : `master-${hash}.json`;
const error = (code, message) => Object.assign(new Error(message), { code, statusCode: 409 });
async function read(file, limit) {
  if ((await fs.stat(file)).size > limit) throw error('echo_performance_budget_exceeded', 'Prepared performance exceeds the read budget.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function atomic(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

/** Publication is a disposable cache, never a mutation of a song or saved cut. */
export async function publishEchoPerformance({ root, bundle, sourceChecks, maxPublishedEntries=512, maxPublishedBytes=2*1024**3 }) {
  if (!/^[a-f0-9]{64}$/.test(plainHash(bundle?.masterAudioHash))) throw error('echo_performance_master_mismatch', 'Publication needs an exact master hash.');
  const exact = bundle.sourcePolicy === assetPolicy;
  livingLightStemSelection(bundle.stemSelectionPolicy??null);
  if(bundle.stemSelectionPolicy&&!exact)throw error('echo_performance_policy_invalid','Coherent selection requires exact asset identity.');
  if (exact && (!bundle.songId || new Set(bundle.buses?.map(bus => bus.id)).size !== bundle.buses?.length || new Set(bundle.buses?.filter(bus => bus.id !== 'master').map(bus => bus.assetId)).size !== bundle.buses?.filter(bus => bus.id !== 'master').length)) throw error('echo_performance_asset_ambiguous', 'Unique exact asset identities are required.');
  if (!Array.isArray(sourceChecks) || !bundle.buses?.length || bundle.buses.length > 64 || bundle.buses.some(bus => {
    if(exact && bus.id !== 'master' && !bus.audioHash && bus.frames?.length === 0 && bus.status === 'missing-analysis') return !bus.assetId;
    return !sourceChecks.some(source => (exact ? (bus.id === 'master' ? source.role === 'master' && !source.assetId : source.assetId === bus.assetId) : normalizeHyperFramesStemRole(source.role) === bus.role) && source.sha256 === plainHash(bus.audioHash));
  })) throw error('echo_performance_source_unverified', 'Every available published audio bus needs matching source-byte evidence.');
  const value = { bundle, sourceChecks };
  if (Buffer.byteLength(JSON.stringify(value)) > 32 * 1024 * 1024) throw error('echo_performance_budget_exceeded', 'Prepared publication exceeds 32 MiB.');
  const key = digest(value);
  const directory = path.join(root, 'published');
  await fs.mkdir(directory, { recursive: true });
  if(!Number.isSafeInteger(maxPublishedEntries)||maxPublishedEntries<1||maxPublishedEntries>512||!Number.isSafeInteger(maxPublishedBytes)||maxPublishedBytes<1||maxPublishedBytes>2*1024**3)throw error('echo_performance_budget_invalid','Publication limits must be bounded.');
  const pointer=pointerName(plainHash(bundle.masterAudioHash),bundle.sourcePolicy,bundle.songId,bundle.stemSelectionPolicy);
  const referenced=async()=>{
    const refs=new Map();
    for(const name of await fs.readdir(directory)){
      if(!/^(?:assets-|master-).+\.json$/.test(name))continue;
      const record=await read(path.join(directory,name),1024);
      if(!/^[a-f0-9]{64}$/.test(record.key||''))throw error('echo_performance_cache_invalid','Publication pointer is invalid.');
      refs.set(name,record.key);
    }
    return refs;
  };
  const entries=[];
  for(const name of await fs.readdir(directory)){
    if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
    const info=await fs.stat(path.join(directory,name)).catch(()=>null);
    if(info)entries.push({name,bytes:info.size,modified:info.mtimeMs});
  }
  const refs=await referenced();refs.set(pointer,key);const protectedKeys=new Set(refs.values());
  const encodedBytes=Buffer.byteLength(JSON.stringify(value)),projected=entries.filter(e=>e.name!==key+'.json').concat({name:key+'.json',bytes:encodedBytes,modified:Date.now()});
  const pinned=projected.filter(e=>protectedKeys.has(e.name.slice(0,-5)));
  // Refuse before changing a pointer when the live source sets alone exceed the
  // budget. Never make a saved source unusable to admit a newer publication.
  if(pinned.length>maxPublishedEntries||pinned.reduce((n,e)=>n+e.bytes,0)>maxPublishedBytes)throw error('echo_performance_pinned_budget_exceeded','Live prepared source sets exceed the publication cache budget. Existing pointers were preserved.');
  await atomic(path.join(directory,`${key}.json`),value);
  await atomic(path.join(directory,pointer),{key});
  let bytes=projected.reduce((n,e)=>n+e.bytes,0),count=projected.length;
  for(const entry of projected.sort((a,b)=>a.modified-b.modified)){
    if(bytes<=maxPublishedBytes&&count<=maxPublishedEntries)break;
    if(entry.name===key+'.json')continue;
    // Re-read pointer ownership before each eviction, including publications
    // made by another owner while this operation was awaiting filesystem I/O.
    if(new Set((await referenced()).values()).has(entry.name.slice(0,-5)))continue;
    await fs.rm(path.join(directory,entry.name),{force:true});bytes-=entry.bytes;count--;
  }
  return { key, masterAudioHash: bundle.masterAudioHash };
}

/** Prepared loads verify the current audio sources. No decoder, analyzer or
 * model is invoked by opening a cut or seeking. Lyrics can rebind independently.
 */
export function createPreparedEchoPerformanceStore({ root, inspect = createEchoSourceInspector().inspect }) {
  const records = new Map();
  return {
    async load({ masterPath, stems = [], lyrics = {}, sourcePolicy = null, songId = null,stemSelectionPolicy=null }) {
      livingLightStemSelection(stemSelectionPolicy);
      const exact = sourcePolicy === assetPolicy;
      if(stemSelectionPolicy&&!exact)throw error('echo_performance_policy_invalid','Coherent selection requires exact asset identity.');
      if(sourcePolicy !== null && !exact) throw error('echo_performance_policy_invalid', 'Unsupported source policy.');
      if(exact && (!songId || stems.length > 32 || stems.some(stem => !stem.assetId) || new Set(stems.map(stem => stem.assetId)).size !== stems.length)) throw error('echo_performance_asset_ambiguous', 'Unique bounded exact selected assets required.');
      const master = await inspect(masterPath);
      if (master.status !== 'bytes-verified' || !master.audioHeaderRecognized) throw error('echo_performance_master_unavailable', 'The selected master audio cannot be verified.');
      let pointer;
      try { pointer = await read(path.join(root, 'published', pointerName(master.sha256, sourcePolicy, songId,stemSelectionPolicy)), 1024); }
      catch (cause) { if (cause.code === 'ENOENT') throw error('echo_performance_not_prepared', 'This exact master has no prepared performance bundle.'); throw cause; }
      if (!/^[a-f0-9]{64}$/.test(pointer.key || '')) throw error('echo_performance_cache_invalid', 'Prepared performance pointer is invalid.');
      const file = path.join(root, 'published', `${pointer.key}.json`);
      const info = await fs.stat(file).catch(cause => { if (cause.code === 'ENOENT') throw error('echo_performance_not_prepared', 'The prepared entry was evicted; prepare this audio again.'); throw cause; });
      const stamp = `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;
      let record = records.get(pointer.key);
      if (!record || record.stamp !== stamp) {
        const value = await read(file, 32 * 1024 * 1024);
        if (digest(value) !== pointer.key) throw error('echo_performance_cache_invalid', 'Prepared performance content hash changed.');
        record = { value, stamp }; records.set(pointer.key, record);
        while (records.size > 2) records.delete(records.keys().next().value);
      }
      const { bundle, sourceChecks } = record.value;
      if((bundle.stemSelectionPolicy??null)!==stemSelectionPolicy)throw error('echo_performance_source_policy_mismatch','Prepared stem selection differs from the requested set.');
      if (plainHash(bundle.masterAudioHash) !== master.sha256 || bundle.schemaVersion !== 'hapa.echo.music-performance.v1') throw error('echo_performance_master_mismatch', 'Prepared performance does not match the selected master.');
      if (exact && (bundle.sourcePolicy !== assetPolicy || bundle.songId !== songId)) throw error('echo_performance_source_policy_mismatch', 'Prepared asset bank belongs to another Song or source policy.');
      if (lyrics.audioHash && plainHash(lyrics.audioHash) !== master.sha256) throw error('echo_performance_lyric_master_mismatch', 'Lyrics were aligned against a different master revision.');
      if (!Array.isArray(sourceChecks) || sourceChecks.length > 65) throw error('echo_performance_cache_invalid', 'Prepared source inventory is invalid.');
      for (const source of sourceChecks) {
        const selectedSource = exact ? stems.find(stem => stem.assetId === source.assetId) : stems.find(stem => normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id) === normalizeHyperFramesStemRole(source.role));
        if(exact && source.assetId && !selectedSource?.audioPath) throw error('echo_performance_stem_revision_mismatch', 'An analyzed exact asset is no longer selected or locally resolved.');
        const isMaster = exact ? !source.assetId : source.role === 'master';
        const current = isMaster ? master : await inspect(selectedSource?.audioPath || source.path);
        if (current.status !== 'bytes-verified' || current.sha256 !== source.sha256) throw error(selectedSource?.audioPath && selectedSource.audioPath !== source.path ? 'echo_performance_stem_revision_mismatch' : 'echo_performance_source_changed', `Prepared ${source.role} source changed or is unavailable.`);
      }
      if(exact && (bundle.buses.filter(bus => bus.id !== 'master').length !== stems.length || bundle.buses.some(bus => bus.id !== 'master' && !stems.some(stem => stem.assetId === bus.assetId)))) throw error('echo_performance_stem_revision_mismatch', 'Selected asset declarations differ from the prepared bank.');
      // A cut cannot silently replace a stem while retaining old analysis.
      for (const stem of stems) {
        if (!stem.audioPath) {
          if(exact && bundle.buses.some(bus => bus.assetId === stem.assetId && (bus.audioHash || bus.frames?.length))) throw error('echo_performance_stem_revision_mismatch', 'An analyzed asset is now unavailable.');
          continue;
        }
        const role = normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id);
        const buses = bundle.buses.filter(bus => exact ? bus.assetId === stem.assetId : bus.role === role);
        const current = await inspect(stem.audioPath);
        if(exact && buses.length === 1 && !buses[0].audioHash && buses[0].frames?.length === 0 && ['missing-file','missing-reference','empty-or-nonfile','read-error'].includes(current.status)) continue;
        if (buses.length !== 1 || current.status !== 'bytes-verified' || plainHash(buses[0].audioHash) !== current.sha256) throw error('echo_performance_stem_revision_mismatch', `The selected ${role} stem has no matching prepared analysis.`);
      }
      const rebound = { ...structuredClone(bundle), lyrics: structuredClone(lyrics), baseFingerprint: bundle.fingerprint };
      rebound.fingerprint = `sha256:${digest({ base: pointer.key, lyrics })}`;
      return { performance: rebound, sourceValidation: { masterAudioHash: master.sha256, sourcesChecked: sourceChecks.length, analysisExecuted: false, checkedAt: new Date().toISOString() } };
    },
  };
}
