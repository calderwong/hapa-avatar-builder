import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleEchoLyricIntervals, echoLyricTranscriptPairs, echoLyricRetainedLineIndexes } from '../src/domain/echo-lyric-alignment.js';
import { evaluateEchoLyricTimingPromotion } from '../src/domain/echo-lyric-promotion.js';
const word = (text,start,end,matched=true) => ({ text,start,end,matched });
const assemble = (lines,alignedWords,extra={}) => assembleEchoLyricIntervals({lines,alignedWords,duration:10,...extra});
const valid = result => {
  let end = 0;
  for (const l of result.rows) {
    assert.ok(l.start >= end); assert.ok(l.end > l.start); end=l.end;
    let we=l.start;
    for(const w of l.lineWords){assert.ok(w.start>=we-1e-6);assert.ok(w.end>w.start);assert.ok(w.end<=l.end+1e-6);we=w.end;}
  }
};
test('crop-boundary repair preserves preceding words and demotes intruding prefix',()=>{
  const input=[[word('last',1,2)],[word('next',1.8,2.1),word('phrase',2.6,3)]];
  const result=assemble(['last','next phrase'],input,{windows:[{lines:[1],startSeconds:1.8,runId:'fixture'}],transcriptWords:[word('last',1,2),word('next',2.3,2.6),word('phrase',2.6,3)]});
  valid(result);assert.equal(result.repairs.length,1);assert.equal(result.rows[0].lineWords[0].end,2);assert.equal(result.rows[1].lineWords[0].matched,false);assert.equal(result.alignedCount,2);assert.equal(result.agreeing,2);assert.equal(input[1][0].matched,true);
});
test('unexplained cross-line acoustic conflicts are held, not clipped into a passing file',()=>{
  assert.throws(()=>assemble(['one','two'],[[word('one',1,3)],[word('two',2,4)]]),/Overlapping measured/);
});
test('consecutive unanchored lines share available space without overlaps',()=>{
  const result=assemble(['a','missing one','missing two','b'],[[word('a',1,2)],[word('missing',null,null,false),word('one',null,null,false)],[word('missing',null,null,false),word('two',null,null,false)],[word('b',6,7)]]);
  valid(result);assert.equal(result.rows[1].end,result.rows[2].start);assert.equal(result.alignedCount,2);
});
test('repeated lyrics consume transcript occurrences once in monotonic order',()=>{
  assert.deepEqual(echoLyricTranscriptPairs([word('go'),word('go')],[word('go')]),[[0,0]]);
  const result=assemble(['go go'],[[word('go',1,1.3),word('go',1.4,1.6)]],{transcriptWords:[word('go',1,1.3)]});
  assert.equal(result.agreeing,1);assert.equal(result.rows[0].agreementRatio,.5);
});
test('bad timestamps cannot pass promotion with confident scores or falsified clean stats',()=>{
 const base={engine:'audio-atlas-mlx',confidence:.95,stats:{overlapCount:0,duplicateStartCount:0},warnings:[],provenance:{audioPath:'a',audioSha256:'a',lyricsPath:'b',lyricsSha256:'b'}};
 const cases=[
  {lines:[{start:1,end:2,words:[word('outside',1.5,2.5)]}],reason:'word-outside-line'},
  {lines:[{start:1,end:3,words:[word('one',1,2),word('two',1.5,2.5)]}],reason:'overlapping-word-windows'},
  {lines:[{start:1,end:3},{start:2,end:4}],reason:'overlapping-line-windows'},
  {lines:[{start:1,end:2},{start:1,end:3}],reason:'duplicate-line-starts'}];
 for(const c of cases){const result=evaluateEchoLyricTimingPromotion({...base,lines:c.lines},{sourcePathExists:true,sttPathExists:true});assert.equal(result.accepted,false);assert.ok(result.reasons.includes(c.reason));}
});

test('timing omissions require exact, unique source receipts and retain canonical indexes', () => {
  const lines = ['keep first', 'unsupported', 'keep last'];
  const receipt = {lineIndex: 1, text: 'unsupported', reason: 'No transcript support'};
  assert.deepEqual(echoLyricRetainedLineIndexes(lines, [receipt]), [0, 2]);
  assert.deepEqual(lines, ['keep first', 'unsupported', 'keep last']);
  for (const omissions of [null, [null], [receipt, receipt], [{...receipt, text:'stale'}], [{...receipt, reason:' '}], [{...receipt, lineIndex:9}]])
    assert.throws(() => echoLyricRetainedLineIndexes(lines, omissions), /Invalid explicit/);
  assert.throws(() => echoLyricRetainedLineIndexes(['only'], [{lineIndex:0,text:'only',reason:'unsupported'}]), /No supported/);
});
