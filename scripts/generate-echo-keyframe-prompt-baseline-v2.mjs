#!/usr/bin/env node
// Echo keyframe prompt PASS #2 — enriched from pass#1 baseline + song + CRITIQUE-v1 rubric.
// Implements R1-R7 from data/echo-keyframe-prompt-baseline/CRITIQUE-v1.md.
// Append-only: writes data/echo-keyframe-prompt-baseline-v2/. Never touches v1 or approved artifacts.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const V1_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline');
const V2_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline-v2');
const SONGS = path.join(ROOT, 'data/hapa-songs-store.json');

const CAST = {
  'red-reaper': { name: 'Red', color: 'crimson red', lane: 'red',
    anchors: 'red-capped strategist, black-and-red armor, worn cap',
    invariantFull: 'Red face; black-and-red armor; worn red cap; grounded protective silhouette',
    energy: 'protective pressure, practical care', kit: ['signal flare', 'fire-control yoke', 'field radio', 'sealed letter canister'] },
  'avatar-2': { name: 'Blue', color: 'navy cyan', lane: 'blue',
    anchors: 'short dark hair, navy Orion flight-suit with cyan accents, red earbud wire',
    invariantFull: 'same face and short dark hair; navy Orion flight-suit silhouette with cyan accents; red earbud wire; precise but warm navigator presence',
    energy: 'attentive navigator, stories that return home', kit: ['star chart slate', 'cyan tether line', 'brass compass', 'recording quill'] },
  'avatar-3': { name: 'Green', color: 'living green', lane: 'green',
    anchors: 'hooded ranger silhouette, dark beard, weathered forest armor, living-wood bow',
    invariantFull: 'Green registered face; dark beard and hooded ranger silhouette; weathered forest armor; living-wood bow',
    energy: 'animal-bonded dancer, action serving living stakeholders', kit: ['living-wood bow', 'seed pouch', 'moss-wrapped arrow', 'bird companion'] },
  'pinokio-bella': { name: 'Bella', color: 'cream and gold', lane: 'cream',
    anchors: 'long dark hair, warm olive skin, red-and-cream flowing dance outfit, gold jewelry',
    invariantFull: 'same Bella face; long dark hair; warm olive/tan skin; red-and-cream flowing dance outfit; gold jewelry; visually distinct from Green',
    energy: 'grace under memory, dance as emotional translation', kit: ['silk ribbon', 'gold bangles', 'paper lantern', 'ballroom heels on wet stone'] },
};

// R1: deterministic location + light + lens library, keyed by section/keyword hash
const LOCATIONS = [
  'rain-slick neon overpass at night', 'sunken cathedral of coral and cable', 'rooftop tea house above a copper city',
  'fogbound rail yard with hanging signal lamps', 'tidal library, shelves bleeding into the surf',
  'abandoned arcade humming with one lit cabinet', 'bamboo grove strung with drying laundry',
  'espresso kiosk under amber awning lights', 'salt flat mirage at dusk', 'greenhouse of cracked glass and orchids',
  'harbor control tower at blue hour', 'concrete underpass transformed by projected koi',
  'snowbound bus stop with a single warm window', 'volcanic shore, black sand, steaming vents',
  'midnight laundromat, spinning drums as planets', 'cliffside shrine with wind chimes',
  'orbital observation deck over a brushed-pixel Earth', 'night market closing, shutters half-down',
  'overgrown highway median, saplings splitting asphalt', 'lighthouse gallery, rotating beam',
];
const LENSES = ['24mm wide establishing', '35mm environmental', '50mm natural', '85mm portrait compression', '90mm tabletop macro', '14mm ultra-wide distortion', '135mm telephoto isolation'];
const ENERGIES = ['tentative', 'building', 'defiant', 'tender', 'frantic', 'resolute', 'euphoric', 'mournful', 'watchful', 'unburdened'];

// R6: 4-act arc (intro / development / climax / resolution) — light + camera behavior per act
const ACTS = [
  { name: 'intro', light: 'low-key practical light, deep shadows, single warm source', camera: 'slow drift-in, locked horizon' },
  { name: 'development', light: 'mixed color temperature, moving practicals, rim light emerging', camera: 'steady push, rising crane' },
  { name: 'climax', light: 'hard key, blown highlights, storm flash or full bloom', camera: 'dynamic angle, dutch tilt or fast dolly' },
  { name: 'resolution', light: 'soft diffused dawn/dusk wash, gentle falloff', camera: 'settling pull-back, centered calm' },
];

