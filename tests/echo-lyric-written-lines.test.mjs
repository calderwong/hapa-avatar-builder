import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { echoLyricWrittenLinesCheck, echoLyricWrittenLyricsFor } from '../src/domain/echo-lyric-sync-safety.js';
import { evaluateEchoLyricTimingPromotion } from '../src/domain/echo-lyric-promotion.js';

const written = '[Verse 1]\nJoin  a  Navy, Sea  the  World,\nI  Herd  the  Others,\n\n[Chorus]\nNow we’re ruled by Wanna Bees';
const timed = (texts) => texts.map((text, i) => ({ text, start: i * 2, end: i * 2 + 1.5, words: [{ word: text.split(/\s+/)[0], start: i * 2, end: i * 2 + .5, matched: true }] }));
const exact = ['Join  a  Navy, Sea  the  World,', 'I  Herd  the  Others,', 'Now we’re ruled by Wanna Bees'];

test('timed lines must be exactly the written lyric lines; section tags are not lyrics', () => {
  assert.deepEqual(echoLyricWrittenLinesCheck(timed(exact), { text: written }), { writtenLines: 3, timedLines: 3, ok: true });
  assert.equal(echoLyricWrittenLinesCheck(timed(['[Intro]', ...exact]), written).ok, true, 'a timed section tag is ignored');
  // Speech-to-text writes what it hears; that text never replaces the written line.
  const heard = echoLyricWrittenLinesCheck(timed(['join the navy see the world', ...exact.slice(1)]), written);
  assert.equal(heard.ok, false);
  assert.equal(heard.reason, 'timed-text-differs-from-written');
  assert.deepEqual(heard.firstDifference, { index: 0, written: exact[0], timed: 'join the navy see the world' });
  assert.equal(echoLyricWrittenLinesCheck(timed(exact.slice(0, 2)), written).reason, 'written-lines-missing');
  assert.equal(echoLyricWrittenLinesCheck(timed([...exact, 'an extra transcribed line']), written).reason, 'lines-not-in-written-lyrics');
  assert.equal(echoLyricWrittenLinesCheck(timed([exact[1], exact[0], exact[2]]), written).ok, false, 'order matters');
  assert.equal(echoLyricWrittenLinesCheck(timed(exact), '').reason, 'no-written-lyrics');
});

const timing = (lines, engine = 'whisper-cli') => ({
  engine, confidence: .9, warnings: [], stats: {}, lines,
  provenance: { audioPath: '/song.wav', audioSha256: 'a'.repeat(64), lyricsPath: '/lyrics.txt', lyricsSha256: 'b'.repeat(64) },
});
const sidecars = { sourcePathExists: true, sttPathExists: true };

test('every engine is refused unless its timed lines are the written lyrics', () => {
  for (const engine of ['whisper-cli', 'audio-atlas-mlx']) {
    assert.equal(evaluateEchoLyricTimingPromotion(timing(timed(exact), engine), { ...sidecars, writtenLyrics: written }).accepted, true, engine);
    const transcript = evaluateEchoLyricTimingPromotion(timing(timed(['join the navy see the world', 'i heard the others', 'now were ruled by wannabes']), engine), { ...sidecars, writtenLyrics: written });
    assert.equal(transcript.accepted, false);
    assert.ok(transcript.reasons.includes('timed-lines-not-written-lyrics'), engine);
    assert.equal(transcript.writtenLines.firstDifference.index, 0);
  }
  assert.ok(evaluateEchoLyricTimingPromotion(timing(timed(exact)), sidecars).reasons.includes('written-lyrics-not-checked'), 'no caller can skip the check by omission');
  assert.ok(evaluateEchoLyricTimingPromotion(timing(timed(exact)), { ...sidecars, writtenLyrics: null }).reasons.includes('written-lyrics-unavailable'));
});

test('written lyrics are found by the Song Card canonical timing ID', () => {
  const songs = [{ id: 'a', lineage: { registryTrackId: 'reg-1' }, lyrics: { text: written } }, { id: 'b', audio: { registryTrackId: 'reg-2' }, lyrics: 'Other song' }];
  assert.equal(echoLyricWrittenLyricsFor('reg-1', songs).text, written);
  assert.equal(echoLyricWrittenLyricsFor('reg-2', songs), 'Other song');
  assert.equal(echoLyricWrittenLyricsFor('missing', songs), null);
});

test('promotion, sync and every other gate caller pass the written lyrics, for all pipelines', () => {
  const source = (file) => fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
  const sync = source('sync-dear-papa-lyric-timings.mjs');
  assert.doesNotMatch(sync, /pipeline===['"]audio-atlas-lyric-timing\.v2['"]/, 'the written-lines check is not limited to one pipeline');
  assert.match(sync, /echoLyricWrittenLinesCheck\(timing\.lines,song\.lyrics\)/);
  assert.match(sync, /writtenLyrics: echoLyricWrittenLyricsFor\(timing\.registryTrackId, writtenSongs\)/);
  for (const file of ['promote-echo-lyric-timing-candidates.mjs', 'publish-echo-generated-lyric-timings.mjs', 'repair-echo-lyric-audio-identity.mjs', 'audit-echo-lyric-quality-v4.mjs', 'plan-echo-lyric-timing-drain.mjs', 'atlas-lyric-mass-heal.mjs']) {
    const text = source(file), calls = text.match(/evaluateEchoLyricTimingPromotion\(timing[\s\S]*?\}\)/g) || [];
    assert.ok(calls.length, `${file} calls the gate`);
    for (const call of calls) assert.match(call, /writtenLyrics/, `${file} passes written lyrics`);
  }
});
