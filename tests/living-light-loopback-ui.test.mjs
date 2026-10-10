import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createConnection} from 'node:net';
import {once} from 'node:events';
import {livingLightUiPolicy,bindBuilderListener,builderListenerBind,loopbackUiRedirect,startLivingLightLoopbackUi} from '../server/living-light-loopback-ui.mjs';
import {livingLightBrowserContext} from '../server/living-light-routes.mjs';
const defaults={staticDir:'dist',host:'0.0.0.0',port:8797,httpsPort:8798};
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address().port);});});
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
const get=({port,path='/',method='GET',headers={}})=>new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path,method,headers},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
async function availablePort(){const s=createServer();const p=await listen(s);await close(s);return p;}
test('policy preserves primary loopback and Phone Card ports; opt-out and collisions fail closed',()=>{
 const expected=livingLightUiPolicy(defaults);assert.equal(expected.port,8807);assert.equal(expected.startCompanion,true);
 for(const host of ['127.0.0.1','localhost','::1']){const p=livingLightUiPolicy({...defaults,host});assert.equal(p.mode,'primary-loopback');assert.equal(p.startCompanion,false);assert.equal(p.port,8797);}
 for(const extra of [{staticDir:null},{explicitPort:0},{explicitPort:'0'}])assert.equal(livingLightUiPolicy({...defaults,...extra}).mode,'unavailable');
 for(const explicitPort of [true,'abc',8797,8798,8794,8799,-1,65536,1.5])assert.throws(()=>livingLightUiPolicy({...defaults,explicitPort}),e=>e.code==='living_light_ui_port_invalid');
 assert.equal(livingLightUiPolicy({...defaults,port:8784,httpsPort:8785}).port,8795);
 assert.equal(livingLightUiPolicy({...defaults,explicitPort:19001}).port,19001);
});
test('only trusted listener metadata qualifies bootstrap; client headers cannot assert its bind',()=>{
 const req={method:'POST',headers:{host:'127.0.0.1:8807',origin:'http://127.0.0.1:8807','sec-fetch-site':'same-origin','x-hapa-first-party-intent':'living-light','x-builder-listener-bind':'127.0.0.1'},socket:{remoteAddress:'127.0.0.1'}};
 const options={allowedOrigins:new Set([req.headers.origin]),loopbackAddress:a=>a==='127.0.0.1',bootstrap:true};
 bindBuilderListener(r=>assert.equal(livingLightBrowserContext(r,{...options,serverBind:builderListenerBind(r,'0.0.0.0')}),false),{host:'0.0.0.0',role:'primary'})(req,{});
 const other={...req};bindBuilderListener(r=>assert.equal(livingLightBrowserContext(r,{...options,serverBind:builderListenerBind(r,'0.0.0.0')}),true),{host:'127.0.0.1',role:'loopback-ui'})(other,{});
 assert.equal(builderListenerBind({headers:req.headers},'0.0.0.0'),'0.0.0.0');
});
test('redirect preserves local root query while leaving Phone Card, LAN, APIs and secure listener alone',()=>{
 const policy=livingLightUiPolicy(defaults),options={primaryPort:8797,policy,active:true};
 const evaluate=(extra={},binding={host:'0.0.0.0',role:'primary'})=>{let value;bindBuilderListener(req=>{value=loopbackUiRedirect(req,options);},binding)({method:'GET',url:'/?view=echos&song=exact-id',headers:{host:'127.0.0.1:8797'},socket:{remoteAddress:'127.0.0.1'},...extra},{});return value;};
 assert.equal(evaluate(),'http://127.0.0.1:8807/?view=echos&song=exact-id');
 assert.equal(evaluate({url:'/index.html?view=tarot'}),'http://127.0.0.1:8807/index.html?view=tarot');
 for(const url of ['/phone-card','/api/health','/api/phone-bridge/info','/assets/app.js'])assert.equal(evaluate({url}),null);
 for(const extra of [{method:'POST'},{headers:{host:'192.168.1.2:8797'}},{socket:{remoteAddress:'192.168.1.3'}},{socket:{remoteAddress:'127.0.0.1',encrypted:true}}])assert.equal(evaluate(extra),null);
 assert.equal(evaluate({},{host:'127.0.0.1',role:'loopback-ui'}),null);
 assert.equal(loopbackUiRedirect({}, {...options,active:false}),null);
});
test('real loopback listener serves the same handler and strict browser boundary without starting a process',async()=>{
 const port=await availablePort(),policy=livingLightUiPolicy({...defaults,explicitPort:port});let calls=0;
 const handle=await startLivingLightLoopbackUi({policy,handler:(req,res)=>{calls++;const valid=livingLightBrowserContext(req,{allowedOrigins:new Set([policy.origin]),loopbackAddress:a=>a==='127.0.0.1',serverBind:builderListenerBind(req,'0.0.0.0'),bootstrap:true});res.writeHead(valid?201:403);res.end(valid?'accepted':'denied');}});
 try{assert.equal(handle.server.address().address,'127.0.0.1');const headers={origin:policy.origin,'sec-fetch-site':'same-origin','x-hapa-first-party-intent':'living-light'};assert.equal((await get({port,method:'POST',headers})).status,201);assert.equal((await get({port,method:'POST',headers:{...headers,origin:'http://127.0.0.1:8797'}})).status,403);assert.equal(calls,2);}finally{await Promise.all([handle.close(),handle.close()]);}
 const reused=createServer();try{await new Promise((resolve,reject)=>{reused.once('error',reject);reused.listen(port,'127.0.0.1',resolve);});}finally{await close(reused);}
});
test('occupied companion port refuses without closing or impersonating the existing listener',async()=>{
 const owner=createServer((req,res)=>res.end('existing-owner')),port=await listen(owner),policy=livingLightUiPolicy({...defaults,explicitPort:port});
 try{await assert.rejects(startLivingLightLoopbackUi({policy,handler:()=>{throw Error('Must not be called');}}),e=>e.code==='EADDRINUSE'&&e.message==='The loopback UI port is already in use');assert.equal((await get({port})).body,'existing-owner');}finally{await close(owner);}
});
test('cleanup bounds a held connection and releases the exact socket',async()=>{
 const port=await availablePort(),handle=await startLivingLightLoopbackUi({policy:livingLightUiPolicy({...defaults,explicitPort:port}),handler:(req,res)=>{res.writeHead(200);res.write('held');}});
 const socket=createConnection({host:'127.0.0.1',port});socket.on('error',()=>{});await once(socket,'connect');socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');await once(socket,'data');const started=Date.now();try{await handle.close();assert(Date.now()-started<2000);assert.equal(handle.server.listening,false);}finally{socket.destroy();await handle.close();}
});
