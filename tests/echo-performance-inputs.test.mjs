import test from 'node:test';
import assert from 'node:assert/strict';
import { echoPerformanceInputs } from '../server/echo-performance-inputs.mjs';

test('audio-only preparation preserves exact master and lyrics when render certification is unavailable', () => {
  const project = { song_id: 'song', registry_track_id: 'master', duration: 3, director_show_graph: null,
    director_show_graph_receipt: { status: 'blocked', reason: 'visual-source-unavailable' },
    timed_lyrics: [{ start: .1, end: 1.2, text: 'fixture word', words: [{ text: 'fixture', start: .1, end: .8 }] }] };
  const registry = { stems: [{ id: 'v', parentId: 'master', stemType: 'Vocals', localPath: '/source/vocals.wav' }, { id: 'other', parentId: 'other-master', stemType: 'Drums', localPath: '/wrong.wav' }] };
  const before = JSON.stringify(project);
  const { graph, audioUri } = echoPerformanceInputs({ project, registry });
  assert.equal(audioUri, '/api/song-registry/audio/master');
  assert.equal(graph.stems.items.length, 1); assert.equal(graph.stems.items[0].audioPath, '/source/vocals.wav');
  assert.equal(graph.song.lyricOverlay.lines[0].start, .1);
  assert.equal(graph.source.renderCertification, false); assert.equal(graph.tracks, undefined);
  assert.equal(JSON.stringify(project), before);
});

test('an explicit graph audio revision and stem resource take precedence over Registry aliases', () => {
  const project = { song_id: 'song', registry_track_id: 'master', duration: 3, director_show_graph: { song: { audioPath: '/audio/selected.wav' }, stems: { items: [{ id: 'v', stemType: 'Vocals', audioPath: '/selected/v.wav' }] } } };
  const result = echoPerformanceInputs({ project, registry: { stems: [{ id: 'wrong', parentId: 'master', stemType: 'Vocals', localPath: '/other/v.wav' }] } });
  assert.equal(result.audioUri, '/audio/selected.wav');
  assert.equal(result.graph.stems.items[0].audioPath, '/selected/v.wav');
  project.director_show_graph.stems.items[0].audioPath = '';
  assert.equal(echoPerformanceInputs({ project, registry: { stems: [{ id: 'resolved', parentId: 'master', stemType: 'Vocals', localPath: '/registry/v.wav' }] } }).graph.stems.items[0].audioPath, '/registry/v.wav');
});

test('local ingest custody supplies exact stems before external Registry mirroring', () => {
  const project = {
    song_id: 'dear-papa-song-gnow-her',
    registry_track_id: '891fb5e0-116d-4c18-889b-3aa514d7f971',
    duration: 219.56,
    stems_available: ['drums', 'vocals'],
  };
  const songStore = { songs: [{
    id: 'dear-papa-song-gnow-her',
    audio: { registryTrackId: '891fb5e0-116d-4c18-889b-3aa514d7f971' },
    stems: [
      { id: 'stem:gnow-her:drums', stemType: 'Drums', localPath: '/ingest/stems/drums.wav' },
      { id: 'stem:gnow-her:vocals', stemType: 'Vocals', localPath: '/ingest/stems/vocals.wav' },
    ],
  }] };
  const result = echoPerformanceInputs({ project, registry: { stems: [] }, songStore });
  assert.deepEqual(result.graph.stems.items.map(stem => [stem.role, stem.audioPath, stem.truthStatus]), [
    ['drums', '/ingest/stems/drums.wav', 'verified_local_ingest_path'],
    ['vocals', '/ingest/stems/vocals.wav', 'verified_local_ingest_path'],
  ]);
});
