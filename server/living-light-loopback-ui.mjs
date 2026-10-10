import {createServer} from 'node:http';

const listenerBinding=Symbol('Builder trusted listener binding');
const isLoopbackBind=host=>['127.0.0.1','localhost','::1'].includes(String(host).toLowerCase());
const reservedPorts=new Set([8794,8799]);
/** Preserve the existing LAN HTTP/HTTPS Phone Card listeners. The same Builder
 * handler gains one strictly loopback UI listener, not another authoring owner. */
export function livingLightUiPolicy({staticDir,host,port,httpsPort=0,explicitPort}={}){
 if(isLoopbackBind(host))return {mode:'primary-loopback',startCompanion:false,port,origin:`http://${host==='::1'?'[::1]':host}:${port}`};
 if(!staticDir||String(explicitPort)==='0')return {mode:'unavailable',startCompanion:false,port:null,origin:null};
 if(explicitPort!==undefined&&!/^\d+$/.test(String(explicitPort)))throw Object.assign(Error('The loopback UI port must be a bounded numeric port'),{code:'living_light_ui_port_invalid'});
 let candidate=explicitPort===undefined?port+10:Number(explicitPort);
 if(explicitPort===undefined){while(reservedPorts.has(candidate)||candidate===port||candidate===httpsPort)candidate++;}
 if(!Number.isSafeInteger(candidate)||candidate<1||candidate>65535||reservedPorts.has(candidate)||candidate===port||candidate===httpsPort)throw Object.assign(Error('The loopback UI port must be distinct from Phone Card and reserved desktop ports'),{code:'living_light_ui_port_invalid'});
 return {mode:'companion-loopback',startCompanion:true,port:candidate,origin:`http://127.0.0.1:${candidate}`};
}
export function bindBuilderListener(handler,{host,role}){
 return (req,res)=>{Object.defineProperty(req,listenerBinding,{value:Object.freeze({host,role})});return handler(req,res);};
}
export function builderListenerBind(req,fallback){return req[listenerBinding]?.host||fallback;}
export function loopbackUiRedirect(req,{primaryPort,policy,active}={}){
 if(!active||!policy.startCompanion||req[listenerBinding]?.role!=='primary'||req.socket?.encrypted||req.method!=='GET'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return null;
 if(![`127.0.0.1:${primaryPort}`,`localhost:${primaryPort}`,`[::1]:${primaryPort}`].includes(req.headers.host))return null;
 const url=new URL(req.url,'http://127.0.0.1');if(!['/','/index.html'].includes(url.pathname))return null;
 return policy.origin+url.pathname+url.search;
}
export async function startLivingLightLoopbackUi({policy,handler}={}){
 if(!policy.startCompanion)return {state:policy.mode,origin:policy.origin,close:async()=>{}};
 const server=createServer(bindBuilderListener(handler,{host:'127.0.0.1',role:'loopback-ui'}));
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(policy.port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});}
 catch(error){server.close();throw Object.assign(Error(error.code==='EADDRINUSE'?'The loopback UI port is already in use':'The loopback UI listener could not start'),{code:error.code||'living_light_ui_start_failed'});}
 let closing=null;
 return {state:'listening',origin:policy.origin,server,close:()=>closing||=(new Promise(resolve=>{const timer=setTimeout(()=>{server.closeAllConnections();},1000);server.close(()=>{clearTimeout(timer);resolve();});server.closeIdleConnections();}))};
}