// R2: evolution stages for repeated lyric lines
const EVOLVE = ['establish the image', 'complicate it — introduce a counter-force', 'invert it — reveal the opposite reading', 'resolve it — release the tension into stillness'];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
function pick(arr, seed) { return arr[seed % arr.length]; }
function hasCJK(s) { return /[\u3040-\u30ff\u4e00-\u9fff]/.test(s || ''); }
function lyricsText(song) { const l = song.lyrics; return !l ? '' : (typeof l === 'string' ? l : l.text || ''); }

// R4: lane-aware primary selection
function pickLead(song, v1frame) {
  const tags = song.tags || [];
  const laneTag = ['red', 'green', 'blue'].find(t => tags.includes(t));
  const titleLane = ['red', 'green', 'blue'].find(t => (song.title || '').toLowerCase().includes(t));
  const lane = titleLane || laneTag || null; // title is the more specific lane claim than a bulk tag
  const perf = v1frame.cast[0]?.avatarId || 'red-reaper';
  const perfLane = CAST[perf]?.lane;
  if (lane && CAST[perf]?.lane !== lane) {
    const swap = Object.keys(CAST).find(id => CAST[id].lane === lane);
    return { primary: swap, substituted: true, reason: `lane-substitution: song lives in ${lane} lane but pass#1 cast ${CAST[perf]?.name}; ${CAST[swap].name} leads, original perspective kept as witness` };
  }
  return { primary: perf, substituted: false, reason: 'cast confirmed from performance perspective and lane' };
}

// R1/R3: scene director decision
function directScene(song, f, lyric, occurrence, act, refs, leadId) {
  const lead = CAST[leadId];
  const block = Math.floor(f.countOrdinal / 12); // scene block: location family holds for ~12 counts
  const seed = hash(`${song.id}:${f.countOrdinal}:${lyric || 'inst'}`);
  const blockSeed = hash(`${song.id}:block:${block}:${act.name}`);
  const location = pick(LOCATIONS, blockSeed);
  const lens = pick(LENSES, hash(`${song.id}:${act.name}:${f.countOrdinal}`));
  const energy = pick(ENERGIES, hash(lyric || `inst-${f.countOrdinal}`));
  const prop = pick(lead.kit, hash(`${song.id}:${block}:prop:${leadId}`)); // prop motif locked per block
  const motifRef = refs[0];
  let action;
  if (lyric && !hasCJK(lyric)) {
    const stage = EVOLVE[occurrence % 4];
    action = `${lead.name} at the ${location}: ${stage} — ${lead.name} ${pick([
      `turns ${prop} toward the light as the lyric lands`, `sets ${prop} down and looks past frame edge`,
      `reaches for a distant glow while ${prop} catches the key light`, `moves through the space trailing ${prop} like a question`,
      `plants ${prop} upright like a marker and squares shoulders to it`, `cradles ${prop} against the chest, chin lifting`,
    ], seed)}; the lyric's meaning becomes physical cause-and-effect`;
  } else if (lyric && hasCJK(lyric)) {
    // R5: CJK gloss-needed frame — render atmosphere, no raw quote in prompt body
    action = `${lead.name} at the ${location}, ${energy} — atmosphere carries an untranslated line: weather, posture, and ${prop} speak where words are withheld`;
  } else {
    // R3: instrumental motif carrier
    const carrier = motifRef
      ? pick(['a murmuration of starlings spelling nothing', 'a paper boat crossing the current', 'the reference motif made weather: drifting ash-light', 'a stray dog trotting the rhythm', 'kinetic wind chimes on the downbeat', 'a projector beam sweeping empty seats'], seed)
      : pick(['steam rising in four-beat pulses', 'falling embers counting the bar', 'waves slapping pilings on the downbeat', 'neon flicker keeping time'], seed);
    action = `${lead.name} at the ${location} as ${carrier} performs the instrumental — ${lead.energy}`;
  }
  return { location, lens, energy, prop, action, motifCarrier: (!lyric) };
}

