#!/usr/bin/env node
// Echo Album keyframe prompt baseline — Conviction enrichment v1
// For every Dear Papa / Echo Album song:
//   1. analyze the song relative to the rest of the album (shared refs/themes, color role, arc position)
//   2. identify references (explicit connectors + catalog signal scan of lyrics)
//   3. craft generative-AI image prompts, one key-frame every 4-count (musical bar pairs),
//      cast with Builder characters (Red / Blue / Green / Bella) as identity seed references,
//      narrative-continuous like a music video, in the Hapa Aesthetic (Brushed Pixel / Detailed Comic Book).
// Output: data/echo-keyframe-prompt-baseline/<songId>.json + index.json (append-only, never overwrites human-approved artifacts).
//
// Two-pass prompt architecture:
//   pass1 "universal"  — model-agnostic narrative prompt (works on any general image model)
//   pass2 "profiles"   — per-model adaptation (gpt-image, midjourney, flux-dev, sdxl)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STORE = path.join(ROOT, 'data/hapa-songs-store.json');
const TELEMETRY_DIR = '/Users/calderwong/Desktop/hapa-song-registry/data/audio_telemetry/latest';
const OUT_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline');
const COUNT_BEATS = 4; // one key-frame every 4-count
const DEFAULT_BPM = 90;

// ---------- Character seed packs (from live avatar-store + human-verified seed invariants) ----------
const CAST = {
  'red-reaper': {
    name: 'Red', aliases: ['Reaper'], colorRole: 'red',
    ship: 'HSS Red Forge', role: 'Core Protocol Team Lead, Fire-Control Specialist',
    invariants: ['Red face', 'black-and-red armor', 'worn red cap', 'grounded protective silhouette'],
    energy: 'protective pressure and practical care; stress-tests everything for the common good',
  },
  'avatar-2': {
    name: 'Blue', aliases: ['Orion', 'Blue Architect'], colorRole: 'blue',
    ship: 'HSS Blue Lance', role: 'Strategist, source-provenance pilot, bard, parity guardian',
    invariants: ['same face and short dark hair', 'navy Orion flight-suit silhouette with cyan accents', 'red earbud wire', 'precise but warm navigator presence'],
    energy: 'attentive, traceable, makes claims traceable and stories able to return home',
  },
  'avatar-3': {
    name: 'Green', aliases: ['Conviction', 'Hooded Archer', 'Beast Whisperer'], colorRole: 'green',
    ship: 'HSS Green Consul', role: 'Execution anchor, hooded archer, dancer, Wild Accord field operator',
    invariants: ['Green registered face', 'dark beard and hooded ranger silhouette', 'weathered forest armor', 'living-wood bow'],
    energy: 'action serving living stakeholders; animal-bonded, dancer rhythm',
  },
  'pinokio-bella': {
    name: 'Bella', aliases: ["lil'"], colorRole: 'cream/red-accent',
    ship: null, role: 'Dancer, beloved; the tender heart-thread of the album',
    invariants: ['same Bella face', 'long dark hair', 'warm olive/tan skin', 'red-and-cream flowing dance outfit', 'gold jewelry', 'visually distinct from Green'],
    energy: 'grace under memory; dance as emotional translation',
  },
};

const AESTHETIC = {
  name: 'Hapa Aesthetic — Brushed Pixel / Detailed Comic Book',
  universal: 'Hapa Aesthetic: brushed-pixel texture over detailed comic-book rendering — crisp ink linework, halftone-dot shading, hand-brushed color plates with visible horizontal pixel drag, cinematic rim light, saturated team-color accents (crimson red, deep navy-cyan, living green, warm cream-gold), 1990s anime-print grain, dramatic panel-scale composition',
  negative: 'readable text, logos, UI, watermarks, phones, photoreal skin, plastic 3D render, blurry mush, extra limbs, malformed anatomy, franchise character imitation, costume copy of existing IP, generic centered portrait',
};

