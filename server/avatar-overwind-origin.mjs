import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const b64 = (value) => Buffer.from(String(value), "utf8").toString("base64url");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const sha = (value) => `sha256:${createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex")}`;
export const cardIdFor = (origin, localId) => `hapa-card:v1:${b64(origin)}:${b64(localId)}`;
const nativeAlias = (origin, localId) => `hapa-native:v1:${b64(origin)}:${b64(localId)}`;
const recordsFor = (kind, store) => kind === "avatar" ? (store?.avatars || []) : kind === "song" ? (store?.songs || []) : kind === "song-card-edition" ? (store?.editions || []) : (store?.cards || []);
const recordId = (record) => String(record?.id || record?.cardId || record?.avatarId || "").trim();
const originLocalId = (kind, record) => { const id = recordId(record); return id && kind === "song" ? `song:${id}` : id && kind === "song-card-edition" ? `song-edition:${id}` : id; };

export class AvatarOverwindOrigin {
  constructor({ dbPath, originNode = "hapa-avatar-builder", overwindUrl = "http://127.0.0.1:8788", token = "" }) {
    this.originNode = originNode; this.overwindUrl = overwindUrl.replace(/\/$/, ""); this.token = token;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath); this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY,store_kind TEXT NOT NULL,before_digest TEXT,after_digest TEXT NOT NULL,state TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL,committed_at TEXT,UNIQUE(store_kind,after_digest));
      CREATE TABLE IF NOT EXISTS outbox(event_id TEXT PRIMARY KEY,mutation_id TEXT,origin_sequence INTEGER UNIQUE NOT NULL,card_id TEXT NOT NULL,revision INTEGER NOT NULL,event_digest TEXT NOT NULL,event_json TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,receipt_json TEXT,acknowledged_at TEXT);
      CREATE TABLE IF NOT EXISTS heads(card_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,event_id TEXT NOT NULL,event_digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS legacy_history(sequence INTEGER PRIMARY KEY,line_digest TEXT UNIQUE NOT NULL,event_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriber_checkpoints(subscriber_id TEXT PRIMARY KEY,origin_sequence INTEGER NOT NULL,event_id TEXT,updated_at TEXT NOT NULL);
    `);
  }
  close() { this.db.close(); }
  nextSequence() { return Number(this.db.prepare("SELECT coalesce(max(origin_sequence),0) n FROM outbox").get().n) + 1; }
  envelope(kind, record, revision, occurredAt) {
    const localId = originLocalId(kind, record); if (!localId) throw new Error(`${kind} record requires id`);
    const cardId = cardIdFor(this.originNode, localId);
    return { schema:"hapa.card.envelope.v1",card_id:cardId,identity:{global_id:cardId,origin_node:this.originNode,origin_local_id:localId,aliases:[nativeAlias(this.originNode,localId)]},
      card_type:kind === "avatar" ? "avatar_card" : kind === "song" ? "song_card" : kind === "song-card-edition" ? "song_card_edition" : kind === "tarot" && record?.tarotMainType === "stargate_context" ? "stargate_context" : String(record.cardType || record.kind || "item_card"),title:String(record.title || record.primaryName || record.name || localId),
      summary:String(record.summary || record.description || record.lore || ""),owner:String(record.owner || this.originNode),actor:this.originNode,
      truth:{state:"origin-staged",record_owner:this.originNode},visibility:String(record.visibility || "fleet"),revision:{number:revision,event_id:null},
      provenance:{created_by_node:this.originNode,source_schema:kind === "avatar" ? "hapa.avatar-card.v1" : kind === "song" ? String(record.schemaVersion || "hapa.song-card.v2") : kind === "song-card-edition" ? String(record.schemaVersion || "hapa.song-card.edition.v1") : kind === "tarot" ? String(record.stargateContext?.schemaVersion || record.schemaVersion || "hapa.tarot-card.v1") : "hapa.item-card.v1",source_ref:`avatar-builder://${kind}/${localId}`},
      timestamps:{origin_created_at:String(record.createdAt || occurredAt),origin_updated_at:occurredAt,acknowledged_at:null},
      content:{authoritative:record,digest:sha(record)},projections:{},derived:{} };
  }
  makeEvent(kind, record, eventType, payload, occurredAt, mutationId) {
    const localId=originLocalId(kind, record); const cardId=cardIdFor(this.originNode,localId); const head=this.db.prepare("SELECT * FROM heads WHERE card_id=?").get(cardId);
    const revision=Number(head?.revision || 0)+1; const sequence=this.nextSequence();
    const body=payload || ((eventType === "card.created" || eventType === "card.revised") ? {card:this.envelope(kind,record,revision,occurredAt)} : eventType === "card.tombstoned" ? {reason:"source record removed"} : {});
    const contentDigest=sha(body); const suffix=createHash("sha256").update(canonical([this.originNode,sequence,cardId,eventType,contentDigest])).digest("hex").slice(0,24);
    const eventId=`hapa-card-event:v1:${b64(this.originNode)}:${String(sequence).padStart(20,"0")}:${suffix}`;
    const event={schema:"hapa.card.event.v1",event_id:eventId,event_type:eventType,card_id:cardId,origin:{node:this.originNode,sequence},
      causality:{correlation_id:`avatar-builder:${kind}:${localId}`,causation_id:head?.event_id || null,lamport:sequence},actor:{id:this.originNode,type:"service"},
      revision:{expected:revision-1,resulting:revision},digests:{previous_event:head?.event_digest || null,content:contentDigest,event:null},occurred_at:occurredAt,received_at:occurredAt,visibility:"fleet",payload:body};
    const unsigned=JSON.parse(canonical(event)); delete unsigned.digests.event; event.digests.event=sha(unsigned);
    this.db.prepare("INSERT INTO outbox(event_id,mutation_id,origin_sequence,card_id,revision,event_digest,event_json,state) VALUES(?,?,?,?,?,?,?,?)")
      .run(eventId,mutationId,sequence,cardId,revision,event.digests.event,canonical(event),mutationId ? "staged" : "pending");
    this.db.prepare("INSERT INTO heads(card_id,revision,event_id,event_digest) VALUES(?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET revision=excluded.revision,event_id=excluded.event_id,event_digest=excluded.event_digest")
      .run(cardId,revision,eventId,event.digests.event);
    return event;
  }
  async commitStoreMutation(kind, before, after, writeSource) {
    const beforeDigest=sha(before || {}), afterDigest=sha(after || {}), mutationId=`mutation-${randomBytes(12).toString("hex")}`, occurredAt=new Date().toISOString();
    if (beforeDigest === afterDigest) { await writeSource(); return {ok:true,outcome:"no_change",events:0}; }
    const priorMutation=this.db.prepare("SELECT id,state FROM mutations WHERE store_kind=? AND after_digest=?").get(kind,afterDigest);
    if (priorMutation) { await writeSource(); return {ok:true,outcome:"idempotent_store_retry",mutationId:priorMutation.id,events:0}; }
    const oldById=new Map(recordsFor(kind,before).map((record)=>[recordId(record),record])); const newById=new Map(recordsFor(kind,after).map((record)=>[recordId(record),record]));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO mutations(id,store_kind,before_digest,after_digest,state,created_at) VALUES(?,?,?,?,?,?)").run(mutationId,kind,beforeDigest,afterDigest,"staged",occurredAt);
      for (const [id,record] of newById) if (!oldById.has(id) || sha(oldById.get(id)) !== sha(record)) this.makeEvent(kind,record,oldById.has(id)?"card.revised":"card.created",null,occurredAt,mutationId);
      for (const [id,record] of oldById) if (!newById.has(id)) this.makeEvent(kind,record,"card.tombstoned",null,occurredAt,mutationId);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    try {
      await writeSource();
      this.db.exec("BEGIN IMMEDIATE"); this.db.prepare("UPDATE mutations SET state='committed',committed_at=? WHERE id=?").run(new Date().toISOString(),mutationId);
      this.db.prepare("UPDATE outbox SET state='pending' WHERE mutation_id=?").run(mutationId); this.db.exec("COMMIT");
      return {ok:true,mutationId,events:this.db.prepare("SELECT count(*) n FROM outbox WHERE mutation_id=?").get(mutationId).n};
    } catch (error) {
      this.db.prepare("UPDATE mutations SET state='repair',detail=? WHERE id=?").run(error?.message || String(error),mutationId);
      throw error;
    }
  }
  appendOperation(kind, record, eventType, payload, occurredAt=new Date().toISOString()) {
    this.db.exec("BEGIN IMMEDIATE"); try { const event=this.makeEvent(kind,record,eventType,payload,occurredAt,null); this.db.exec("COMMIT"); return event; }
    catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  async commitCardMint(kind, record, writeSource) {
    const localId = originLocalId(kind, record);
    if (!localId) throw new Error(`${kind} record requires id`);
    const cardId = cardIdFor(this.originNode, localId);
    const recordDigest = sha(record);
    const latest = this.db.prepare("SELECT event_json,state,receipt_json,origin_sequence,revision FROM outbox WHERE card_id=? ORDER BY origin_sequence DESC LIMIT 1").get(cardId);
    if (latest) {
      const event = JSON.parse(latest.event_json);
      if (event?.payload?.card?.content?.digest === recordDigest) {
        await writeSource();
        return {
          ok: true,
          outcome: "idempotent_mint_retry",
          event,
          status: this.statusForRecord(kind, record)
        };
      }
      throw Object.assign(new Error("A different Stargate Context revision already owns this Card head; append an explicit revision instead of minting a second head."), { code: "mint_revision_conflict", statusCode: 409 });
    }
    const occurredAt = new Date().toISOString();
    const mutationId = `mint-${randomBytes(12).toString("hex")}`;
    this.db.exec("BEGIN IMMEDIATE");
    let event;
    try {
      this.db.prepare("INSERT INTO mutations(id,store_kind,before_digest,after_digest,state,created_at) VALUES(?,?,?,?,?,?)")
        .run(mutationId, `${kind}-mint`, null, recordDigest, "staged", occurredAt);
      event = this.makeEvent(kind, record, "card.created", null, occurredAt, mutationId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    try {
      await writeSource();
      this.db.exec("BEGIN IMMEDIATE");
      this.db.prepare("UPDATE mutations SET state='committed',committed_at=? WHERE id=?").run(new Date().toISOString(), mutationId);
      this.db.prepare("UPDATE outbox SET state='pending' WHERE mutation_id=?").run(mutationId);
      this.db.exec("COMMIT");
      return { ok: true, outcome: "origin_staged", event, status: this.statusForRecord(kind, record) };
    } catch (error) {
      this.db.prepare("UPDATE mutations SET state='repair',detail=? WHERE id=?").run(error?.message || String(error), mutationId);
      throw error;
    }
  }
  pending(limit=250){return this.db.prepare("SELECT event_json FROM outbox WHERE state='pending' ORDER BY origin_sequence LIMIT ?").all(limit).map((row)=>JSON.parse(row.event_json));}
  async upload(fetchImpl=fetch,eventIds=null){const selected=eventIds?new Set(eventIds):null;const events=this.pending().filter((event)=>!selected||selected.has(event.event_id));if(!events.length)return{ok:true,sent:0,acknowledged:0};try{const response=await fetchImpl(`${this.overwindUrl}/v1/cards/events/batch`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.token}`,"x-hapa-origin-node":this.originNode},body:JSON.stringify({events})});const body=await response.json();const results=new Map((body.results||[]).map((row)=>[row.event_id,row]));let acknowledged=0;this.db.exec("BEGIN IMMEDIATE");for(const event of events){const result=results.get(event.event_id);const cursor=Number(result?.overwind_watermark||result?.ledger_position||result?.cursor||0);if(result?.durable&&cursor>0&&["accepted","idempotent_duplicate"].includes(result.outcome)){this.db.prepare("UPDATE outbox SET state='acknowledged',receipt_json=?,acknowledged_at=?,last_error=NULL WHERE event_id=?").run(canonical({...result,ledger_position:cursor}),new Date().toISOString(),event.event_id);acknowledged++;}else this.db.prepare("UPDATE outbox SET attempts=attempts+1,last_error=? WHERE event_id=?").run(result?.outcome||(!cursor?"durable_cursor_missing":`http_${response.status}`),event.event_id);}this.db.exec("COMMIT");return{ok:acknowledged===events.length,sent:events.length,acknowledged};}catch(error){for(const event of events)this.db.prepare("UPDATE outbox SET attempts=attempts+1,last_error=? WHERE event_id=?").run(error?.message||String(error),event.event_id);return{ok:false,sent:events.length,acknowledged:0,error:error?.message||String(error)};}}
  statusForRecord(kind, record) {
    const localId = originLocalId(kind, record);
    const cardId = localId ? cardIdFor(this.originNode, localId) : "";
    const row = cardId ? this.db.prepare("SELECT * FROM outbox WHERE card_id=? ORDER BY origin_sequence DESC LIMIT 1").get(cardId) : null;
    const receipt = row?.receipt_json ? JSON.parse(row.receipt_json) : null;
    const ledgerPosition = Number(receipt?.overwind_watermark || receipt?.ledger_position || receipt?.cursor || 0);
    return {
      schemaVersion: "hapa.avatar-builder.card-origin-status.v1",
      cardId,
      originLocalId: localId || "",
      originNode: this.originNode,
      state: row?.state || "proposed_unminted",
      revision: Number(row?.revision || 0),
      originSequence: Number(row?.origin_sequence || 0),
      eventId: row?.event_id || null,
      eventDigest: row?.event_digest || null,
      durableAcknowledgement: row?.state === "acknowledged" && ledgerPosition > 0,
      ledgerPosition: ledgerPosition || null,
      attempts: Number(row?.attempts || 0),
      lastError: row?.last_error || null,
      acknowledgedAt: row?.acknowledged_at || null
    };
  }
  async migrateLegacy(subscriberDir, subscribers=[]) { const central=await this.readNdjson(path.join(subscriberDir,"events.ndjson")); let sequence=0; this.db.exec("BEGIN IMMEDIATE"); try{for(const event of central){sequence++;const raw=canonical(event),lineDigest=sha(raw);this.db.prepare("INSERT OR IGNORE INTO legacy_history(sequence,line_digest,event_json) VALUES(?,?,?)").run(sequence,lineDigest,raw);}this.db.exec("COMMIT");}catch(error){this.db.exec("ROLLBACK");throw error;}const targets={};for(const subscriber of subscribers)targets[subscriber]=(await this.readNdjson(path.join(subscriberDir,`${subscriber}.ndjson`))).length;return{schema:"hapa.avatar-builder.legacy-history-migration.v1",central_events:central.length,central_digest:sha(central),assigned_sequences:sequence,target_counts:targets,duplicate_target_rows:Object.values(targets).reduce((a,b)=>a+b,0),canonical_source:"events.ndjson",history_truncated:false}; }
  async readNdjson(file){try{return (await readFile(file,"utf8")).split("\n").filter(Boolean).map(JSON.parse);}catch{return[];}}
  health(){const row=this.db.prepare("SELECT coalesce(max(origin_sequence),0) source_head,coalesce(max(CASE WHEN state='acknowledged' THEN origin_sequence ELSE 0 END),0) acknowledged_head,sum(CASE WHEN state='pending' THEN 1 ELSE 0 END) pending,sum(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) failures FROM outbox").get();return{ok:Number(this.db.prepare("SELECT count(*) n FROM mutations WHERE state='repair'").get().n)===0,sourceHead:Number(row.source_head),acknowledgedHead:Number(row.acknowledged_head),pending:Number(row.pending||0),failures:Number(row.failures||0),repairMutations:Number(this.db.prepare("SELECT count(*) n FROM mutations WHERE state='repair'").get().n)};}
}
