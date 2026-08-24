// Avatar Likeness Assignment — layer L4 verification.
//
// Three parts, matching the plan's gate ("UI smoke via served-bundle
// markers + API round-trip; tests + commit"):
//   1. Dashboard join unit tests — verdict map + decision store land on the
//      right videos (key, alias, and videoId joins) with summary telemetry,
//      and the dashboard stays backward-compatible without likeness inputs.
//   2. Source-contract tests — the served-bundle marker pattern: the API
//      routes, the lane component, the view wiring, the styles, and the data
//      docs all exist, and the lane routes stay un-gated (family trust model).
//   3. Real-server API round-trip — spawn the actual api.mjs against a tmp
//      data root: proposed list → accept (re-pointed) → accepted list →
//      stale-revision 409 → missing-verdict 409 → unknown 404, plus durable
//      file + event receipts on disk.

import assert from "node:assert/strict";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createHumanVideoEnricherDashboard } from "../src/domain/human-video-enrichment.js";
import {
  matchesHumanVideoLikenessLaneFilter,
  HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA,
} from "../src/domain/human-video-likeness-decisions.js";

// ---------------------------------------------------------------------------
// 1. Dashboard join unit tests

const VIDEO_ALPHA = {
  id: "vid-alpha",
  name: "Alpha Clip",
  mediaType: "video",
  uri: "/media/alpha.mp4",
  sourcePath: "/tmp/hapa-test/alpha.mp4",
  thumbnailUri: null,
  contentFingerprint: null,
  asset: { id: "asset-alpha", uri: "/media/alpha.mp4" },
};

const VIDEO_BETA = {
  id: "vid-beta",
  name: "Beta Clip",
  mediaType: "video",
  uri: "/media/beta.mp4",
  sourcePath: null,
  thumbnailUri: null,
  contentFingerprint: null,
  asset: { id: "asset-beta", uri: "/media/beta.mp4" },
};

const channels = (palette, dHash) => ({ palette, dHash, text: null, colorWords: null });

const VERDICT_ALPHA = {
  schemaVersion: "hapa.avatar-likeness-match.v1",
  key: "uri:/media/alpha.mp4",
  videoId: "vid-alpha",
  videoName: "Alpha Clip",
  verdict: "assigned",
  runId: "avatar-likeness-match-test",
  gate: { assignedScore: 0.71, assignedMargin: 0.12, secondaryScore: 0.59 },
  weights: { palette: 0.45, dHash: 0.25, text: 0.2, colorWords: 0.1 },
  primary: { avatarId: "avatar-a", name: "Alpha", score: 0.71, channels: channels(0.8, 0.6) },
  secondary: { avatarId: "avatar-b", name: "Beta", score: 0.59, channels: channels(0.7, 0.55) },
  candidates: [
    { avatarId: "avatar-a", name: "Alpha", score: 0.71, channels: channels(0.8, 0.6) },
    { avatarId: "avatar-b", name: "Beta", score: 0.59, channels: channels(0.7, 0.55) },
    { avatarId: "avatar-c", name: "Gamma", score: 0.31, channels: channels(0.4, 0.3) },
  ],
  excludedProfileless: 2,
  staleSignature: false,
  matchedAt: "2026-08-24T00:00:00.000Z",
};

// Keyed on a DIFFERENT alias (record:) than the video's own key so this join
// must come through the verdict's videoId — the dashboard index includes it.
const VERDICT_BETA = {
  ...VERDICT_ALPHA,
  key: "record:vid-beta",
  videoId: "vid-beta",
  videoName: "Beta Clip",
  verdict: "unresolved",
  primary: { avatarId: "avatar-b", name: "Beta", score: 0.52, channels: channels(0.6, 0.5) },
  secondary: null,
  candidates: [{ avatarId: "avatar-b", name: "Beta", score: 0.52, channels: channels(0.6, 0.5) }],
};

const DECISION_BETA = {
  schemaVersion: "hapa.human-video-likeness-decision.v1",
  id: "uri:/media/beta.mp4:avatar-likeness",
  videoKey: "uri:/media/beta.mp4",
  videoId: "vid-beta",
  videoName: "Beta Clip",
  aliases: ["uri:/media/beta.mp4"],
  state: "accepted",
  origin: "avatar-likeness",
  decisionAvatarId: "avatar-b",
  decisionAvatarName: "Beta",
  receipt: null,
  notes: "",
  actorId: "human-enricher-likeness",
  revision: 1,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z",
};