// ---------- Load ----------
function lyricsText(song) {
  const l = song.lyrics;
  if (!l) return '';
  if (typeof l === 'string') return l;
  return l.text || '';
}

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const songs = store.songs;
const refCatalog = store.referenceCatalog || [];
const refById = new Map(refCatalog.map(r => [r.id, r]));

// telemetry bpm map by registryTrackId
const bpmByTrack = new Map();
if (fs.existsSync(TELEMETRY_DIR)) {
  for (const f of fs.readdirSync(TELEMETRY_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TELEMETRY_DIR, f), 'utf8'));
      const bpm = t.rhythm && t.rhythm.bpm;
      if (bpm && bpm > 40 && bpm < 220) bpmByTrack.set(t.songId || f.replace('.json', ''), bpm);
      if (t.songId) bpmByTrack.set(t.songId, bpm || bpmByTrack.get(t.songId));
    } catch { /* skip */ }
  }
}

// ---------- 1. Album-relative analysis ----------
const refsBySong = new Map();       // songId -> Set(referenceId)  (explicit connectors)
const themesBySong = new Map();     // songId -> Set(theme)
for (const s of songs) {
  const refs = new Set();
  for (const c of s.referenceConnectors || []) {
    refs.add(c.referenceId);
    const r = refById.get(c.referenceId);
    if (r) for (const th of r.themes || []) (themesBySong.get(s.id) || themesBySong.set(s.id, new Set()).get(s.id)).add(th);
  }
  refsBySong.set(s.id, refs);
}

function albumContext(song) {
  const myRefs = refsBySong.get(song.id) || new Set();
  const myColor = (song.performancePerspective || {}).avatarId || null;
  const sharedReferences = [];
  for (const other of songs) {
    if (other.id === song.id) continue;
    const overlap = [...myRefs].filter(r => (refsBySong.get(other.id) || new Set()).has(r));
    if (overlap.length) sharedReferences.push({ songId: other.id, title: other.title, references: overlap });
  }
  sharedReferences.sort((a, b) => b.references.length - a.references.length);
  const colorCounts = {};
  for (const s of songs) { const c = (s.performancePerspective || {}).avatarId || 'none'; colorCounts[c] = (colorCounts[c] || 0) + 1; }
  return {
    totalSongs: songs.length,
    trackPosition: `${song.trackNumber}/${songs.length}`,
    colorRole: myColor ? CAST[myColor]?.name || myColor : 'ensemble',
    colorRoleShare: colorCounts[myColor || 'none'] || 0,
    sharedReferences: sharedReferences.slice(0, 6),
    songCountWithSameColorRole: colorCounts[myColor || 'none'] || 0,
  };
}

// ---------- 2. Reference identification ----------
function identifyReferences(song) {
  const found = [];
  const seen = new Set();
  // explicit connectors (source-backed)
  for (const c of s_connectors(song)) {
    found.push({
      referenceId: c.referenceId, title: c.referenceTitle, kind: c.referenceKind,
      relation: c.relationType, confidence: c.confidence,
      lyricEvidence: c.target?.lyricText || '', matchedText: c.target?.matchedText || '',
      semanticEffect: c.semanticEffect?.withContext || '',
      class: 'explicit-connector',
    });
    seen.add(c.referenceId);
  }
  // catalog signal scan over lyrics (candidate, must stay evidence-bounded)
  const lyricBlob = lyricsText(song).toLowerCase();
  if (lyricBlob) {
    for (const r of refCatalog) {
      if (seen.has(r.id)) continue;
      const terms = [...(r.traversalTerms || []), ...(r.signalLexicon?.literal || [])];
      for (const term of terms) {
        const t = term.toLowerCase();
        if (t.length >= 5 && lyricBlob.includes(t)) {
          const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          found.push({
            referenceId: r.id, title: r.title, kind: r.kind,
            relation: 'candidate-lexical-hit', confidence: 'candidate-unreviewed',
            lyricEvidence: (lyricBlob.match(new RegExp(`.{0,40}${esc}.{0,40}`)) || [''])[0],
            matchedText: term, semanticEffect: r.publicContext || '',
            class: 'candidate-scan',
          });
          seen.add(r.id);
          break;
        }
      }
    }
  }
  return found;
}
function s_connectors(song) { return song.referenceConnectors || []; }

