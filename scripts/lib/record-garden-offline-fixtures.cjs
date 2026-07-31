const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RECORD_GARDEN_E2E_SCHEME = "hapa-record-e2e";
const RECORD_GARDEN_E2E_HOST = "app";
const RECORD_GARDEN_E2E_ORIGIN = `${RECORD_GARDEN_E2E_SCHEME}://${RECORD_GARDEN_E2E_HOST}`;
const RECORD_GARDEN_E2E_MEDIA_PREFIX = "/media/e2e";

const FIXTURE_SONGS = Object.freeze([
  ["garden-main", "Sunday Signals", "green", "Sunday Guide", "sunday-signals.wav"],
  ["garden-recovery", "Porchlight Recovery", "blue", "Sunday Guide", "sunday-signals.wav"],
  ["garden-broken-audio", "Cracked Picnic Speaker", "red", "Sunday Guide", "broken-audio.bin"],
  ["garden-four", "Clouds Over the Turntable", "green", "Mara", "sunday-signals.wav"],
  ["garden-five", "Tea Cooling Slowly", "blue", "Mara", "sunday-signals.wav"],
  ["garden-six", "The Long Walk Home", "red", "Ivo", "sunday-signals.wav"],
  ["garden-seven", "Apricot Radio", "green", "Ivo", "sunday-signals.wav"],
  ["garden-eight", "Last Record Before Dinner", "blue", "Sunday Guide", "sunday-signals.wav"],
]);

const SVG_FIXTURES = Object.freeze([
  ["cover-main.svg", "#123f43", "#f6c96d", "SUNDAY SIGNALS"],
  ["cover-recovery.svg", "#17355f", "#75d8ee", "PORCHLIGHT RECOVERY"],
  ["cover-broken.svg", "#5c202c", "#ff9aa8", "CRACKED SPEAKER"],
  ["character-sunday-guide.svg", "#163f37", "#61f0cb", "SUNDAY GUIDE"],
  ["reference-1.svg", "#3d2f19", "#ffd979", "PICNIC RECEIPT"],
  ["reference-2.svg", "#4c2740", "#ff98c5", "PORCHLIGHT MEMORY"],
  ["reference-3.svg", "#193f51", "#81d6ff", "BLUE HOUR NOTE"],
  ["reference-4.svg", "#344b21", "#a8e67a", "GARDEN MAP"],
  ["reference-5.svg", "#4d3122", "#ffbd7d", "TEA RING"],
  ["scene-1.svg", "#225344", "#a4efc3", "LAZY SUNDAY TABLE"],
  ["scene-2.svg", "#3b315d", "#b8a2ff", "TREE SHADE"],
  ["scene-3.svg", "#633f21", "#ffd08a", "GOLDEN PORCH"],
  ["scene-4.svg", "#244c63", "#8ddcff", "EVENING GARDEN"],
]);

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function declaredRights() {
  return {
    licenseStatus: "fixture-private-review",
    consentStatus: "fixture-private-review",
    visibility: "private",
    publicProjectionAllowed: false,
    attribution: ["Deterministic offline Record Garden acceptance fixture"],
  };
}

