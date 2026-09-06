import {DatabaseSync} from 'node:sqlite';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const observationFileStamp=async file=>stat(file).then(row=>[row.size,row.mtimeMs,row.ctimeMs,row.ino].join(':')).catch(error=>{if(error.code==='ENOENT')return null;throw error});
export const observationDatabaseStamp=async file=>[await observationFileStamp(file),await observationFileStamp(file+'-wal')];

/** A consistent, bounded read transaction. Unrelated catalog writes must not
 * invalidate selected observations. The stat fast path is usable only when
 * both sides of this exact read agree; otherwise the caller rechecks row data. */
export async function readEchoObservationRows({catalogPath,mediaIds,maxOutputBytes=16*1024*1024}) {
 if(!Array.isArray(mediaIds)||mediaIds.length>2048||mediaIds.some(id=>typeof id!=='string'||!id||id.length>512))throw Error('observation-media-budget-or-schema');
 if(!Number.isFinite(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>64*1024*1024)throw Error('observation-row-byte-budget');
 const requested=[...new Set(mediaIds)].sort(),before=await observationDatabaseStamp(catalogPath);
 const db=new DatabaseSync(catalogPath,{readOnly:true});
 const records=[];let loadedBytes=0;
 try{
  db.exec('PRAGMA query_only=ON; BEGIN');
  const videoQuery=db.prepare('SELECT media_id,sha256,canonical_path,duration_sec,updated_at FROM videos WHERE media_id=?');
  const frameQuery=db.prepare('SELECT frame_id,media_id,marker,at_seconds,updated_at,fingerprint_json FROM frames WHERE media_id=? ORDER BY marker,frame_id LIMIT 4');
  const recognitionQuery=db.prepare('SELECT frame_id,media_id,marker,status,provider,recognized_at,fingerprint_json,labels_json,text_lines_json FROM recognition WHERE frame_id=?');
  for(const mediaId of requested){
   const video=videoQuery.get(mediaId);
   const frames=video?frameQuery.all(mediaId):[];
   if(frames.length>3)throw Error('catalog-frame-budget');
   const record=video?{video,frames:frames.map(frame=>({frame,recognition:recognitionQuery.get(frame.frame_id)||null}))}:{mediaId,status:'unavailable',reason:'source-not-in-catalog'};
   loadedBytes+=Buffer.byteLength(JSON.stringify(record));
   if(loadedBytes>maxOutputBytes)throw Error('observation-input-byte-budget');
   records.push(record);
  }
  db.exec('COMMIT');
 }finally{db.close();}
 const after=await observationDatabaseStamp(catalogPath);
 return {requested,records,loadedBytes,rowRevision:digest(records),stamp:JSON.stringify(before)===JSON.stringify(after)?after:[null,null]};
}