// ---------- 3. Timing: key-frame every 4-count ----------
function songBpm(song) {
  const tid = song.audio?.registryTrackId;
  if (tid && bpmByTrack.get(tid)) return { bpm: bpmByTrack.get(tid), source: 'registry-telemetry' };
  // estimate from lyric timing span vs section count fallback
  const dur = song.audio?.duration || 0;
  const timed = song.lyricTimings || [];
  if (timed.length > 4 && dur > 0) {
    const words = timed.reduce((n, l) => n + (l.words || []).length, 0);
    // rough: syllables-per-second → bpm proxy at ~2.2 words/beat for sung lines
    const est = Math.round(Math.min(170, Math.max(60, (words / dur) * 60 / 2.2)));
    return { bpm: est, source: 'lyric-density-estimate' };
  }
  return { bpm: DEFAULT_BPM, source: 'default' };
}

function keyframeTimeline(song) {
  const { bpm, source } = songBpm(song);
  const dur = song.audio?.duration || 0;
  const secPerCount = 60 / bpm;
  const secPerFrame = secPerCount * COUNT_BEATS;
  const frames = [];
  let idx = 1;
  for (let t = 0; t + 0.01 < dur; t += secPerFrame, idx++) {
    frames.push({
      id: `${song.id}-count-${String(idx).padStart(4, '0')}`,
      countOrdinal: idx, beatStart: (idx - 1) * COUNT_BEATS + 1, beatEndExclusive: idx * COUNT_BEATS,
      startSeconds: +t.toFixed(3), endSeconds: +Math.min(dur, t + secPerFrame).toFixed(3),
      timingSource: source,
    });
  }
  return frames;
}

function linesInWindow(song, a, b) {
  return (song.lyricTimings || [])
    .filter(l => l.end > a && l.start < b)
    .map(l => ({ start: l.start, end: l.end, text: (l.text || '').replace(/[“”]/g, '').trim(), section: l.section_label || l.section || '' }));
}

// ---------- 4. Cast assignment ----------
function castForFrame(song, frameIdx, refs) {
  const perf = (song.performancePerspective || {}).avatarId || 'red-reaper';
  const primary = CAST[perf] ? perf : 'red-reaper';
  const cast = [{ avatarId: primary, role: 'primary', reason: primary === perf ? 'song performance perspective' : `performance perspective ${perf} outside RGB-Bella cast; Red stands in as lead` }];
  const lyricBlob = (lyricsText(song) + ' ' + song.title).toLowerCase();
  // Bella joins when she is referenced by name/lore or song is hers
  if (lyricBlob.includes('bella') && perf !== 'pinokio-bella') cast.push({ avatarId: 'pinokio-bella', role: 'featured', reason: 'lyric names Bella' });
  if (perf === 'pinokio-bella') cast.push({ avatarId: 'avatar-3', role: 'support', reason: 'Green is Bella’s established visual counterweight' });
  // rotating ensemble on instrumental gaps (no lyric in window): pick two others for visual continuity
  return cast;
}

function castForWindow(song, lines, frameIdx) {
  const cast = castForFrame(song, frameIdx, []);
  if (!lines.length) {
    // instrumental/empty window: ensemble coverage so the video never goes character-less
    const others = Object.keys(CAST).filter(id => !cast.some(c => c.avatarId === id));
    const pick = others[frameIdx % others.length];
    cast.push({ avatarId: pick, role: 'ensemble-bridge', reason: 'instrumental gap — rotating ensemble keeps the narrative moving' });
  }
  return cast;
}

