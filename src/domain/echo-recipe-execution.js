import { PREPARED_VISUALIZER_MAPPED_SIGNAL } from "./hyperframes-visualizer-runtime.js";
import {resolveNativeVisualizerRoute} from './native-visualizer-route.js';
import {echoMediaEligibilityFields} from './echo-media-eligibility.js';
import {directorStemRole} from './echo-stem-binding-repair.js';
import {buildAccentEventTrack} from './accent-event-track.js';
import {buildVisualTimeTrack} from './visual-time-track.js';
import {normalizeEchoLyricContract,echoLyricTemplate} from './echo-lyric-contract.js';
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
const round=value=>Math.round((Number(value)||0)*1000)/1000;

export function echoRecipeBaseOpacity(opacity,prior) {
  const value=clamp(opacity??.5);
  return prior?.schemaVersion==='hapa.echo.recipe-opacity.v1' && value===prior.appliedOpacity && Number.isFinite(prior.baseOpacity) ? clamp(prior.baseOpacity) : value;
}
export function echoRecipeOpacity(opacity,recipe) {return round(clamp(opacity)*recipe.visualizerMix)}
export function echoRecipeLyrics(project,recipe) {
  const source=normalizeEchoLyricContract(project),presentation=recipe.lyricPresentation;
  if(!presentation)return source;
  const template=echoLyricTemplate(presentation.templateId);
  return {...source,templateId:template.id,templateLabel:template.label,legacyVariant:template.legacyVariant,motionIntensity:presentation.motionIntensity};
}
export function buildEchoRecipeEventTracks({cues=[],sections=[],recipe,durationSeconds,reducedMotion=false}) {
  return {accentTrack:buildAccentEventTrack({cues,sections,density:recipe.accentDensity,durationSeconds,reducedMotion}),
    visualTimeTrack:buildVisualTimeTrack({cues,density:recipe.temporalModulation,durationSeconds,reducedMotion})};
}

export function buildEchoRecipeModulationBindings(visualizers, recipe) {
  const executableEnvelope = (overrides = {}) => ({
    depth: 0.2,
    baseValue: 0,
    attackSeconds: 0.04,
    releaseSeconds: 0.18,
    smoothingSeconds: 0.03,
    easing: "power2.out",
    clamp: [0, 1],
    quantize: "frame",
    quantizeStep: 0,
    gate: { threshold: 0.02, floor: 0 },
    delaySeconds: 0,
    polarity: "positive",
    safetyBounds: { min: 0, max: 1, maxDeltaPerSecond: 8 },
    ...overrides,
  });
  const visualizerBindings = visualizers.flatMap((visualizer) => (
    Object.entries(visualizer.audioMap || {})
      .filter(([, mapping]) => String(mapping?.signal || "off") !== "off")
      .map(([uniform, mapping]) => ({
        id: `${visualizer.id}:${uniform}`,
        source: { kind: "stem_signal", stemFocus: directorStemRole(mapping?.stemFocus || mapping?.stem_focus || visualizer.stemFocus), signal: String(mapping.signal) },
        target: { kind: "visualizer_uniform", visualizerId: visualizer.id, uniform, valueSpace: PREPARED_VISUALIZER_MAPPED_SIGNAL, referenceDepth: clamp(mapping.depth ?? 0.2) },
        envelope: executableEnvelope({
          depth: round(clamp(mapping.depth ?? 0.2) * recipe.visualizerMix),
          quantize: mapping.signal === "beat" ? "beat" : "frame",
        }),
      }))
  ));
  return [
    ...visualizerBindings,
    {
      id: "camera:bass-mass",
      source: { kind: "stem_signal", stemFocus: "bass", signal: "bass" },
      target: { kind: "camera", property: "scale" },
      envelope: executableEnvelope({ baseValue: 1.04, depth: round(0.08 * recipe.cameraEnergy), attackSeconds: 0.08, releaseSeconds: 0.42, smoothingSeconds: 0.08, easing: "sine.out", clamp: [1.04, 1.18], safetyBounds: { min: 1.04, max: 1.18, maxDeltaPerSecond: 0.5 } }),
    },
    {
      id: "edit:drum-permission",
      source: { kind: "stem_signal", stemFocus: "drums", signal: "peak" },
      target: { kind: "edit_permission", property: "accent" },
      envelope: executableEnvelope({ depth: round(recipe.accentDensity), attackSeconds: 0.01, releaseSeconds: 0.08, smoothingSeconds: 0.01, easing: "power3.out", clamp: [0, 1], cooldownSeconds: 0.22, gate: { threshold: 0.62, floor: 0 } }),
    },
    {
      id: "time:phrase-breath",
      source: { kind: "cue", signal: "phrase_boundary" },
      target: { kind: "visual_time", property: "rate" },
      envelope: executableEnvelope({ baseValue: 1, depth: round(recipe.temporalModulation), attackSeconds: 0.12, releaseSeconds: 0.5, smoothingSeconds: 0.1, easing: "sine.inOut", clamp: [0.78, 1.18], safetyBounds: { min: 0.78, max: 1.18, maxDeltaPerSecond: 0.4 } }),
    },
    {
      id: "master:mix-bloom",
      source: { kind: "mix_signal", bus: "master", signal: "rms" },
      target: { kind: "effect", property: "bloom" },
      envelope: executableEnvelope({ depth: 0.16, attackSeconds: 0.08, releaseSeconds: 0.28, smoothingSeconds: 0.05, clamp: [0, 0.28], safetyBounds: { min: 0, max: 0.28, maxDeltaPerSecond: 0.7 } }),
    },
  ];
}


