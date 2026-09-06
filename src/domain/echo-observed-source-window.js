import {mapEchoSourceWindowTime,normalizeEchoTransitionTimeMapping} from './echo-playback-sync.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
/** Project the exact supported video mapper over the destination cue. Never
 * replace a short cue with the entire source duration or infer proxy lineage.
 * Endpoints use a conservative half-open interval; terminal hold is reported
 * separately and cannot invent a continuous observation. */
export function echoObservedSourceWindow(asset,slot) {
 const evidence=asset.contentEvidence||{},sourceDurationSeconds=evidence.sourceDurationSeconds;
 const unavailable=reason=>({status:'unavailable',reason,window:null});
 if(evidence.status!=='prepared-inferred-limited'||!/^[a-f0-9]{64}$/.test(evidence.sourceSha256||'')||!finite(sourceDurationSeconds)||sourceDurationSeconds<=0)return unavailable('source-duration-or-byte-identity-unverified');
 const contract=asset.sourceShot?.media_contract||asset.media_contract||asset.mediaContract||{};
 const runtimeUri=asset.uri||asset.runtimeUri||asset.runtime_media_uri||contract.runtimeUri||asset.media_uri||contract.originalUri;
 const mediaId=asset.id||asset.media_id||asset.sourceShot?.media_id;
 if(!runtimeUri||runtimeUri!==evidence.boundRuntimeUri||!mediaId||mediaId!==evidence.boundMediaId)return unavailable('runtime-media-binding-changed-or-unverified');
 if(asset.sourceKind==='pure-visualizer'||asset.sourceKind==='local-photo')return unavailable('video-observations-do-not-cover-this-media-kind');
 const start=slot?.startSeconds,end=slot?.endSeconds;
 if(!finite(start)||!finite(end)||start<0||end<=start)return unavailable('destination-cue-unverified');
 const sourceInSeconds=contract.sourceInSeconds??contract.source_in_seconds??0;
 const sourceOutSeconds=contract.sourceOutSeconds??contract.source_out_seconds??sourceDurationSeconds;
 if(!finite(sourceInSeconds)||!finite(sourceOutSeconds)||sourceInSeconds<0||sourceOutSeconds<=sourceInSeconds||sourceOutSeconds>sourceDurationSeconds)return unavailable('source-window-outside-verified-duration');
 const options={durationSeconds:sourceDurationSeconds,sourceInSeconds,sourceOutSeconds,cueDurationSeconds:end-start,loop:false};
 const declared=contract.timeMapping||contract.time_mapping;
 const timeMapping=declared?normalizeEchoTransitionTimeMapping(declared,options):null;
 if(declared&&!timeMapping)return unavailable('unsupported-or-stale-source-time-mapping');
 options.timeMapping=timeMapping;
 const sourceStart=mapEchoSourceWindowTime({...options,elapsedSeconds:0});
 const sourceEnd=mapEchoSourceWindowTime({...options,elapsedSeconds:end-start});
 if(!finite(sourceStart)||!finite(sourceEnd)||sourceEnd<=sourceStart)return unavailable('empty-playable-source-window');
 return {status:'mapped',reason:null,window:{sourceSha256:evidence.sourceSha256,startSeconds:sourceStart,endSeconds:sourceEnd},
  mapping:timeMapping?'fit-source-once-to-cue':'source-rate-then-terminal-hold',cueRange:{startSeconds:start,endSeconds:end},
  sourceDurationSeconds,loop:false,endpointPolicy:'conservative-half-open-source-window',continuousCoverage:false};
}
