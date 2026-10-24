import test from 'node:test';
import assert from 'node:assert/strict';
import { echoLyricPerformanceMap, echoLyricSoundKey, echoLyricTokenMatch, echoLyricAlignmentWindows, echoLyricPerformanceWindows, inspectEchoLyricPassages } from '../src/domain/echo-lyric-performance.js';
import { echoLyricVoiceMap, echoLyricVoiceOf } from '../src/domain/echo-lyric-voices.js';
import { performanceTiming } from '../scripts/atlas-lyric-timing.mjs';

// Recognizer words at a steady pace from `at` seconds.
const heard = (text, at = 0, step = .5) => text.split(' ').map((word, i) => ({ text: word, start: at + i * step, end: at + i * step + .4 }));

test('recognizer words match the written lyric by sound, spelling or joining, never by coincidence', () => {
  // American Kings writes puns the recognizer spells normally.
  for (const [written, recognized] of [['sea', 'see'], ['herd', 'heard'], ['ruff', 'rough'], ['write', 'right'], ['knight', 'night']])
    assert.equal(echoLyricTokenMatch(written, recognized)?.kind, 'sounds-alike', `${written}/${recognized}`);
  assert.equal(echoLyricTokenMatch('doodling', 'drooling')?.kind, 'close-spelling');
  for (const [written, recognized] of [['sky', 'sea'], ['bet', 'bit'], ['beyond', 'beside'], ['caro', 'carol'], ['the', 'thee'], ['a', 'uh']])
    assert.equal(echoLyricTokenMatch(written, recognized), null, `${written}/${recognized} must not match`);
  assert.equal(echoLyricSoundKey('wannabees'), echoLyricSoundKey('wannabes'));

  const lines = ['Join a Navy, Sea the World', 'Ghost Fleet Sailing over Ruff Waters', 'Now we’re ruled by Wanna Bees'];
  const map = echoLyricPerformanceMap(lines, heard('join the navy see the world ghost fleet sailing over rough waters now were ruled by wannabes'));
  assert.equal(map.supportedLines, 3);
  const kinds = map.lines.flatMap((l) => l.matches.filter((m) => m.matchKind !== 'exact').map((m) => `${m.token}<-${m.recognizedToken}:${m.matchKind}`));
  assert.deepEqual(kinds, ['sea<-see:sounds-alike', 'ruff<-rough:sounds-alike', 'wanna<-wannabes:joined-words', 'bees<-wannabes:joined-words']);
  const wanna = map.lines[2].matches.filter((m) => m.matchKind === 'joined-words');
  assert.equal(wanna[0].transcriptIndex, wanna[1].transcriptIndex, 'two written words share the one heard word');
});

test('a vowel-only word is never joined into its neighbour', () => {
  const map = echoLyricPerformanceMap(['the only American King I respect'], heard('the only american king respect'));
  const king = map.lines[0].matches.find((m) => m.token === 'king');
  assert.equal(king.matchKind, 'exact');
  assert.equal(map.lines[0].matches.some((m) => m.token === 'i'), false);
});

test('stem roles classify into lyric voices', () => {
  assert.deepEqual(['Lead Vocals', 'lead-vocals', '0-lead-vocals', 'Vocals', 'Backing Vocals', 'backing-vocals', 'Master', 'Drums', 'Harmony Vocals'].map(echoLyricVoiceOf),
    ['lead', 'lead', 'lead', 'vocals', 'backing', 'backing', 'mix', null, 'backing']);
});

const lines = ['silver stars glow tonight', 'carry me home again', 'oh oh the river runs', 'silver stars glow tonight'];
const lead = heard('silver stars glow tonight carry me home again', 10).concat(heard('silver stars glow tonight', 40));
const backing = heard('silver stars glow tonight', 10.2).concat(heard('oh oh the river runs', 25)).concat(heard('silver stars glow tonight', 40.1)).concat(heard('silver stars glow tonight', 46));
const sources = [{ voice: 'lead', sourceId: 'stem-lead', runId: 'run-lead', words: lead }, { voice: 'backing', sourceId: 'stem-back', runId: 'run-back', words: backing }];