/** Upgrade only the recognizable legacy generator contract, in a derived graph.
 * Unmarked authored absolute envelopes and operator locks keep their meaning. */
export function upgradeEchoGeneratedVisualizerBindings(graph, { project = {} } = {}) {
  const director = graph.directorV2 || {};
  const locks = director.locks || [];
  const locked = id => Boolean(id) && locks.some(lock => (lock.targetId || lock.target) === id);
  if (locked("shader-treatment")) return graph;
  const cards = (graph.tracks || []).flatMap(track => track.cards || []);
  const targets = new Map(cards.flatMap(card => [card.id, card.cueId].filter(Boolean).map(id => [id, card])));
  const upgraded = [];
  const bindings = (director.modulationBindings || []).map(binding => {
    const target = binding.target || {}, e = binding.envelope || {};
    if (target.kind !== "visualizer_uniform" || target.valueSpace || binding.locked || locked(binding.id)) return binding;
    const card = targets.get(target.visualizerId);
    if (!card || locked(card.id) || locked(card.cueId)) return binding;
    const row = card.persistentSlotId ? (project.persistent_shader_slots || []).find(row => row.id === card.persistentSlotId)
      : (project.visualizer_timeline || [])[card.sourceCueIndex];
    if (card.locked || row?.locked || (row?.locks || []).some(lock => ["shader", "opacity", "treatment"].includes(lock)) || locked(row?.id)) return binding;
    const legacyGenerated = binding.id === `${target.visualizerId}:${target.uniform}` && binding.source?.kind === "stem_signal"
      && e.baseValue === 0 && !e.initialValue && e.attackSeconds === .04 && e.releaseSeconds === .18 && e.smoothingSeconds === .03
      && e.easing === "power2.out" && e.polarity === "positive" && e.delaySeconds === 0 && e.quantizeStep === 0
      && ["frame", "beat"].includes(e.quantize) && e.clamp?.[0] === 0 && e.clamp?.[1] === 1 && e.clamp.length === 2
      && e.gate?.threshold === .02 && e.gate?.floor === 0 && e.safetyBounds?.min === 0 && e.safetyBounds?.max === 1
      && e.safetyBounds?.maxDeltaPerSecond === 8 && Number.isFinite(e.depth) && e.depth >= 0 && e.depth <= 1;
    if (!legacyGenerated) return binding;
    const mapping = card.visualization?.card?.audioMap?.[target.uniform];
    if (!mapping || typeof mapping !== "object") return binding;
    upgraded.push(binding.id);
    return { ...binding, target: { ...target, valueSpace: PREPARED_VISUALIZER_MAPPED_SIGNAL, referenceDepth: clamp(mapping.depth ?? .2) } };
  });
  return upgraded.length ? { ...graph, directorV2: { ...director, modulationBindings: bindings,
    modulationValueSpaceUpgrade: { schemaVersion: "hapa.echo.modulation-value-space-upgrade.v1", sourceContract: "legacy-recipe-normalized-envelope", upgradedBindingIds: upgraded, storedSourceMutated: false } } } : graph;
}


const strings=input=>Object.fromEntries(Object.entries(input).map(([key,value])=>[key,String(value??'')]));
export function buildEchoRecipeAccentCards({cueGraph,recipe,resolveMediaAt}) {
  const accentCandidates = cueGraph.editCues.filter((cue) => cue.strength >= 0.58);
  const admittedCueIds = new Set(buildEchoRecipeEventTracks({ cues:cueGraph.cues||[], sections:cueGraph.sections||[], recipe, durationSeconds:cueGraph.durationSeconds }).accentTrack.events.map(event=>event.cueId));
  const selected = accentCandidates.filter(cue=>cueGraph.cues?.some(candidate=>candidate.evidence?.editCueId===cue.id&&admittedCueIds.has(candidate.id)));
  const accentNativeRoute = resolveNativeVisualizerRoute({ id: "director:accent", title: "Director accent" });
  const trackC = selected.map((cue, index) => {
    const media = resolveMediaAt(cue.atSeconds);
    const duration = round(0.18 + 0.34 * cue.strength);
    const approvedCue = cueGraph.cues?.find((candidate) => candidate.evidence?.editCueId === cue.id);
    return {
      id: `card:c:${cue.id}`,
      trackId: "track-c",
      startSeconds: cue.atSeconds,
      endSeconds: Math.min(cueGraph.durationSeconds, round(cue.atSeconds + duration)),
      media: {
        ...echoMediaEligibilityFields(media),
        id: media.id,
        title: media.title,
        sourceKind: media.sourceKind,
        groupId: "accent",
        groupName: cue.type,
        localPath: media.localPath,
      },
      visualization: { sourceId: "director:accent", nativeKey: null, nativeRoute: accentNativeRoute, status: "unsupported" },
      parameters: {
        opacity: round(0.18 + cue.strength * 0.28),
        blendMode: "screen",
        target: "program",
        motion: "shutter-accent",
        visualizerControls: { strength: cue.strength, duration },
        visualizerMappings: { strength: "drums:peak" },
        favorite: false,
      },
      provenance: strings({ cueId: approvedCue?.id || cue.id, cueSource: cue.source, safety: "bounded-accent-density" }),
      knockedOut: false,
    };
  });
  return trackC;
}