// ---------- 5. Prompt construction ----------
function beatAction(cast, lines, refs, frame, section) {
  const lead = CAST[cast[0].avatarId];
  const lyric = lines.length ? lines[0].text : '';
  const motif = refs.length ? refs[0] : null;
  if (lyric) {
    return `${lead.name} performs the lyric turn “${lyric.slice(0, 90)}” — translate the words only as original physical action, spatial rule, or material consequence (no literal text, no franchise costume)`;
  }
  if (section) {
    return `${lead.name} moves through the ${section.toLowerCase()} as the music breathes — atmosphere carries the moment; ${lead.energy}`;
  }
  if (motif) {
    return `${lead.name} enacts the ${motif.themes?.[0] || 'memory'} motif from the “${motif.title}” reference — original action only, no imitation of any franchise character or costume`;
  }
  return `${lead.name} holds the frame in ${lead.ship || 'a quiet Hapa space'} — light shifts mark the 4-count pulse; ${lead.energy}`;
}

function buildPrompt(song, frame, prevFrame, nextFrame, ctx, refs, lines, cast) {
  const lead = CAST[cast[0].avatarId];
  const seedBlock = cast.map(c => {
    const ch = CAST[c.avatarId];
    return `${ch.name} (${ch.role}): identity seed — ${ch.invariants.join('; ')}. Keep ${ch.name} visually distinct; ${ch.energy}.`;
  }).join('\n');
  const refBlock = refs.slice(0, 2).map(r =>
    `Reference “${r.title}” (${r.kind}, ${r.confidence}${r.matchedText ? `, hit: “${r.matchedText}”` : ''}) — import ONLY its theme/mechanic as original action or material consequence: ${r.semanticEffect || (r.themes || []).join(', ') || 'emotional motif'}.`
  ).join('\n');
  const continuity = `Continuity: carries from ${prevFrame ? prevFrame.id : 'song open'}; prepares ${nextFrame ? nextFrame.id : 'song close'}.` +
    ` Album position ${ctx.trackPosition}, ${ctx.colorRole} lane (${ctx.colorRoleShare} songs share this lane).`;
  const lyricBlock = lines.length
    ? `Exact lyric evidence (do not render as visible text): ${lines.map(l => `“${l.text}”`).join(' / ').slice(0, 220)}`
    : `No lyric in this window — instrumental/atmosphere count; visual music: ${song.lore?.summary ? song.lore.summary.slice(0, 140) : 'pace and texture follow the arrangement'}.`;

  const universal = [
    `Hapa Echo Album music-video key-frame, exact 4-count ${String(frame.countOrdinal).padStart(4, '0')} (${frame.startSeconds.toFixed(1)}s–${frame.endSeconds.toFixed(1)}s, ${songBpm(song).bpm} bpm) of “${song.title}” by Calder.`,
    `SCENE: ${beatAction(cast, lines, refs, frame, lines[0]?.section || '')}.`,
    seedBlock,
    refBlock,
    lyricBlock,
    continuity,
    AESTHETIC.universal + '.',
    `Composition: ${['wide establishing', 'medium two-shot energy', 'low-angle heroism', 'over-shoulder intimacy', 'top-down map-of-the-scene', 'dutch-tilt tension'][frame.countOrdinal % 6]} framing; camera and lighting evolve one step from the previous count.`,
    `No readable text, no logos, no UI, no phones, no franchise imitation, no weapon glamour. Single coherent scene, not a collage.`,
  ].filter(Boolean).join('\n');

  return {
    universal,
    negative: AESTHETIC.negative,
    profiles: {
      'gpt-image': {
        note: 'GPT Image / Codex native — follows long structured prompts; keep seed reference via image attachment of the avatar full-body slot; ask for 1536x1024 landscape then lanczos-fit to 1920x1080 director plate.',
        prompt: universal.replace(/^Hapa Echo Album music-video key-frame/, 'Generate one cinematic key-frame frame for the Hapa Echo Album music video.'),
        params: { size: '1536x1024', quality: 'high', attach: cast.map(c => CAST[c.avatarId].name + ' full-body-concept-art slot') },
      },
      'midjourney': {
        note: 'Midjourney — compress to front-loaded subject + style; use --cref only if a Bella/RGB character sheet URL is available, else rely on invariant description; --style raw keeps comic linework clean.',
        prompt: `${lead.name}, ${CAST[cast[0].avatarId].invariants.slice(0, 3).join(', ')} — ${beatAction(cast, lines, refs, frame, '').split('—')[0].trim()}, brushed pixel texture, detailed comic book illustration, ink linework, halftone shading, cinematic lighting, ${lead.colorRole} accent --ar 16:9 --style raw --v 6`,
        params: { aspect: '16:9', stylize: 'raw' },
      },
      'flux-dev': {
        note: 'FLUX — natural-language, no negative prompt field; fold negatives into the sentence as "avoid ...". Strong at multi-clause scene description.',
        prompt: `${universal.split('\n').slice(0, 4).join('. ')}. Rendered in a brushed-pixel detailed comic book aesthetic with ink linework and halftone shading. Avoid readable text, logos, photorealism, extra limbs.`,
        params: { guidance: 3.5, steps: 28 },
      },
      'sdxl': {
        note: 'SDXL/ComfyUI — tag-forward; pair with comic/ink LoRA slot if installed; use negative prompt field.',
        prompt: `${lead.name.toLowerCase()}, ${lead.invariants.map(i => i.toLowerCase()).join(', ')}, comic book illustration, brushed pixel texture, halftone, detailed ink linework, cinematic composition, dramatic lighting, ${lead.colorRole} palette, album keyframe, music video still`,
        params: { negative: AESTHETIC.negative, width: 1344, height: 768 },
      },
    },
  };
}

