import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {echoLyricPresentation,echoLyricPresentationBrowserSource} from '../src/domain/echo-lyric-presentation.js';
import {resolveEchoOutputProfile} from '../src/domain/echo-output-profile.js';

test('Preview and offline packaging use identical profile-sized typography and safe placement contracts', () => {
 const context=vm.createContext({});vm.runInContext(echoLyricPresentationBrowserSource(),context);
 for(const id of ['landscape','square','vertical'])for(const templateId of ['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1']){
  const profile=resolveEchoOutputProfile(id),contract={templateId,position:'bottom-center',style:'neon-cyan'};
  context.profile=profile;context.contract=contract;
  const actual=echoLyricPresentation(contract,profile);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('echoLyricPresentation(contract,profile)',context))),actual);
  assert.equal(actual.fontSize,56);assert.equal(actual.panel.textTransform,'none');
  assert.equal(parseFloat(actual.panel.bottom),profile.height*profile.safeArea.lyricBottom);
 }
});
