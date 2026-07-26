export const COMIC_SONG_INGEST_MANIFEST_VERSION = "hapa.comic-song-ingest-manifest.v1";
export const COMIC_SONG_INGEST_REPORT_VERSION = "hapa.comic-song-ingest-report.v1";

export function normalizeComicSongManifest(input = {}) {
  const source = input && typeof input === "object" ? structuredClone(input) : {};
  const packages = Array.isArray(source.packages)
    ? source.packages
    : source.package && typeof source.package === "object"
      ? [source.package]
      : [];

  return {
    schemaVersion: source.schemaVersion || COMIC_SONG_INGEST_MANIFEST_VERSION,
    author: text(source.author) || "Calder",
    album: {
      id: text(source.album?.id) || "dear-papa-album",
      title: text(source.album?.title) || "Dear Papa",
      aliases: unique(["Dear Papa", "Echo Album", ...list(source.album?.aliases)]),
      activeProjection: {
        id: text(source.album?.activeProjection?.id) || "echo-album",
        title: text(source.album?.activeProjection?.title) || "Echo Album"
      }
    },
    packages: packages.map(normalizePackage),
    provenance: {
      sourceTurn: text(source.provenance?.sourceTurn),
      createdBy: text(source.provenance?.createdBy) || "Codex",
      notes: text(source.provenance?.notes)
    }
  };
}

export function validateComicSongManifest(input = {}) {
  const manifest = normalizeComicSongManifest(input);
  const errors = [];
  if (manifest.schemaVersion !== COMIC_SONG_INGEST_MANIFEST_VERSION) {
    errors.push(`Unsupported schemaVersion: ${manifest.schemaVersion}`);
  }
  if (!manifest.packages.length) errors.push("At least one comic-song package is required.");

  const packageIds = new Set();
  for (const [packageIndex, comic] of manifest.packages.entries()) {
    const prefix = `packages[${packageIndex}]`;
    if (!safeId(comic.id)) errors.push(`${prefix}.id must be a lowercase safe identifier.`);
    if (packageIds.has(comic.id)) errors.push(`${prefix}.id duplicates ${comic.id}.`);
    packageIds.add(comic.id);
    if (!comic.title) errors.push(`${prefix}.title is required.`);
    if (!safeId(comic.song.id)) errors.push(`${prefix}.song.id must be a lowercase safe identifier.`);
    if (!comic.song.title) errors.push(`${prefix}.song.title is required.`);
    if (!comic.song.lyrics.trim() && !comic.song.lyricsPath) {
      errors.push(`${prefix}.song.lyrics or ${prefix}.song.lyricsPath is required.`);
    }
    if (!comic.avatars.length) errors.push(`${prefix}.avatars must contain at least one Avatar.`);

    const avatarIds = new Set();
    for (const [avatarIndex, avatar] of comic.avatars.entries()) {
      if (!safeId(avatar.id)) errors.push(`${prefix}.avatars[${avatarIndex}].id must be a safe Avatar ID.`);
      if (avatarIds.has(avatar.id)) errors.push(`${prefix}.avatars duplicates ${avatar.id}.`);
      avatarIds.add(avatar.id);
    }

    if (!comic.pages.length) errors.push(`${prefix}.pages must contain at least one page.`);
    const pageNumbers = new Set();
    for (const [pageIndex, page] of comic.pages.entries()) {
      if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
        errors.push(`${prefix}.pages[${pageIndex}].pageNumber must be a positive integer.`);
      }
      if (pageNumbers.has(page.pageNumber)) errors.push(`${prefix}.pages duplicates page ${page.pageNumber}.`);
      pageNumbers.add(page.pageNumber);
      if (!page.title) errors.push(`${prefix}.pages[${pageIndex}].title is required.`);
      if (!page.path) errors.push(`${prefix}.pages[${pageIndex}].path is required.`);
      for (const avatarId of page.avatarIds) {
        if (!avatarIds.has(avatarId)) errors.push(`${prefix}.pages[${pageIndex}] references unknown Avatar ${avatarId}.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, manifest };
}

export function comicSongIds(comic) {
  const packageId = comic.id;
  return {
    packageId,
    songId: comic.song.id,
    songCardId: comic.song.cardId || `dear-papa-song-${comic.song.id}`,
    volumeId: "echo-album-comic-volume",
    episodeId: `echo-comic-episode-${packageId}`,
    placeId: `echo-comic-place-${packageId}`,
    timelineId: "echo-album-comic-timeline",
    sceneId(pageNumber) {
      return `echo-comic-${packageId}-page-${String(pageNumber).padStart(2, "0")}`;
    },
    assetId(role, pageNumber = null) {
      const suffix = pageNumber == null ? role : `${role}-${String(pageNumber).padStart(2, "0")}`;
      return `comic-song-${packageId}-${suffix}`;
    }
  };
}

function normalizePackage(source = {}) {
  const id = text(source.id).toLowerCase();
  const avatars = list(source.avatars).map((avatar) => ({
    id: text(avatar.id),
    name: text(avatar.name),
    role: text(avatar.role) || "lead",
    performancePerspective: Boolean(avatar.performancePerspective),
    note: text(avatar.note)
  }));
  const defaultAvatarIds = avatars.map((avatar) => avatar.id).filter(Boolean);
  const pages = list(source.pages)
    .map((page, index) => ({
      pageNumber: Number(page.pageNumber || index + 1),
      title: text(page.title) || `Page ${index + 1}`,
      summary: text(page.summary),
      caption: text(page.caption),
      path: text(page.path),
      avatarIds: unique(list(page.avatarIds).length ? list(page.avatarIds) : defaultAvatarIds),
      productionPrompt: text(page.productionPrompt),
      tags: unique(["comic", "song-scene", ...list(page.tags)])
    }))
    .sort((left, right) => left.pageNumber - right.pageNumber);

  return {
    id,
    title: text(source.title),
    subtitle: text(source.subtitle),
    canonStatus: text(source.canonStatus) || "soft_canon",
    source: {
      root: text(source.source?.root),
      pdf: text(source.source?.pdf),
      contactSheet: text(source.source?.contactSheet),
      storyboard: text(source.source?.storyboard),
      audio: text(source.source?.audio)
    },
    song: {
      id: text(source.song?.id).toLowerCase(),
      cardId: text(source.song?.cardId),
      title: text(source.song?.title),
      author: text(source.song?.author),
      lyrics: text(source.song?.lyrics),
      lyricsPath: text(source.song?.lyricsPath),
      mood: text(source.song?.mood) || "cinematic-storybook",
      summary: text(source.song?.summary),
      learningThing: text(source.song?.learningThing),
      broadGameMechanic: text(source.song?.broadGameMechanic),
      tags: unique(["comic-song", "echo-album", ...list(source.song?.tags)])
    },
    avatars,
    pages,
    visualLanguage: {
      mood: text(source.visualLanguage?.mood),
      palette: text(source.visualLanguage?.palette),
      style: text(source.visualLanguage?.style),
      generationWorkflow: text(source.visualLanguage?.generationWorkflow) || "GPT Image plus deterministic lettering"
    },
    rights: {
      author: text(source.rights?.author),
      status: text(source.rights?.status) || "operator-authored-local",
      notes: text(source.rights?.notes)
    }
  };
}

function safeId(value) {
  return /^[a-z0-9][a-z0-9._-]*$/u.test(text(value));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
