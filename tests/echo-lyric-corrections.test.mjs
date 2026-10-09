import test from "node:test";
import assert from "node:assert/strict";
import { applyEchoLyricCorrection } from "../src/domain/echo-lyric-timing-editor.js";
import { echoLyricWordTimingPolicy } from "../src/domain/echo-lyric-template-runtime.js";
import { buildCueGraph } from "../src/domain/echo-director-v2.js";
import { createEchoDirectionWorkingFork, deriveEchoDirectionWorkingProject, buildEchoDirectionForkRequest, deriveEchoDirectionVariantProject, pickEchoDirectionVariantProjectPatch } from "../src/domain/echo-direction-variants.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
const fixture = () => ({ song_id: "review-fixture", audio_id: "audio-a", duration: 12,
  lyrics: { enabled: true, timingSource: "imported-alignment", confidence: .4, audioHash: "a".repeat(64), timingHash: "b".repeat(64) },
  timeline: [], visualizer_timeline: [], timed_lyrics: [
    { id: "line-a", text: "sun light", start: 1, end: 3, confidence: .8, words: [{word:"sun",start:1.2,end:1.6,confidence:.9},{word:"light",start:2,end:2.6,confidence:.8}] },
    { id: "line-b", text: "hold on", start: 4, end: 6, words: [{word:"hold",start:4.123456,end:4.5,confidence:.8},{word:"on",start:5,end:5.9,confidence:.9}] },
  ] });
