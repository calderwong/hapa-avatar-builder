import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const text = (value) => String(value ?? "").trim();

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function localSongAudioPath(song = {}) {
  for (const candidate of [song?.audio?.localPath, song?.audio?.wavUri, song?.audio?.mp3Uri]) {
    const value = text(candidate);
    if (value && path.isAbsolute(value)) return path.normalize(value);
  }
  return null;
}

function resolveRegistryRoute(pathname, {
  songRegistryPath,
  songbookPath,
  songStorePath,
  registryPayload,
  songbookPayload,
  songStorePayload,
}) {
  const match = pathname.match(/^\/api\/song-registry\/(audio|covers)\/([^/]+)$/u);
  if (!match) return null;
  const route = match[1];
  let songId = safeDecode(match[2]);
  const registry = registryPayload || readJson(songRegistryPath);
  if (songId.startsWith("dear-papa-song-")) {
    const songbook = songbookPayload || readJson(songbookPath);
    const card = (songbook.songCards || []).find((entry) => entry?.id === songId || entry?.songId === songId);
    if (card?.registryTrackId) songId = card.registryTrackId;
  }
  const song = (registry.songs || []).find((entry) => entry?.id === songId || entry?.title === songId);
  const candidate = route === "audio" ? song?.localPath : song?.raw?._hapaPlaylistExport?.coverPath;
  if (candidate) return path.resolve(candidate);
  if (route !== "audio") return null;

  // Incremental Echo ingests enter Builder-owned custody before they are
  // necessarily mirrored into the external Song Registry. Keep the stable
  // registry route, but resolve only an exact identity match from the local
  // song store and prefer the ingested WAV master over its MP3 derivative.
  const store = songStorePayload || (songStorePath ? readJson(songStorePath) : null);
  const localSong = (store?.songs || []).find((entry) => [
    entry?.id,
    entry?.songId,
    entry?.registryTrackId,
    entry?.audio?.registryTrackId,
    entry?.lineage?.registryTrackId,
    entry?.attribution?.songRegistryTrackId,
  ].some((identity) => text(identity) === songId));
  return localSongAudioPath(localSong);
}

export function resolveEchoRuntimeMediaUri(uri, {
  root,
  mediaDir,
  songRegistryPath,
  songbookPath,
  songStorePath,
  registryPayload,
  songbookPayload,
  songStorePayload,
} = {}) {
  const declaredUri = text(uri);
  if (!declaredUri) return { ok: false, reason: "runtime-uri-missing", uri: null, resolvedPath: null };
  if (/^https?:/iu.test(declaredUri)) {
    return { ok: false, reason: "remote-runtime-uri-unverified", uri: declaredUri, resolvedPath: null };
  }
  if (/^(?:data:|blob:)/iu.test(declaredUri)) {
    return { ok: false, reason: "non-file-runtime-uri-unverified", uri: declaredUri, resolvedPath: null };
  }
  if (/^\/\//u.test(declaredUri)) {
    return { ok: false, reason: "protocol-relative-runtime-uri-unverified", uri: declaredUri, resolvedPath: null };
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(declaredUri) && !/^file:/iu.test(declaredUri)) {
    return { ok: false, reason: "nonlocal-runtime-uri-scheme", uri: declaredUri, resolvedPath: null };
  }
  try {
    if (/^file:/iu.test(declaredUri)) {
      return { ok: true, reason: null, uri: declaredUri, route: "file-uri", resolvedPath: path.normalize(fileURLToPath(declaredUri)) };
    }
    const parsed = new URL(declaredUri, "http://hapa.local");
    if (parsed.origin !== "http://hapa.local") {
      return { ok: false, reason: "nonlocal-runtime-uri-origin", uri: declaredUri, resolvedPath: null };
    }
    if (parsed.pathname === "/api/local-file") {
      const candidate = safeDecode(text(parsed.searchParams.get("path")));
      return candidate && path.isAbsolute(candidate)
        ? { ok: true, reason: null, uri: declaredUri, route: "local-file-api", resolvedPath: path.normalize(candidate) }
        : { ok: false, reason: "local-file-runtime-path-invalid", uri: declaredUri, resolvedPath: null };
    }
    if (parsed.pathname.startsWith("/media/")) {
      const resolvedMediaRoot = path.resolve(mediaDir || path.join(path.resolve(root), "data/media"));
      const candidate = path.resolve(resolvedMediaRoot, `.${safeDecode(parsed.pathname)}`.replace(/^\.\/media\//u, ""));
      if (!within(resolvedMediaRoot, candidate)) return { ok: false, reason: "media-runtime-path-escaped", uri: declaredUri, resolvedPath: null };
      return { ok: true, reason: null, uri: declaredUri, route: "media-api", resolvedPath: candidate };
    }
    if (parsed.pathname.startsWith("/api/song-registry/")) {
      const candidate = resolveRegistryRoute(parsed.pathname, {
        songRegistryPath,
        songbookPath,
        songStorePath,
        registryPayload,
        songbookPayload,
        songStorePayload,
      });
      return candidate
        ? { ok: true, reason: null, uri: declaredUri, route: "song-registry-api", resolvedPath: candidate }
        : { ok: false, reason: "song-registry-runtime-route-unresolved", uri: declaredUri, resolvedPath: null };
    }
    if (path.isAbsolute(declaredUri)) {
      return { ok: true, reason: null, uri: declaredUri, route: "absolute-file-path", resolvedPath: path.normalize(declaredUri) };
    }
  } catch (error) {
    return { ok: false, reason: "runtime-uri-resolution-failed", uri: declaredUri, resolvedPath: null, message: error.message };
  }
  return { ok: false, reason: "runtime-uri-route-unsupported", uri: declaredUri, resolvedPath: null };
}
