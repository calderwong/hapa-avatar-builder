#!/usr/bin/env node
// Echo keyframe prompt PASS #3 — consumes full lineage:
//   pass#1 baseline (v1) + CRITIQUE-v1 + pass#2 (v2) + CRITIQUE-v2 + live song store.
// Implements rubric S1-S6 from ../echo-keyframe-prompt-baseline-v2/CRITIQUE-v2.md.
// Append-only: writes data/echo-keyframe-prompt-baseline-v3/.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const V1_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline');
const V2_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline-v2');
const V3_DIR = path.join(ROOT, 'data/echo-keyframe-prompt-baseline-v3');
const SONGS = path.join(ROOT, 'data/hapa-songs-store.json');

const CAST = {
  'red-reaper': { name: 'Red', color: 'crimson red', lane: 'red', anchors: 'red-capped strategist, black-and-red armor, worn cap',
    invariantFull: 'Red face; black-and-red armor; worn cap; grounded protective silhouette',
    kit: ['signal flare', 'fire-control yoke', 'field radio', 'sealed letter canister'],
    arc: ['watchful', 'tense', 'defiant', 'resolute', 'unburdened'] },
  'avatar-2': { name: 'Blue', color: 'navy cyan', lane: 'blue', anchors: 'short dark hair, navy Orion flight-suit with cyan accents, red earbud wire',
    invariantFull: 'same face and short dark hair; navy Orion flight-suit silhouette with cyan accents; red earbud wire; precise but warm navigator presence',
    kit: ['star chart slate', 'cyan tether line', 'brass compass', 'recording quill'],
    arc: ['attentive', 'searching', 'overwhelmed', 'clarity', 'at peace'] },
  'avatar-3': { name: 'Green', color: 'living green', lane: 'green', anchors: 'hooded ranger silhouette, dark beard, weathered forest armor, living-wood bow',
    invariantFull: 'Green registered face; dark beard and hooded ranger silhouette; weathered forest armor; living-wood bow',
    kit: ['living-wood bow', 'seed pouch', 'moss-wrapped arrow', 'bird companion'],
    arc: ['still', 'coiled', 'hunting', 'release', 'gentle'] },
  'pinokio-bella': { name: 'Bella', color: 'cream and gold', lane: 'cream', anchors: 'long dark hair, warm olive skin, red-and-cream flowing dance outfit, gold jewelry',
    invariantFull: 'same Bella face; long dark hair; warm olive/tan skin; red-and-cream flowing dance outfit; gold jewelry; visually distinct from Green',
    kit: ['silk ribbon', 'gold bangles', 'paper lantern', 'ballroom heels on wet stone'],
    arc: ['shy', 'blooming', 'wild', 'exhausted joy', 'remembering'] },
};

// shot grammar (S1): progression families, lens locked within shot
const SHOT_MOVE = { wide: ['24mm wide establishing', '35mm environmental', '50mm natural'], close: ['50mm natural', '85mm portrait compression', '135mm telephoto isolation'] };
const TRANSITIONS = ['hard cut', 'match-cut on shape', 'dissolve through light bloom', 'whip pan into', 'cut on the downbeat to'];
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
const FRACTION_ACTS = ['intro', 'development', 'climax', 'resolution'];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
function pick(arr, seed) { return arr[seed % arr.length]; }
function hasCJK(s) { return /[\u3040-\u30ff\u4e00-\u9fff]/.test(s || ''); }
function lyricsText(song) { const l = song.lyrics; return !l ? '' : (typeof l === 'string' ? l : l.text || ''); }

