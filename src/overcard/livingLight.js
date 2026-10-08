/** Builder-owned projection of native Living Light identities. No notes or paths. */
const fail=(code,message)=>{throw Object.assign(Error(message),{code,statusCode:422});};
export function livingLightCardTarget(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_card_target','Choose an exact Living Light Card revision.');
 for(const key of Object.keys(value))if(!['kind','id','revision'].includes(key))fail('unknown_field','Unsupported Card target field: '+key);
 if(!['thing','journey'].includes(value.kind))fail('invalid_card_target','Choose a Thing or saved Journey.');
 for(const key of ['id','revision'])if(typeof value[key]!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(value[key]))fail('invalid_card_target','An exact Card identity and revision are required.');
 return {kind:value.kind,id:value.id,revision:value.revision};
}
export function livingLightEntityRef(record,kind){
 const value=kind==='thing'?record.thing:record.journey;
 const target=livingLightCardTarget({kind,id:kind==='thing'?value?.thingId:value?.journeyId,revision:value?.revisionId});
 return {schema:'hapa.entity-ref.v2',sourceSystem:'hapa-avatar-builder',entityType:'card',entityId:target.id,revision:target.revision,availability:'available',label:value.title,
  resolver:{kind:'api',uri:'/api/echos/living-light/shared-card?'+new URLSearchParams(target)},
  presentation:{title:value.title,subtitle:kind==='journey'?'Living Light Journey':value.kind==='location'?'Living Light Location':'Living Light Tunnel'}};
}
export function livingLightTargetFromEntity(entity){
 if(entity?.sourceSystem!=='hapa-avatar-builder'||entity.entityType!=='card'||entity.resolver?.kind!=='api')return null;
 const uri=entity.resolver.uri;if(typeof uri!=='string'||!uri.startsWith('/api/echos/living-light/shared-card?'))return null;
 try{const url=new URL(uri,'http://living-light.invalid');if(url.pathname!=='/api/echos/living-light/shared-card'||url.hash||url.origin!=='http://living-light.invalid'||[...url.searchParams.keys()].length!==3)return null;
  const target=livingLightCardTarget(Object.fromEntries(url.searchParams));return target.id===entity.entityId&&target.revision===entity.revision?target:null;
 }catch{return null;}
}
export function livingLightCustodyReady(record,target){
 const receipt=record?.custody?.rootReceipt;
 return record?.custody?.state==='verified'&&receipt?.cardId===target.id&&/^[a-f0-9]{64}$/.test(receipt.cardCoreKey||'')&&/^[a-f0-9]{64}$/.test(receipt.cardRecordDigest||'');
}
