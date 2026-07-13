import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os"; import path from "node:path";
import { AvatarOverwindOrigin } from "../server/avatar-overwind-origin.mjs";
const root=await mkdtemp(path.join(os.tmpdir(),"avatar-overwind-fixtures-"));const adapter=new AvatarOverwindOrigin({dbPath:path.join(root,"outbox.sqlite3"),token:"fixture"});
try{const avatar={id:"avatar-roundtrip",primaryName:"Round Trip Avatar",summary:"v1",createdAt:"2026-07-11T00:00:00Z",updatedAt:"2026-07-11T00:00:00Z"};const target={id:"avatar-roundtrip-target",primaryName:"Round Trip Target",summary:"target",createdAt:"2026-07-11T00:00:00Z",updatedAt:"2026-07-11T00:00:00Z"};
await adapter.commitStoreMutation("avatar",{avatars:[]},{avatars:[avatar,target]},()=>writeFile(path.join(root,"store.json"),JSON.stringify({avatars:[avatar,target]})));
const revised={...avatar,summary:"v2",updatedAt:"2026-07-11T00:01:00Z"};await adapter.commitStoreMutation("avatar",{avatars:[avatar,target]},{avatars:[revised,target]},()=>writeFile(path.join(root,"store.json"),JSON.stringify({avatars:[revised,target]})));
adapter.appendOperation("avatar",revised,"card.comment.appended",{comment_id:"comment-roundtrip",body:"append only",reply_to_comment_id:null},"2026-07-11T00:02:00Z");const cardId=adapter.pending()[0].card_id;
const targetCardId=adapter.pending().find(x=>x.payload?.card?.identity?.origin_local_id==="avatar-roundtrip-target").card_id;
adapter.appendOperation("avatar",revised,"card.relationship.appended",{relationship_id:"rel-roundtrip",relationship_type:"related_to",operation:"add",source_card_id:cardId,target_card_id:targetCardId},"2026-07-11T00:03:00Z");
await adapter.commitStoreMutation("avatar",{avatars:[revised,target]},{avatars:[target]},()=>writeFile(path.join(root,"store.json"),JSON.stringify({avatars:[target]})));
console.log(JSON.stringify({ok:true,events:adapter.pending(),health:adapter.health()}));}finally{adapter.close();await rm(root,{recursive:true,force:true});}
