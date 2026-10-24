import test from 'node:test';
import assert from 'node:assert/strict';
import {echoLyricComparePerformanceMaps,echoLyricLexemes,echoLyricPerformanceMap,echoLyricAlignmentWindows,inspectEchoLyricPassages} from '../src/domain/echo-lyric-performance.js';
const words=text=>text.split(' ').map((text,i)=>({text,start:i,end:i+.5}));
test('punctuation separates recognition tokens while authored spelling is retained',()=>{
 const line='Wide—eyy-ehhh-eyahaeh…';assert.deepEqual(echoLyricLexemes(line),['wide','eyy','ehhh','eyahaeh']);
 const m=echoLyricPerformanceMap([line],words('wide eyy ehhh eyahaeh'));assert.equal(m.lines[0].text,line);assert.equal(m.lines[0].supported,true);
 assert.deepEqual(echoLyricLexemes('風の声 déjà—vu'),['風の声','deja','vu']);
});
test('two common words cannot locate an unsupported verse',()=>{
 const m=echoLyricPerformanceMap(['Heroes bring thunder and go beyond the endless sky'],words('wide go narrow the wide'));assert.equal(m.supportedLines,0);assert.equal(m.lines[0].matches.length,2);assert.equal(m.passages[0].lineCount,1);
});
test('repeated chorus evidence is consumed once; missing occurrence held',()=>{
 const m=echoLyricPerformanceMap(['silver stars glow','silver stars glow','silver stars glow'],words('silver stars glow silver stars glow'));
 assert.equal(m.supportedLines,2);assert.equal(m.passages.length,1);
 assert.equal(new Set(m.lines.flatMap(r=>r.matches.map(w=>w.transcriptIndex))).size,6);
});
test('missing consecutive lines share a gap and no line is discarded',()=>{
 const lines=['alpha beta','missing one','missing two','gamma delta'];const m=echoLyricPerformanceMap(lines,[{text:'alpha',start:1,end:2},{text:'beta',start:2,end:3},{text:'gamma',start:10,end:11},{text:'delta',start:11,end:12}]);
 const w=echoLyricAlignmentWindows(lines,m,13);assert.deepEqual(w.flatMap(x=>x.lines),[0,1,2,3]);assert.equal(w[0].text,lines.join('\n'));
});
test('long lyric passage refuses truncation',()=>assert.throws(()=>echoLyricAlignmentWindows(['unrecognized long verse'],echoLyricPerformanceMap(['unrecognized long verse'],[]),90),/needs passage review/));
test('high whole-song score cannot bypass one bad passage or omission',()=>{
 const t={confidence:.99,lines:[{start:1,end:4,words:[{matched:true}],alignmentReview:{modelAgreementRatio:0}}]};assert.equal(inspectEchoLyricPassages(t).accepted,false);
 t.lines[0].alignmentReview.modelAgreementRatio=1;assert.equal(inspectEchoLyricPassages(t).accepted,true);
 t.provenance={timingOmissions:[{lineIndex:3}]};assert.equal(inspectEchoLyricPassages(t).accepted,false);
});


test('display-token positions survive skipped repeated words',()=>{
 const m=echoLyricPerformanceMap(['the moon sees the sun'],words('moon sees the sun'));
 assert.deepEqual(m.lines[0].matches.map(x=>x.lineTokenIndex),[1,2,3,4]);
});


test('leading-silence absorption uses the shorter measured boundary only with same-word context agreement',()=>{
 const lines=['Just need to find a sea'];
 const lead=echoLyricPerformanceMap(lines,['Just','need','to','find','a','sea'].map((text,i)=>({text,start:63+i*.4,end:63.2+i*.4})));
 const mix=structuredClone(lead);mix.lines[0].matches[0].start=60;mix.lines[0].start=60;
 const repaired=echoLyricComparePerformanceMaps(mix,lead,{preferPrimary:true});
 assert.deepEqual(repaired.conflictingLines,[]);assert.equal(repaired.lines[0].matches[0].start,63);assert.equal(repaired.boundaryRepairs.length,1);assert.equal(mix.lines[0].matches[0].start,60);
 const shifted=structuredClone(lead);shifted.lines[0].matches.forEach(w=>{w.start-=3;w.end-=3;});shifted.lines[0].start-=3;
 assert.deepEqual(echoLyricComparePerformanceMaps(lead,shifted).conflictingLines,[0]);
});


test('a local spelling-like name mismatch can use its own timestamp beside a distinctive exact anchor',()=>{
 const m=echoLyricPerformanceMap(['Caro Dario'],words('Carol Dario'));
 assert.equal(m.lines[0].supported,true);assert.equal(m.lines[0].matches[0].matchKind,'local-spelling-variant');assert.equal(m.lines[0].matches[0].recognizedToken,'carol');
 assert.equal(echoLyricPerformanceMap(['Caro'],words('Carol')).supportedLines,0);
 assert.equal(echoLyricPerformanceMap(['heroes sail beyond the sky'],words('narrow sail beside the sea')).supportedLines,0);
});

test('an existing aligner must corroborate only one recognized occurrence to resolve a conflict',()=>{
 const a=echoLyricPerformanceMap(['Fellas,'],[{text:'Fellas',start:36.78,end:37.58}]);
 const b=echoLyricPerformanceMap(['Fellas,'],[{text:'Fellas',start:21.18,end:22.58}]);
 const evidence=[{lineText:'Fellas,',token:'fellas',start:36.74,end:37.7}];
 const chosen=echoLyricComparePerformanceMaps(b,a,{preferPrimary:true,corroboratingWords:evidence});
 assert.deepEqual(chosen.conflictingLines,[]);assert.equal(chosen.lines[0].start,36.78);assert.equal(chosen.lines[0].conflictResolution,'existing-qwen-and-recognizer-agreement');
 assert.deepEqual(echoLyricComparePerformanceMaps(a,b,{corroboratingWords:[...evidence,{...evidence[0],start:21.2}]}).conflictingLines,[0]);
 assert.deepEqual(echoLyricComparePerformanceMaps(a,b,{corroboratingWords:[{...evidence[0],lineText:'Different phrase'}]}).conflictingLines,[0]);
});