function summaryProject([songId, title, perspective, avatarName, audioFile], index) {
  return {
    music_video_project: {
      song_id: songId,
      song_title: title,
      perspective,
      avatar_id: avatarName === "Sunday Guide" ? "sunday-guide" : avatarName.toLowerCase(),
      avatar_name: avatarName,
      duration: 18,
      audio_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/${audioFile}`,
      cover_uri: index === 0
        ? `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/cover-main.svg`
        : index === 1
          ? `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/cover-recovery.svg`
          : index === 2
            ? `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/cover-broken.svg`
            : `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/reference-${(index % 5) + 1}.svg`,
      timeline_count: 4,
      direction_script_variant_count: 2,
      revision_id: `fixture-revision-${index + 1}`,
      vocal_mode: "instrumental",
      rightsAndPrivacy: declaredRights(),
      provenance: {
        status: "verified",
        source: "offline-contract-acceptance-fixture",
        fixture: true,
      },
    },
  };
}

function detailProject(songId) {
  const summary = FIXTURE_SONGS.find((entry) => entry[0] === songId) || FIXTURE_SONGS[0];
  const base = summaryProject(summary, Math.max(0, FIXTURE_SONGS.indexOf(summary))).music_video_project;
  return {
    ...base,
    timeline: [
      {
        id: `${songId}-shot-1`,
        start_sec: 0,
        end_sec: 4.5,
        media_title: "Needle finds the first groove",
        runtime_media_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/surface-a.mp4`,
        poster_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/scene-1.svg`,
        media_card_id: `${songId}-appearance-a`,
        decision_evidence: {
          truthStatus: "verified",
          sourceEvidence: { card: { id: `${songId}-appearance-a` } },
        },
        rightsAndPrivacy: declaredRights(),
      },
      {
        id: `${songId}-shot-2`,
        start_sec: 4.5,
        end_sec: 9,
        media_title: "Sunlight moves across the sleeve",
        runtime_media_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/surface-b.mp4`,
        poster_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/scene-2.svg`,
        media_card_id: `${songId}-appearance-b`,
        decision_evidence: {
          truthStatus: "verified",
          sourceEvidence: { card: { id: `${songId}-appearance-b` } },
        },
        rightsAndPrivacy: declaredRights(),
      },
      {
        id: `${songId}-shot-3`,
        start_sec: 9,
        end_sec: 13.5,
        media_title: "Tea and tree shadows",
        runtime_media_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/scene-3.svg`,
        media_card_id: `${songId}-appearance-c`,
        decision_evidence: {
          truthStatus: "verified",
          sourceEvidence: { card: { id: `${songId}-appearance-c` } },
        },
        rightsAndPrivacy: declaredRights(),
      },
      {
        id: `${songId}-shot-4`,
        start_sec: 13.5,
        end_sec: 18,
        media_title: "The garden settles",
        runtime_media_uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/scene-4.svg`,
        media_card_id: `${songId}-appearance-d`,
        decision_evidence: {
          truthStatus: "verified",
          sourceEvidence: { card: { id: `${songId}-appearance-d` } },
        },
        rightsAndPrivacy: declaredRights(),
      },
    ],
    updated_at: "2026-07-30T22:00:00.000Z",
  };
}

function fixtureReferences(songId) {
  return Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const missingVideo = index === 5;
    return {
      id: `fixture-reference-card-${number}`,
      referenceCardId: `fixture-reference-${number}`,
      cardType: "reference_card",
      title: missingVideo ? "Missing media fallback proof" : `Sunday reference ${number}`,
      imageUri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/reference-${Math.min(number, 5)}.svg`,
      ...(missingVideo ? {
        videoUri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/intentionally-missing.webm`,
      } : {}),
      occurrences: [{ songId }],
      authority: {
        reviewStatus: "approved",
        evidenceClass: "verified",
        canonStatus: "fixture-only",
      },
      rightsAndPrivacy: declaredRights(),
      referenceAtlas: {
        revisionId: `fixture-reference-revision-${number}`,
        citations: ["offline-fixture://record-garden"],
      },
    };
  });
}

function fixtureWorld() {
  return {
    schemaVersion: "hapa.scene-graph.v1",
    places: [{
      id: "fixture-garden-place",
      name: "Sunday Record Garden",
      title: "Sunday Record Garden",
      summary: "Deterministic private acceptance fixture.",
    }],
    scenes: Array.from({ length: 4 }, (_, index) => ({
      id: `fixture-garden-scene-${index + 1}`,
      placeId: "fixture-garden-place",
      title: ["Lazy Sunday table", "Tree shade", "Golden porch", "Evening garden"][index],
      summary: "A source-labelled scene used only by the offline acceptance harness.",
      canonStatus: "generated-placeholder",
      avatarTags: [{ avatarId: "sunday-guide", role: "lead" }],
      songIds: ["garden-main", "garden-recovery", "garden-broken-audio"],
      assets: [{
        id: `fixture-scene-asset-${index + 1}`,
        type: "image",
        uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/scene-${index + 1}.svg`,
      }],
      rightsAndPrivacy: declaredRights(),
    })),
    timelines: [],
  };
}