test('every voice is timed against the written lines: doubles, backing-only lines and repeats are captured', () => {
  const map = echoLyricVoiceMap(lines, sources);
  assert.equal(map.supportedLines, 4);
  assert.deepEqual(map.lines.map((l) => l.voice), ['lead', 'lead', 'backing', 'lead'], 'a line only the backing singers sing becomes a backing line');
  assert.equal(map.lines[2].start, 25);
  assert.equal(map.lines[0].performances[0].relation, 'doubles');
  assert.equal(map.lines[0].performances[0].sourceId, 'stem-back');
  // The backing singers repeat the last line once more than it is written: kept as an echo.
  assert.deepEqual(map.lines[3].performances.map((p) => [p.relation, p.start]), [['doubles', 40.1], ['echoes', 46]]);
  assert.equal(map.lines[3].performances[1].pass, 'repeat-pass');
  assert.equal(map.unplacedWords.backing, 0);
  assert.deepEqual(map.lines.map((l) => l.alignSourceId), ['stem-lead', 'stem-lead', 'stem-back', 'stem-lead']);
});

test('backing evidence that contradicts the song order is not adopted; the master fills lead gaps', () => {
  const late = [{ voice: 'lead', sourceId: 'stem-lead', runId: 'r1', words: heard('silver stars glow tonight', 10).concat(heard('silver stars glow tonight', 40)) },
    { voice: 'backing', sourceId: 'stem-back', runId: 'r2', words: heard('carry me home again', 60) }];
  const map = echoLyricVoiceMap(lines, late);
  assert.equal(map.lines[1].supported, false, 'a backing line after the next lead line is out of order');
  const withMix = echoLyricVoiceMap(lines, [...late, { voice: 'mix', sourceId: 'master', runId: 'r3', words: heard('silver stars glow tonight carry me home again', 10) }]);
  assert.equal(withMix.lines[1].supported, true);
  assert.equal(withMix.lines[1].voice, 'mix', 'heard only in the master: the singer is not attributed');
  assert.equal(withMix.lines[0].voice, 'lead');
  assert.equal(withMix.lines[0].performances.length, 0, 'the lead heard again in the master is not a second performance');
});

test('alignment windows never mix stems; additional performances get their own stem windows', () => {
  const map = echoLyricVoiceMap(lines, sources);
  const windows = echoLyricAlignmentWindows(lines, map, 60);
  assert.ok(windows.every((w) => w.lines.every((i) => map.lines[i].alignSourceId === w.sourceId)));
  assert.deepEqual(windows.flatMap((w) => w.lines), [0, 1, 2, 3]);
  const performance = echoLyricPerformanceWindows(lines, map, 60);
  assert.ok(performance.every((w) => w.sourceId === 'stem-back' && w.endSeconds - w.startSeconds < 30));
  assert.deepEqual(performance.flatMap((w) => w.entries.map((e) => [e.line, e.performance])), [[0, 0], [3, 0], [3, 1]]);
  assert.equal(performance.at(-1).text.split('\n').length, performance.at(-1).entries.length, 'a repeated line appears once per performance');
});

test('a voice performance is timed from the aligner when it placed words, else from the recognizer', () => {
  const performance = { matches: [{ lineTokenIndex: 0, start: 40.1, end: 40.5 }, { lineTokenIndex: 3, start: 41.6, end: 42 }] };
  const recognizer = performanceTiming('silver stars glow tonight', performance, null, 60);
  assert.equal(recognizer.evidence, 'recognizer');
  assert.deepEqual(recognizer.words.map((w) => w.matched), [true, false, false, true]);
  assert.ok(recognizer.words.every((w, k, all) => w.end > w.start && (!k || w.start >= all[k - 1].end - 1e-6)), 'unmatched words sit between their neighbours');
  const aligned = performanceTiming('silver stars glow tonight', performance, [{ start: 40.2, end: 40.6, matched: true }, { start: 40.7, end: 41, matched: true }, { matched: false }, { start: 41.5, end: 41.9, matched: true }], 60);
  assert.equal(aligned.evidence, 'forced-alignment');
  assert.equal(aligned.words[1].start, 40.7);
  assert.equal(performanceTiming('silver stars', { matches: [] }, null, 60), null, 'nothing is invented without evidence');
});

test('each line is judged on the evidence that timed it', () => {
  const timing = { lines: [
    { start: 1, end: 2, words: [{ matched: true }], alignmentReview: { modelAgreementRatio: .8 } },
    { start: 3, end: 4, words: [{ matched: true }], alignmentReview: { evidence: 'transcript-timestamps', performanceSupported: true, performanceCoverage: .7 } },
  ] };
  assert.equal(inspectEchoLyricPassages(timing).accepted, true);
  timing.lines[1].alignmentReview.performanceCoverage = .2;
  assert.deepEqual(inspectEchoLyricPassages(timing).unresolvedLines, [1]);
});