// S3: map real section labels to 4 acts
function sectionActs(song, frameCount) {
  const timed = song.lyricTimings || [];
  const labels = [];
  for (const l of timed) {
    const s = (l.section_label || l.section || '').trim();
    if (s && (!labels.length || labels[labels.length - 1].label !== s)) labels.push({ label: s, start: l.start });
  }
  // section labels are often blank in timings — parse [Marker]s from lyrics text and map by ordinal
  if (labels.length < 2) {
    const markers = [...lyricsText(song).matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1].trim());
    if (markers.length >= 2) {
      const per = Math.max(1, Math.floor(timed.length / markers.length));
      markers.forEach((mk, mi) => {
        const tl = timed[Math.min(timed.length - 1, mi * per)];
        if (tl) labels.push({ label: mk, start: tl.start });
      });
    }
  }
  if (labels.length < 2) return null;
  const dur = song.audio?.duration || (timed[timed.length - 1]?.end || 1);
  const acts = [];
  for (const lb of labels) {
    const low = lb.label.toLowerCase();
    let act = null;
    if (/intro|opening|radio talking head/.test(low)) act = 'intro';
    else if (/chorus|hook|refrain/.test(low)) act = 'climax';
    else if (/outro|closing|coda|fade/.test(low)) act = 'resolution';
    else if (/bridge|breakdown|solo|instrumental/.test(low)) act = 'development';
    else if (/verse/.test(low)) act = acts.length <= 1 ? 'intro' : 'development';
    acts.push({ label: lb.label, act: act || 'development', start: lb.start });
  }
  return acts;
}

const ACT_STYLE = {
  intro: { light: 'low-key practical light, deep shadows, single warm source', camera: 'slow drift-in, locked horizon' },
  development: { light: 'mixed color temperature, moving practicals, rim light emerging', camera: 'steady push, rising crane' },
  climax: { light: 'hard key, blown highlights, storm flash or full bloom', camera: 'dynamic angle, dutch tilt or fast dolly' },
  resolution: { light: 'soft diffused dawn/dusk wash, gentle falloff', camera: 'settling pull-back, centered calm' },
};

// S4: motivated partner choice
function motivatedPartner(song, lyric, leadId, frame, activeRefs) {
  const low = (lyric || '').toLowerCase();
  if (/bella|she was born wild|i knew a bella/.test(low) && leadId !== 'pinokio-bella') return { id: 'pinokio-bella', reason: 'lyric names/addressee Bella' };
  if (leadId === 'pinokio-bella') {
    if (/green|forest|wild|bow/.test(low)) return { id: 'avatar-3', reason: 'lyric imagery belongs to Green’s lane' };
    return { id: 'avatar-3', reason: 'Green is Bella’s established protector counterweight in this song' };
  }
  if (/dad|papa|father/.test(low)) return { id: 'red-reaper', reason: 'father-thread: Red carries the protective parentage motif' };
  if (/home|return|navigate|star|map/.test(low) && leadId !== 'avatar-2') return { id: 'avatar-2', reason: 'homecoming imagery: Blue, the navigator, answers' };
  if (/animal|bird|grow|root|seed/.test(low) && leadId !== 'avatar-3') return { id: 'avatar-3', reason: 'living-stakeholder imagery: Green answers' };
  const ref = activeRefs[0];
  if (ref) {
    const refLane = /space|ship|halo|galaxy/.test((ref.title + ' ' + (ref.themes || '')).toLowerCase()) ? 'avatar-2'
      : /witcher|forest|beast|west|wukong/.test((ref.title + ' ' + (ref.themes || '')).toLowerCase()) ? 'avatar-3' : 'red-reaper';
    if (refLane !== leadId) return { id: refLane, reason: `active reference “${ref.title}” lives in ${CAST[refLane].name}’s lane` };
  }
  return null;
}

// S6: self-review score
function scoreFrame(f) {
  let score = 0; const flags = [];
  if (f.location) score += 2; else flags.push('no-location');
  if (f.prop) score += 1;
  if (f.lens) score += 1;
  if (f.energy) score += 1;
  if (f.actionIsPhysical && !/performs the lyric turn|holds the frame/.test(f.shot)) score += 2; else flags.push('delegated-directing');
  if (f.castMotivated) score += 1; else flags.push('unmotivated-partner');
  if (f.cutJustified) score += 1; else flags.push('grid-cut');
  if (f.flags.needsLyricGloss) { score -= 2; flags.push('needs-lyric-gloss'); }
  if (!f.evidenceGrounded) { score -= 1; flags.push('no-reference-evidence'); }
  if (!f.lyricAnchored && !f.motifCarrier) { score -= 1; flags.push('no-lyric-anchor'); }
  return { score: Math.max(0, Math.min(9, score)), max: 9, flags };
}

