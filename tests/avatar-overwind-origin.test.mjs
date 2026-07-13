import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AvatarOverwindOrigin } from "../server/avatar-overwind-origin.mjs";

test("Avatar Builder canonical outbox covers history, acknowledgement, repair, and legacy migration", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"avatar-overwind-"));
  try {
    const source=path.join(root,"avatar-store.json"); const db=path.join(root,"outbox.sqlite3");
    const adapter=new AvatarOverwindOrigin({dbPath:db,token:"fixture"});
    const avatar={id:"avatar-1",primaryName:"Aurelia",summary:"first",createdAt:"2026-07-11T00:00:00Z",updatedAt:"2026-07-11T00:00:00Z"};
    await adapter.commitStoreMutation("avatar",{avatars:[]},{avatars:[avatar]},()=>writeFile(source,JSON.stringify({avatars:[avatar]})));
    const revised={...avatar,summary:"revised",updatedAt:"2026-07-11T00:01:00Z"};
    await adapter.commitStoreMutation("avatar",{avatars:[avatar]},{avatars:[revised]},()=>writeFile(source,JSON.stringify({avatars:[revised]})));
    adapter.appendOperation("avatar",revised,"card.comment.appended",{comment_id:"comment-1",body:"append only",reply_to_comment_id:null},"2026-07-11T00:02:00Z");
    adapter.appendOperation("avatar",revised,"card.relationship.appended",{relationship_id:"rel-1",relationship_type:"related_to",operation:"add",source_card_id:adapter.pending()[0].card_id,target_card_id:"hapa-card:v1:dGFyZ2V0:Y2FyZA"},"2026-07-11T00:03:00Z");
    await adapter.commitStoreMutation("avatar",{avatars:[revised]},{avatars:[]},()=>writeFile(source,JSON.stringify({avatars:[]})));
    assert.deepEqual(adapter.pending().map((event)=>event.event_type),["card.created","card.revised","card.comment.appended","card.relationship.appended","card.tombstoned"]);
    const sent=[]; const ack=await adapter.upload(async (_url,options)=>{const events=JSON.parse(options.body).events;sent.push(...events);return new Response(JSON.stringify({ok:true,results:events.map((event)=>({event_id:event.event_id,outcome:"accepted",durable:true}))}),{status:200,headers:{"content-type":"application/json"}});});
    assert.equal(ack.acknowledged,5); assert.deepEqual(adapter.health(),{ok:true,sourceHead:5,acknowledgedHead:5,pending:0,failures:0,repairMutations:0});

    const subscriberDir=path.join(root,"subscribers");await mkdir(subscriberDir);
    const legacy=[{id:"legacy-1",action:"avatar.updated"},{id:"legacy-2",action:"item.updated"}];
    await writeFile(path.join(subscriberDir,"events.ndjson"),legacy.map(JSON.stringify).join("\n")+"\n");
    for(const name of ["hapa-atlas","hapa-second-brain","hapa-worldbuilding-wiki"])await writeFile(path.join(subscriberDir,`${name}.ndjson`),legacy.map((event)=>JSON.stringify({...event,subscriber:name,status:"queued"})).join("\n")+"\n");
    const migration=await adapter.migrateLegacy(subscriberDir,["hapa-atlas","hapa-second-brain","hapa-worldbuilding-wiki"]);
    assert.equal(migration.central_events,2);assert.equal(migration.assigned_sequences,2);assert.equal(migration.duplicate_target_rows,6);assert.equal(migration.history_truncated,false);
    adapter.close();

    const repair=new AvatarOverwindOrigin({dbPath:path.join(root,"repair.sqlite3")});
    await assert.rejects(()=>repair.commitStoreMutation("item",{cards:[]},{cards:[{id:"item-1",title:"Item"}]},async()=>{throw new Error("synthetic source failure");}));
    assert.equal(repair.health().repairMutations,1);assert.equal(repair.pending().length,0,"staged repair event cannot upload");repair.close();

    const maintenance=await readFile(path.resolve("scripts/assign-unlinked-video-media.mjs"),"utf8");
    assert.equal(maintenance.includes("history.slice(0, 24)"),false);
    const api=await readFile(path.resolve("server/api.mjs"),"utf8");
    assert.equal(api.includes("SUBSCRIBERS.map((subscriber) => appendFile"),false,"server no longer duplicates permanently queued subscriber histories");
    assert.equal(sent.length,5);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("Overwind origin preserves song kind, store.songs, and a collision-safe Song Card identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "song-overwind-"));
  try {
    const adapter = new AvatarOverwindOrigin({ dbPath: path.join(root, "outbox.sqlite3") });
    const song = { schemaVersion: "hapa.song-card.v2", id: "shared-id", songId: "dear-papa", title: "Dear Papa", latestEdition: 1 };
    await adapter.commitStoreMutation("song", { songs: [] }, { songs: [song] }, async () => {});
    const event = adapter.pending()[0];
    const envelope = event.payload.card;
    assert.equal(envelope.card_type, "song_card");
    assert.equal(envelope.identity.origin_local_id, "song:shared-id");
    assert.equal(envelope.provenance.source_schema, "hapa.song-card.v2");
    assert.equal(envelope.content.authoritative.latestEdition, 1);
    const itemEnvelope = adapter.envelope("item", { id: "shared-id", title: "Item" }, 1, "2026-07-12T00:00:00Z");
    assert.notEqual(envelope.card_id, itemEnvelope.card_id);
    const edition = { schemaVersion: "hapa.song-card.edition.v1", id: "song-card:dear-papa:edition:1", headId: "song-card:dear-papa", songId: "dear-papa", edition: 1, immutable: true, semanticFingerprint: "sha256:edition-one", lineage: { complete: true }, acknowledgements: { catalog: "pending" } };
    await adapter.commitStoreMutation("song-card-edition", { editions: [] }, { editions: [edition] }, async () => {});
    const editionEvent = adapter.pending().find((row) => row.payload?.card?.card_type === "song_card_edition");
    assert.ok(editionEvent);
    assert.equal(editionEvent.payload.card.identity.origin_local_id, `song-edition:${edition.id}`);
    assert.equal(editionEvent.payload.card.provenance.source_schema, "hapa.song-card.edition.v1");
    assert.equal(editionEvent.payload.card.content.authoritative.immutable, true);
    assert.equal(editionEvent.payload.card.content.authoritative.acknowledgements.catalog, "pending");
    adapter.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
