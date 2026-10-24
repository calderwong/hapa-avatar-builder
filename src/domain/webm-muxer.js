// Minimal in-memory WebM (Matroska) writer for one VP8/VP9 video track and an
// optional Opus audio track. Built for deterministic offline exports: every
// block carries the explicit timestamp it was encoded with, never wall time.
// Output includes SeekHead, Info (with Duration), Tracks, Clusters and Cues.

const ID = Object.freeze({
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimecodeScale: 0x2ad7b1, MuxingApp: 0x4d80, WritingApp: 0x5741, Duration: 0x4489,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, CodecID: 0x86, CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa, SeekPreRoll: 0x56bb, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba, Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f,
  Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
});
const encoder = new TextEncoder();

function idBytes(id) {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return Uint8Array.from(out);
}
function vint(size, width = null) {
  let length = width || 1;
  while (!width && size >= 2 ** (7 * length) - 1) length++;
  if (length > 8) throw new RangeError("EBML size too large");
  const out = new Uint8Array(length);
  let value = size;
  for (let i = length - 1; i >= 0; i--) { out[i] = value % 256; value = Math.floor(value / 256); }
  out[0] |= 1 << (8 - length);
  return out;
}
function uint(value, width = null) {
  const bytes = [];
  for (let v = value; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  while (bytes.length < (width || 1)) bytes.unshift(0);
  return Uint8Array.from(bytes);
}
function float64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return out;
}
const concat = (parts) => {
  const total = parts.reduce((sum, p) => sum + p.length, 0), out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
};
function element(id, body) {
  const payload = body instanceof Uint8Array ? body : concat(body);
  return concat([idBytes(id), vint(payload.length), payload]);
}
const elUint = (id, value, width) => element(id, uint(value, width));
const elString = (id, value) => element(id, encoder.encode(value));

/** Standard OpusHead identification header (RFC 7845 §5.1). */
export function opusHead({ channels = 2, sampleRate = 48000, preSkip = 312 } = {}) {
  const head = new Uint8Array(19), view = new DataView(head.buffer);
  head.set(encoder.encode("OpusHead"), 0);
  head[8] = 1; head[9] = channels;
  view.setUint16(10, preSkip, true); view.setUint32(12, sampleRate, true); view.setInt16(16, 0, true); head[18] = 0;
  return head;
}

/**
 * createWebmMuxer({video:{codec:'V_VP9',width,height}, audio?:{sampleRate,channels,codecPrivate,codecDelayNs}})
 * addVideoChunk({data, timestampUs, keyframe}); addAudioChunk({data, timestampUs});
 * finalize({durationUs}) → Uint8Array
 */
