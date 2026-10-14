import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { normalizeEchoLyricContract, ECHO_LYRIC_TEMPLATES } from '../src/domain/echo-lyric-contract.js';
import { resolveEchoLyricTemplateFrame, echoLyricTemplateRuntimeBrowserSource } from '../src/domain/echo-lyric-template-runtime.js';
import { echoLyricPresentation, echoLyricWordPaint } from '../src/domain/echo-lyric-presentation.js';
const text='One complete phrase with more than ten words stays visible without any unpredictable individual word highlighting';
const line={text,start:1,end:20,words:text.split(' ').map((word,i)=>({word,start:1+i,end:2+i,matched:true}))};
test('full phrase remains uniformly painted across every template, timestamp, and backward seek',()=>{
 for(const template of ECHO_LYRIC_TEMPLATES){
  const contract=normalizeEchoLyricContract({lyrics:{templateId:template.id,highlightWords:false,style:'minimal-subtitle'}});
  assert.equal(normalizeEchoLyricContract({lyrics:JSON.parse(JSON.stringify(contract))}).highlightWords,false);
  const presentation=echoLyricPresentation(contract);
  let first;
  for(const timeSeconds of [1.1,9.5,18.5,4.5,1.1]){
   const f=resolveEchoLyricTemplateFrame({contract,line,timeSeconds});
   assert.equal(f.timingPolicy.mode,'phrase');assert.equal(f.displayText,text);assert.equal(f.words.length,line.words.length);
   for(const w of f.words){assert.equal(w.display,true);assert.equal(w.active,false);assert.equal(w.completed,false);assert.equal(w.underlineProgress,0);assert.equal(w.opacity,1);assert.equal(w.scale,1);assert.equal(w.translateX,0);assert.equal(w.translateY,0);assert.deepEqual(w.characters,[]);const p=echoLyricWordPaint(w,w.index,presentation,f.timingPolicy.mode);assert.equal(p.opacity,1);assert.equal(p.fill,'#ffffff');assert.equal(p.underline,false);assert.equal(p.highlight,null);assert.equal(p.glow,null);}
   if(!first)first=f.words;else assert.deepEqual(f.words,first);
  }
 }
});
test('offline runtime respects the same switch and legacy word activation stays available',()=>{
 const context=vm.createContext({line});
 const frame=vm.runInContext(echoLyricTemplateRuntimeBrowserSource()+`;echoLyricTemplateFrameState({line,timeSeconds:9.5,highlightWords:false})`,context);
 assert.equal(frame.displayText,text);assert.ok(frame.words.every(w=>w.display&&!w.active&&w.underlineProgress===0));
 const legacy=normalizeEchoLyricContract({});assert.equal(legacy.highlightWords,true);
 assert.ok(resolveEchoLyricTemplateFrame({contract:legacy,line,timeSeconds:9.5}).words.some(w=>w.active));
 const compiler=fs.readFileSync(new URL('../scripts/compile-hyperframes-show-v2.mjs', import.meta.url),'utf8');assert.ok(compiler.includes('highlightWords:track.contract?.highlightWords!==false'));
});
