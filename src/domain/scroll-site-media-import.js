import { createMediaAsset, withVideoFrames } from "./avatar.js";
import { createItemCard } from "./item.js";

export const SCROLL_SITE_IMPORT_VERSION = "hapa.scroll-site-media-import.v1";
export const SCROLL_SITE_VIDEO_CARD_VERSION = "hapa.scroll-site-video-card.v1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function safeId(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function humanize(value = "") {
  const text = String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.replace(/\b\w/g, (char) => char.toUpperCase()) : "Untitled Scroll Video";
}

function sourceKey(value = "") {
  return String(value).replace(/^\.\//, "").normalize("NFC");
}

function collectAuthoredUses(site = {}) {
  const bySource = new Map();
  const byClip = new Map();
  const remember = (entry = {}, authoredUse, role = "") => {
    const record = {
      authoredUse,
      role,
      context: entry.context || entry.copy?.title || entry.copy?.body || "",
      routeOrder: Number(entry.index ?? entry.anchor ?? Number.MAX_SAFE_INTEGER),
      proxy: entry.src || "",
      mobileProxy: entry.srcMobile || "",
      poster: entry.poster || "",
      cardId: entry.card || "",
    };
    if (entry.source || entry.resolvedSource) bySource.set(sourceKey(entry.resolvedSource || entry.source), record);
    if (entry.clip || entry.id) byClip.set(entry.clip || entry.id, record);
  };

  for (const entry of list(site.timeline)) remember(entry, entry.kind === "loop" ? "hold" : "opening-route", entry.copy?.title || "");
  for (const entry of list(site.spine?.transitions)) remember(entry, "connector", entry.label || "");
  for (const entry of list(site.spine?.anchorLoopHolds)) remember(entry, "hold", entry.role || "");
  for (const entry of list(site.spine?.loopInsertions)) remember(entry, "hold", entry.role || "");
  for (const entry of list(site.spine?.cardLoopOverlays)) remember(entry, "card-overlay", entry.context || "");
  return { bySource, byClip };
}

function storyAppearances(site = {}) {
  const byClip = new Map();
  for (const [cardId, card] of Object.entries(site.cards || {})) {
    if (!card?.mediaClip) continue;
    const rows = byClip.get(card.mediaClip) || [];
    rows.push({ cardId, title: card.title || cardId, family: card.family || card.type || "item" });
    byClip.set(card.mediaClip, rows);
  }
  return byClip;
}

export function createScrollSiteImportPlan({ continuity = {}, site = {}, sourceRoot = "", includeAvatarBuilder = false } = {}) {
  const authored = collectAuthoredUses(site);
  const appearances = storyAppearances(site);
  const clips = list(continuity.clips)
    .filter((clip) => includeAvatarBuilder || !String(clip.source || "").startsWith("avatar-builder/"))
    .map((clip, sourceIndex) => {
      const source = sourceKey(clip.source);
      const authoredRecord = authored.bySource.get(source) || authored.byClip.get(clip.id) || null;
      const cohort = source.startsWith("fal-second-cohort/") ? "fal-second-cohort"
        : source.startsWith("avatar-builder/") ? "avatar-builder"
          : "root";
      return {
        id: clip.id,
        source,
        sourcePath: sourceRoot ? `${String(sourceRoot).replace(/\/$/, "")}/${source}` : source,
        cohort,
        duration: Number(clip.duration || 0),
        width: Number(clip.width || 0),
        height: Number(clip.height || 0),
        fps: Number(clip.fps || 0),
        analyzerRole: clip.classification?.role || "transition",
        analyzerConfidence: clip.classification?.confidence || "none",
        loopMetrics: clip.classification?.loop_metrics || {},
        frameFiles: clip.frames || {},
        autoEligible: Boolean(authoredRecord && cohort !== "avatar-builder"),
        authoredUse: authoredRecord?.authoredUse || "review-candidate",
        authoredRoles: unique([authoredRecord?.role, ...list(appearances.get(clip.id)).map((item) => item.title)]),
        authoredContext: authoredRecord?.context || "",
        routeOrder: authoredRecord?.routeOrder ?? sourceIndex + 10000,
        proxyRelativePath: authoredRecord?.proxy || "",
        mobileProxyRelativePath: authoredRecord?.mobileProxy || "",
        posterRelativePath: authoredRecord?.poster || "",
        storyAppearances: list(appearances.get(clip.id)),
      };
    });

  return {
    schemaVersion: SCROLL_SITE_IMPORT_VERSION,
    sourceRoot,
    clips,
    storyCards: Object.entries(site.cards || {}).map(([id, card]) => ({ id, ...card })),
    totals: {
      declared: list(continuity.clips).length,
      included: clips.length,
      root: clips.filter((clip) => clip.cohort === "root").length,
      fal: clips.filter((clip) => clip.cohort === "fal-second-cohort").length,
      authoredEligible: clips.filter((clip) => clip.autoEligible).length,
      reviewCandidates: clips.filter((clip) => !clip.autoEligible).length,
      storyCards: Object.keys(site.cards || {}).length,
    },
  };
}

export function validateScrollImportPlan(plan = {}, expectations = {}) {
  const failures = [];
  const clips = list(plan.clips);
  const ids = clips.map((clip) => clip.id);
  const sources = clips.map((clip) => clip.source);
  if (new Set(ids).size !== ids.length) failures.push("duplicate clip ids");
  if (new Set(sources).size !== sources.length) failures.push("duplicate clip sources");
  if (clips.some((clip) => !clip.source || clip.source.startsWith("/") || clip.source.split("/").includes(".."))) failures.push("unsafe source path");
  if (clips.some((clip) => /hell[ -]?week|hapa[-_]dev[-_]proto|\bltx\b/i.test(`${clip.source} ${clip.id}`))) failures.push("forbidden replacement lineage marker");
  if (expectations.included !== undefined && clips.length !== expectations.included) failures.push(`expected ${expectations.included} clips, found ${clips.length}`);
  if (expectations.authoredEligible !== undefined && clips.filter((clip) => clip.autoEligible).length !== expectations.authoredEligible) failures.push(`expected ${expectations.authoredEligible} authored clips`);
  if (failures.length) throw new Error(`Invalid Scroll Site import plan: ${failures.join("; ")}`);
  return { ok: true, clips: clips.length, authoredEligible: clips.filter((clip) => clip.autoEligible).length };
}

export function scrollVideoCardId(sha256 = "") {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("A full SHA-256 digest is required for a Scroll video Card.");
  return `scroll-video-${sha256.toLowerCase()}`;
}

export function scrollMediaRecordId(sha256 = "") {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("A full SHA-256 digest is required for a Scroll media record.");
  return `hapa-media:sha256:${sha256.toLowerCase()}`;
}

export function createScrollMediaAsset(entry = {}, paths = {}, now = new Date().toISOString()) {
  const sha256 = String(entry.sha256 || "").toLowerCase();
  const assetId = `scroll-video-asset-${sha256}`;
  const frames = list(paths.frames).map((frame) => ({
    ...frame,
    id: frame.id || `${assetId}-frame-${frame.marker || "still"}`,
  }));
  return withVideoFrames(createMediaAsset({
    id: assetId,
    name: entry.title || humanize(entry.source),
    uri: paths.uri,
    type: "video",
    requirementId: "scene_videos",
    tags: unique([
      "scroll-site",
      "scroll-fal-replacement",
      `scroll-cohort-${entry.cohort}`,
      `flow-${entry.analyzerRole}`,
      entry.autoEligible ? "director-eligible" : "director-review-required",
      entry.authoredUse ? `authored-use-${safeId(entry.authoredUse)}` : "",
    ]),
    source: "scroll-site-skill",
    notes: entry.autoEligible
      ? "Authored Scroll Site placement makes this clip eligible for append-only director recasting."
      : "Indexed and Carded; automatic director placement remains review-gated.",
    metadata: {
      originalFileName: entry.source.split("/").at(-1),
      mimeType: "video/mp4",
      width: entry.width,
      height: entry.height,
      duration: entry.duration,
      fps: entry.fps,
      thumbnailUri: paths.posterUri || frames[0]?.uri || "",
      frames,
      storage: {
        kind: "local-symlink",
        fileName: paths.fileName,
        path: paths.mediaPath,
        targetPath: entry.sourcePath,
      },
      scrollSite: {
        schemaVersion: SCROLL_SITE_IMPORT_VERSION,
        sourcePath: entry.sourcePath,
        sourceRelativePath: entry.source,
        cohort: entry.cohort,
        sha256,
        analyzer: {
          role: entry.analyzerRole,
          confidence: entry.analyzerConfidence,
          loopMetrics: entry.loopMetrics,
        },
        authored: {
          eligible: entry.autoEligible,
          use: entry.authoredUse,
          roles: entry.authoredRoles,
          context: entry.authoredContext,
          routeOrder: entry.routeOrder,
          storyAppearances: entry.storyAppearances,
        },
        derived: {
          runtimeUri: paths.runtimeUri || paths.uri,
          mobileRuntimeUri: paths.mobileRuntimeUri || "",
          posterUri: paths.posterUri || "",
        },
        rightsStatus: "not-inferred",
        canonStatus: entry.autoEligible ? "authored-placement-only" : "unreviewed",
      },
    },
    processing: {
      status: "indexed-carded",
      attachedToCard: true,
      indexedAt: now,
    },
  }), frames);
}

export function createScrollVideoItemCard(entry = {}, asset = {}, now = new Date().toISOString()) {
  const sha256 = String(entry.sha256 || "").toLowerCase();
  const title = entry.title || (entry.cohort === "fal-second-cohort" && !entry.authoredRoles?.length
    ? `FAL Video ${sha256.slice(0, 10)}`
    : humanize(entry.source));
  return createItemCard({
    id: scrollVideoCardId(sha256),
    schemaVersion: SCROLL_SITE_VIDEO_CARD_VERSION,
    cardType: "scene_video_card",
    kind: "item",
    title,
    name: title,
    status: "active",
    canonStatus: entry.autoEligible ? "soft_canon" : "scaffold",
    summary: entry.autoEligible
      ? `Authored ${entry.authoredUse} from the Scroll Site/FAL visual route.`
      : "Processed Scroll Site/FAL video Card awaiting authored placement review.",
    description: entry.authoredContext || "Technical and continuity metadata are verified; narrative meaning is not inferred.",
    tags: asset.tags,
    sourceRefs: [
      { label: "Scroll Site source video", uri: entry.sourcePath, confidence: "hard" },
      { label: "Content SHA-256", uri: `sha256:${sha256}`, confidence: "hard" },
    ],
    mediaAssets: [{
      id: asset.id,
      title: asset.name,
      type: "video",
      uri: asset.uri,
      thumbnailUri: asset.metadata?.scrollSite?.derived?.posterUri || asset.metadata?.thumbnailUri || "",
      mimeType: "video/mp4",
      width: entry.width,
      height: entry.height,
      tags: asset.tags,
      confidence: "hard",
      metadata: asset.metadata,
      createdAt: now,
      updatedAt: now,
    }],
    videoUri: asset.uri,
    videoSources: unique([
      asset.uri,
      asset.metadata?.scrollSite?.derived?.runtimeUri,
      asset.metadata?.scrollSite?.derived?.mobileRuntimeUri,
    ]),
    connections: {
      itemIds: list(entry.storyAppearances).map((appearance) => `scroll-story-${safeId(appearance.cardId)}`),
    },
    telemetry: {
      schemaVersion: SCROLL_SITE_IMPORT_VERSION,
      sha256,
      cohort: entry.cohort,
      width: entry.width,
      height: entry.height,
      durationSeconds: entry.duration,
      fps: entry.fps,
      analyzerRole: entry.analyzerRole,
      analyzerConfidence: entry.analyzerConfidence,
      authoredUse: entry.authoredUse,
      directorEligible: entry.autoEligible,
      truthBoundary: "technical-and-authored-placement-only",
    },
    cardRecord: {
      immutableContentId: `sha256:${sha256}`,
      sourceSystem: "scroll-site-skill",
      sourceRelativePath: entry.source,
      storyAppearances: entry.storyAppearances,
      rightsStatus: "not-inferred",
    },
    createdAt: now,
    updatedAt: now,
  });
}

export function createScrollStoryItemCards(storyCards = [], entries = [], now = new Date().toISOString()) {
  const entryByClip = new Map(entries.map((entry) => [entry.id, entry]));
  return list(storyCards).map((story) => {
    const linked = entryByClip.get(story.mediaClip);
    const family = story.family || story.type || "item";
    return createItemCard({
      id: `scroll-story-${safeId(story.id)}`,
      cardType: "scroll_story_card",
      kind: "item",
      title: story.title || humanize(story.id),
      name: story.title || humanize(story.id),
      canonStatus: story.status === "SOURCE BACKED" ? "soft_canon" : "scaffold",
      summary: story.subheader || story.meaning || "",
      description: story.meaning || "",
      lore: story.invitation || "",
      utility: list(story.mechanics),
      tags: unique(["scroll-site", "scroll-story-card", `scroll-family-${safeId(family)}`, ...(story.nodes || [])]),
      sourceRefs: [{ label: story.source || "Scroll Site authored Card", uri: "", confidence: "hard" }],
      connections: { itemIds: linked?.sha256 ? [scrollVideoCardId(linked.sha256)] : [] },
      cardRecord: {
        sourceCardId: story.id,
        family,
        number: story.number || "",
        proof: story.proof || [],
        boundaries: story.boundaries || [],
        relatedCards: story.relatedCards || [],
        mediaClip: story.mediaClip || "",
      },
      createdAt: now,
      updatedAt: now,
    });
  });
}

export function createScrollSystemMediaRecord(entry = {}, asset = {}, now = new Date().toISOString()) {
  const sha256 = String(entry.sha256 || "").toLowerCase();
  return {
    id: scrollMediaRecordId(sha256),
    sourceKind: "scroll-site-video",
    name: asset.name,
    mediaType: "video",
    uri: asset.uri,
    thumbnailUri: asset.metadata?.scrollSite?.derived?.posterUri || asset.metadata?.thumbnailUri || "",
    sourcePath: entry.sourcePath,
    sourceRoots: ["scroll-site-skill", entry.cohort],
    sourceRelativePaths: { "scroll-site-skill": entry.source },
    contentFingerprint: `sha256:${sha256}`,
    sizeBytes: Number(entry.sizeBytes || 0),
    width: entry.width,
    height: entry.height,
    duration: entry.duration,
    documentKind: "scene_video",
    reviewPriority: entry.autoEligible ? "none" : "medium",
    reviewStatus: entry.autoEligible ? "authored-eligible" : "review-required",
    tags: asset.tags,
    match: null,
    relationships: unique([
      `card:${scrollVideoCardId(sha256)}`,
      ...list(entry.storyAppearances).map((appearance) => `card:scroll-story-${safeId(appearance.cardId)}`),
    ]).map((value) => {
      const [ownerType, ownerId] = value.split(":");
      return { ownerType, ownerId, ownerName: ownerId, role: "scroll-site-source" };
    }),
    asset,
    intelligence: {
      schemaVersion: "hapa.media-intelligence.v1",
      source: "scroll-site-authored-manifests-and-continuity",
      classifications: {
        documentKind: "scene_video",
        reviewPriority: entry.autoEligible ? "none" : "medium",
        activity: [entry.analyzerRole],
      },
      technical: {
        sha256,
        width: entry.width,
        height: entry.height,
        duration: entry.duration,
        fps: entry.fps,
      },
      continuity: {
        role: entry.analyzerRole,
        confidence: entry.analyzerConfidence,
        loopMetrics: entry.loopMetrics,
      },
      authored: {
        eligible: entry.autoEligible,
        use: entry.authoredUse,
        roles: entry.authoredRoles,
        context: entry.authoredContext,
      },
    },
    notes: entry.autoEligible ? "Authored director candidate." : "Processed; narrative placement requires review.",
    createdAt: now,
    updatedAt: now,
  };
}