function fixtureAvatar() {
  return {
    id: "sunday-guide",
    schemaVersion: "hapa.avatar-card.v1",
    primaryName: "Sunday Guide",
    name: "Sunday Guide",
    names: [{ name: "Sunday Guide" }],
    aliases: ["Garden DJ"],
    role: "Album guide",
    assets: [{
      id: "sunday-guide-character",
      name: "Sunday Guide character portrait",
      type: "image",
      uri: `${RECORD_GARDEN_E2E_MEDIA_PREFIX}/character-sunday-guide.svg`,
      requirementId: "character_dossier",
      processing: { attachedToCard: true },
      source: "offline-contract-acceptance-fixture",
    }],
    rightsAndPrivacy: declaredRights(),
  };
}

function createRecordGardenFixtureDataset() {
  const avatar = fixtureAvatar();
  const world = fixtureWorld();
  const projects = FIXTURE_SONGS.map(summaryProject);
  const itemStore = { schemaVersion: "hapa.item-manager-store.v1", cards: [] };
  const inventory = { schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] };
  const kanban = { schemaVersion: "hapa.kanban.v1", overwindProjection: "shell", lanes: [] };
  return {
    projects,
    avatar,
    world,
    itemStore,
    inventory,
    kanban,
    bootstrap: {
      schemaVersion: "hapa.overwind.avatar-builder-shell.v1",
      overwind: { projection: "shell", fixture: true },
      avatars: [avatar],
      teams: [],
      selectedAvatar: avatar,
      selectedAvatarId: avatar.id,
      items: itemStore,
      inventory,
      kanban,
      world,
      telemetry: { waitingState: "Offline acceptance shell ready." },
    },
  };
}

function createRecordGardenFixtureState() {
  return {
    catalogRequests: 0,
    projectRequests: {},
    referenceRequests: 0,
    songCardHeadRequests: 0,
    songCardTimeRequests: 0,
    songCardPrintRequests: 0,
    tarotCardRequests: 0,
    mediaRequests: {},
    unexpectedApiRequests: [],
  };
}

function jsonResult(body, status = 200, headers = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
    body: `${JSON.stringify(body)}\n`,
  };
}