function baseDashboardInput() {
  return { mediaDashboard: { records: [VIDEO_ALPHA, VIDEO_BETA], facets: {}, updatedAt: null } };
}

test("dashboard joins likeness verdicts by map key, by videoId, and by decision alias", () => {
  const dashboard = createHumanVideoEnricherDashboard({
    ...baseDashboardInput(),
    likenessVerdictStore: { entries: { [VERDICT_ALPHA.key]: VERDICT_ALPHA, [VERDICT_BETA.key]: VERDICT_BETA } },
    likenessDecisionStore: { schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA, decisions: [DECISION_BETA] },
  });
  const alpha = dashboard.videos.find((video) => video.id === "vid-alpha");
  const beta = dashboard.videos.find((video) => video.id === "vid-beta");
  assert.deepEqual(alpha.likenessVerdict, VERDICT_ALPHA, "map-key join");
  assert.equal(alpha.likenessDecision, null);
  assert.deepEqual(beta.likenessVerdict, VERDICT_BETA, "videoId-alias join");
  assert.deepEqual(beta.likenessDecision, DECISION_BETA, "decision alias join");
  assert.deepEqual(dashboard.summary, {
    ...dashboard.summary,
    likenessKnown: 2,
    likenessProposed: 1,
    likenessAssignedProposed: 1,
    likenessAccepted: 1,
    likenessRejected: 0,
  });
  assert.equal(matchesHumanVideoLikenessLaneFilter(alpha, "proposed"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(alpha, "assigned"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(beta, "proposed"), false, "a decided video leaves the proposed queue");
  assert.equal(matchesHumanVideoLikenessLaneFilter(beta, "accepted"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(beta, "all"), true);
});

test("dashboard without likeness inputs stays backward-compatible (null joins, zero counts)", () => {
  const dashboard = createHumanVideoEnricherDashboard(baseDashboardInput());
  for (const video of dashboard.videos) {
    assert.equal(video.likenessVerdict, null);
    assert.equal(video.likenessDecision, null);
  }
  assert.deepEqual(dashboard.summary, {
    ...dashboard.summary,
    likenessKnown: 0,
    likenessProposed: 0,
    likenessAssignedProposed: 0,
    likenessAccepted: 0,
    likenessRejected: 0,
  });
});

// ---------------------------------------------------------------------------
// 2. Source-contract tests (served-bundle markers)

test("the likeness lane is wired into the API, the Enricher view, the styles, and the data docs", async () => {
  const [api, view, lane, css, dataReadme] = await Promise.all([
    fsp.readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    fsp.readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    fsp.readFile(new URL("../src/components/HumanEnricherLikenessLane.jsx", import.meta.url), "utf8"),
    fsp.readFile(new URL("../src/index.css", import.meta.url), "utf8"),
    fsp.readFile(new URL("../data/README.md", import.meta.url), "utf8"),
  ]);

  // API: both routes, the stores, and the dashboard wiring.
  assert.match(api, /pathname === "\/api\/human-enricher\/likeness" && req\.method === "GET"/);
  assert.match(api, /pathname === "\/api\/human-enricher\/likeness-decisions" && req\.method === "POST"/);
  assert.match(api, /openHumanVideoLikenessDecisionsStore/);
  assert.match(api, /createAvatarLikenessVerdictStore/);
  assert.match(api, /HAPA_HUMAN_VIDEO_LIKENESS_DECISIONS_STORE/);
  assert.match(api, /HAPA_HUMAN_VIDEO_LIKENESS_DECISIONS_EVENTS/);
  assert.match(api, /likenessVerdictStore: \{ entries: likenessVerdictEntries \}/);
  assert.match(api, /likenessDecisionStore: likenessDecisionsStore/);
  assert.match(api, /hapa\.human-enricher-likeness-lane\.v1/);

  // Family trust model: the lane is local-loopback UI, like Quick Sort —
  // the inserted block must NOT be admin-gated.
  const block = api.slice(
    api.indexOf('pathname === "/api/human-enricher/likeness"'),
    api.indexOf("const agentReviewDecisionMatch"),
  );
  assert.ok(block.length > 0, "the likeness route block exists before the agent-review decision route");
  assert.match(block, /likeness-decisions/);
  assert.doesNotMatch(block, /requireAdmin|hasTrustedLocalUiSession/);

  // View: layout registration, load-skip, URL sync, and the render branch.
  assert.match(view, /import HumanEnricherLikenessLane from "\.\/HumanEnricherLikenessLane\.jsx"/);
  assert.match(view, /aria-pressed=\{layout === "likeness"\}/);
  assert.match(view, /layout === "likeness"/);
  assert.match(view, /requested === "tiles" \|\| requested === "likeness"/);
  assert.match(view, /<HumanEnricherLikenessLane apiBase=\{apiBase\} onNotify=\{onNotify\} \/>/);

  // Lane component: owns its fetch, decides optimistically, attributes the actor.
  assert.match(lane, /\/api\/human-enricher\/likeness\?\$\{params\}/);
  assert.match(lane, /\/api\/human-enricher\/likeness-decisions/);
  assert.match(lane, /"x-hapa-actor-id": "human-enricher-likeness"/);
  assert.match(lane, /\/api\/local-file\?path=/);
  assert.match(lane, /const optimisticDecision/);

  // Styles + data documentation.
  assert.match(css, /\.human-likeness-lane \{/);
  assert.match(css, /\.human-likeness-row\[data-state="accepted"\]/);
  assert.match(dataReadme, /human-video-likeness-decisions\.json/);
  assert.match(dataReadme, /human-video-likeness-decisions-events\.ndjson/);
});

// ---------------------------------------------------------------------------
// 3. Real-server API round-trip

const VERDICT_DOC = {
  schemaVersion: "hapa.avatar-likeness-match.v1",
  entries: {
    "uri:/media/test-clip.mp4": {
      schemaVersion: "hapa.avatar-likeness-match.v1",
      key: "uri:/media/test-clip.mp4",
      videoId: "test-clip-1",
      videoName: "test-clip.mp4",
      verdict: "assigned",
      runId: "avatar-likeness-match-rt",
      gate: { assignedScore: 0.74, assignedMargin: 0.2, secondaryScore: 0.54 },
      weights: { palette: 0.45, dHash: 0.25, text: 0.2, colorWords: 0.1 },
      primary: { avatarId: "avatar-1", name: "Testy", score: 0.74, channels: { palette: 0.8, dHash: 0.6, text: null, colorWords: null } },
      secondary: { avatarId: "avatar-2", name: "Sunny", score: 0.54, channels: { palette: 0.7, dHash: 0.5, text: null, colorWords: null } },
      candidates: [
        { avatarId: "avatar-1", name: "Testy", score: 0.74, channels: { palette: 0.8, dHash: 0.6, text: null, colorWords: null } },
        { avatarId: "avatar-2", name: "Sunny", score: 0.54, channels: { palette: 0.7, dHash: 0.5, text: null, colorWords: null } },
      ],
      excludedProfileless: 1,
      staleSignature: false,
      matchedAt: "2026-08-24T00:00:00.000Z",
    },
  },
  updatedAt: "2026-08-24T00:00:00.000Z",
};

const MEDIA_DOC = {
  schemaVersion: "hapa.system-media-library.v1",
  records: [
    {
      id: "test-clip-1",
      sourceKind: "persisted-media",
      name: "test-clip.mp4",
      mediaType: "video",
      uri: "/media/test-clip.mp4",
      thumbnailUri: null,
      sourcePath: "/tmp/hapa-test/test-clip.mp4",
      sourceRoots: ["avatar-builder-media"],
      contentFingerprint: null,
      sizeBytes: 1024,
      width: 1280,
      height: 720,
      duration: 0,
      documentKind: "library_media",
      reviewPriority: "none",
      reviewStatus: "assigned",
      tags: [],
      match: null,
      relationships: [{ ownerType: "library", ownerId: "system-media", ownerName: "System Media Library", role: "persisted-media" }],
      asset: { id: "media-test-clip", uri: "/media/test-clip.mp4", name: "test-clip.mp4", mimeType: "video/mp4", sizeBytes: 1024, storage: { kind: "local-file", fileName: "test-clip.mp4", path: "/tmp/hapa-test/test-clip.mp4" } },
    },
    {
      id: "lonely-clip-1",
      sourceKind: "persisted-media",
      name: "lonely-clip.mp4",
      mediaType: "video",
      uri: "/media/lonely-clip.mp4",
      thumbnailUri: null,
      sourcePath: "/tmp/hapa-test/lonely-clip.mp4",
      sourceRoots: ["avatar-builder-media"],
      contentFingerprint: null,
      sizeBytes: 1024,
      width: 720,
      height: 1280,
      duration: 0,
      documentKind: "library_media",
      reviewPriority: "none",
      reviewStatus: "assigned",
      tags: [],
      match: null,
      relationships: [{ ownerType: "library", ownerId: "system-media", ownerName: "System Media Library", role: "persisted-media" }],
      asset: { id: "media-lonely-clip", uri: "/media/lonely-clip.mp4", name: "lonely-clip.mp4", mimeType: "video/mp4", sizeBytes: 1024, storage: { kind: "local-file", fileName: "lonely-clip.mp4", path: "/tmp/hapa-test/lonely-clip.mp4" } },
    },
  ],
  batches: [],
  updatedAt: "2026-08-24T00:00:00.000Z",
};

async function waitFor(url, child, output, attempts = 200) {
  for (let attempt = 0; attempt < attempts && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`API did not start: ${output.join("").slice(-3000)}`);
}

test("the likeness lane round-trips through the real server: list, accept, conflict, and guard rails", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-lane-"));
  const port = 19800 + Math.floor(Math.random() * 200);
  const api = `http://127.0.0.1:${port}`;
  const store = (name) => path.join(root, name);

  await fsp.mkdir(path.join(root, "avatar-likeness"), { recursive: true });
  await Promise.all([
    fsp.writeFile(store("media-library.json"), JSON.stringify(MEDIA_DOC)),
    fsp.writeFile(path.join(root, "avatar-likeness", "verdicts.json"), JSON.stringify(VERDICT_DOC)),
    fsp.writeFile(store("avatars.json"), JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(store("scenes.json"), JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(store("tarot.json"), JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", decks: [], sets: [], cards: [], spreads: [] })),
    fsp.writeFile(store("items.json"), JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [], agents: [], auditRuns: [], audit: {} })),
    fsp.writeFile(store("songs.json"), JSON.stringify({ schemaVersion: "hapa.songs.store.v1", songs: [] })),
    fsp.writeFile(store("songbook.json"), JSON.stringify({ schemaVersion: "hapa.dear-papa-songbook.v1", songCards: [] })),
  ]);
  // Every enricher-family store points into the tmp root (missing file →
  // empty normalized store) so the test never touches live data.
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_STORE: store("avatars.json"),
      HAPA_SCENE_STORE: store("scenes.json"),
      HAPA_TAROT_STORE: store("tarot.json"),
      HAPA_ITEM_STORE: store("items.json"),
      HAPA_SONG_STORE: store("songs.json"),
      HAPA_DEAR_PAPA_SONGBOOK: store("songbook.json"),
      HAPA_SONG_REGISTRY_DATA: store("registry-missing.json"),
      HAPA_MEDIA_LIBRARY: store("media-library.json"),
      HAPA_AVATAR_LIKENESS_DIR: path.join(root, "avatar-likeness"),
      HAPA_HUMAN_VIDEO_ENRICHMENT_STORE: store("enrichments.json"),
      HAPA_HUMAN_VIDEO_ENRICHMENT_EVENTS: store("enrichment-events.ndjson"),
      HAPA_HUMAN_VIDEO_AGENT_REVIEW_STORE: store("agent-reviews.json"),
      HAPA_HUMAN_VIDEO_AGENT_REVIEW_EVENTS: store("agent-review-events.ndjson"),
      HAPA_HUMAN_VIDEO_QUICK_SORT_STORE: store("quick-sort.json"),
      HAPA_HUMAN_VIDEO_QUICK_SORT_EVENTS: store("quick-sort-events.ndjson"),
      HAPA_HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE: store("optical-campaign.json"),
      HAPA_HUMAN_VIDEO_OPTICAL_CAMPAIGN_EVENTS: store("optical-campaign-events.ndjson"),
      HAPA_HUMAN_VIDEO_REFERENCE_REVIEW_STORE: store("reference-reviews.json"),
      HAPA_HUMAN_VIDEO_REFERENCE_REVIEW_EVENTS: store("reference-review-events.ndjson"),
      HAPA_HUMAN_VIDEO_LIKENESS_DECISIONS_STORE: store("likeness-decisions.json"),
      HAPA_HUMAN_VIDEO_LIKENESS_DECISIONS_EVENTS: store("likeness-decisions-events.ndjson"),
      HAPA_HUMAN_VIDEO_FRAME_CATALOG: store("frame-catalog.sqlite3"),
      HAPA_HUMAN_VIDEO_FRAME_ROOT: store("frames"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit").catch(() => {});
      child.kill("SIGTERM");
      await exited;
    }
    await fsp.rm(root, { recursive: true, force: true });
  });

  await waitFor(`${api}/api/health`, child, output);

  // Proposed queue: the assigned verdict is listed with its receipt; the
  // verdict-less clip is absent.
  const proposedUrl = `${api}/api/human-enricher/likeness?state=proposed`;
  let proposed = await fetch(proposedUrl);
  for (let attempt = 0; attempt < 60 && proposed.status !== 200; attempt += 1) {
    await proposed.text().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 250));
    proposed = await fetch(proposedUrl);
  }
  const proposedText = await proposed.text();
  assert.equal(proposed.status, 200, proposedText.slice(0, 400));
  const proposedBody = JSON.parse(proposedText);
  assert.equal(proposedBody.schemaVersion, "hapa.human-enricher-likeness-lane.v1");
  assert.equal(proposedBody.summary.likenessKnown, 1);
  assert.equal(proposedBody.summary.likenessProposed, 1);
  assert.equal(proposedBody.summary.likenessAssignedProposed, 1);
  assert.equal(proposedBody.items.length, 1);
  assert.equal(proposedBody.items[0].name, "test-clip.mp4");
  assert.equal(proposedBody.items[0].likenessVerdict.primary.avatarId, "avatar-1");
  assert.equal(proposedBody.items[0].likenessDecision, null);

  // Accept — re-pointed to the SECOND candidate (edited acceptance).
  const post = (body, expectedStatus) => fetch(`${api}/api/human-enricher/likeness-decisions`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "x-hapa-actor-id": "human-enricher-likeness" },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

  const accepted = await post({
    videoKey: "uri:/media/test-clip.mp4",
    videoId: "test-clip-1",
    state: "accepted",
    decisionAvatarId: "avatar-2",
    decisionAvatarName: "Sunny",
    notes: "Sunny fits the frame better",
    expectedRevision: 0,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.ok, true);
  assert.equal(accepted.body.changed, true);
  const { decision } = accepted.body;
  assert.equal(decision.origin, "avatar-likeness");
  assert.equal(decision.state, "accepted");
  assert.equal(decision.decisionAvatarId, "avatar-2", "edited acceptance records the human's pick, not the proposal's primary");
  assert.equal(decision.decisionAvatarName, "Sunny");
  assert.equal(decision.revision, 1);
  assert.equal(decision.actorId, "human-enricher-likeness");
  assert.equal(decision.receipt?.primary?.avatarId, "avatar-1", "the full score receipt anchors the decision");
  assert.equal(decision.receipt?.verdict, "assigned");

  // Idempotent re-accept of the same state+avatar without a stale revision.
  const reAccept = await post({
    videoKey: "uri:/media/test-clip.mp4",
    state: "accepted",
    decisionAvatarId: "avatar-2",
    decisionAvatarName: "Sunny",
    expectedRevision: 1,
  });
  assert.equal(reAccept.status, 200);
  assert.equal(reAccept.body.changed, false, "re-deciding to the identical state is a no-op, not a revision bump");
  assert.equal(reAccept.body.decision.revision, 1);

  // Stale optimistic revision → 409 conflict.
  const stale = await post({
    videoKey: "uri:/media/test-clip.mp4",
    state: "rejected",
    decisionAvatarId: "avatar-1",
    expectedRevision: 0,
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.error, "likeness_decision_revision_conflict");

  // Guard rails: no verdict yet → 409; unknown video → 404.
  const noVerdict = await post({ videoKey: "uri:/media/lonely-clip.mp4", state: "accepted" });
  assert.equal(noVerdict.status, 409);
  assert.equal(noVerdict.body.error, "likeness_verdict_missing");
  const unknown = await post({ videoKey: "uri:/media/never-seen.mp4", state: "accepted" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "likeness_video_not_found");

  // Accepted queue: the decision is visible with the confirmed Avatar.
  const acceptedResponse = await fetch(`${api}/api/human-enricher/likeness?state=accepted`);
  assert.equal(acceptedResponse.status, 200);
  const acceptedBody = await acceptedResponse.json();
  assert.equal(acceptedBody.summary.likenessAccepted, 1);
  assert.equal(acceptedBody.summary.likenessProposed, 0);
  assert.equal(acceptedBody.items.length, 1);
  assert.equal(acceptedBody.items[0].likenessDecision.decisionAvatarName, "Sunny");

  // Durable: the decision file and the append-only event receipt exist.
  const persisted = JSON.parse(await fsp.readFile(store("likeness-decisions.json"), "utf8"));
  assert.equal(persisted.decisions.length, 1);
  assert.equal(persisted.decisions[0].decisionAvatarId, "avatar-2");
  const events = (await fsp.readFile(store("likeness-decisions-events.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "human-video-likeness.accepted");
  assert.equal(events[0].authority, "human-likeness-acceptance-only");
});
