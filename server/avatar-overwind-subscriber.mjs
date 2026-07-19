import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';

export const resolveOverwindToken = (env = process.env) => {
  const direct = String(env.HAPA_AVATAR_OVERWIND_TOKEN || env.HAPA_OVERWIND_TOKEN || '').trim();
  if (direct) return direct;
  const candidates = [env.HAPA_OVERWIND_TOKEN_FILE, path.join(os.homedir(), '.hapa-overwind', 'identities', 'hapa-avatar-builder.token'), path.join(os.homedir(), '.hapa-overwind', '.node_token')].filter(Boolean);
  for (const file of candidates) { try { const token=readFileSync(file,'utf8').trim();if(token)return token; } catch {} }
  return '';
};

const digest = (rows) => `sha256:${createHash('sha256').update(rows.map((row) => `${row.card_id}|${row.revision}|${row.event_digest}`).sort().join('\n')).digest('hex')}`;
const localId = (cardId) => { try { return Buffer.from(String(cardId).split(':').at(-1), 'base64url').toString('utf8'); } catch { return ''; } };
const AVATAR_CARD_TYPES = new Set(['avatar_card','hapa.avatar-card.v1']);
const populationFor = (cardId, cardType = '') => localId(cardId).startsWith('avatar/') || AVATAR_CARD_TYPES.has(cardType) ? 'avatars' : 'items';
const packetDocument = (packet = {}) => {
  const card = packet?.card && typeof packet.card === 'object' ? packet.card : packet;
  const envelope = packet?.envelope || card?.envelope || null;
  return card?.card_id ? { ...card, ...(envelope ? { envelope } : {}) } : null;
};
const packetRevision = (packet = {}) => Number(packet?.revision?.number || packet?.revision || packet?.card?.revision?.number || packet?.card?.revision || packet?.envelope?.revision?.number || 0);
const authoritativeCard = (packet = {}) => packet?.envelope?.content?.authoritative || packet?.content?.authoritative || packet?.authoritative || packet?.payload?.card?.content?.authoritative || null;
const historyRows = (packet = {}) => Array.isArray(packet) ? packet : Array.isArray(packet?.items) ? packet.items : Array.isArray(packet?.history) ? packet.history : Array.isArray(packet?.events) ? packet.events : [];
const historyExact = (packet = {}, expectedRevision = 0) => {
  for (const row of historyRows(packet)) {
    const event = row?.event || row;
    const revision = Number(event?.revision?.resulting || event?.revision?.number || row?.revision?.resulting || row?.revision?.number || row?.revision || 0);
    const card = authoritativeCard(event);
    if (revision === expectedRevision && card) return { card, envelope: event?.payload?.card || row?.envelope || null, event, revision };
  }
  return null;
};