function parseBody(body = "") {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function routeRecordGardenFixtureApi(requestUrl, {
  method = "GET",
  body = "",
  state = createRecordGardenFixtureState(),
  dataset = createRecordGardenFixtureDataset(),
} = {}) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl), RECORD_GARDEN_E2E_ORIGIN);
  const pathname = url.pathname;

  if (pathname === "/api/health") {
    return jsonResult({
      service: "hapa-avatar-builder-record-garden-offline-fixture",
      ok: true,
      transport: RECORD_GARDEN_E2E_SCHEME,
      httpListener: false,
    });
  }
  if (pathname === "/api/overwind/bootstrap") return jsonResult(dataset.bootstrap);
  if (pathname === "/api/overwind/library") {
    return jsonResult({
      schemaVersion: "hapa.overwind.avatar-builder-library.v1",
      truth_state: "local-fixture",
      avatars: [dataset.avatar],
      teams: [],
      items: [],
      itemStore: dataset.itemStore,
      populations: { avatars: 1, items: 0 },
      watermarks: { avatars: "fixture", items: "fixture" },
    });
  }
  if (pathname === "/api/kanban") return jsonResult(dataset.kanban);
  if (pathname === "/api/world") return jsonResult(dataset.world);
  if (pathname === "/api/inventory") return jsonResult(dataset.inventory);
  if (pathname === "/api/items") return jsonResult(dataset.itemStore);
  if (pathname === "/api/avatars") return jsonResult({ avatars: [dataset.avatar], teams: [] });
  if (pathname === "/api/hapa-songs") {
    return jsonResult({
      schemaVersion: "hapa.hapa-song-store.v1",
      songs: FIXTURE_SONGS.map(([id, title]) => ({ id, title })),
    });
  }
  if (pathname === "/api/tarot") {
    return jsonResult({ schemaVersion: "hapa.tarot-library.v1", cards: [], decks: [], sets: [], spreads: [] });
  }
  if (pathname === "/api/subscribers/status") {
    return jsonResult({ ok: true, status: "offline-fixture", subscribers: 0 });
  }
  if (pathname === "/api/song-registry/dear-papa") {
    return jsonResult({
      songs: FIXTURE_SONGS.map(([id, title]) => ({ id, title })),
      total: FIXTURE_SONGS.length,
    });
  }

  if (pathname === "/api/echos/director-projects") {
    state.catalogRequests += 1;
    if (state.catalogRequests === 1) {
      return jsonResult({ error: "intentional_catalog_failure", retryable: true }, 503);
    }
    return jsonResult({ projects: dataset.projects });
  }

  if (pathname === "/api/echos/director-project") {
    const songId = url.searchParams.get("songId") || "";
    state.projectRequests[songId] = (state.projectRequests[songId] || 0) + 1;
    if (songId === "garden-recovery" && state.projectRequests[songId] === 1) {
      return jsonResult({ error: "intentional_project_failure", songId, retryable: true }, 503);
    }
    return jsonResult({ music_video_project: detailProject(songId) });
  }

  if (pathname === "/api/echos/references/tarot-cards") {
    const songId = url.searchParams.get("songId") || "garden-main";
    state.referenceRequests += 1;
    return jsonResult({ cards: fixtureReferences(songId) });
  }

  const songCardHead = pathname.match(/^\/api\/song-cards\/([^/]+)$/);
  if (songCardHead && method === "GET") {
    state.songCardHeadRequests += 1;
    return jsonResult({
      songId: decodeURIComponent(songCardHead[1]),
      latestEdition: 1,
      head: { latestEdition: 1, fixture: true },
    });
  }

  const songCardAtTime = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/cards-at-time$/);
  if (songCardAtTime && method === "GET") {
    state.songCardTimeRequests += 1;
    const timeMs = Math.max(0, Math.round(Number(url.searchParams.get("timeMs")) || 0));
    const appearanceId = "fixture-appearance-edition-1";
    const snapshot = {
      id: `fixture-historical-card-${timeMs}`,
      title: `Sunday Signals · ${timeMs}ms`,
      cardType: "song_card",
    };
    return jsonResult({
      truthStatus: "printable",
      primary: { appearanceId, snapshot },
      active: [{ appearanceId, snapshot }],
    });
  }

  const songCardPrint = pathname.match(/^\/api\/song-cards\/([^/]+)\/editions\/(\d+)\/print$/);
  if (songCardPrint && method === "POST") {
    state.songCardPrintRequests += 1;
    const request = parseBody(body);
    const songId = decodeURIComponent(songCardPrint[1]);
    const edition = Number(songCardPrint[2]);
    const timestampMs = Math.max(0, Math.round(Number(request.timeMs) || 0));
    const appearanceId = request.appearanceId || "fixture-appearance-edition-1";
    return jsonResult({
      card: {
        id: `fixture-printed-card-${songId}-${timestampMs}`,
        title: `Printed ${songId} at ${timestampMs}ms`,
        cardType: "song_card",
        songCardPrint: {
          schemaVersion: "hapa.song-card.print-receipt.v1",
          truthStatus: "fixture-authoritative-print",
          songId,
          edition,
          timestampMs,
          appearanceId,
          surface: request.surface || "",
        },
      },
    }, 201);
  }

  const tarotCard = pathname.match(/^\/api\/tarot\/card\/([^/]+)$/);
  if (tarotCard && method === "GET") {
    state.tarotCardRequests += 1;
    const cardId = decodeURIComponent(tarotCard[1]);
    if (cardId.includes("missing")) return jsonResult({ error: "not_found" }, 404);
    return jsonResult({
      id: cardId,
      title: `Fixture Card · ${cardId}`,
      cardType: "reference_card",
      truthStatus: "offline-fixture",
    });
  }

  state.unexpectedApiRequests.push({ method, pathname, search: url.search });
  return jsonResult({ error: "offline_fixture_route_not_found", method, pathname }, 404);
}

function svgMarkup(background, accent, label) {
  const safeLabel = String(label).replace(/[<>&]/g, "");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">',
    `<rect width="960" height="540" fill="${background}"/>`,
    `<circle cx="480" cy="270" r="190" fill="none" stroke="${accent}" stroke-width="12" opacity=".7"/>`,
    `<circle cx="480" cy="270" r="125" fill="none" stroke="${accent}" stroke-width="3" opacity=".45"/>`,
    `<path d="M80 410 C250 250 330 470 500 290 S760 240 880 110" fill="none" stroke="${accent}" stroke-width="7" opacity=".5"/>`,
    `<text x="480" y="270" text-anchor="middle" dominant-baseline="middle" fill="#fff8df" font-family="monospace" font-size="42" font-weight="700">${safeLabel}</text>`,
    '<text x="480" y="325" text-anchor="middle" fill="#fff8df" opacity=".72" font-family="monospace" font-size="18">OFFLINE ACCEPTANCE FIXTURE</text>',
    '</svg>',
  ].join("");
}

