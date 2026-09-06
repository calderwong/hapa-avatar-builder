import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createEchoKanbanMirrorReader} from '../server/echo-kanban-mirror.mjs';
import {createEchoKanbanStore} from '../server/echo-kanban-store.mjs';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-board-mirror-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const configPath=path.join(root,'mirror.json'),eventsPath=path.join(root,'data/project/events.ndjson');
 await fs.mkdir(path.dirname(eventsPath),{recursive:true});await fs.mkdir(path.join(root,'config/projects'),{recursive:true});
 await fs.writeFile(path.join(root,'config/projects/project.json'),JSON.stringify({id:'project'}));
 await fs.writeFile(configPath,JSON.stringify({schemaVersion:'hapa.echo.kanban-mirror.v1',ownerModule:path.join(root,'owner.mjs'),projectId:'project',taskIds:['a','b']}));
 const rows=[{id:'event-a',ts:'2026-01-01T00:00:00Z',payload:{task:{id:'a',column:'ready'}}},{id:'event-b',ts:'2026-01-02T00:00:00Z',payload:{task:{id:'b',column:'in_progress'}}}];
 await fs.writeFile(eventsPath,rows.map(JSON.stringify).join('\n')+'\n');
 const board={lanes:[{id:'lane',cards:[{id:'a',status:'todo'},{id:'b',status:'in_progress'},{id:'unmapped',status:'review'}]}]};
 const owner={ROOT_DIR:root,deriveState(config,events){assert.equal(config.id,'project');assert.ok(events.every((event,index)=>event.sequence===index+1));return {tasks:events.map(event=>event.payload.task)};}};
 const read=createEchoKanbanMirrorReader({configPath,loadOwner:async()=>owner});return {root,configPath,eventsPath,board,read};
}
test('mirror reads owner projection, maps status vocabulary, and exposes lag without mutating either board',async t=>{
 const {eventsPath,board,read}=await fixture(t);const originalBoard=structuredClone(board),originalEvents=await fs.readFile(eventsPath);
 const matched=await read(board);assert.equal(matched.status,'aligned');assert.equal(matched.matched,2);assert.ok(matched.lastConfirmedAt);
 await fs.appendFile(eventsPath,JSON.stringify({id:'later',ts:'2026-01-03T00:00:00Z',payload:{task:{id:'a',column:'done'}}})+'\n');
 const updatedBytes=await fs.readFile(eventsPath);const lag=await read(board);
 assert.equal(lag.status,'different');assert.equal(lag.matched,1);assert.equal(lag.differences[0].cardId,'a');assert.equal(lag.differences[0].overwatchStatus,'done');
 assert.equal(lag.lastConfirmedAt,matched.lastConfirmedAt);assert.notEqual(lag.sourceRevision,matched.sourceRevision);
 assert.deepEqual(board,originalBoard);assert.deepEqual(await fs.readFile(eventsPath),updatedBytes);assert.ok(updatedBytes.subarray(0,originalEvents.length).equals(originalEvents));
 board.lanes[0].cards[0].status='done';assert.equal((await read(board)).status,'aligned');
});
test('missing cards never create a false match; invalid configuration and malformed history remain visible',async t=>{
 const {eventsPath,board,read,configPath}=await fixture(t);
 board.lanes[0].cards=board.lanes[0].cards.filter(card=>card.id!=='a');
 const missing=await read(board);assert.equal(missing.status,'different');assert.equal(missing.differences[0].reason,'missing-in-echo');
 await fs.appendFile(eventsPath,'broken-json\n');await assert.rejects(read(board),SyntaxError);
 await fs.unlink(configPath);assert.equal((await read(board)).status,'not-configured');
});
test('mirror outage does not prevent a durable local status save and returns visible unavailable state',async t=>{
 const {root,board}=await fixture(t);const boardPath=path.join(root,'board.json');await fs.writeFile(boardPath,JSON.stringify(board));
 const store=createEchoKanbanStore({boardPath,stateRoot:path.join(root,'state'),readMirror:async()=>{throw new Error('Overwatch unavailable');}});
 const initial=await store.read();assert.equal(initial._sync.overwatch,'unavailable');
 const updated=await store.changeStatus({commandId:'mirror-outage-command',expectedRevision:initial._sync.revision,laneId:'lane',cardId:'a',status:'review'});
 assert.equal(updated.lanes[0].cards[0].status,'review');assert.equal(updated._sync.localProjection,'current');assert.equal(updated._sync.mirror.message,'Overwatch unavailable');
});
