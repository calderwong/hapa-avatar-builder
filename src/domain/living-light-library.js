/** Metadata only. Catalog visibility never qualifies a renderer or allocates GL. */
export function livingLightLibraryCards({things=[],thingRows={},journeys=[]}={}){
 const cards=things.map(thing=>{
  const row=thingRows[thing.thingId];
  return {key:'thing:'+thing.thingId,kind:thing.kind,thing,title:thing.title,summary:thing.summary,
   tags:thing.tags||[],readiness:thing.readiness.state==='preview-ready'?'preview-ready':'awaiting',
   noteCount:row?.noteCount??null,usedIn:row?.usedIn||[],source:thing.source.attribution,
   archived:!!row?.visibility?.archived};
 });
 for(const row of journeys){
  const journey=row.journey;
  cards.push({key:'journey:'+journey.journeyId,kind:'journey',row,title:journey.title,
   summary:(journey.mode==='tour'?'Authored Location tour':'Authored Tunnel recipe')+' · '+journey.instances.length+' uses · '+(journey.schedule.at(-1).endUs/1e6).toFixed(2)+' seconds',
   tags:[journey.mode],readiness:'awaiting',noteCount:row.noteCount??null,usedIn:[],
   source:(row.actor?.kind==='agent'?'Agent: ':'Local author: ')+(row.actor?.displayName||'Attribution unavailable'),archived:false});
 }
 return cards;
}
export function filterLivingLightLibrary(cards,{kind='all',search='',readiness='all',tag='all'}={}){
 const query=search.trim().toLocaleLowerCase();
 return cards.filter(card=>(kind==='all'||card.kind===kind)&&(readiness==='all'||card.readiness===readiness)&&(tag==='all'||card.tags.includes(tag))&&
  (!query||[card.title,card.summary,card.source,...card.tags,card.thing?.thingId,card.row?.journey.songId].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
}
