import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {echoLyricWordPaint,echoLyricWordPaintCss,paintEchoLyricSurfaceToCanvas,chooseEchoLyricPlacement,echoLyricGlyphArtStyle,echoLyricGlyphMeasurementBox,echoLyricPresentation,echoLyricPresentationBrowserSource,echoLyricWordArtStyle,echoLyricWordMeasurementStyle,echoLyricWordsLayoutStyle} from '../src/domain/echo-lyric-presentation.js';
import {resolveEchoOutputProfile} from '../src/domain/echo-output-profile.js';

test('Preview and offline packaging use identical profile-sized typography and safe placement contracts', () => {
 const context=vm.createContext({});vm.runInContext(echoLyricPresentationBrowserSource(),context);
 const templates=['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1','center-word-focus-v1','square-word-mosaic-v1','letter-wave-v1','kinetic-typewriter-v1','vertical-poster-stack-v1','prism-slam-v1','letterfall-totem-v1'];
 const sizes={'kinetic-word-burst-v1':78,'scanline-phrase-ribbon-v1':60,'stacked-hook-echo-v1':73,'orbit-caption-v1':54,'center-word-focus-v1':140,'square-word-mosaic-v1':63,'letter-wave-v1':86,'kinetic-typewriter-v1':63,'vertical-poster-stack-v1':81,'prism-slam-v1':162,'letterfall-totem-v1':140};
 for(const id of ['landscape','square','vertical'])for(const templateId of templates){
  const profile=resolveEchoOutputProfile(id),contract={templateId,position:'bottom-center',style:'neon-cyan'};
  context.profile=profile;context.contract=contract;
  const actual=echoLyricPresentation(contract,profile);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('echoLyricPresentation(contract,profile)',context))),actual);
  assert.equal(actual.fontSize,sizes[templateId]);assert.equal(actual.panel.textTransform,templateId==='prism-slam-v1'?'uppercase':'none');
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
 assert.equal(presentation.fontSize,140);
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
 assert.equal(actual.fontSize,211);
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

test('karaoke states: upcoming words are quiet, the sung word is lit, sung words are solid, phrase lines are uniform', () => {
 const presentation=echoLyricPresentation({templateId:'scanline-phrase-ribbon-v1',style:'neon-cyan'},resolveEchoOutputProfile('vertical'));
 const upcoming=echoLyricWordPaint({},0,presentation,'word'),active=echoLyricWordPaint({active:true},0,presentation,'word'),sung=echoLyricWordPaint({completed:true},0,presentation,'word');
 assert.ok(upcoming.opacity<.7);assert.equal(active.fill,presentation.accent);assert.equal(active.underline,true);assert.ok(active.glow);
 assert.equal(sung.fill,presentation.text);assert.equal(sung.opacity,1);
 assert.deepEqual(['static','static'],[echoLyricWordPaint({},0,presentation,'phrase').state,echoLyricWordPaint({active:true},0,presentation,'phrase').state]);
 const poster=echoLyricPresentation({templateId:'vertical-poster-stack-v1'},resolveEchoOutputProfile('vertical'));
 assert.equal(echoLyricWordPaint({},0,poster,'word').fill,'transparent');assert.match(echoLyricWordPaintCss(echoLyricWordPaint({},0,poster,'word')).WebkitTextStroke,/px #/u);
 const burst=echoLyricPresentation({templateId:'kinetic-word-burst-v1'},resolveEchoOutputProfile('vertical'));
 assert.equal(echoLyricWordPaint({active:true},0,burst,'word').highlight.color,burst.accent);
});

test('templates own typography and legibility scrims; palettes only carry colour and every stack falls back to CJK', () => {
 const profile=resolveEchoOutputProfile('vertical');
 const ribbon=echoLyricPresentation({templateId:'scanline-phrase-ribbon-v1',style:'neon-cyan'},profile);
 assert.match(ribbon.panel.background,/linear-gradient/u);assert.equal(ribbon.panel.backgroundImage,undefined);assert.equal(ribbon.look,'ribbon');
 assert.doesNotMatch(ribbon.fontFamily,/monospace/u);
 assert.match(echoLyricPresentation({templateId:'orbit-caption-v1'},profile).panel.backdropFilter,/blur/u);
 assert.match(echoLyricPresentation({templateId:'kinetic-typewriter-v1'},profile).fontFamily,/Menlo/u);
 assert.match(echoLyricPresentation({templateId:'center-word-focus-v1'},profile).fontFamily,/Didot/u);
 for(const templateId of ['scanline-phrase-ribbon-v1','kinetic-word-burst-v1','center-word-focus-v1','kinetic-typewriter-v1','orbit-caption-v1'])assert.match(echoLyricPresentation({templateId},profile).fontFamily,/Hiragino Sans/u);
 const paper=echoLyricPresentation({templateId:'scanline-phrase-ribbon-v1',style:'paper-white'},profile);
 assert.equal(paper.text,'#17130d');assert.equal(paper.deep,'#f6f1e6');
 const poster=echoLyricPresentation({templateId:'vertical-poster-stack-v1'},profile);
 assert.ok(echoLyricWordArtStyle({displayText:'WE'},0,4,poster).fontScale>echoLyricWordArtStyle({displayText:'REDISCOVER'},1,4,poster).fontScale);
});

test('the recording canvas paints the same word paint the DOM uses, including outline strokes and ghosts', () => {
 const presentation=echoLyricPresentation({templateId:'vertical-poster-stack-v1',style:'neon-cyan'},resolveEchoOutputProfile('vertical'));
 const calls=[];const context={canvas:{width:1080,height:1920},save(){},restore(){},scale(){},translate(){},rotate(){},beginPath(){},roundRect(){},rect(){},fill(){},stroke(){},
  fillRect(){},createLinearGradient(){return {addColorStop(){}};},fillText(value){calls.push(['fill',value,this.fillStyle]);},strokeText(value){calls.push(['stroke',value,this.strokeStyle,this.lineWidth]);}};
 const state={frame:{visible:true},line:{id:'l'},mode:'word',contract:{templateId:'vertical-poster-stack-v1'},presentation,
  layout:{boxes:[{x:0,y:0,width:500,height:90},{x:0,y:90,width:500,height:90}],width:500,height:180,panelHeight:228,fontSize:81,wordsOffsetX:48,wordsOffsetY:24},
  placement:{x:100,y:1200},rows:[{index:0,displayText:'walked',active:true,opacity:1},{index:1,displayText:'once',opacity:1}],nodes:[{textContent:'walked'},{textContent:'once'}]};
 assert.equal(paintEchoLyricSurfaceToCanvas(context,{style:{visibility:'visible'},__echoLyricSurface:state},{}).drawn,true);
 assert.ok(calls.some(c=>c[0]==='fill'&&c[1]==='WALKED'&&c[2]===presentation.accent));
 assert.ok(calls.some(c=>c[0]==='stroke'&&c[1]==='ONCE'&&c[2]===presentation.text));
 assert.ok(!calls.some(c=>c[0]==='fill'&&c[1]==='ONCE'));
});
