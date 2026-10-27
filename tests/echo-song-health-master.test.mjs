import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registryMaster} from '../scripts/preflight-echo-render-readiness.mjs';
test('readiness resolves the same Builder WAV as playback without an external registry mirror',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'health-master-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const master=path.join(root,'master.wav');fs.writeFileSync(master,'RIFFfixture');
 const project={song_id:'dear-papa-song-test',audio_id:'recording-1',audio_uri:'/api/song-registry/audio/recording-1'};
 const local={id:project.song_id,audio:{registryTrackId:'recording-1',localPath:master}};
 const context={root,registryPayload:{songs:[]},songbookPayload:{songCards:[]},songStorePayload:{songs:[local]}};
 const r=registryMaster(project,{},new Map(),new Map(),context);assert.equal(r.ok,true);assert.equal(r.path,master);assert.equal(r.registryId,'recording-1');
 const duplicate=registryMaster(project,{},new Map(),new Map(),{...context,songStorePayload:{songs:[local,{...local,id:'duplicate'}]}});assert.equal(duplicate.ok,false);
 const wrong=registryMaster(project,{},new Map(),new Map(),{...context,songStorePayload:{songs:[{...local,audio:{...local.audio,registryTrackId:'other'}}]}});assert.equal(wrong.ok,false);
});
