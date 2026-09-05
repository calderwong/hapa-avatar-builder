import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Historical output folders are retained evidence, not current album members.
 * Require the manifest to cover the exact authoritative project set first. */
export function currentEchoAlbumGraphPaths(albumRoot) {
  const directory = albumRoot instanceof URL ? albumRoot.pathname : albumRoot;
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'album-hydration-report.json'), 'utf8'));
  const expected = fs.readdirSync('data/music-video-projects').filter(file => file.endsWith('-video-project.json')).sort();
  assert.equal(report.ok, true, 'current album compilation must pass');
  assert.deepEqual(report.projects.map(row => row.file).sort(), expected, 'compile the complete current album before checking its rendering contracts');
  assert.equal(new Set(report.projects.map(row => row.songId)).size, expected.length, 'one compiled graph per exact song');
  return report.projects.map(row => {
    assert.equal(path.basename(row.songId), row.songId);
    const file = path.join(directory, row.songId, 'native-show-graph.json');
    assert.equal(fs.existsSync(file), true, `missing current graph ${row.songId}`);
    return file;
  }).sort();
}