export class AvatarOverwindSubscriber {
  constructor({ dbPath, baseUrl = 'http://127.0.0.1:8788', token = resolveOverwindToken(), subscriberId = 'hapa-avatar-builder', originNode = 'hapa-avatar-builder' }) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.token = token; this.subscriberId = subscriberId; this.originNode = originNode;
    mkdirSync(path.dirname(dbPath), { recursive: true }); this.db = new DatabaseSync(dbPath);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cards(card_id TEXT PRIMARY KEY,population TEXT NOT NULL,title TEXT,card_type TEXT,revision INTEGER,event_id TEXT,event_digest TEXT,ledger_position INTEGER,document_json TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_avatar_overwind_population ON cards(population,active,title);
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    `);
  }
  close(){this.db.close();}
  state(key){return this.db.prepare('SELECT value FROM state WHERE key=?').get(key)?.value || '';}
  setState(key,value){this.db.prepare('INSERT INTO state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
  async request(pathname,{method='GET',body,admin=false}={}){
    const headers={accept:'application/json','content-type':'application/json','x-hapa-origin-node':this.originNode};if(this.token)headers.authorization=`Bearer ${this.token}`;if(admin)headers['x-hapa-admin']='true';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try{const response=await fetch(`${this.baseUrl}${pathname}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.message||data.error||`overwind_http_${response.status}`);error.statusCode=response.status;throw error;}return data;}finally{clearTimeout(timer);}
  }
  async search(params={}){
    const query=new URLSearchParams({q:String(params.q||''),sources:'hapa-avatar-builder',statuses:String(params.statuses||'active'),limit:String(Math.max(1,Math.min(200,Number(params.limit)||100))),sort:String(params.sort||'-updated_at,card_id')});
    if(params.cursor)query.set('cursor',String(params.cursor));if(params.types?.length)query.set('types',params.types.join(','));
    try{const data=await this.request(`/v1/cards/search?${query}`);this.remember(data.items||[],data.as_of_watermark);return{...data,truth_state:'overwind-acknowledged',offline:false,populations:this.populationCountsFromFacets(data.facets)};}
    catch(error){return this.localSearch(params,error);}
  }
  async all(params={}){
    const items=[];let cursor='';let last=null;
    do{last=await this.search({...params,cursor,limit:200});items.push(...(last.items||[]));cursor=String(last.next_cursor||'');}while(cursor&&!last.offline);
    return{...last,items,count:items.length,total:Number(last?.total||items.length)};
  }
  async population(population,params={}){
    if(population==='avatars')return this.all({...params,population,types:[...AVATAR_CARD_TYPES]});
    if(population==='items'){
      const facetProbe=await this.search({...params,limit:1});
      if(facetProbe.offline)return this.all({...params,population});
      const types=Object.keys(facetProbe.facets?.card_type||{}).filter((type)=>!AVATAR_CARD_TYPES.has(type));
      return this.all({...params,population,types});
    }
    return this.all(params);
  }
  populationCountsFromFacets(facets={}){const types=facets.card_type||{};return{avatars:[...AVATAR_CARD_TYPES].reduce((sum,type)=>sum+Number(types[type]||0),0),items:Object.entries(types).filter(([type])=>!AVATAR_CARD_TYPES.has(type)).reduce((sum,[,count])=>sum+Number(count||0),0)};}
  remember(items,watermark){const now=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');try{for(const item of items){this.db.prepare(`INSERT INTO cards(card_id,population,title,card_type,revision,event_id,event_digest,ledger_position,document_json,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(card_id) DO UPDATE SET population=excluded.population,title=excluded.title,card_type=excluded.card_type,revision=excluded.revision,event_id=excluded.event_id,event_digest=excluded.event_digest,ledger_position=excluded.ledger_position,document_json=excluded.document_json,active=1,updated_at=excluded.updated_at`).run(item.card_id,populationFor(item.card_id,item.card_type),item.title||item.card_id,item.card_type||'unknown',Number(item.revision||0),item.event_id||'',item.event_digest||'',Number(item.ledger_position||watermark||0),JSON.stringify(item),now);}if(watermark)this.setState('cursor',watermark);this.setState('synced_at',now);this.setState('truth_state','overwind-acknowledged');this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
  localSearch(params,error){const population=params.population==='avatars'||params.population==='items'?params.population:null;const q=`%${String(params.q||'').toLowerCase()}%`;const limit=Math.max(1,Math.min(200,Number(params.limit)||100));const where=['active=1'];const args=[];if(population){where.push('population=?');args.push(population);}if(params.q){where.push('lower(title) LIKE ?');args.push(q);}const rows=this.db.prepare(`SELECT document_json FROM cards WHERE ${where.join(' AND ')} ORDER BY title COLLATE NOCASE,card_id LIMIT ?`).all(...args,limit).map((row)=>JSON.parse(row.document_json));const total=Number(this.db.prepare(`SELECT count(*) n FROM cards WHERE ${where.join(' AND ')}`).get(...args).n||0);return{ok:true,schema:'hapa.avatar-builder.overwind-card-search.v1',items:rows,count:rows.length,total,next_cursor:null,facets:{},truth_state:'local-stale',offline:true,stale_as_of:this.state('synced_at')||null,consistency_state:'bounded_stale_local_fallback',serving_backend:'avatar-builder-subscriber-cache',degraded:{reason:error?.message||String(error)},fallback_policy:{bounded:true,max_stale_seconds:86400,reversible:true},populations:this.counts()};}
  counts(){const rows=this.db.prepare('SELECT population,count(*) n FROM cards WHERE active=1 GROUP BY population').all();return Object.fromEntries(rows.map((row)=>[row.population,Number(row.n)]));}
  localDocument(cardId=''){
    const row=cardId?this.db.prepare('SELECT * FROM cards WHERE card_id=? AND active=1').get(String(cardId)):null;
    return row?{...JSON.parse(row.document_json),card_id:row.card_id,card_type:row.card_type,title:row.title,revision:Number(row.revision||0),event_id:row.event_id||null,event_digest:row.event_digest||null,ledger_position:Number(row.ledger_position||0),cache_updated_at:row.updated_at}:null;
  }
  async exactRevision(cardId='',expectedRevision=0){
    const expected=Number(expectedRevision||0);
    if(!cardId||!Number.isSafeInteger(expected)||expected<1)throw Object.assign(new Error('A stable Card ID and positive expected revision are required.'),{code:'invalid_exact_revision_request',statusCode:422});
    const cached=this.localDocument(cardId);
    let remote=null,remoteError=null;
    try{
      const packet=await this.get(cardId);
      remote=packetDocument(packet);
      if(remote)this.remember([remote],packet?.as_of_watermark||remote.ledger_position||0);
      const headRevision=packetRevision(remote||packet);
      if(remote&&headRevision===expected){
        const card=authoritativeCard(remote);
        if(card)return{ok:true,card,envelope:remote.envelope||null,revision:expected,headRevision,source:'overwind-live-exact',offline:false,truthState:'overwind-acknowledged',newerRevisionAvailable:false};
      }
      if(headRevision>expected){
        const history=await this.history(cardId);
        const exact=historyExact(history,expected);
        if(exact)return{ok:true,...exact,headRevision,source:'overwind-history-exact',offline:false,truthState:'overwind-acknowledged',newerRevisionAvailable:true};
      }
    }catch(error){remoteError=error;}
    if(cached&&Number(cached.revision)===expected){
      const card=authoritativeCard(cached);
      const remoteHeadRevision=packetRevision(remote);
      if(card)return{ok:true,card,envelope:cached.envelope||null,revision:expected,headRevision:remoteHeadRevision||Number(cached.revision||0),source:'subscriber-cache-exact',offline:Boolean(remoteError),truthState:'local-stale',newerRevisionAvailable:remoteHeadRevision>expected,degradedReason:remoteError?.message||null};
    }
    const headRevision=packetRevision(remote)||Number(cached?.revision||0);
    return{ok:false,card:null,revision:expected,headRevision:headRevision||null,source:remoteError?'subscriber-unavailable':'exact-revision-unavailable',offline:Boolean(remoteError),truthState:cached?'local-stale':'unavailable',newerRevisionAvailable:headRevision>expected,degradedReason:remoteError?.message||null};
  }
  async rebuild(){await this.request('/v1/cards/subscriptions/register',{method:'POST',body:{subscriber_id:this.subscriberId,max_batch:500,backpressure_threshold:5000,config:{consumer:'hapa-avatar-builder'}}});this.db.prepare('UPDATE cards SET active=0').run();let cursor='',watermark=0,total=0;do{const data=await this.search({limit:200,cursor,statuses:'active'});if(data.offline)throw new Error('cannot rebuild Avatar Builder subscriber from offline cache');watermark=Number(data.as_of_watermark||watermark);total+=data.items.length;cursor=String(data.next_cursor||'');}while(cursor);this.db.prepare('DELETE FROM cards WHERE active=0').run();this.setState('cursor',watermark);if(watermark>0){const tail=await this.request(`/v1/cards/subscriptions/deltas?${new URLSearchParams({subscriber_id:this.subscriberId,after:String(watermark-1),limit:'1'})}`);const event=(tail.items||[]).find((item)=>Number(item.cursor)===watermark);if(event)await this.request('/v1/cards/subscriptions/ack',{method:'POST',body:{subscriber_id:this.subscriberId,cursor:watermark,event_id:event.event_id}});}return{ok:true,mode:'rebuild',subscriber_id:this.subscriberId,total,watermark,populations:this.counts(),digest:this.digest(),truth_state:'overwind-acknowledged'};}
  async sync(){let cursor=Number(this.state('cursor')||0);if(!cursor)return this.rebuild();await this.request('/v1/cards/subscriptions/register',{method:'POST',body:{subscriber_id:this.subscriberId,max_batch:500,backpressure_threshold:5000,config:{consumer:'hapa-avatar-builder'}}});let applied=0,head=cursor;while(true){const data=await this.request(`/v1/cards/subscriptions/deltas?${new URLSearchParams({subscriber_id:this.subscriberId,after:String(cursor),limit:'500'})}`);head=Number(data.head||head);const items=data.items||[];for(const item of items){const event=item.event||{};if(event.origin?.node==='hapa-avatar-builder'){if(item.event_type==='card.tombstoned')this.db.prepare('UPDATE cards SET active=0,updated_at=? WHERE card_id=?').run(new Date().toISOString(),item.card_id);else{const card=await this.request(`/v1/cards/${encodeURIComponent(item.card_id)}`);this.remember([{...card.card,envelope:card.envelope}],item.cursor);}}}applied+=items.length;if(items.length){cursor=Number(items.at(-1).cursor);await this.request('/v1/cards/subscriptions/ack',{method:'POST',body:{subscriber_id:this.subscriberId,cursor,event_id:items.at(-1).event_id}});}if(!data.has_more||!items.length)break;}this.setState('cursor',cursor);return{ok:true,mode:'delta-sync',subscriber_id:this.subscriberId,applied,cursor,head,lag:Math.max(0,head-cursor),populations:this.counts(),digest:this.digest(),truth_state:'overwind-acknowledged'};}
  digest(){const rows=this.db.prepare('SELECT card_id,revision,event_digest FROM cards WHERE active=1').all();return digest(rows);}
  status(){const cursor=Number(this.state('cursor')||0);return{ok:true,subscriber_id:this.subscriberId,cursor,populations:this.counts(),digest:this.digest(),truth_state:this.state('truth_state')||'local-stale',synced_at:this.state('synced_at')||null,token_configured:Boolean(this.token),offline_policy:{bounded:true,max_stale_seconds:86400,reversible:true}};}
  get(cardId){return this.request(`/v1/cards/${encodeURIComponent(cardId)}`);}
  history(cardId){return this.request(`/v1/cards/${encodeURIComponent(cardId)}/history`);}
  comments(cardId){return this.request(`/v1/cards/${encodeURIComponent(cardId)}/comments`);}
  lineage(cardId){return this.request(`/v1/cards/${encodeURIComponent(cardId)}/lineage`);}
  comment(cardId,body){return this.request(`/v1/cards/${encodeURIComponent(cardId)}/comments`,{method:'POST',body});}
}