const edit = (p, command) => ({...p, ...applyEchoLyricCorrection(p,command,{at:"2026-09-08T00:00:00.000Z"})});
test("correction preserves exact untouched source records, marks changed confidence unknown, and undo restores original intervals",()=>{
 const p=fixture(),before=structuredClone(p);const next=edit(p,{type:"shift-word",lineIndex:0,wordIndex:0,deltaSeconds:.05});
 assert.deepEqual(p,before);assert.deepEqual(next.lyrics,p.lyrics);assert.deepEqual(next.timed_lyrics[1],p.timed_lyrics[1]);
 assert.deepEqual(next.timed_lyrics[0].words[1],p.timed_lyrics[0].words[1]);
 const word=next.timed_lyrics[0].words[0];assert.equal(word.start,1.25);assert.equal(word.confidence,null);assert.equal(word.timingCorrection.source.confidence,.9);
 // The operator-corrected word loses measured confidence but its hand-placed interval drives the display.
 const policy=echoLyricWordTimingPolicy(next.timed_lyrics[0],next.lyrics.timingSource);assert.equal(policy.mode,"word");assert.equal(policy.reason,"word-confidence-missing");
 assert.deepEqual(next.lyric_timing_manual_edit.source.originalLines,p.timed_lyrics);
 assert.deepEqual(edit(next,{type:"undo"}).timed_lyrics,p.timed_lyrics);
});
test("locks survive JSON reload and reject line, word and global changes until explicitly undone",()=>{
 let p=edit(fixture(),{type:"lock-word",lineIndex:0,wordIndex:0,locked:true});p=JSON.parse(JSON.stringify(p));
 for(const command of [{type:"shift-line",deltaSeconds:.05},{type:"shift-word",deltaSeconds:.05},{type:"global-offset",deltaSeconds:.05},{type:"split-line",beforeWordIndex:1}])assert.throws(()=>edit(p,command),/Unlock/);
 assert.deepEqual(edit(p,{type:"undo"}).timed_lyrics,fixture().timed_lyrics);
 p=edit(fixture(),{type:"lock-line",lineIndex:1,locked:true});assert.throws(()=>edit(p,{type:"merge-line",lineIndex:0}),/Unlock/);
});
test("explicit word splitting creates no measured confidence; line regrouping preserves exact word intervals",()=>{
 let p=fixture();assert.throws(()=>edit(p,{type:"split-word",atSeconds:3,left:"s",right:"un"}),/inside/);
 p=edit(p,{type:"split-word",atSeconds:1.4,left:"s",right:"un"});
 assert.deepEqual(p.timed_lyrics[0].words.slice(0,2).map(w=>[w.word,w.start,w.end,w.confidence]),[["s",1.2,1.4,null],["un",1.4,1.6,null]]);
 p=edit(p,{type:"undo"});assert.deepEqual(p.timed_lyrics,fixture().timed_lyrics);
 p=edit(p,{type:"split-line",beforeWordIndex:1});assert.equal(p.timed_lyrics.length,3);assert.equal(p.timed_lyrics[0].end,1.6);assert.equal(p.timed_lyrics[1].start,2);
 assert.deepEqual(p.timed_lyrics.slice(0,2).flatMap(l=>l.words),fixture().timed_lyrics[0].words);
 p=edit(p,{type:"merge-line"});assert.equal(p.timed_lyrics.length,2);assert.deepEqual(p.timed_lyrics[0].words,fixture().timed_lyrics[0].words);
 assert.throws(()=>edit(fixture(),{type:"merge-line",lineIndex:1}),/Select a lyric line/);
});
test("text replacement cannot retain obsolete karaoke words and undo recovers source text, confidence and hashes",()=>{
 const p=fixture(),next=edit(p,{type:"line-text",text:"A changed performance"});assert.deepEqual(next.timed_lyrics[0].words,[]);assert.deepEqual(next.timed_lyrics[0].textCorrection.sourceWords,p.timed_lyrics[0].words);
 assert.equal(echoLyricWordTimingPolicy(next.timed_lyrics[0]).mode,"phrase");assert.deepEqual(edit(next,{type:"undo"}).timed_lyrics,p.timed_lyrics);assert.deepEqual(next.lyrics,p.lyrics);
});
test("stale audio and edit revisions are rejected, duplicate commands do not append history",()=>{
 const p=edit(fixture(),{id:"edit-1",expectedRevision:0,type:"shift-line",deltaSeconds:.05});
 assert.equal(applyEchoLyricCorrection(p,{id:"edit-1",expectedRevision:0,type:"shift-line",deltaSeconds:.05}),null);
 assert.throws(()=>edit(p,{id:"edit-1",type:"shift-line",deltaSeconds:.25}),/different action/);
 assert.throws(()=>edit(p,{expectedRevision:0,type:"shift-line",deltaSeconds:.05}),/Lyrics changed/);
 assert.throws(()=>edit({...p,audio_id:"new-audio"},{type:"undo"}),/audio source changed/);
 assert.throws(()=>edit({...p,lyrics:{...p.lyrics,audioHash:"c".repeat(64)}},{type:"undo"}),/audio source changed/);
});
test("working cut identity, fork JSON, reloaded editor and compiled cues retain corrections and source provenance",()=>{
 const p=fixture(),variant={id:"parent",timeline:[],visualizer_timeline:[]};
 const fork=createEchoDirectionWorkingFork(p,variant);const before=deriveEchoDirectionWorkingProject(fork);
 fork.project=edit(fork.project,{type:"shift-word",lineIndex:0,wordIndex:0,deltaSeconds:.05});
 const working=deriveEchoDirectionWorkingProject(fork);assert.notEqual(working.active_direction_script_variant.workingHash,before.active_direction_script_variant.workingHash);
 const request=JSON.parse(JSON.stringify(buildEchoDirectionForkRequest(fork)));
 assert.deepEqual(request.projectPatch.timed_lyrics,working.timed_lyrics);assert.deepEqual(request.projectPatch.lyric_timing_manual_edit,working.lyric_timing_manual_edit);
 const saved={id:"child",timeline:request.timeline,visualizer_timeline:request.visualizerTimeline,project_patch:request.projectPatch};
 const reloaded=deriveEchoDirectionVariantProject(p,saved);const graph=projectToEditorGraph(reloaded);
 assert.deepEqual(graph.song.lyricOverlay.lines,working.timed_lyrics);
 const cues=buildCueGraph(reloaded);assert.equal(cues.lyricCues[0].words[0].startSeconds,1.25);assert.equal(cues.lyricCues[0].words[0].confidence,null);
 assert.equal(cues.lyricCues[0].words[0].timingCorrection.source.confidence,.9);
 assert.deepEqual(edit(reloaded,{type:"undo"}).timed_lyrics,p.timed_lyrics);
 assert.ok(pickEchoDirectionVariantProjectPatch(reloaded).lyric_timing_manual_edit);
});