function buildV2Prompt(song, f1, f2prev, direct, act, lead, refs, flags, arcNote, bpm) {
  const refLine = refs.slice(0, 2).map(r =>
    `reference “${r.title}” [${r.confidence}] → import theme as material consequence only: ${(r.semanticEffect || r.themes?.join(', ') || 'emotional motif').slice(0, 180)}`).join('; ');
  const universal = [
    `HAPA ECHO ALBUM — music-video key-frame ${String(f1.countOrdinal).padStart(4, '0')} of “${song.title}” (Calder), 4-count ${f1.startSeconds.toFixed(1)}s–${f1.endSeconds.toFixed(1)}s @ ${bpm || 'tempo pending'} bpm, act: ${act.name}.`,
    `SHOT: ${direct.action}.`,
    `CAMERA: ${direct.lens}, ${act.camera}. LIGHT: ${act.light}; ${lead.color} accent dominant. MOOD: ${direct.energy}.`,
    `CAST SEED — ${lead.name}: ${lead.invariantFull}. ${f2prev.cast && f2prev.cast[1] ? `SECOND: ${CAST[f2prev.cast[1].avatarId]?.name} — ${CAST[f2prev.cast[1].avatarId]?.invariantFull}.` : ''} Same faces and kits every frame; no lookalikes.`,
    refLine ? `EVIDENCE BOUNDARY — ${refLine}.` : '',
    flags.needsLyricGloss ? `NOTE: lyric in this window is non-English (gloss pending); render emotion from staging, never from visible text.` : (direct.motifCarrier ? `Instrumental count — no lyric; motif carrier is the subject.` : `Lyric evidence stays off-image: “${(f1.lyricLines[0]?.text || '').slice(0, 120)}” informs staging only.`),
    arcNote,
    `STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering; crisp ink linework, halftone-dot shading, hand-brushed color plates with horizontal pixel drag, cinematic rim light, 1990s anime-print grain. Single coherent scene.`,
    `NEVER: readable text, logos, UI, phones, franchise character or costume copies, weapon glamour, photoreal skin, malformed anatomy, collage layout.`,
  ].filter(Boolean).join('\n');

  const mjCore = `${lead.anchors}, ${direct.action.split(':')[1]?.split('—')[0].trim().slice(0, 90) || 'in quiet motion'}, ${direct.location}, ${direct.energy} mood, brushed pixel, detailed comic book, ink linework, halftone, ${lead.color} accent`;
  return {
    universal,
    negative: 'readable text, logo, UI, phone, photoreal skin, plastic 3D, extra limbs, malformed anatomy, franchise costume copy, watermark, collage',
    profiles: {
      'gpt-image': { note: 'feed full director block; attach lead full-body slot + second cast slot as image seeds; 1536x1024 then lanczos-fit 1920x1080.', prompt: universal, params: { size: '1536x1024', quality: 'high' } },
      'midjourney': { note: 'core scene front-loaded; --cref with character sheet URL if available.', prompt: `${mjCore} --ar 16:9 --style raw --v 6`, params: { aspect: '16:9' } },
      'flux-dev': { note: 'single flowing paragraph, negatives inline.', prompt: `${direct.action}. ${direct.location}. ${direct.lens}, ${act.light}, ${lead.color} palette, brushed-pixel detailed comic book aesthetic, ink linework, halftone shading. Avoid readable text, logos, photorealism, extra limbs.`, params: { guidance: 3.5, steps: 28 } },
      'sdxl': { note: 'subject→action→style→light tag order; comic/ink LoRA slot if installed.', prompt: `${lead.name.toLowerCase()}, ${lead.anchors.toLowerCase()}, ${(direct.action.split(':')[1] || 'standing').trim().toLowerCase().slice(0, 120)}, ${direct.location}, comic book illustration, brushed pixel texture, halftone, ink linework, ${act.light}, ${lead.color} palette`, params: { negative: 'readable text, logo, photoreal, extra limbs, blurry', width: 1344, height: 768 } },
    },
  };
}

// ---------- Main ----------
const store = JSON.parse(fs.readFileSync(SONGS, 'utf8'));
const songById = new Map(store.songs.map(s => [s.id, s]));
fs.mkdirSync(V2_DIR, { recursive: true });

const index = { schemaVersion: 'hapa.echo-keyframe-prompt-baseline.v2', createdAt: new Date().toISOString(), basedOn: 'v1 + CRITIQUE-v1.md rubric R1-R7', songs: [], totals: {} };
let totalFrames = 0, totalSubs = 0, totalGloss = 0;

