import { createHash } from "node:crypto";

export const ECHO_RECORD_GARDEN_RECORDING_CARD_SCHEMA = "hapa.echo-record-garden.recording-card.v1";
export const ECHO_RECORD_GARDEN_RECORDING_RESULT_SCHEMA = "hapa.echo-record-garden.recording-result.v1";
export const ECHO_RECORD_GARDEN_RECORDING_MAX_BYTES = 96 * 1024 * 1024;
export const ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS = 180;
export const ECHO_RECORD_GARDEN_RECORDING_DURATION_TOLERANCE_SECONDS = 1;

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,239}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const DOC_TYPE_ID = 0x4282;
const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;
const TRACK_NUMBER_ID = 0xd7;
const TRACK_TYPE_ID = 0x83;
const CODEC_ID = 0x86;
const CLUSTER_ID = 0x1f43b675;
const SEEK_HEAD_ID = 0x114d9b74;
const INFO_ID = 0x1549a966;
const CUES_ID = 0x1c53bb6b;
const ATTACHMENTS_ID = 0x1941a469;
const CHAPTERS_ID = 0x1043a770;
const TAGS_ID = 0x1254c367;
const TIMESTAMP_ID = 0xe7;
const SILENT_TRACKS_ID = 0x5854;
const POSITION_ID = 0xa7;
const PREVIOUS_SIZE_ID = 0xab;
const SIMPLE_BLOCK_ID = 0xa3;
const BLOCK_GROUP_ID = 0xa0;
const BLOCK_ID = 0xa1;
const ENCRYPTED_BLOCK_ID = 0xaf;
const VOID_ID = 0xec;
const CRC_32_ID = 0xbf;
const MAX_EBML_ELEMENTS_PER_LEVEL = 4096;
const MAX_WEBM_CLUSTER_CHILDREN = 131_072;

const SEGMENT_LEVEL_ONE_IDS = new Set([
  SEEK_HEAD_ID,
  INFO_ID,
  TRACKS_ID,
  CLUSTER_ID,
  CUES_ID,
  ATTACHMENTS_ID,
  CHAPTERS_ID,
  TAGS_ID,
]);
const CLUSTER_CHILD_IDS = new Set([
  TIMESTAMP_ID,
  SILENT_TRACKS_ID,
  POSITION_ID,
  PREVIOUS_SIZE_ID,
  SIMPLE_BLOCK_ID,
  BLOCK_GROUP_ID,
  ENCRYPTED_BLOCK_ID,
]);
const GLOBAL_ELEMENT_IDS = new Set([VOID_ID, CRC_32_ID]);

let recordingTransactionTail = Promise.resolve();

function recordingError(code, message, statusCode = 422) {
  return Object.assign(new Error(message), { code, statusCode });
}

function headerValue(headers = {}, name = "") {
  const value = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value.join(",") : String(value ?? "");
}

