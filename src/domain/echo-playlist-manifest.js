import fs from "node:fs";
import path from "node:path";

const fileAvailable = (filePath) => {
  try {
    return Boolean(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

function recoverSongDirectory(song = {}, previousSong = {}) {
  const direct = [song.localDir, previousSong.localDir, song.songPath && path.dirname(song.songPath), previousSong.songPath && path.dirname(previousSong.songPath)]
    .filter(Boolean);
  for (const directory of direct) {
    if (fileAvailable(path.join(directory, "song.mp3"))) return directory;
  }
  const idPrefix = String(song.id || "").slice(0, 8);
  const roots = [...new Set(direct.map((directory) => path.dirname(directory)))];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (!name.endsWith(` - ${idPrefix}`)) continue;
        const directory = path.join(root, name);
        if (fileAvailable(path.join(directory, "song.mp3"))) return directory;
      }
    } catch {
      // Missing legacy roots are reported by the normal reconciliation checks.
    }
  }
  return song.localDir || previousSong.localDir || direct[0] || "";
}

function recoveredPath(directory, preferred, fallback, pattern) {
  if (fileAvailable(preferred)) return preferred;
  if (fileAvailable(fallback)) return fallback;
  if (!directory) return preferred || fallback || "";
  try {
    const match = fs.readdirSync(directory).find((name) => pattern.test(name));
    return match ? path.join(directory, match) : preferred || fallback || "";
  } catch {
    return preferred || fallback || "";
  }
}

function discoverStemFiles(localDir) {
  const stemDir = localDir && path.join(localDir, "stems");
  if (!stemDir) return [];
  try {
    return fs.readdirSync(stemDir)
      .filter((name) => /\.(?:mp3|wav|m4a|flac)$/i.test(name))
      .sort()
      .map((name) => {
        const localPath = path.join(stemDir, name);
        const metadataName = name.replace(/\.(?:mp3|wav|m4a|flac)$/i, ".metadata.json");
        const metadataPath = path.join(stemDir, metadataName);
        let metadata = {};
        try { metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")); } catch { /* optional */ }
        const label = name.replace(/^\d+\s+-\s+/, "").replace(/\s+-\s+[a-f0-9]{8}\.(?:mp3|wav|m4a|flac)$/i, "");
        return {
          id: metadata.id || name.match(/([a-f0-9]{8})\.(?:mp3|wav|m4a|flac)$/i)?.[1] || name,
          title: metadata.title || label,
          stemType: metadata.metadata?.stem_type_group_name || metadata.metadata?.stem_task || label,
          localPath,
          metadataPath: fileAvailable(metadataPath) ? metadataPath : "",
          audioUrl: metadata.audio_url || "",
        };
      });
  } catch {
    return [];
  }
}

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
    const sourceStems = currentStems.length ? currentStems : previousStems;
    const localDir = recoverSongDirectory(currentSong, previousSong || {});
    let stems = sourceStems.map((stem) => {
      const previousStem = previousStems.find((row) => row.id === stem.id) || {};
      const stemDir = path.join(localDir, "stems");
      const idPrefix = String(stem.id || "").slice(0, 8);
      const localPath = recoveredPath(
        stemDir,
        stem.localPath || stem.path,
        previousStem.localPath || previousStem.path,
        new RegExp(` - ${idPrefix}\\.(?:mp3|wav|m4a|flac)$`, "i")
      );
      return { ...previousStem, ...stem, localPath };
    });
    if (stems.length && stems.some((stem) => !fileAvailable(stem.localPath || stem.path))) {
      const discovered = discoverStemFiles(localDir);
      const availableDeclared = stems.filter((stem) => fileAvailable(stem.localPath || stem.path)).length;
      if (discovered.length > 0 && discovered.length >= availableDeclared) stems = discovered;
    }
    const songPath = recoveredPath(localDir, currentSong.songPath, previousSong?.songPath, /^song\.(?:mp3|wav|m4a|flac)$/i);
    const coverPath = recoveredPath(localDir, currentSong.coverPath, previousSong?.coverPath, /^cover\.(?:jpg|jpeg|png|webp)$/i);

    return {
      ...(previousSong || {}),
      ...currentSong,
      localDir,
      songPath,
      coverPath,
      lyricsPath: recoveredPath(localDir, currentSong.lyricsPath, previousSong?.lyricsPath, /^lyrics\.txt$/i),
      metadataPath: recoveredPath(localDir, currentSong.metadataPath, previousSong?.metadataPath, /^metadata\.json$/i),
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