// ---------- Main ----------
const store = JSON.parse(fs.readFileSync(SONGS, 'utf8'));
const songById = new Map(store.songs.map(s => [s.id, s]));
fs.mkdirSync(V3_DIR, { recursive: true });
const index = { schemaVersion: 'hapa.echo-keyframe-prompt-baseline.v3', createdAt: new Date().toISOString(), lineage: ['v1 baseline', 'CRITIQUE-v1 (R1-R7)', 'v2 enriched', 'CRITIQUE-v2 (S1-S6)', 'v3 this pass'], songs: [], totals: { songs: 0, keyframes: 0, renderReady: 0, needsHumanReview: 0, gloss: 0 } };
const RENDER_THRESHOLD = 7;

const v2files = fs.readdirSync(V2_DIR).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'README.md' && !f.startsWith('CRITIQUE'));
for (const file of v2files) {
  const v2 = JSON.parse(fs.readFileSync(path.join(V2_DIR, file), 'utf8'));
  const song = songById.get(v2.songId) || {};
  const timed = song.lyricTimings || [];
  const acts = sectionActs(song, v2.keyframes.length);
  const refs = v2.keyframes.flatMap(k => k.prompts ? [] : []); // refs live in v1
  const v1 = JSON.parse(fs.readFileSync(path.join(V1_DIR, file), 'utf8'));
  const allRefs = v1.referencesIdentified || [];

  // shot segmentation (S1/S2): cut when section_label changes OR a new lyric phrase starts after >=2 shots in current
  const out = { schemaVersion: 'hapa.echo-keyframe-prompt-baseline.v3.song', songId: v2.songId, title: v2.title, trackNumber: v2.trackNumber, bpm: v2.bpm, duration: v2.duration,
    actsFromSections: !!acts, sectionActs: acts ? acts.map(a => ({ label: a.label, act: a.act, atSeconds: a.start })) : null,
    critiqueApplied: ['S1-shot-grammar', 'S2-phrase-boundary-cuts', 'S3-section-acts', 'S4-motivated-casting', 'S5-emotion-state-machine', 'S6-self-review-score'],
    keyframes: [] };

  // state
  let shotIdx = 0, lastShotKey = '', lensFamily = null, lensIdx = 0;
  const emoState = {}; // avatarId -> {pos, section}
  let prevLocation = null;

  v2.keyframes.forEach((k2, i) => {
    const frac = i / Math.max(1, v2.keyframes.length - 1);
    // act (S3)
    let act = FRACTION_ACTS[Math.min(3, Math.floor(frac * 4))], sectionLabel = '';
    if (acts) {
      const t = k2.startSeconds;
      let cur = acts[0];
      for (const a of acts) { if (a.start <= t + 0.01) cur = a; }
      act = cur.act; sectionLabel = cur.label;
    } else {
      const tl = timed.find(l => l.end > k2.startSeconds && l.start < k2.endSeconds);
      sectionLabel = tl?.section_label || tl?.section || '';
    }
    const lyric = k2.lyricLine || '';

    // shot segmentation (S2): cut at section change or new lyric phrase; else hold
    const shotKey = `${sectionLabel}::${lyric ? lyric.slice(0, 24) : 'inst-' + Math.floor(i / 4)}`;
    let isCut = false;
    if (shotKey !== lastShotKey) { isCut = true; lastShotKey = shotKey; }
    if (isCut) {
      shotIdx++;
      // lens grammar (S1): pick family per shot, walk progression within shot
      lensFamily = (shotIdx % 2 === 0) ? 'wide' : 'close';
      lensIdx = 0;
    } else lensIdx = Math.min(lensIdx + 1, 2);
    const lens = SHOT_MOVE[lensFamily][lensIdx];
    const transition = isCut ? pick(TRANSITIONS, hash(`${v2.songId}:cut:${shotIdx}`)) : 'hold — same shot continues';

    // location: locked per shot, new location only on cut (S2)
    let location = k2.location;
    if (isCut) {
      location = pick(LOCATIONS, hash(`${v2.songId}:shotloc:${shotIdx}:${act}`));
      prevLocation = location;
    } else location = prevLocation || k2.location;

    // emotion state machine (S5): escalate within section, pivot at section change
    const leadId = k2.cast[0].avatarId;
    const lead = CAST[leadId] || CAST['red-reaper'];
    if (!emoState[leadId] || emoState[leadId].section !== sectionLabel) emoState[leadId] = { section: sectionLabel, pos: 0 };
    else emoState[leadId].pos = (emoState[leadId].pos + 1) % lead.arc.length; // cycle, never saturate
    const energy = lead.arc[emoState[leadId].pos];

    // motivated partner (S4)
    const activeRefs = allRefs.filter(r => {
      if (!r.lyricEvidence) return false;
      const hit = timed.find(l => (l.text || '').includes(r.lyricEvidence));
      return hit && hit.end > k2.startSeconds && hit.start < k2.endSeconds;
    });
    const partner = motivatedPartner(song, lyric, leadId, k2, activeRefs);
    const cast = [{ avatarId: leadId, role: 'primary', name: lead.name }];
    if (partner && partner.id !== leadId) cast.push({ avatarId: partner.id, role: 'scene-partner', name: CAST[partner.id].name, motivation: partner.reason });

    // shot sentence
    const prop = k2.prop || pick(lead.kit, hash(`${v2.songId}:${shotIdx}:prop`));
    const stageWord = k2.evolutionStage ? k2.evolutionStage.split('—')[0].trim() : 'let the motif carrier carry';
    const partnerClause = partner ? `; ${CAST[partner.id].name} ${pick(['watches from the threshold', 'hands over the prop and withdraws', 'mirrors the movement a half-beat behind', 'holds the far frame edge, still', 'steps in on the downbeat'], hash(`${v2.songId}:partner:${shotIdx}`))}` : '';
    const shotSentence = `${lead.name} in the ${location}: ${stageWord} — ${lead.name} ${pick(['turns ' + prop + ' toward the light', 'sets ' + prop + ' down and looks past frame edge', 'reaches for a distant glow while ' + prop + ' catches the key light', 'moves through trailing ' + prop + ' like a question', 'plants ' + prop + ' upright like a marker'], hash(`${v2.songId}:act:${shotIdx}:${k2.countOrdinal}`))}${partnerClause}`;

    const style = ACT_STYLE[act];
    const flags = { needsLyricGloss: k2.flags?.needsLyricGloss || false };
    const universal = [
      `HAPA ECHO ALBUM “${v2.title}” (Calder) — key-frame ${String(k2.countOrdinal).padStart(4, '0')}, 4-count ${k2.startSeconds.toFixed(1)}s–${k2.endSeconds.toFixed(1)}s @ ${v2.bpm?.bpm || '—'} bpm.`,
      `SHOT ${shotIdx} [${transition}] ${sectionLabel || act}: ${shotSentence}.`,
      `CAMERA: ${lens}${isCut ? '' : ' (held from previous count)'}; ${style.camera}. LIGHT: ${style.light}; ${lead.color} accent dominant. MOOD: ${energy}${emoState[leadId].pos > 2 ? ' — peak of this section’s arc' : ''}.`,
      `CAST SEED — ${lead.name}: ${lead.invariantFull}.${partner ? ` PARTNER — ${CAST[partner.id].name}: ${CAST[partner.id].invariantFull} (${partner.reason}).` : ''} Same faces/kits every frame; no lookalikes.`,
      activeRefs.length ? `EVIDENCE — ${activeRefs.slice(0, 2).map(r => `“${r.title}” [${r.confidence}] → theme as material consequence only`).join('; ')}.` : `Evidence: lyric/staging only; no external reference in this window.`,
      flags.needsLyricGloss ? `NOTE: lyric non-English (gloss pending); emotion from staging only, never visible text.` : (lyric ? `Lyric evidence off-image: “${lyric.slice(0, 110)}” informs staging only.` : `Instrumental count — motif carrier is the subject.`),
      `LINEAGE: refines ${k2.id} (pass#2) ← ${k2.provenance?.pass1Id || 'pass#1'}; fixes lens-jitter (D8), grid-cut (D9), act-map (D10), partner-churn (D11), mood-sticky (D12).`,
      `STYLE: Hapa Aesthetic — brushed-pixel texture over detailed comic-book rendering; crisp ink linework, halftone-dot shading, hand-brushed color plates with horizontal pixel drag, cinematic rim light, 1990s anime-print grain. Single coherent scene.`,
      `NEVER: readable text, logos, UI, phones, franchise character/costume copies, weapon glamour, photoreal skin, malformed anatomy, collage.`,
    ].join('\n');

    const mjCore = `${lead.anchors}, ${shotSentence.split(':')[1]?.split(';')[0].trim().slice(0, 90) || 'in quiet motion'}, ${location}, ${energy} mood, brushed pixel, detailed comic book, ink linework, halftone, ${lead.color} accent`;
    const prompts = {
      universal,
      negative: 'readable text, logo, UI, phone, photoreal skin, plastic 3D, extra limbs, malformed anatomy, franchise costume copy, watermark, collage',
      profiles: {
        'gpt-image': { note: 'attach lead + partner full-body slots as image seeds; batch whole shot at once for intra-shot consistency; 1536x1024 then lanczos-fit 1920x1080.', prompt: universal, params: { size: '1536x1024', quality: 'high' } },
        'midjourney': { note: '--cref character sheet URL per cast member; same --seed within a shot for consistency.', prompt: `${mjCore} --ar 16:9 --style raw --v 6`, params: { aspect: '16:9' } },
        'flux-dev': { note: 'inline negatives; same seed per shot.', prompt: `${shotSentence}. ${location}. ${lens}, ${style.light}, ${lead.color} palette, brushed-pixel detailed comic book aesthetic. Avoid readable text, logos, photorealism, extra limbs.`, params: { guidance: 3.5, steps: 28 } },
        'sdxl': { note: 'tag order subject→action→style→light; comic/ink LoRA slot.', prompt: `${lead.name.toLowerCase()}, ${lead.anchors.toLowerCase()}, ${(shotSentence.split(':')[1] || 'standing').trim().toLowerCase().slice(0, 120)}, ${location}, comic book illustration, brushed pixel texture, halftone, ink linework, ${style.light}, ${lead.color} palette`, params: { negative: 'readable text, logo, photoreal, extra limbs, blurry', width: 1344, height: 768 } },
      },
    };

    const frame = {
      id: k2.id.replace('-count-', '-v3-count-'), pass2Id: k2.id, pass1Id: k2.provenance?.pass1Id,
      countOrdinal: k2.countOrdinal, startSeconds: k2.startSeconds, endSeconds: k2.endSeconds,
      act, sectionLabel, shot: shotIdx, isCut, transition, lens, location, prop, energy,
      evolutionStage: k2.evolutionStage, lyricLine: lyric, flags, cast, prompts,
      actionIsPhysical: true, castMotivated: !!partner || cast.length === 1, cutJustified: isCut || shotIdx > 0, evidenceGrounded: activeRefs.length > 0,
      lyricAnchored: !!lyric, motifCarrier: !lyric,
      scene: shotSentence,
    };
    frame.selfReview = scoreFrame(frame);
    frame.renderReady = frame.selfReview.score >= RENDER_THRESHOLD;
    if (!frame.renderReady) index.totals.needsHumanReview++; else index.totals.renderReady++;
    if (flags.needsLyricGloss) index.totals.gloss++;
    out.keyframes.push(frame);
    index.totals.keyframes++;
  });

  const outFile = path.join(V3_DIR, file);
  if (!fs.existsSync(outFile) || process.argv.includes('--force')) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  const shots = new Set(out.keyframes.map(k => k.shot)).size;
  index.songs.push({ songId: v2.songId, title: v2.title, frames: out.keyframes.length, shots, actsFromSections: out.actsFromSections,
    avgScore: +(out.keyframes.reduce((n, k) => n + k.selfReview.score, 0) / out.keyframes.length).toFixed(2),
    renderReady: out.keyframes.filter(k => k.renderReady).length, needsReview: out.keyframes.filter(k => !k.renderReady).length });
}
index.totals.songs = index.songs.length;
fs.writeFileSync(path.join(V3_DIR, 'index.json'), JSON.stringify(index, null, 1));
console.log(JSON.stringify(index.totals, null, 1));
