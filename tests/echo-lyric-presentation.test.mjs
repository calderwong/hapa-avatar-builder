import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {chooseEchoLyricPlacement,echoLyricGlyphArtStyle,echoLyricGlyphMeasurementBox,echoLyricPresentation,echoLyricPresentationBrowserSource,echoLyricWordArtStyle,echoLyricWordMeasurementStyle,echoLyricWordsLayoutStyle} from '../src/domain/echo-lyric-presentation.js';
import {resolveEchoOutputProfile} from '../src/domain/echo-output-profile.js';

test('Preview and offline packaging use identical profile-sized typography and safe placement contracts', () => {
 const context=vm.createContext({});vm.runInContext(echoLyricPresentationBrowserSource(),context);
 const templates=['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1','center-word-focus-v1','square-word-mosaic-v1','letter-wave-v1','kinetic-typewriter-v1','vertical-poster-stack-v1','prism-slam-v1','letterfall-totem-v1'];
 const sizes={'center-word-focus-v1':119,'square-word-mosaic-v1':59,'letter-wave-v1':78,'kinetic-typewriter-v1':65,'vertical-poster-stack-v1':70,'prism-slam-v1':162,'letterfall-totem-v1':71};
 for(const id of ['landscape','square','vertical'])for(const templateId of templates){
  const profile=resolveEchoOutputProfile(id),contract={templateId,position:'bottom-center',style:'neon-cyan'};
  context.profile=profile;context.contract=contract;
  const actual=echoLyricPresentation(contract,profile);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('echoLyricPresentation(contract,profile)',context))),actual);
  assert.equal(actual.fontSize,sizes[templateId]||56);assert.equal(actual.panel.textTransform,templateId==='prism-slam-v1'?'uppercase':'none');
  if(['center-word-focus-v1','square-word-mosaic-v1','prism-slam-v1','letterfall-totem-v1'].includes(templateId))assert.equal(actual.panel.top,'50%');
  else assert.equal(parseFloat(actual.panel.bottom),profile.height*profile.safeArea.lyricBottom);
 }
});

test('stylistic templates declare distinct square, poster, and per-letter presentation contracts', () => {
 const profile=resolveEchoOutputProfile('landscape');
 const square=echoLyricPresentation({templateId:'square-word-mosaic-v1',style:'neon-cyan'},profile);
 assert.equal(square.layoutMode,'square-grid');
 assert.equal(square.panel.aspectRatio,'1 / 1');
 assert.equal(square.panel.background,'transparent');
 assert.equal(echoLyricWordsLayoutStyle(square,7).gridTemplateColumns,'repeat(3, minmax(0, 1fr))');
 assert.equal(echoLyricWordArtStyle({displayText:'Philosophy,'},0,6,square).fontScale,7/11);
 assert.equal(echoLyricWordArtStyle({displayText:'My'},0,6,square).fontScale,1.5);
 const poster=echoLyricPresentation({templateId:'vertical-poster-stack-v1',style:'neon-cyan'},profile);
 assert.equal(poster.layoutMode,'poster-stack');
 assert.equal(poster.panel.background,'transparent');
 assert.equal(echoLyricWordsLayoutStyle(poster,5).gridTemplateColumns,'minmax(0, 1fr)');
 assert.equal(echoLyricPresentation({templateId:'letter-wave-v1'},profile).letterMotion,'wave');
 assert.equal(echoLyricPresentation({templateId:'kinetic-typewriter-v1'},profile).letterMotion,'typewriter');
 const prism=echoLyricPresentation({templateId:'prism-slam-v1'},profile);
 assert.equal(prism.singleWordOnly,true);
 assert.equal(prism.letterMotion,'prism');
 assert.equal(prism.panel.textTransform,'uppercase');
 const totem=echoLyricPresentation({templateId:'letterfall-totem-v1'},profile);
 assert.equal(totem.layoutMode,'glyph-column');
 assert.equal(totem.letterMotion,'letterfall');
 assert.equal(echoLyricWordsLayoutStyle(totem,1).display,'flex');
 assert.match(echoLyricGlyphArtStyle({colorRole:'accent',shadowRole:'prism'},{},0,prism).textShadow,/f43f5e/u);
});

test('center word focus is large, fixed-center, and has no visible text container', () => {
 const profile=resolveEchoOutputProfile('landscape');
 const presentation=echoLyricPresentation({templateId:'center-word-focus-v1',position:'bottom-center',style:'neon-cyan'},profile);
 assert.equal(presentation.fixedCenter,true);
 assert.equal(presentation.fontSize,119);
 assert.equal(presentation.panel.background,'transparent');
 assert.equal(presentation.panel.backgroundImage,'none');
 assert.equal(presentation.panel.border,'0');
 assert.equal(presentation.panel.padding,'0');
 assert.equal(presentation.panel.boxShadow,'none');
 const placement=chooseEchoLyricPlacement({presentation,panelHeight:125,obstacles:[]});
 assert.equal(placement.x,(profile.width-parseFloat(presentation.panel.width))/2);
 assert.equal(placement.y,(profile.height-125)/2);
});

test('font, size, and color controls resolve identically for Preview and export', () => {
 const profile=resolveEchoOutputProfile('landscape');
 const contract={templateId:'center-word-focus-v1',position:'center',style:'neon-cyan',fontFamily:'display',fontScale:1.5,textColor:'#f97316'};
 const actual=echoLyricPresentation(contract,profile);
 assert.equal(actual.fontSize,178);
 assert.equal(actual.text,'#f97316');
 assert.equal(actual.accent,'#f97316');
 assert.match(actual.panel.font,/Impact/u);
 const context=vm.createContext({contract,profile});vm.runInContext(echoLyricPresentationBrowserSource(),context);
 assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('echoLyricPresentation(contract,profile)',context))),actual);
});

test('word geometry is measured with final typography and leaves transformed glyph ink visible', () => {
 const style=echoLyricWordMeasurementStyle();
 assert.equal(style.fontWeight,'700');
 assert.equal(style.boxSizing,'border-box');
 assert.equal(style.overflow,'visible');
 assert.equal(style.whiteSpace,'nowrap');
 assert.equal(style.wordBreak,'keep-all');
 assert.equal(style.padding,'0 2px');
 const joined=echoLyricWordMeasurementStyle({joinerBefore:false},{joinerBefore:false});
 assert.equal(joined.marginLeft,'0');
 assert.equal(joined.marginRight,'0');
 assert.deepEqual(
  echoLyricGlyphMeasurementBox(
   {offsetLeft:180,offsetTop:42,offsetWidth:24,offsetHeight:36},
   {offsetLeft:160,offsetTop:30},
  ),
  {x:20,y:12,width:24,height:36},
 );
});
