import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {chooseEchoLyricPlacement,echoLyricPresentation,echoLyricPresentationBrowserSource,echoLyricWordMeasurementStyle} from '../src/domain/echo-lyric-presentation.js';
import {resolveEchoOutputProfile} from '../src/domain/echo-output-profile.js';

test('Preview and offline packaging use identical profile-sized typography and safe placement contracts', () => {
 const context=vm.createContext({});vm.runInContext(echoLyricPresentationBrowserSource(),context);
 for(const id of ['landscape','square','vertical'])for(const templateId of ['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1','center-word-focus-v1']){
  const profile=resolveEchoOutputProfile(id),contract={templateId,position:'bottom-center',style:'neon-cyan'};
  context.profile=profile;context.contract=contract;
  const actual=echoLyricPresentation(contract,profile);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('echoLyricPresentation(contract,profile)',context))),actual);
  assert.equal(actual.fontSize,templateId==='center-word-focus-v1'?119:56);assert.equal(actual.panel.textTransform,'none');
  if(templateId==='center-word-focus-v1')assert.equal(actual.panel.top,'50%');
  else assert.equal(parseFloat(actual.panel.bottom),profile.height*profile.safeArea.lyricBottom);
 }
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
});
