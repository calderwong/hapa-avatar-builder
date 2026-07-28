import fs from "node:fs";

export function mergeEchoPlaylistManifest(currentManifest = {}, previousManifest = {}) {
  const previousById = new Map(
    (previousManifest.songs || [])
      .filter((song) => song?.id)
      .map((song) => [song.id, song])
  );

  let reusedPreviousSongs = 0;
  const addedSongs = [];
  const songs = (currentManifest.songs || []).map((currentSong) => {
    const previousSong = previousById.get(currentSong.id);
    if (previousSong) reusedPreviousSongs += 1;
    else addedSongs.push(currentSong);

    const currentStems = Array.isArray(currentSong.stems) ? currentSong.stems : [];
    const previousStems = Array.isArray(previousSong?.stems) ? previousSong.stems : [];
    const stems = currentStems.length ? currentStems : previousStems;

    return {
      ...(previousSong || {}),
      ...currentSong,
      stemCount: stems.length,
      discoveredStemCount: Math.max(
        Number(currentSong.discoveredStemCount || 0),
        Number(previousSong?.discoveredStemCount || 0),
        stems.length
      ),
      stemTypes: stems.map((stem) => stem.stemType || stem.type).filter(Boolean),
      stems
    };
  });

  const fileAvailable = (filePath) => {
    try {
      return Boolean(filePath) && fs.statSync(filePath).size > 0;
    } catch {
      return false;
    }
  };

  const missingMasterFiles = songs.filter((song) => !fileAvailable(song.songPath));
  const missingCoverFiles = songs.filter((song) => song.coverPath && !fileAvailable(song.coverPath));
  const missingStemFiles = songs.flatMap((song) => (
    (song.stems || [])
      .filter((stem) => !fileAvailable(stem.localPath || stem.path))
      .map((stem) => ({ songId: song.id, stemId: stem.id }))
  ));

  const counts = {
    ...(currentManifest.counts || {}),
    songs: songs.length,
    songsWithStemFlag: songs.filter((song) => song.hasStem).length,
    songsWithDiscoveredStems: songs.filter((song) => (song.stems || []).length > 0).length,
    discoveredStems: songs.reduce((sum, song) => sum + Number(song.discoveredStemCount || 0), 0),
    stems: songs.reduce((sum, song) => sum + (song.stems || []).length, 0)
  };

  return {
    manifest: {
      ...currentManifest,
      schema: "hapa.suno_playlist_export.builder_reconciled.v1",
      counts,
      songs
    },
    reconciliation: {
      schemaVersion: "hapa.echo-playlist-reconciliation.v2",
      playlistId: currentManifest.playlist?.id || "",
      sourceUrl: currentManifest.sourceUrl || "",
      generatedAt: new Date().toISOString(),
      counts: {
        playlistTracks: songs.length,
        reusedBuilderTracks: reusedPreviousSongs,
        addedTracks: addedSongs.length,
        addedWithStems: addedSongs.filter((song) => (song.stems || []).length > 0).length,
        addedWithoutStems: addedSongs.filter((song) => (song.stems || []).length === 0).length,
        missingMasterFiles: missingMasterFiles.length,
        missingCoverFiles: missingCoverFiles.length,
        missingStemFiles: missingStemFiles.length
      },
      added: addedSongs.map((song) => ({
        index: song.index,
        id: song.id,
        title: song.title,
        stemCount: (song.stems || []).length
      })),
      missingMasterFiles: missingMasterFiles.map((song) => ({ id: song.id, title: song.title })),
      missingCoverFiles: missingCoverFiles.map((song) => ({ id: song.id, title: song.title })),
      missingStemFiles
    }
  };
}