export function createWebmMuxer({ video, audio = null, writingApp = "Hapa Echo Score Dust" } = {}) {
  if (!video?.width || !video?.height || !["V_VP8", "V_VP9"].includes(video.codec || "V_VP9")) throw new TypeError("A VP8/VP9 video track with width and height is required.");
  const blocks = [];
  let lastVideoUs = -1, lastAudioUs = -1;
  function addVideoChunk({ data, timestampUs, keyframe }) {
    if (!(timestampUs > lastVideoUs)) throw new RangeError("Video chunks must have increasing timestamps.");
    lastVideoUs = timestampUs;
    blocks.push({ track: 1, data: Uint8Array.from(data), us: timestampUs, keyframe: Boolean(keyframe) });
  }
  function addAudioChunk({ data, timestampUs }) {
    if (!audio) throw new Error("This muxer has no audio track.");
    if (!(timestampUs > lastAudioUs)) throw new RangeError("Audio chunks must have increasing timestamps.");
    lastAudioUs = timestampUs;
    blocks.push({ track: 2, data: Uint8Array.from(data), us: timestampUs, keyframe: true });
  }
  function finalize({ durationUs = null } = {}) {
    if (!blocks.some((b) => b.track === 1)) throw new Error("No video frames were added.");
    const ordered = [...blocks].sort((a, b) => a.us - b.us || a.track - b.track);
    if (!ordered[0].keyframe || ordered.find((b) => b.track === 1)?.keyframe !== true) throw new Error("The first video chunk must be a keyframe.");
    const durationMs = (durationUs ?? Math.max(...ordered.map((b) => b.us))) / 1000;
    const header = element(ID.EBML, [elUint(ID.EBMLVersion, 1), elUint(ID.EBMLReadVersion, 1), elUint(ID.EBMLMaxIDLength, 4), elUint(ID.EBMLMaxSizeLength, 8),
      elString(ID.DocType, "webm"), elUint(ID.DocTypeVersion, 4), elUint(ID.DocTypeReadVersion, 2)]);
    const info = element(ID.Info, [elUint(ID.TimecodeScale, 1_000_000), elString(ID.MuxingApp, "hapa-webm-muxer"), elString(ID.WritingApp, writingApp), element(ID.Duration, float64(durationMs))]);
    const trackEntries = [element(ID.TrackEntry, [elUint(ID.TrackNumber, 1), elUint(ID.TrackUID, 1), elUint(ID.TrackType, 1), elString(ID.CodecID, video.codec || "V_VP9"),
      element(ID.Video, [elUint(ID.PixelWidth, video.width), elUint(ID.PixelHeight, video.height)])])];
    if (audio) trackEntries.push(element(ID.TrackEntry, [elUint(ID.TrackNumber, 2), elUint(ID.TrackUID, 2), elUint(ID.TrackType, 2), elString(ID.CodecID, "A_OPUS"),
      element(ID.CodecPrivate, audio.codecPrivate || opusHead(audio)), elUint(ID.CodecDelay, Math.round(audio.codecDelayNs ?? 6_500_000)), elUint(ID.SeekPreRoll, 80_000_000),
      element(ID.Audio, [element(ID.SamplingFrequency, float64(audio.sampleRate || 48000)), elUint(ID.Channels, audio.channels || 2)])]));
    const tracks = element(ID.Tracks, trackEntries);
    // Clusters open on each video keyframe (and before int16 timecode overflow).
    const clusters = [], cuePoints = [];
    let current = null;
    const flush = () => { if (current) clusters.push({ ms: current.ms, bytes: element(ID.Cluster, [elUint(ID.Timecode, current.ms), ...current.parts]) }); current = null; };
    for (const block of ordered) {
      const ms = Math.round(block.us / 1000);
      if (!current || (block.track === 1 && block.keyframe) || ms - current.ms > 30000) {
        flush(); current = { ms, parts: [] };
        if (block.track === 1 && block.keyframe) cuePoints.push({ ms, clusterIndex: clusters.length });
      }
      const head = new Uint8Array(4), view = new DataView(head.buffer);
      head[0] = 0x80 | block.track; view.setInt16(1, ms - current.ms); head[3] = block.keyframe ? 0x80 : 0;
      current.parts.push(element(ID.SimpleBlock, concat([head, block.data])));
    }
    flush();
    // Fixed-width positions keep the SeekHead and Cues sizes independent of offsets.
    const seekEntry = (id, position) => element(ID.Seek, [element(ID.SeekID, idBytes(id)), elUint(ID.SeekPosition, position, 8)]);
    const seekHeadSize = element(ID.SeekHead, [seekEntry(ID.Info, 0), seekEntry(ID.Tracks, 0), seekEntry(ID.Cues, 0)]).length;
    const infoAt = seekHeadSize, tracksAt = infoAt + info.length, clustersAt = tracksAt + tracks.length;
    const clusterOffsets = [];
    let cursor = clustersAt;
    for (const c of clusters) { clusterOffsets.push(cursor); cursor += c.bytes.length; }
    const cues = element(ID.Cues, cuePoints.map((p) => element(ID.CuePoint, [elUint(ID.CueTime, p.ms), element(ID.CueTrackPositions, [elUint(ID.CueTrack, 1), elUint(ID.CueClusterPosition, clusterOffsets[p.clusterIndex], 8)])])));
    const seekHead = element(ID.SeekHead, [seekEntry(ID.Info, infoAt), seekEntry(ID.Tracks, tracksAt), seekEntry(ID.Cues, cursor)]);
    const segment = element(ID.Segment, [seekHead, info, tracks, ...clusters.map((c) => c.bytes), cues]);
    return concat([header, segment]);
  }
  return { addVideoChunk, addAudioChunk, finalize, get blockCount() { return blocks.length; } };
}

/** Tiny EBML reader used by tests and export self-checks. */
export function readEbml(bytes, start = 0, end = bytes.length) {
  const out = [];
  let at = start;
  const readVint = (keepMarker) => {
    const first = bytes[at];
    let length = 1;
    while (length <= 8 && !(first & (1 << (8 - length)))) length++;
    let value = keepMarker ? first : first & ((1 << (8 - length)) - 1);
    for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
    at += length;
    return value;
  };
  while (at < end) {
    const offset = at, id = readVint(true), size = readVint(false), dataAt = at;
    out.push({ id, size, offset, dataAt });
    at = dataAt + size;
  }
  return out;
}
export const WEBM_IDS = ID;