function parseContentType(value = "") {
  const [rawMimeType = "", ...parameters] = String(value).split(";");
  const mimeType = boundedText(rawMimeType, 120).toLowerCase();
  const codecsParameter = parameters
    .map((parameter) => parameter.trim())
    .find((parameter) => /^codecs\s*=/iu.test(parameter));
  const codecs = codecsParameter
    ? codecsParameter.replace(/^codecs\s*=\s*/iu, "").replace(/^['"]|['"]$/gu, "")
      .split(",").map((codec) => codec.trim().toLowerCase()).filter(Boolean)
    : [];
  return { mimeType, codecs };
}

function requiredPositiveNumberHeader(headers, name, label) {
  const raw = headerValue(headers, name).trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value <= 0) {
    throw recordingError("record_garden_recording_metadata_invalid", `${label} must be a positive finite number.`);
  }
  return value;
}

function requiredIntegerHeader(headers, name, label, minimum, maximum) {
  const value = requiredPositiveNumberHeader(headers, name, label);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw recordingError("record_garden_recording_metadata_invalid", `${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function readVint(bytes, offset, { identifier = false, maximumLength = identifier ? 4 : 8 } = {}) {
  if (offset >= bytes.length) throw new TypeError("Unexpected end of EBML data.");
  const first = bytes[offset];
  let marker = 0x80;
  let length = 1;
  while (length <= maximumLength && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (!marker || length > maximumLength || offset + length > bytes.length) {
    throw new TypeError("Invalid EBML variable-length integer.");
  }
  let value = BigInt(identifier ? first : first & (marker - 1));
  for (let index = 1; index < length; index += 1) value = (value << 8n) | BigInt(bytes[offset + index]);
  const unknown = !identifier && value === (1n << BigInt(7 * length)) - 1n;
  return { length, value, unknown };
}

function readElement(bytes, offset, boundary = bytes.length) {
  const id = readVint(bytes, offset, { identifier: true });
  const size = readVint(bytes, offset + id.length);
  const dataStart = offset + id.length + size.length;
  if (dataStart > boundary) throw new TypeError("EBML element header exceeds its parent boundary.");
  const remaining = BigInt(boundary - dataStart);
  if (!size.unknown && size.value > remaining) throw new TypeError("EBML element exceeds its parent boundary.");
  const dataEnd = size.unknown ? boundary : dataStart + Number(size.value);
  return { id: Number(id.value), dataStart, dataEnd, nextOffset: dataEnd, unknownSize: size.unknown };
}

function childElements(bytes, start, end, { allowUnknownSizeIds = new Set() } = {}) {
  const elements = [];
  let offset = start;
  while (offset < end) {
    if (elements.length >= MAX_EBML_ELEMENTS_PER_LEVEL) {
      throw new TypeError("The WebM container exceeds the bounded EBML element budget.");
    }
    const element = readElement(bytes, offset, end);
    if (element.unknownSize && !allowUnknownSizeIds.has(element.id)) {
      throw new TypeError("Only the WebM Segment and Cluster may use unknown EBML sizes.");
    }
    elements.push(element);
    if (element.nextOffset <= offset) throw new TypeError("EBML parser made no forward progress.");
    offset = element.nextOffset;
  }
  return elements;
}

function consumeStreamingElementBudget(budget) {
  budget.count += 1;
  if (budget.count > MAX_WEBM_CLUSTER_CHILDREN) {
    throw new TypeError("The WebM streaming media exceeds the bounded EBML element budget.");
  }
}

function unknownClusterEnd(bytes, start, end, budget) {
  let offset = start;
  while (offset < end) {
    const element = readElement(bytes, offset, end);
    if (SEGMENT_LEVEL_ONE_IDS.has(element.id)) return offset;
    consumeStreamingElementBudget(budget);
    if (!CLUSTER_CHILD_IDS.has(element.id) && !GLOBAL_ELEMENT_IDS.has(element.id)) {
      throw new TypeError("An unknown-size WebM Cluster contains an unsupported child element.");
    }
    if (element.unknownSize) {
      throw new TypeError("Only the WebM Segment and Cluster may use unknown EBML sizes.");
    }
    if (element.nextOffset <= offset) throw new TypeError("EBML parser made no forward progress.");
    offset = element.nextOffset;
  }
  return end;
}

function segmentElements(bytes, start, end) {
  const elements = [];
  const boundaryBudget = { count: 0 };
  let offset = start;
  while (offset < end) {
    if (elements.length >= MAX_EBML_ELEMENTS_PER_LEVEL) {
      throw new TypeError("The WebM Segment exceeds the bounded EBML element budget.");
    }
    const element = readElement(bytes, offset, end);
    if (!SEGMENT_LEVEL_ONE_IDS.has(element.id) && !GLOBAL_ELEMENT_IDS.has(element.id)) {
      throw new TypeError("The WebM Segment contains an unsupported top-level element.");
    }
    if (element.unknownSize && element.id !== CLUSTER_ID) {
      throw new TypeError("Only the WebM Segment and Cluster may use unknown EBML sizes.");
    }
    const boundedElement = element.id === CLUSTER_ID && element.unknownSize
      ? (() => {
        const dataEnd = unknownClusterEnd(bytes, element.dataStart, end, boundaryBudget);
        return { ...element, dataEnd, nextOffset: dataEnd };
      })()
      : element;
    elements.push(boundedElement);
    if (boundedElement.nextOffset <= offset) throw new TypeError("EBML parser made no forward progress.");
    offset = boundedElement.nextOffset;
  }
  return elements;
}

function unsignedInteger(bytes, start, end) {
  const length = end - start;
  if (length < 1 || length > 8) throw new TypeError("Invalid EBML unsigned integer width.");
  let value = 0n;
  for (let index = start; index < end; index += 1) value = (value << 8n) | BigInt(bytes[index]);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("EBML unsigned integer is too large.");
  return Number(value);
}

function blockTrackNumber(bytes, start, end) {
  if (end - start < 5) throw new TypeError("A WebM media block has no encoded frame payload.");
  const trackNumber = readVint(bytes, start);
  if (trackNumber.unknown || trackNumber.value < 1n || trackNumber.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("A WebM media block has an invalid track number.");
  }
  return Number(trackNumber.value);
}

function sampledTrackNumbers(bytes, clusters = []) {
  const sampled = new Set();
  const mediaBudget = { count: 0 };
  for (const cluster of clusters) {
    let offset = cluster.dataStart;
    while (offset < cluster.dataEnd) {
      const element = readElement(bytes, offset, cluster.dataEnd);
      consumeStreamingElementBudget(mediaBudget);
      if (SEGMENT_LEVEL_ONE_IDS.has(element.id)) {
        throw new TypeError("A WebM Cluster contains a Segment-level sibling inside its resolved boundary.");
      }
      if (!CLUSTER_CHILD_IDS.has(element.id) && !GLOBAL_ELEMENT_IDS.has(element.id)) {
        throw new TypeError("A WebM Cluster contains an unsupported child element.");
      }
      if (element.unknownSize) {
        throw new TypeError("Only the WebM Segment and Cluster may use unknown EBML sizes.");
      }
      if (element.id === SIMPLE_BLOCK_ID) {
        sampled.add(blockTrackNumber(bytes, element.dataStart, element.dataEnd));
      } else if (element.id === BLOCK_GROUP_ID) {
        const block = childElements(bytes, element.dataStart, element.dataEnd)
          .find((candidate) => candidate.id === BLOCK_ID);
        if (block) sampled.add(blockTrackNumber(bytes, block.dataStart, block.dataEnd));
      }
      if (element.nextOffset <= offset) throw new TypeError("EBML parser made no forward progress.");
      offset = element.nextOffset;
    }
  }
  return sampled;
}

function codecToken(codecId = "") {
  const tokens = {
    V_VP8: "vp8",
    V_VP9: "vp9",
    V_AV1: "av1",
    A_OPUS: "opus",
    A_VORBIS: "vorbis",
  };
  return tokens[codecId] || "";
}

export function inspectEchoRecordGardenWebM(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) {
    throw recordingError("record_garden_recording_container_invalid", "The uploaded capture is not a complete WebM container.");
  }
  try {
    const topLevel = childElements(bytes, 0, bytes.length, { allowUnknownSizeIds: new Set([SEGMENT_ID]) });
    if (topLevel[0]?.id !== EBML_ID) throw new TypeError("The WebM EBML header is missing.");
    const headerElements = childElements(bytes, topLevel[0].dataStart, topLevel[0].dataEnd);
    const docTypeElement = headerElements.find((element) => element.id === DOC_TYPE_ID);
    const docType = docTypeElement
      ? bytes.toString("utf8", docTypeElement.dataStart, docTypeElement.dataEnd).replace(/\0+$/gu, "").trim().toLowerCase()
      : "";
    if (docType !== "webm") throw new TypeError("The EBML document type is not WebM.");

    const segment = topLevel.find((element) => element.id === SEGMENT_ID);
    if (!segment) throw new TypeError("The WebM Segment is missing.");
    const children = segmentElements(bytes, segment.dataStart, segment.dataEnd);
    const tracks = children.find((element) => element.id === TRACKS_ID);
    if (!tracks) throw new TypeError("The WebM Tracks element is missing.");

    const trackEntries = childElements(bytes, tracks.dataStart, tracks.dataEnd)
      .filter((element) => element.id === TRACK_ENTRY_ID)
      .map((entry) => {
        const fields = childElements(bytes, entry.dataStart, entry.dataEnd);
        const numberField = fields.find((field) => field.id === TRACK_NUMBER_ID);
        const typeField = fields.find((field) => field.id === TRACK_TYPE_ID);
        const codecField = fields.find((field) => field.id === CODEC_ID);
        return {
          number: numberField ? unsignedInteger(bytes, numberField.dataStart, numberField.dataEnd) : 0,
          type: typeField ? unsignedInteger(bytes, typeField.dataStart, typeField.dataEnd) : 0,
          codecId: codecField
            ? bytes.toString("utf8", codecField.dataStart, codecField.dataEnd).replace(/\0+$/gu, "").trim().toUpperCase()
            : "",
        };
      });
    const video = trackEntries.filter((track) => track.type === 1);
    const audio = trackEntries.filter((track) => track.type === 2);
    if (!video.length) throw new TypeError("The WebM container has no video track.");
    if (!audio.length) throw new TypeError("The WebM container has no audio track.");
    const trackNumbers = trackEntries.map((track) => track.number);
    if (trackNumbers.some((number) => !number) || new Set(trackNumbers).size !== trackNumbers.length) {
      throw new TypeError("The WebM TrackEntry numbers are missing or duplicated.");
    }
    if (video.some((track) => !track.codecId.startsWith("V_")) || audio.some((track) => !track.codecId.startsWith("A_"))) {
      throw new TypeError("The WebM TrackType and CodecID declarations disagree.");
    }
    const clusters = children.filter((element) => element.id === CLUSTER_ID);
    if (!clusters.length) throw new TypeError("The WebM container has no media Cluster.");
    const sampledTracks = sampledTrackNumbers(bytes, clusters);
    if (video.some((track) => !sampledTracks.has(track.number))) throw new TypeError("The WebM video track has no media frames.");
    if (audio.some((track) => !sampledTracks.has(track.number))) throw new TypeError("The WebM audio track has no media frames.");
    return {
      docType,
      videoTracks: video.length,
      audioTracks: audio.length,
      videoCodecs: video.map((track) => track.codecId),
      audioCodecs: audio.map((track) => track.codecId),
      sampledTrackNumbers: [...sampledTracks].sort((left, right) => left - right),
      codecTokens: [...video, ...audio].map((track) => codecToken(track.codecId)).filter(Boolean),
    };
  } catch (error) {
    if (error?.code === "record_garden_recording_container_invalid") throw error;
    throw recordingError(
      "record_garden_recording_container_invalid",
      `The uploaded capture is not a valid WebM recording: ${error?.message || String(error)}`,
    );
  }
}

export function validateEchoRecordGardenRecordingIdempotencyKey(value, sessionId) {
  const key = boundedText(value, 500);
  const expected = `record-garden:${sessionId}`;
  if (!key) {
    throw recordingError("record_garden_recording_idempotency_required", "A Record Garden idempotency key is required.", 428);
  }
  if (key !== expected) {
    throw recordingError("record_garden_recording_idempotency_mismatch", "The Record Garden idempotency key does not match the capture session.", 409);
  }
  return key;
}

export function echoRecordGardenRecordingBytesMatch(bytes, recording = {}) {
  return Buffer.isBuffer(bytes)
    && bytes.length === recording.sizeBytes
    && HEX_64.test(recording.contentHash || "")
    && sha256Hex(bytes) === recording.contentHash;
}

export function runEchoRecordGardenRecordingTransaction(operation) {
  if (typeof operation !== "function") throw new TypeError("A Record Garden recording transaction operation is required.");
  const result = recordingTransactionTail.catch(() => {}).then(operation);
  recordingTransactionTail = result.then(() => undefined, () => undefined);
  return result;
}

function boundedText(value = "", limit = 500) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, limit);
}

function decodedHeader(value = "", limit = 500) {
  const text = String(value || "");
  try {
    return boundedText(decodeURIComponent(text), limit);
  } catch {
    return boundedText(text, limit);
  }
}

function safeIdentity(value = "") {
  const text = boundedText(value, 240);
  return SAFE_ID.test(text) ? text : "";
}

function requiredSafeIdentityHeader(headers, name, label) {
  const identity = safeIdentity(headerValue(headers, name));
  if (!identity) {
    throw recordingError(
      "record_garden_recording_lineage_invalid",
      `${label} must be an explicit safe identifier from 8 through 240 characters.`,
    );
  }
  return identity;
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEchoRecordGardenRecordingRequest({ headers = {}, bytes } = {}) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) {
    throw recordingError("record_garden_recording_empty", "A non-empty Record Garden capture is required.");
  }
  if (bytes.length > ECHO_RECORD_GARDEN_RECORDING_MAX_BYTES) {
    throw recordingError(
      "record_garden_recording_too_large",
      `Record Garden captures are limited to ${ECHO_RECORD_GARDEN_RECORDING_MAX_BYTES} bytes.`,
      413,
    );
  }
  const contentType = parseContentType(headerValue(headers, "content-type"));
  const { mimeType } = contentType;
  if (mimeType !== "video/webm") {
    throw recordingError(
      "record_garden_recording_mime_unsupported",
      "Record Garden currently accepts browser-recorded WebM video only.",
      415,
    );
  }
  const container = inspectEchoRecordGardenWebM(bytes);
  if (contentType.codecs.length) {
    const missingCodecs = contentType.codecs.filter((codec) => !container.codecTokens.includes(codec));
    if (missingCodecs.length) {
      throw recordingError(
        "record_garden_recording_codec_mismatch",
        `The declared WebM codecs do not match its Tracks metadata: ${missingCodecs.join(", ")}.`,
      );
    }
  }
  const durationSeconds = requiredPositiveNumberHeader(
    headers,
    "x-hapa-recording-duration",
    "Record Garden duration",
  );
  if (durationSeconds > ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS + ECHO_RECORD_GARDEN_RECORDING_DURATION_TOLERANCE_SECONDS) {
    throw recordingError(
      "record_garden_recording_duration_invalid",
      `Record Garden captures are limited to ${ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS} seconds plus a one-second recorder-finalization tolerance.`,
    );
  }
  const sessionId = safeIdentity(headerValue(headers, "x-hapa-recording-id"));
  if (!sessionId) {
    throw recordingError("record_garden_recording_id_invalid", "A stable Record Garden recording ID is required.");
  }
  const audioTracks = requiredIntegerHeader(
    headers,
    "x-hapa-recording-audio-tracks",
    "Record Garden audio-track count",
    1,
    8,
  );
  if (audioTracks !== container.audioTracks) {
    throw recordingError(
      "record_garden_recording_audio_mismatch",
      `The declared audio-track count (${audioTracks}) does not match the WebM container (${container.audioTracks}).`,
    );
  }
  const contentHash = sha256Hex(bytes);
  const declaredHash = headerValue(headers, "x-hapa-recording-sha256").replace(/^sha256:/iu, "").trim().toLowerCase();
  if (declaredHash && (!HEX_64.test(declaredHash) || declaredHash !== contentHash)) {
    throw recordingError("record_garden_recording_digest_mismatch", "The declared recording digest does not match the uploaded WebM bytes.", 409);
  }
  return {
    sessionId,
    title: decodedHeader(headerValue(headers, "x-hapa-recording-title"), 180) || "Echo State · Record Garden Session",
    songId: requiredSafeIdentityHeader(headers, "x-hapa-recording-song-id", "Record Garden song ID"),
    songTitle: decodedHeader(headerValue(headers, "x-hapa-recording-song-title"), 180) || "Echo State",
    cutId: requiredSafeIdentityHeader(headers, "x-hapa-recording-cut-id", "Record Garden Director cut ID"),
    cutTitle: decodedHeader(headerValue(headers, "x-hapa-recording-cut-title"), 180) || "Director cut",
    weatherPhase: boundedText(headerValue(headers, "x-hapa-recording-weather"), 40) || "high-noon",
    rightsStatus: boundedText(headerValue(headers, "x-hapa-recording-rights"), 80) || "review-required-before-public-release",
    durationSeconds,
    width: requiredIntegerHeader(headers, "x-hapa-recording-width", "Record Garden width", 1, 8192),
    height: requiredIntegerHeader(headers, "x-hapa-recording-height", "Record Garden height", 1, 8192),
    fps: requiredIntegerHeader(headers, "x-hapa-recording-fps", "Record Garden frame rate", 1, 120),
    videoTracks: container.videoTracks,
    audioTracks,
    mimeType,
    contentType: headerValue(headers, "content-type").trim().toLowerCase(),
    videoCodecs: container.videoCodecs,
    audioCodecs: container.audioCodecs,
    sizeBytes: bytes.length,
    contentHash,
  };
}

export function echoRecordGardenRecordingFileName(recording = {}) {
  if (!HEX_64.test(recording.contentHash || "")) throw new TypeError("A SHA-256 recording content hash is required.");
  return `echo-record-garden-${recording.contentHash}.webm`;
}

export function buildEchoRecordGardenRecordingCard({
  recording,
  mediaUri,
  createdAt = new Date().toISOString(),
  actorId = "local-operator",
} = {}) {
  if (!recording || !HEX_64.test(recording.contentHash || "")) throw new TypeError("A normalized Record Garden recording is required.");
  const expectedMediaUri = `/media/${echoRecordGardenRecordingFileName(recording)}`;
  if (mediaUri !== expectedMediaUri) throw new TypeError("The Record Garden Card media URI must be its content-addressed local media URI.");
  const sourceIdentity = JSON.stringify([
    ECHO_RECORD_GARDEN_RECORDING_CARD_SCHEMA,
    recording.contentHash,
    recording.songId,
    recording.cutId,
  ]);
  const cardId = `record-garden-card-${sha256Hex(sourceIdentity).slice(0, 32)}`;
  const assetId = `${cardId}-loop-video`;
  const presentation = {
    id: `${cardId}:presentation`,
    sourceId: assetId,
    songId: recording.songId,
    title: recording.title,
    kind: "video",
    mediaUri,
    videoUri: mediaUri,
    imageUri: "",
    posterUri: "",
    sourceStartSeconds: 0,
    sourceEndSeconds: recording.durationSeconds,
    durationSeconds: recording.durationSeconds,
    playbackMode: "loop",
    clockLocked: false,
    source: {
      revisionId: recording.contentHash,
      cutId: recording.cutId,
      cutTitle: recording.cutTitle,
    },
  };
  return {
    schemaVersion: ECHO_RECORD_GARDEN_RECORDING_CARD_SCHEMA,
    id: cardId,
    cardId,
    title: recording.title,
    subtitle: `${recording.songTitle} · ${recording.durationSeconds.toFixed(1)}s Garden session`,
    cardType: "reference_card",
    status: "draft",
    suit: "custom",
    arcana: "custom",
    orientation: "upright",
    number: "REC",
    meaning: "A local Record Garden performance capture preserving the visible 3D session, mastered song audio, and declared song and Director-cut identifiers.",
    promptNotes: "Looping Record Garden session Card. Public release still requires separate rights and publication review.",
    keywords: ["record-garden", "session-recording", "echo-state", "director-cut", "loop-video"],
    tags: ["hapa-card", "echo-record-garden", "local-capture", "loop-video"],
    truthStatus: "proposed-unminted-recording-card",
    minted: false,
    published: false,
    canonical: false,
    commerceEligible: false,
    authorityState: {
      custody: "pending",
      minted: false,
      published: false,
      canonical: false,
      commerceEligible: false,
    },
    sourceKind: "echo-record-garden-session",
    sourceRefs: [
      {
        kind: "recording-content",
        revisionId: recording.contentHash,
        recordDigest: recording.contentHash,
        label: "Captured Record Garden WebM",
        license: recording.rightsStatus,
      },
      { kind: "song", cardId: recording.songId, label: recording.songTitle },
      { kind: "director-cut", cardId: recording.cutId, label: recording.cutTitle },
    ],
    attribution: {
      source: "Hapa Avatar Builder / Record Garden",
      creator: boundedText(actorId, 120),
      tool: "Browser MediaRecorder + Record Garden master audio",
      license: recording.rightsStatus,
    },
    assets: [{
      id: assetId,
      type: "video",
      role: "loop_video",
      label: recording.title,
      uri: mediaUri,
      source: "echo-record-garden-record-mode",
      metadata: {
        tarotMediaRole: "loop_video",
        mimeType: recording.mimeType,
        contentType: recording.contentType,
        sha256: recording.contentHash,
        sizeBytes: recording.sizeBytes,
        durationSeconds: recording.durationSeconds,
        width: recording.width,
        height: recording.height,
        fps: recording.fps,
        videoTracks: recording.videoTracks,
        audioTracks: recording.audioTracks,
        videoCodecs: recording.videoCodecs,
        audioCodecs: recording.audioCodecs,
      },
    }],
    primaryAssetId: null,
    enrichment: {
      status: "enriched",
      method: "record-garden-record-mode",
      confidence: "high",
      needsReview: recording.rightsStatus !== "cleared-for-public-release",
      media: {
        recordGarden: {
          schemaVersion: ECHO_RECORD_GARDEN_RECORDING_CARD_SCHEMA,
          sessionId: recording.sessionId,
          title: recording.title,
          songId: recording.songId,
          songTitle: recording.songTitle,
          cutId: recording.cutId,
          cutTitle: recording.cutTitle,
          weatherPhase: recording.weatherPhase,
          contentHash: recording.contentHash,
          rightsStatus: recording.rightsStatus,
          actorId: boundedText(actorId, 120),
          durationSeconds: recording.durationSeconds,
          width: recording.width,
          height: recording.height,
          fps: recording.fps,
          videoTracks: recording.videoTracks,
          audioTracks: recording.audioTracks,
          mimeType: recording.mimeType,
          contentType: recording.contentType,
          videoCodecs: recording.videoCodecs,
          audioCodecs: recording.audioCodecs,
          truthStatus: "proposed-unminted-recording-card",
        },
        presentation,
      },
      enrichedAt: createdAt,
    },
    echoRecordAttachment: {
      sourceVisualId: presentation.id,
      sourceSongId: recording.songId,
      sourceCardId: cardId,
      sourceRevisionId: recording.contentHash,
      directorRevisionId: recording.cutId,
      atSeconds: 0,
      surface: "echo-record-garden",
      truthStatus: "proposed-unminted-recording-card",
      presentation,
    },
    mediaTelemetry: {
      durationSeconds: recording.durationSeconds,
      width: recording.width,
      height: recording.height,
      fps: recording.fps,
      audioTracks: recording.audioTracks,
      videoTracks: recording.videoTracks,
      mimeType: recording.mimeType,
      contentType: recording.contentType,
      videoCodecs: recording.videoCodecs,
      audioCodecs: recording.audioCodecs,
      sizeBytes: recording.sizeBytes,
      sha256: recording.contentHash,
    },
    lineage: {
      createdAt,
      source: "echo-record-garden-record-mode",
      sourceSongId: recording.songId,
      sourceCutId: recording.cutId,
      captureSessionId: recording.sessionId,
      contentHash: recording.contentHash,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export function finalizeEchoRecordGardenRecordingCard({ card, receipt } = {}) {
  const cardId = boundedText(card?.cardId || card?.id, 240);
  if (!cardId || receipt?.cardId !== cardId || !HEX_64.test(receipt?.cardCoreKey || "") || !HEX_64.test(receipt?.cardRecordDigest || "")) {
    throw new TypeError("A matching verified Card custody receipt is required to finalize a Record Garden recording Card.");
  }
  if (receipt.minted !== false || receipt.catalogPublished !== false || receipt.canonical !== false || receipt.commerceEligible !== false) {
    throw new TypeError("Record Garden recording custody must remain unminted, unpublished, non-canonical, and commerce-ineligible.");
  }
  const enrichment = card?.enrichment && typeof card.enrichment === "object" ? card.enrichment : {};
  const media = enrichment.media && typeof enrichment.media === "object" ? enrichment.media : {};
  const recordGarden = media.recordGarden && typeof media.recordGarden === "object" ? media.recordGarden : {};
  const presentation = media.presentation && typeof media.presentation === "object" ? media.presentation : null;
  const contentHash = boundedText(recordGarden.contentHash, 64).toLowerCase();
  if (!HEX_64.test(contentHash) || !presentation?.videoUri) {
    throw new TypeError("The persisted Record Garden Card is missing its content digest or looping presentation.");
  }
  const asset = (Array.isArray(card.assets) ? card.assets : []).find((candidate) => (
    candidate?.metadata?.tarotMediaRole === "loop_video" || candidate?.id === presentation.sourceId
  ));
  if (!asset || asset.uri !== presentation.videoUri || asset.metadata?.sha256 !== contentHash) {
    throw new TypeError("The persisted Record Garden Card asset does not match its content-addressed presentation.");
  }
  const createdAt = card.createdAt || enrichment.enrichedAt || receipt.createdAt;
  const truthStatus = "durable-local-card";
  const sourceRefs = [
    {
      kind: "recording-content",
      revisionId: contentHash,
      recordDigest: contentHash,
      label: "Captured Record Garden WebM",
      license: recordGarden.rightsStatus,
    },
    { kind: "song", cardId: recordGarden.songId, label: recordGarden.songTitle },
    { kind: "director-cut", cardId: recordGarden.cutId, label: recordGarden.cutTitle },
  ];
  const echoRecordAttachment = {
    sourceVisualId: presentation.id,
    sourceSongId: recordGarden.songId,
    sourceCardId: cardId,
    sourceRevisionId: contentHash,
    directorRevisionId: recordGarden.cutId,
    atSeconds: 0,
    surface: "echo-record-garden",
    truthStatus,
    presentation,
  };
  const mediaTelemetry = {
    durationSeconds: recordGarden.durationSeconds,
    width: recordGarden.width,
    height: recordGarden.height,
    fps: recordGarden.fps,
    videoTracks: recordGarden.videoTracks,
    audioTracks: recordGarden.audioTracks,
    mimeType: recordGarden.mimeType,
    contentType: recordGarden.contentType,
    videoCodecs: recordGarden.videoCodecs,
    audioCodecs: recordGarden.audioCodecs,
    sizeBytes: asset.metadata?.sizeBytes,
    sha256: contentHash,
  };
  return {
    ...card,
    cardId,
    cardCoreKey: receipt.cardCoreKey,
    cardRevisionId: receipt.cardRevisionId,
    cardRecordDigest: receipt.cardRecordDigest,
    recordDigest: receipt.cardRecordDigest,
    originPublicKey: receipt.originPublicKey,
    subtitle: card.subtitle || `${recordGarden.songTitle || "Echo State"} · ${Number(recordGarden.durationSeconds || 0).toFixed(1)}s Garden session`,
    truthStatus,
    minted: false,
    published: false,
    canonical: false,
    commerceEligible: false,
    authorityState: {
      custody: "origin_appended",
      minted: false,
      published: false,
      canonical: false,
      commerceEligible: false,
    },
    sourceKind: "echo-record-garden-session",
    sourceRefs,
    attribution: {
      source: "Hapa Avatar Builder / Record Garden",
      creator: recordGarden.actorId,
      tool: "Browser MediaRecorder + Record Garden master audio",
      license: recordGarden.rightsStatus,
    },
    enrichment: {
      ...enrichment,
      media: {
        ...media,
        recordGarden: {
          ...recordGarden,
          truthStatus,
        },
      },
    },
    echoRecordAttachment,
    mediaTelemetry,
    lineage: {
      createdAt,
      source: "echo-record-garden-record-mode",
      sourceSongId: recordGarden.songId,
      sourceCutId: recordGarden.cutId,
      captureSessionId: recordGarden.sessionId,
      contentHash,
    },
    custody: {
      ...(card.custody && typeof card.custody === "object" ? card.custody : {}),
      ...receipt,
    },
  };
}
