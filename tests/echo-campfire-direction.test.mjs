import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atlasFixture } from './echo-score-dust-fixture.mjs';
import { atlasVisualScore, createVisualScoreDirectionStore, saveVisualScoreDirection } from '../server/audio-atlas-visual-score.mjs';

test('Campfire directions round-trip, retain history, and reject stale or foreign bindings', () => {
 const result=atlasFixture(), base=atlasVisualScore(result), dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-campfire-'));
 const store=createVisualScoreDirectionStore({dir,lock:()=>({}),release:()=>{}});
 const extension={schemaVersion:'hapa.echo.campfire-direction.v1',binding:{songId:result.song_id,masterSha256:base.timeline.source.sourceSha256,baseRevision:0,scoreFingerprint:base.score.fingerprint},defaults:{plume:{reach:1.2}},ending:{releaseStart:190,fadeStart:195,fadeEnd:204},cues:[{cueId:base.score.cues[0].id,settings:{motif:'open-ring',formation:{participation:0.6},development:[{at:0},{at:0.5,participation:0.6},{at:1}]}}]};
 try {
  const first=saveVisualScoreDirection(result,store,{baseRevision:0,direction:{campfire:extension}});
  assert.deepEqual(store.list(result.song_id).latest.direction.campfire,extension);
  assert.equal(atlasVisualScore(result,{}, {saved:first}).score.fingerprint,base.score.fingerprint);
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:0,direction:{campfire:extension}}),/revision conflict/);
  const bad=structuredClone(extension);bad.binding.baseRevision=1;bad.binding.masterSha256='f'.repeat(64);
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:1,direction:{campfire:bad}}),/no longer matches/);
  bad.binding.masterSha256=extension.binding.masterSha256;bad.cues[0].cueId='unknown';
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:1,direction:{campfire:bad}}),/Cue is not in the bound score/);
  bad.cues[0].cueId=base.score.cues[0].id;bad.ending.fadeEnd=999;
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:1,direction:{campfire:bad}}),/ordered release and fade/);
  const invalidCurve=structuredClone(extension);invalidCurve.binding.baseRevision=1;invalidCurve.cues[0].settings.development[1].at=2;
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:1,direction:{campfire:invalidCurve}}),/strictly increasing/);
  const second=saveVisualScoreDirection(result,store,{baseRevision:1,direction:{campfire:extension,playSettings:{seed:41}}});
  assert.equal(second.direction.campfire.binding.baseRevision,1);
  assert.equal(store.list(result.song_id).revisions[0].direction.campfire.binding.baseRevision,0);
  const modified=structuredClone(second.direction.campfire);modified.defaults.plume.reach=1.1;
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:2,direction:{campfire:modified}}),/base revision/);
  assert.throws(()=>saveVisualScoreDirection(result,store,{baseRevision:2,direction:{campfire:second.direction.campfire,baseHue:10}}),/no longer matches/);
  assert.equal(saveVisualScoreDirection(result,store,{baseRevision:2,direction:{baseHue:10}}).revision,3);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