function wavBuffer({ durationSeconds = 18, sampleRate = 22_050 } = {}) {
  const frames = Math.round(durationSeconds * sampleRate);
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const seconds = frame / sampleRate;
    const envelope = Math.min(1, seconds * 3, (durationSeconds - seconds) * 3);
    const pulse = 0.52 + Math.sin(seconds * Math.PI * 2 * 0.65) * 0.16;
    const value = envelope * (
      Math.sin(seconds * Math.PI * 2 * 220) * 0.38
      + Math.sin(seconds * Math.PI * 2 * 330) * 0.22
      + Math.sin(seconds * Math.PI * 2 * 110) * 0.16 * pulse
    );
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * 32767))), 44 + frame * 2);
  }
  return buffer;
}

function resolveFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next local ffmpeg candidate.
    }
  }
  return "";
}

function writeFixtureVideo(ffmpeg, outputPath, hueOffset) {
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-f", "lavfi",
    "-i", "testsrc2=size=480x270:rate=24:duration=18",
    "-vf", `hue=h=2*PI*t/9+${hueOffset}:s=1.15,eq=contrast=1.08:brightness=-0.04`,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "25",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ], { stdio: "ignore" });
}

async function prepareRecordGardenFixtureMedia(outputDirectory) {
  await fsp.mkdir(outputDirectory, { recursive: true });
  const written = [];
  const write = async (name, bytes) => {
    const filePath = path.join(outputDirectory, name);
    await fsp.writeFile(filePath, bytes);
    const stat = await fsp.stat(filePath);
    written.push({
      name,
      path: filePath,
      bytes: stat.size,
      sha256: sha256(await fsp.readFile(filePath)),
    });
  };

  await write("sunday-signals.wav", wavBuffer());
  await write("broken-audio.bin", Buffer.from("This is intentionally not decodable audio.\n", "utf8"));
  for (const [name, background, accent, label] of SVG_FIXTURES) {
    await write(name, Buffer.from(svgMarkup(background, accent, label), "utf8"));
  }

  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) {
    throw new Error("The offline Record Garden fixture requires a local ffmpeg binary to create deterministic MP4 surfaces.");
  }
  for (const [name, offset] of [["surface-a.mp4", "0"], ["surface-b.mp4", "PI/2"]]) {
    const filePath = path.join(outputDirectory, name);
    writeFixtureVideo(ffmpeg, filePath, offset);
    const bytes = await fsp.readFile(filePath);
    written.push({ name, path: filePath, bytes: bytes.length, sha256: sha256(bytes) });
  }

  const manifest = {
    schemaVersion: "hapa.echo-record-garden.offline-fixture-media.v1",
    transport: RECORD_GARDEN_E2E_SCHEME,
    networkRequired: false,
    intentionallyMissing: ["intentionally-missing.webm"],
    files: written.sort((left, right) => left.name.localeCompare(right.name)),
    digest: sha256(Buffer.from(JSON.stringify(stableJson(written.map(({ name, bytes, sha256: digest }) => ({
      name,
      bytes,
      sha256: digest,
    })))))),
  };
  await fsp.writeFile(
    path.join(outputDirectory, "fixture-media-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

function contentTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".woff2": "font/woff2",
  }[extension] || "application/octet-stream";
}

async function fileDigest(filePath) {
  const bytes = await fsp.readFile(filePath);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

module.exports = {
  FIXTURE_SONGS,
  RECORD_GARDEN_E2E_HOST,
  RECORD_GARDEN_E2E_MEDIA_PREFIX,
  RECORD_GARDEN_E2E_ORIGIN,
  RECORD_GARDEN_E2E_SCHEME,
  contentTypeForFile,
  createRecordGardenFixtureDataset,
  createRecordGardenFixtureState,
  detailProject,
  fileDigest,
  fixtureReferences,
  prepareRecordGardenFixtureMedia,
  routeRecordGardenFixtureApi,
};