const v1files = fs.readdirSync(V1_DIR).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'README.md' && !f.startsWith('CRITIQUE'));
for (const file of v1files) {
  const v1 = JSON.parse(fs.readFileSync(path.join(V1_DIR, file), 'utf8'));
  const song = songById.get(v1.songId) || {};
  const refs = v1.referencesIdentified || [];
  const lyricTextAll = lyricsText(song);

  // R2: occurrence index per lyric line text
  const occ = new Map();
  // R6: act boundaries by fraction of frames
  const out = {
    schemaVersion: 'hapa.echo-keyframe-prompt-baseline.v2.song',
    songId: v1.songId, title: v1.title, trackNumber: v1.trackNumber,
    bpm: v1.bpm, duration: v1.duration,
    critiqueApplied: ['R1-scene-director', 'R2-lyric-evolution', 'R3-instrumental-motif', 'R4-lane-casting', 'R5-cjk-gloss-flag', 'R6-act-arc', 'R7-profile-tightening'],
    laneCheck: null, keyframes: [],
  };

  let lastLead = null;
  v1.keyframes.forEach((f1, i) => {
    const frac = i / Math.max(1, v1.keyframes.length - 1);
    const act = ACTS[Math.min(3, Math.floor(frac * 4))];
    const block = Math.floor(f1.countOrdinal / 12);
    const lyric = f1.lyricLines?.[0]?.text || '';
    const leadSel = pickLead(song, f1);
    const leadId = leadSel.primary;
    if (leadSel.substituted) totalSubs++;
    const occKey = `${lyric}::${block}`;
    const occurrence = occ.get(occKey) || 0;
    occ.set(occKey, occurrence + 1);
    const direct = directScene(song, f1, lyric, occurrence, act, refs.filter(r => {
      if (!r.lyricEvidence) return false;
      const hit = (song.lyricTimings || []).find(l => (l.text || '').includes(r.lyricEvidence));
      return hit && hit.end > f1.startSeconds && hit.start < f1.endSeconds;
    }), leadId);
    const flags = { needsLyricGloss: f1.lyricLines.some(l => hasCJK(l.text)) || hasCJK(lyricTextAll.slice(0, 0)) };
    if (flags.needsLyricGloss) totalGloss++;
    const arcNote = `ACT ARC ${act.name}: ${act.light}; continuity carries from ${v1.keyframes[i - 1]?.id || 'open'} into ${v1.keyframes[i + 1]?.id || 'close'} — same location family, camera advances one move.`;
    const prompts = buildV2Prompt(song, f1, { cast: f1.cast }, direct, act, CAST[leadId], refs, flags, arcNote, v1.bpm?.bpm);
    out.keyframes.push({
      id: f1.id, countOrdinal: f1.countOrdinal, startSeconds: f1.startSeconds, endSeconds: f1.endSeconds,
      act: act.name, lyricLine: lyric, lyricOccurrence: occurrence, evolutionStage: lyric ? EVOLVE[occurrence % 4] : null,
      cast: [{ avatarId: leadId, role: 'primary', name: CAST[leadId].name, ...(leadSel.substituted ? { laneSubstitution: leadSel.reason } : {}) },
        ...(f1.cast.slice(1).map(c => ({ ...c, name: CAST[c.avatarId]?.name || c.avatarId })))].filter(c => c.name),
      location: direct.location, prop: direct.prop, lens: direct.lens, energy: direct.energy,
      flags, prompts,
      provenance: { pass1Id: f1.id, pass1Scene: (f1.prompts?.universal || '').split('\n')[1] || '' },
    });
    lastLead = leadId;
    totalFrames++;
  });
  out.laneCheck = { laneTags: (song.tags || []).filter(t => ['red', 'green', 'blue'].includes(t)), title: song.title, leadUsed: lastLead };
  const outFile = path.join(V2_DIR, file);
  if (!fs.existsSync(outFile) || process.argv.includes('--force')) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  index.songs.push({ songId: v1.songId, title: v1.title, frames: out.keyframes.length, substitutions: out.keyframes.filter(k => k.cast[0].laneSubstitution).length, glossNeeded: out.keyframes.filter(k => k.flags.needsLyricGloss).length });
}
index.totals = { songs: index.songs.length, keyframes: totalFrames, laneSubstitutions: totalSubs, cjkGlossFlagged: totalGloss };
fs.writeFileSync(path.join(V2_DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(JSON.stringify(index.totals, null, 1));
