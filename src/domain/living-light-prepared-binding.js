import {canonicalLivingLightRole,validateSourceBinding} from './living-light-source-binding.js';
import {livingLightStemSelection} from './living-light-stem-selection.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {LIVING_LIGHT_FEATURE_VERSION} from './living-light-features.js';
// Authored decimal seconds and decoded PCM may round across the terminal
// sample. This admits endpoint precision only, never a rescale or time map.
export function livingLightDurationMatches(actualUs,authoredUs,sampleRate) {
 return Number.isSafeInteger(actualUs)&&Number.isSafeInteger(authoredUs)
  &&Number.isFinite(sampleRate)&&sampleRate>0
  &&Math.abs(actualUs-authoredUs)<=Math.ceil(1e6/sampleRate);
}
/** Hash the complete selected coordinates and binding instead of putting all
 * asset declarations/maps into a cache identifier with a fixed length limit. */
export function livingLightFeatureKey({songId,performance,playbackReceipt,sourceBinding}){
 const commitment=[LIVING_LIGHT_FEATURE_VERSION,songId,performance?.sourcePolicy,performance?.fingerprint,playbackReceipt,sourceBinding];
 return 'living-light:'+bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(commitment))));
}
/** A transient selected-source binding. Prepared measurements never imply an
 * applied owner alignment map, persisted binding identity or human review. */
export function livingLightPreparedBinding({songId,performance,playbackReceipt}){
 if(performance?.songId!==songId||performance.sourcePolicy!=='living-light-assets-v1'||!playbackReceipt)throw Object.assign(Error('Selected prepared source is unavailable'),{code:'prepared_source_unavailable'});
 const binding={schemaVersion:'hapa.living-light.source-binding.v1',songId,bindingId:`${livingLightStemSelection(performance.stemSelectionPolicy??null)?'prepared-coherent':'prepared'}:${songId}`,revisionId:`${performance.fingerprint}:${playbackReceipt.pcmSha256}`,state:'alignment-unverified',master:{sourceHash:playbackReceipt.sourceHash,decoded:{digest:playbackReceipt.pcmSha256,sampleRate:playbackReceipt.sampleRate,frameCount:Math.round(playbackReceipt.durationSeconds*playbackReceipt.sampleRate),durationSeconds:playbackReceipt.durationSeconds}},stems:performance.buses.filter(bus=>bus.id!=='master').map(bus=>({assetId:bus.assetId,sourceHash:bus.audioHash,declaredRole:bus.declaredRole,canonicalRole:canonicalLivingLightRole(bus.declaredRole),state:bus.frames?.length?'available':'missing',alignmentState:'alignment-unverified',timeMap:null}))};
 return validateSourceBinding(binding);
}
export function livingLightFeatureBytes(performance){
 const master=performance?.buses?.find(bus=>bus.id==='master');
 if(!master?.frames?.length)throw Error('A prepared master curve is required');
 return master.frames.length*9+performance.buses.filter(bus=>bus.id!=='master').reduce((bytes,bus)=>bytes+(bus.frames?.length||0)*(1+4*['energy','peak','low','mid','high','onset'].filter(name=>bus.featureAvailability?.[name]).length),0);
}
