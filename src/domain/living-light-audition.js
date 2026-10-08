/** Source-local audition is a paused song-clock branch. Returning to master
 * restores the held position; switching songs never carries another song's time. */
export function transitionLivingLightAudition(previous,{songId,assetId=null,songSeconds=0}){
 if(typeof songId!=='string'||!songId)throw Error('An exact Song ID is required');
 if(assetId!==null&&(typeof assetId!=='string'||!assetId.trim()||assetId.length>300))throw Error('An exact stem asset ID is required');
 if(!Number.isFinite(songSeconds)||songSeconds<0)throw Error('A finite song position is required');
 const same=!previous||previous.songId===songId;
 const heldSongSeconds=same&&previous?.assetId!=null?previous.heldSongSeconds:same?songSeconds:0;
 return Object.freeze({songId,assetId,heldSongSeconds,restoreSeconds:assetId===null?heldSongSeconds:0});
}