// ---------- Main ----------
fs.mkdirSync(OUT_DIR, { recursive: true });
const index = { schemaVersion: 'hapa.echo-keyframe-prompt-baseline.v1', createdAt: new Date().toISOString(), aesthetic: AESTHETIC.name, countBeats: COUNT_BEATS, songs: [], totals: {} };
let totalFrames = 0;

for (const song of songs) {
  const ctx = albumContext(song);
  const refs = identifyReferences(song);
  const frames = keyframeTimeline(song);
  const out = {
    schemaVersion: 'hapa.echo-keyframe-prompt-baseline.song.v1',
    songId: song.id, title: song.title, trackNumber: song.trackNumber,
    bpm: songBpm(song), duration: song.audio?.duration || 0,
    albumContext: ctx,
    referencesIdentified: refs,
    loreSummary: song.lore?.summary || '',
    performancePerspective: song.performancePerspective || null,
    keyframes: [],
  };
  frames.forEach((f, i) => {
    const lines = linesInWindow(song, f.startSeconds, f.endSeconds);
    const cast = castForWindow(song, lines, i);
    const windowRefs = refs.filter(r => {
      if (!r.lyricEvidence) return true;
      const hit = (song.lyricTimings || []).find(l => (l.text || '').includes(r.lyricEvidence));
      return !hit || (hit.end > f.startSeconds && hit.start < f.endSeconds);
    });
    out.keyframes.push({
      ...f,
      lyricLines: lines,
      cast: cast.map(c => ({ ...c, name: CAST[c.avatarId].name })),
      activeReferences: windowRefs.map(r => ({ id: r.referenceId, title: r.title, confidence: r.confidence })),
      prompts: buildPrompt(song, f, frames[i - 1], frames[i + 1], ctx, windowRefs, lines, cast),
    });
    totalFrames++;
  });
  const file = path.join(OUT_DIR, `${song.id}.json`);
  if (!fs.existsSync(file) || process.argv.includes('--force')) {
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
  }
  index.songs.push({ songId: song.id, title: song.title, track: song.trackNumber, bpm: out.bpm.bpm, timingSource: out.bpm.source, keyframeCount: out.keyframes.length, references: refs.length, explicitRefs: refs.filter(r => r.class === 'explicit-connector').length });
}
index.totals = { songs: index.songs.length, keyframes: totalFrames, songsWithTelemetryBpm: index.songs.filter(s => s.timingSource === 'registry-telemetry').length, songsWithExplicitRefs: index.songs.filter(s => s.explicitRefs > 0).length };
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(JSON.stringify(index.totals, null, 1));
