const http=require('node:http');
function getLocal(url){return new Promise(resolve=>{let settled=false,timer;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};const req=http.get(url,{timeout:1500},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>{if(body.length+chunk.length>16384){req.destroy();finish({ok:false});return;}body+=chunk;});res.on('error',()=>finish({ok:false}));res.on('aborted',()=>finish({ok:false}));res.on('end',()=>finish({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:res.headers,body}));});timer=setTimeout(()=>{req.destroy();finish({ok:false});},1500);req.on('timeout',()=>{req.destroy();finish({ok:false});});req.on('error',()=>finish({ok:false}));});}
/** Qualify a same-process companion before making it Electron's trusted origin.
 * Public boot metadata is a local configuration check, not OS attestation. */
async function resolveBuilderLocalUiUrl(initialUrl,{get=getLocal}={}){
 let initial;try{initial=new URL(initialUrl);}catch{return initialUrl;}
 if(initial.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(initial.hostname)||initial.username||initial.password)return initialUrl;
 const discovery=await get(initial.origin+'/api/echos/living-light/local-ui');let policy;
 try{policy=JSON.parse(discovery.body);}catch{return initialUrl;}
 if(!discovery.ok||policy.ok!==true||policy.state!=='listening')return initialUrl;
 let companion;try{companion=new URL(policy.origin);}catch{throw Error('Builder local UI has an invalid address');}
 if(companion.protocol!=='http:'||companion.hostname!=='127.0.0.1'||companion.username||companion.password||companion.pathname!=='/'||companion.search||companion.hash||policy.origin!==companion.origin||[8794,8799].includes(Number(companion.port)))throw Error('Builder local UI must use its dedicated literal loopback origin');
 const [primary,secondary,html]=await Promise.all([get(initial.origin+'/api/health'),get(companion.origin+'/api/health'),get(companion.origin+'/')]);let a,b;
 try{a=JSON.parse(primary.body);b=JSON.parse(secondary.body);}catch{throw Error('Builder local UI boot identity is unavailable');}
 if(!primary.ok||!secondary.ok||a.service!=='hapa-avatar-builder'||b.service!==a.service||!Number.isSafeInteger(a.runtime?.pid)||a.runtime.pid<1||a.runtime.pid!==b.runtime?.pid||!a.runtime.startedAt||a.runtime.startedAt!==b.runtime.startedAt||!a.runtime.buildSignature||a.runtime.buildSignature!==b.runtime.buildSignature||!html.ok||!String(html.headers?.['content-type']).includes('text/html')||!/Hapa Avatar Builder|id=["']root["']/.test(html.body||''))throw Error('Builder local UI does not match the selected server and HTML');
 return companion.origin+initial.pathname+initial.search+initial.hash;
}
module.exports={resolveBuilderLocalUiUrl};
