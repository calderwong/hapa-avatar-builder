import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MintLedgerError,
  SONG_CARD_MINT_PRIVATE_CUSTODY_SCHEMA,
  SONG_CARD_MINT_PUBLIC_MANIFEST_SCHEMA,
  SongCardMintLedger,
  cardsAtTimestamp,
  reconcileTimestampIndexRenderPadding,
  validateBoundedTelemetry,
  validateLineage,
  validateTimestampIndex,
} from "../server/song-card-mint-ledger.mjs";

const GOOD_PROBE = {
  durationSeconds: 10,
  hasVideo: true,
  hasAudio: true,
  decodeOk: true,
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
};

async function fixture(options = {}) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-ledger-"));
  const sourceRoot = path.join(base, "renders");
  const root = path.join(base, "ledger");
  const sourceVideoPath = path.join(sourceRoot, "dear-papa.mp4");
  const posterPath = path.join(sourceRoot, "dear-papa.jpg");
  await fsp.mkdir(sourceRoot, { recursive: true });
  await fsp.writeFile(sourceVideoPath, Buffer.from("physical-rendered-master-v1"));
  await fsp.writeFile(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  const ledger = new SongCardMintLedger({
    root,
    allowedSourceRoots: [sourceRoot],
    mediaProbe: async () => GOOD_PROBE,
    ...options,
  });
  const request = {
    headId: "song-card:dear-papa",
    idempotencyKey: "C:\\Users\\Alice\\private\\mint-request.json",
    semanticFingerprint: "sha256:semantic-v1",
    sourceRevision: "editor-revision-1",
    sourceVideoPath,
    posterPath,
    song: { id: "dear-papa", title: "Dear Papa", albumId: "echo-album" },
    snapshot: { schemaVersion: "hapa.song-card.mint-snapshot.v1", editor: { revision: "editor-revision-1", sourcePath: path.join(sourceRoot, "editor.json"), fileUri: "file:///Users/alice/private/editor.json" }, showGraph: { source: { audioPath: path.join(sourceRoot, "song.wav"), windowsPath: "C:\\Users\\Alice\\private\\song.wav" }, tracks: [] } },
    timestampIndex: {
      appearances: [
        { appearanceId: "a", sourceCardId: "tarot:a", startMs: 0, endMs: 5000, trackId: "A", zOrder: 1, snapshot: { id: "tarot:a", title: "A", localPreview: "file:///tmp/private-preview.png" }, printable: true },
        { appearanceId: "b", sourceCardId: "tarot:b", startMs: 3000, endMs: 10000, trackId: "B", zOrder: 2, snapshot: { id: "tarot:b", title: "B" }, printable: true, pureIvf: true },
      ],
    },
    lineage: {
      nodes: [{ id: "director:variant-v1", kind: "director-variant", privateSource: "file:///Users/alice/private/upstream.json" }],
      edges: [],
    },
    telemetry: [{ type: "render-completed", durationMs: 10_000, tracePath: "~alice/private/render.trace" }],
    rendererTruth: { ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 2 },
    rights: { licensingStatus: "operator-authored", consentStatus: "operator-approved", contractPath: "E:private-rights.pdf" },
    approvals: { creative: true, technical: true, evidencePath: "\\Users\\Alice\\private\\approval.json" },
    safety: { ok: true, auditPath: "/Users/alice/private/safety.json" },
    context: { sourcePath: path.join(sourceRoot, "context.json"), uncPath: "\\\\server\\private\\context.json", windowsRootPath: "\\Users\\Alice\\private.mov", driveRelativePath: "E:private.mov", namedHomePath: "~alice/private.mov", traversalRefs: ["/api/../../Users/alice/private.json", "/media/%2e%2e/private.mov"], mediaByPath: { "/Users/alice/private/key.mov": { ok: true }, "card:public": { ok: true } }, publicRef: "/api/context/dear-papa", exactPublicRoots: ["/api", "/media", "/static"] },
    receipts: { evidencePath: path.join(sourceRoot, "receipt.json"), approved: true },
  };
  return { base, root, sourceRoot, sourceVideoPath, posterPath, ledger, request };
}

test("mints a physical immutable Edition 1 with public/private custody split", async () => {
  const { root, sourceRoot, sourceVideoPath, posterPath, ledger, request } = await fixture();
  const result = await ledger.mint(request);
  assert.equal(result.created, true);
  assert.equal(result.edition, 1);
  assert.equal(result.manifest.schemaVersion, SONG_CARD_MINT_PUBLIC_MANIFEST_SCHEMA);
  assert.equal(result.manifest.head.id, "song-card:dear-papa");
  assert.equal(result.manifest.edition.id, "song-card:dear-papa:edition:1");
  assert.equal(result.manifest.downstreamSync.status, "pending");
  assert.equal(JSON.stringify(result.manifest).includes(sourceVideoPath), false);
  assert.equal(path.isAbsolute(result.manifest.render.path), false);

  const edition = await ledger.readEdition(request.headId, 1);
  const master = path.join(edition.directory, "media", "master.mp4");
  assert.notEqual(master, sourceVideoPath);
  assert.deepEqual(await fsp.readFile(master), await fsp.readFile(sourceVideoPath));
  assert.equal(edition.timestampIndex.schemaVersion, "hapa.song-card.appearance-index.v1");
  assert.equal(edition.lineage.complete, true);
  assert.equal(edition.snapshot.schemaVersion, "hapa.song-card.mint-snapshot.v1");
  for (const relative of ["data/show-graph.json", "data/context.json", "data/renderer-truth.json", "data/receipts.json", "captions/captions.json"]) {
    assert.equal((await fsp.stat(path.join(edition.directory, relative))).isFile(), true, relative);
    assert.equal((await fsp.readFile(path.join(edition.directory, relative), "utf8")).includes(sourceRoot), false, `${relative} must remain portable`);
  }
  assert.equal((await fsp.readFile(path.join(edition.directory, "data/mint-snapshot.json"), "utf8")).includes(sourceRoot), false);
  assert.equal((await fsp.readFile(path.join(edition.directory, "lineage.json"), "utf8")).includes(sourceRoot), false);
  assert.equal((await fsp.readFile(path.join(edition.directory, "transaction.json"), "utf8")).includes(request.idempotencyKey), false);
  assert.match(JSON.parse(await fsp.readFile(path.join(edition.directory, "transaction.json"), "utf8")).idempotencyKey, /^idempotency:sha256:[a-f0-9]{64}$/u);
  for (const relative of ["manifest.public.json", "transaction.json", "timestamp-index.json", "lineage.json", "telemetry.json", "data/mint-snapshot.json", "data/show-graph.json", "data/context.json"]) {
    const publicText = await fsp.readFile(path.join(edition.directory, relative), "utf8");
    assert.equal(/file:|C:\\\\Users|\\\\Users|\\\\\\\\server|\/Users\/alice|E:private|~alice\/|\/(?:api|media)\/(?:\.\.|%2e)/iu.test(publicText), false, `${relative} must strip file URIs, Windows paths, traversal roots, UNC paths, drive-relative paths, and named-user home paths`);
  }
  assert.ok(edition.lineage.edges.some((row) => row.relation === "artifact-included-in"));
  assert.equal(edition.lineage.nodes.some((row) => row.kind === "registry-revision"), true);
  const custody = JSON.parse(await fsp.readFile(path.join(edition.directory, ".custody.private.json"), "utf8"));
  assert.equal(custody.schemaVersion, SONG_CARD_MINT_PRIVATE_CUSTODY_SCHEMA);
  assert.equal(custody.sourceAbsolutePath, await fsp.realpath(sourceVideoPath));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith(sourceRoot)));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("file:")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("C:\\")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("\\\\")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("\\Users")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("E:")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("~alice/")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("/api/../")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value.startsWith("/media/%2e")));
  assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value === "/Users/alice/private/key.mov"));
  for (const expected of ["C:\\Users\\Alice\\private\\mint-request.json", "file:///Users/alice/private/upstream.json", "~alice/private/render.trace", "E:private-rights.pdf", "\\Users\\Alice\\private\\approval.json", "/Users/alice/private/safety.json", posterPath]) {
    assert.ok(custody.privateInputAbsolutePaths.some((row) => row.value === expected), `private custody must retain ${expected}`);
  }
  assert.equal(custody.posterSourceAbsolutePath, await fsp.realpath(posterPath));
  const publicContext = JSON.parse(await fsp.readFile(path.join(edition.directory, "data/context.json"), "utf8"));
  assert.deepEqual(publicContext.exactPublicRoots, ["/api", "/media", "/static"]);
  assert.deepEqual(publicContext.mediaByPath, { "card:public": { ok: true } });
  assert.equal((await fsp.stat(master)).mode & 0o222, 0);
});

test("timestamp queries use exact half-open boundaries, overlaps, and IVF snapshots", async () => {
  const index = validateTimestampIndex({ appearances: [
    { appearanceId: "a", sourceCardId: "a", startMs: 0, endMs: 1000, zOrder: 1, snapshot: { id: "a" } },
    { appearanceId: "b", sourceCardId: "b", startMs: 500, endMs: 1500, zOrder: 2, snapshot: { id: "b" }, pureIvf: true },
  ] }, { durationMs: 1500 });
  assert.deepEqual(cardsAtTimestamp(index, 999).map((row) => row.appearanceId), ["a", "b"]);
  assert.deepEqual(cardsAtTimestamp(index, 1000).map((row) => row.appearanceId), ["b"]);
  assert.equal(cardsAtTimestamp(index, 1000)[0].pureIvf, true);
});

test("timestamp indexes preserve one compact snapshot catalog and resolve repeated appearance refs", () => {
  const snapshotRef = "sha256:shared-card-snapshot";
  const index = validateTimestampIndex({
    durationMs: 1500,
    snapshotCatalog: {
      schemaVersion: "hapa.song-card.appearance-snapshot-catalog.v1",
      snapshots: {
        [snapshotRef]: {
          schemaVersion: "hapa.avatar-card.v1",
          id: "avatar:25",
          title: "Boba Tea Strum Avatar",
          songCardSnapshot: { schemaVersion: "hapa.song-card.constituent-snapshot.v2" },
        },
      },
    },
    appearances: [
      { appearanceId: "a", sourceCardId: "avatar:25", startMs: 0, endMs: 1000, zOrder: 1, snapshotRef, sourceDigest: snapshotRef, printable: true },
      { appearanceId: "b", sourceCardId: "avatar:25", startMs: 500, endMs: 1500, zOrder: 2, snapshotRef, sourceDigest: snapshotRef, printable: true },
    ],
  }, { durationMs: 1500 });

  assert.equal(index.snapshotCatalog.snapshots[snapshotRef].title, "Boba Tea Strum Avatar");
  assert.equal(Object.hasOwn(index.appearances[0], "snapshot"), false);
  assert.equal(Object.hasOwn(index.appearances[1], "sourceSnapshot"), false);
  assert.equal(JSON.stringify(index).match(/Boba Tea Strum Avatar/gu)?.length, 1);
  assert.deepEqual(cardsAtTimestamp(index, 750).map((row) => row.snapshot.title), [
    "Boba Tea Strum Avatar",
    "Boba Tea Strum Avatar",
  ]);
  assert.throws(
    () => validateTimestampIndex({ appearances: [{ sourceCardId: "missing", startMs: 0, endMs: 1000, snapshotRef: "sha256:missing", printable: true }] }),
    (error) => error.code === "INVALID_TIMESTAMP_INDEX" && /no resolvable snapshot/u.test(error.message),
  );
});

test("small encoded container tails become explicit non-printable appearances", async () => {
  const { base, sourceRoot, request } = await fixture();
  const timestampIndex = { ...request.timestampIndex, durationMs: 10_000 };
  const reconciled = reconcileTimestampIndexRenderPadding(timestampIndex, { durationMs: 10_032 });
  const padding = reconciled.appearances.at(-1);
  assert.deepEqual(
    { startMs: padding.startMs, endMs: padding.endMs, printable: padding.printable, reason: padding.provenance.reason },
    { startMs: 10_000, endMs: 10_032, printable: false, reason: "container-duration-padding" },
  );

  const ledger = new SongCardMintLedger({
    root: path.join(base, "container-padding-ledger"),
    allowedSourceRoots: [sourceRoot],
    mediaProbe: async () => ({ ...GOOD_PROBE, durationSeconds: 10.032 }),
  });
  const minted = await ledger.mint({ ...request, timestampIndex });
  const edition = await ledger.readEdition(request.headId, minted.edition);
  assert.equal(edition.timestampIndex.durationMs, 10_032);
  assert.equal(cardsAtTimestamp(edition.timestampIndex, 10_016)[0].provenance.reason, "container-duration-padding");

  const oversized = reconcileTimestampIndexRenderPadding(timestampIndex, { durationMs: 10_400 });
  assert.equal(oversized, timestampIndex, "material duration mismatches must still fail closed");
});

test("semantic and idempotency exact-once rules increment only material editions", async () => {
  const { ledger, request } = await fixture();
  const first = await ledger.mint(request);
  const replay = await ledger.mint(request);
  assert.equal(replay.created, false);
  assert.equal(replay.reason, "idempotency-replay");
  assert.equal(replay.edition, first.edition);

  const semanticReplay = await ledger.mint({ ...request, idempotencyKey: "another-request" });
  assert.equal(semanticReplay.created, false);
  assert.equal(semanticReplay.reason, "semantic-no-change");

  await assert.rejects(
    ledger.mint({ ...request, semanticFingerprint: "sha256:conflict" }),
    (error) => error instanceof MintLedgerError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  const second = await ledger.mint({
    ...request,
    idempotencyKey: "dear-papa-editor-rev-2",
    semanticFingerprint: "sha256:semantic-v2",
    sourceRevision: "editor-revision-2",
  });
  assert.equal(second.edition, 2);
  assert.equal((await ledger.getHead(request.headId)).editions.length, 2);
});

test("an exact idempotent replay does not depend on the mutable source render still existing", async () => {
  const { ledger, request, sourceVideoPath } = await fixture();
  await ledger.mint(request);
  await fsp.unlink(sourceVideoPath);
  const replay = await ledger.mint(request);
  assert.equal(replay.created, false);
  assert.equal(replay.reason, "idempotency-replay");
  assert.equal(replay.edition, 1);
});

test("cross-instance concurrent mints publish exactly once", async () => {
  const { root, sourceRoot, request } = await fixture();
  const makeLedger = () => new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  const results = await Promise.all([makeLedger().mint(request), makeLedger().mint(request), makeLedger().mint(request)]);
  assert.equal(results.filter((row) => row.created).length, 1);
  assert.deepEqual([...new Set(results.map((row) => row.edition))], [1]);
  assert.equal((await makeLedger().getHead(request.headId)).latestEdition, 1);
});

for (const crashPoint of ["stage", "rename"]) {
  test(`recovers a crash after ${crashPoint} without duplicating the edition`, async () => {
    const { root, sourceRoot, request } = await fixture({ injectCrash: crashPoint });
    const crashed = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE, injectCrash: crashPoint });
    await assert.rejects(crashed.mint(request), (error) => error.code === "INJECTED_CRASH");
    const recovered = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
    const recovery = await recovered.recover();
    assert.equal(recovery.outcomes.some((row) => row.recovered), true);
    assert.equal((await recovered.getHead(request.headId)).latestEdition, 1);
    const replay = await recovered.mint(request);
    assert.equal(replay.created, false);
    assert.equal(replay.edition, 1);
  });
}

test("a crash after the atomic head update remains exactly once and recoverable", async () => {
  const { root, sourceRoot, request } = await fixture();
  const crashed = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE, injectCrash: "head" });
  await assert.rejects(crashed.mint(request), (error) => error.code === "INJECTED_CRASH");
  const recovered = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  assert.equal((await recovered.getHead(request.headId)).latestEdition, 1);
  assert.equal((await recovered.mint(request)).created, false);
  assert.equal((await recovered.recover()).ok, true);
  const edition = await recovered.readEdition(request.headId, 1);
  assert.equal((await fsp.stat(path.join(edition.directory, "media", "master.mp4"))).mode & 0o222, 0, "recovery repairs immutable permissions after a head-phase crash");
});

test("cooperative cancellation after staging prevents head commit and remains safely recoverable", async () => {
  const { root, sourceRoot, request } = await fixture();
  const ledger = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(ledger.mint({ ...request, shouldAbort: async ({ phase }) => phase === "after-rename" }), (error) => error.code === "MINT_CANCELED");
  assert.equal(await ledger.getHead(request.headId), null);
  const recovery = await ledger.recover();
  assert.equal(recovery.ok, true);
  assert.ok(recovery.outcomes.some((row) => row.reason === "canceled-staging"));
  assert.equal(await ledger.getHead(request.headId), null);
});

test("source revision is rechecked immediately before atomic publish", async () => {
  let revision = "editor-revision-1";
  const { root, sourceRoot, request } = await fixture();
  const ledger = new SongCardMintLedger({
    root,
    allowedSourceRoots: [sourceRoot],
    mediaProbe: async () => GOOD_PROBE,
    readSourceRevision: async ({ phase }) => {
      if (phase === "publish") revision = "editor-revision-2";
      return revision;
    },
  });
  await assert.rejects(ledger.mint(request), (error) => error.code === "SOURCE_REVISION_CHANGED");
  assert.equal(await ledger.getHead(request.headId), null);
});

test("preflight fails closed for path escapes, symlinks, missing A/V, cycles, and per-frame telemetry", async () => {
  const { base, root, sourceRoot, sourceVideoPath, request } = await fixture();
  const outside = path.join(base, "outside.mp4");
  await fsp.writeFile(outside, "outside");
  const ledger = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(ledger.mint({ ...request, sourceVideoPath: outside }), (error) => error.code === "SOURCE_PATH_ESCAPE");

  const symlink = path.join(sourceRoot, "linked.mp4");
  await fsp.symlink(sourceVideoPath, symlink);
  await assert.rejects(ledger.mint({ ...request, sourceVideoPath: symlink }), (error) => ["SYMLINK_SOURCE_FORBIDDEN", "INVALID_SOURCE"].includes(error.code));

  const badMedia = new SongCardMintLedger({ root: path.join(base, "bad-media"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => ({ ...GOOD_PROBE, hasAudio: false }) });
  await assert.rejects(badMedia.mint(request), (error) => error.code === "MEDIA_PREFLIGHT_FAILED");

  const badDecode = new SongCardMintLedger({ root: path.join(base, "bad-decode"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE, mediaDecoder: async () => ({ ok: false, fullAudioVideoDecode: false }) });
  await assert.rejects(badDecode.mint(request), (error) => error.code === "MEDIA_DECODE_FAILED");

  const badRenderer = new SongCardMintLedger({ root: path.join(base, "bad-renderer"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(badRenderer.mint({ ...request, rendererTruth: { ok: false, silentDefaultCount: 1 } }), (error) => error.code === "RENDERER_TRUTH_FAILED");

  const publicGate = new SongCardMintLedger({ root: path.join(base, "public-gate"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(publicGate.mint({ ...request, publishStatus: "public-gate", rights: { licensingStatus: "unknown", consentStatus: "unknown" } }), (error) => error.code === "RIGHTS_GATE_FAILED");

  assert.throws(() => validateLineage({ nodes: [{ id: "x" }, { id: "y" }], edges: [{ from: "x", to: "y" }, { from: "y", to: "x" }] }), (error) => error.code === "LINEAGE_CYCLE");
  assert.throws(() => validateBoundedTelemetry([{ type: "frame-rendered", frameNumber: 1 }]), (error) => error.code === "PER_FRAME_TELEMETRY_FORBIDDEN");
});

test("rejected public identifiers never reach the append-only WAL", async () => {
  const { base, sourceRoot, request } = await fixture();
  const privateFingerprint = "/Users/alice/private/semantic.txt";
  const ledger = new SongCardMintLedger({ root: path.join(base, "private-id-wal"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(ledger.mint({ ...request, semanticFingerprint: privateFingerprint }), (error) => error.code === "PUBLIC_PATH_ESCAPE");
  const wal = await fsp.readFile(path.join(ledger.root, "mint.wal.ndjson"), "utf8").catch(() => "");
  assert.equal(wal.includes(privateFingerprint), false);
  await assert.rejects(ledger.mint({ ...request, headId: "/Users/alice/private/head" }), (error) => error.code === "PUBLIC_PATH_ESCAPE");
  assert.equal((await fsp.readFile(path.join(ledger.root, "mint.wal.ndjson"), "utf8").catch(() => "")).includes("/Users/alice/private/head"), false);
});

test("public gates require cleared rights, affirmative consent, visible renderer states, and a real poster image", async () => {
  const { base, sourceRoot, request } = await fixture();
  const validPoster = path.join(sourceRoot, "poster.jpg");
  const invalidPoster = path.join(sourceRoot, "not-an-image.jpg");
  await fsp.writeFile(validPoster, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  await fsp.writeFile(invalidPoster, "not an image");
  const make = (name) => new SongCardMintLedger({ root: path.join(base, name), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(make("bad-rights").mint({ ...request, publishStatus: "public-gate", posterPath: validPoster, rights: { licensingStatus: "uncleared", consentStatus: "denied" } }), (error) => error.code === "RIGHTS_GATE_FAILED");
  await assert.rejects(make("hidden-renderer").mint({ ...request, publishStatus: "public-gate", posterPath: validPoster, rendererTruth: { ...request.rendererTruth, allStatesVisible: false } }), (error) => error.code === "RENDERER_TRUTH_FAILED");
  await assert.rejects(make("bad-poster").mint({ ...request, publishStatus: "public-gate", posterPath: invalidPoster }), (error) => error.code === "POSTER_IMAGE_INVALID");
  const accepted = await make("valid-public").mint({ ...request, publishStatus: "public-gate", posterPath: validPoster });
  assert.equal(accepted.created, true);
  assert.equal(accepted.manifest.files.poster.mediaType, "image/jpeg");
  const governance = (await fsp.readFile(path.join(base, "valid-public", "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  const published = governance.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "published");
  assert.equal(published.length, 1);
  assert.equal(published[0].lineageHash, accepted.manifest.lineage.lineageHash);
  assert.match(published[0].lineageHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(published[0].perFrame, false);
  await make("valid-public").mint({ ...request, publishStatus: "public-gate", posterPath: validPoster });
  const replayGovernance = (await fsp.readFile(path.join(base, "valid-public", "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(replayGovernance.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "published").length, 1);
});

test("public lifecycle publication is reconciled after a head-phase crash", async () => {
  const { root, sourceRoot, request } = await fixture();
  const crashed = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE, injectCrash: "head" });
  await assert.rejects(crashed.mint({ ...request, publishStatus: "public-gate" }), (error) => error.code === "INJECTED_CRASH");
  assert.equal(await fsp.readFile(path.join(root, "governance.ndjson"), "utf8").catch(() => ""), "");
  const recovered = new SongCardMintLedger({ root, allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  const replay = await recovered.mint({ ...request, publishStatus: "public-gate" });
  assert.equal(replay.created, false);
  assert.equal(replay.reason, "idempotency-replay");
  assert.equal((await recovered.recover()).ok, true);
  assert.equal((await recovered.recover()).ok, true);
  const events = (await fsp.readFile(path.join(root, "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  const published = events.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "published");
  assert.equal(published.length, 1);
  assert.equal(published[0].perFrame, false);
});

test("retention removes staging only while archive and revoke preserve bytes", async () => {
  const { root, ledger, request } = await fixture();
  await ledger.mint(request);
  const edition = await ledger.readEdition(request.headId, 1);
  const before = await fsp.readFile(path.join(edition.directory, "media", "master.mp4"));
  const staleStage = path.join(root, ".staging", "stale");
  await fsp.mkdir(staleStage, { recursive: true });
  const retention = await ledger.cleanupStaging({ olderThanMs: 0 });
  assert.equal(retention.editionDirectoriesTouched, 0);
  assert.ok(retention.removed.some((entry) => entry.endsWith("stale")));
  assert.equal((await ledger.archiveEdition(request.headId, 1, { reason: "cold-storage-policy" })).status, "archived");
  assert.equal((await ledger.revokeEdition(request.headId, 1, { reason: "rights-withdrawn" })).status, "revoked");
  assert.equal((await ledger.revokeEdition(request.headId, 1, { reason: "rights-withdrawn" })).status, "revoked");
  assert.deepEqual(await fsp.readFile(path.join(edition.directory, "media", "master.mp4")), before);
  const governance = (await fsp.readFile(path.join(root, "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(governance.filter((row) => row.schemaVersion === "hapa.song-card-governance-event.v1" && row.status === "revoked").length, 1);
  const revoked = governance.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "revoked");
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].lineageHash, edition.lineage.lineageHash);
  assert.match(revoked[0].lineageHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(revoked[0].perFrame, false);
});

test("export/import and backup/restore preserve immutable render hashes", async () => {
  const { base, root, sourceRoot, ledger, request } = await fixture();
  const minted = await ledger.mint({ ...request, publishStatus: "public-gate" });
  const exported = path.join(base, "exported-edition");
  await ledger.exportEdition(request.headId, 1, exported);

  const importLedger = new SongCardMintLedger({ root: path.join(base, "import-ledger"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  const imported = await importLedger.importEdition(exported);
  assert.equal(imported.edition, 1);
  assert.equal((await importLedger.getHead(request.headId)).editions[0].renderSha256, minted.manifest.render.sha256);
  const importedGovernance = (await fsp.readFile(path.join(importLedger.root, "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(importedGovernance.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "published").length, 1);

  const backupPath = path.join(base, "backup");
  await ledger.backup(backupPath);
  const restoreLedger = new SongCardMintLedger({ root: path.join(base, "restore-ledger"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  const restored = await restoreLedger.restore(backupPath);
  assert.equal(restored.headCount, 1);
  assert.equal((await restoreLedger.getHead(request.headId)).latestEdition, 1);
  const restoredEdition = await restoreLedger.readEdition(request.headId, 1);
  assert.equal(restoredEdition.manifest.render.sha256, minted.manifest.render.sha256);
});

test("legacy portable imports normalize raw idempotency keys before persistence", async () => {
  const { base, sourceRoot, ledger, request } = await fixture();
  await ledger.mint(request);
  const edition = await ledger.readEdition(request.headId, 1);
  const legacySource = path.join(base, "legacy-raw-idempotency-bundle");
  await fsp.cp(edition.directory, legacySource, { recursive: true });
  const transactionPath = path.join(legacySource, "transaction.json");
  await fsp.chmod(transactionPath, 0o644);
  const transaction = JSON.parse(await fsp.readFile(transactionPath, "utf8"));
  transaction.idempotencyKey = "legacy-raw-safe-key";
  await fsp.writeFile(transactionPath, `${JSON.stringify(transaction, null, 2)}\n`);
  const importedLedger = new SongCardMintLedger({ root: path.join(base, "legacy-idempotency-import"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await importedLedger.importEdition(legacySource);
  const importedHead = await importedLedger.getHead(request.headId);
  assert.equal(Object.keys(importedHead.idempotency).every((key) => /^idempotency:sha256:[a-f0-9]{64}$/u.test(key)), true);
  const importedEdition = await importedLedger.readEdition(request.headId, 1);
  const importedTransaction = JSON.parse(await fsp.readFile(path.join(importedEdition.directory, "transaction.json"), "utf8"));
  assert.match(importedTransaction.idempotencyKey, /^idempotency:sha256:[a-f0-9]{64}$/u);
});

test("export and backup reject corrupted support files and private custody instead of blessing current disk state", async () => {
  const first = await fixture();
  await first.ledger.mint(first.request);
  const firstEdition = await first.ledger.readEdition(first.request.headId, 1);
  const contextPath = path.join(firstEdition.directory, "data/context.json");
  await fsp.chmod(contextPath, 0o644);
  await fsp.writeFile(contextPath, `${JSON.stringify({ injected: "/Users/alice/private/injected-after-mint.json" })}\n`);
  await assert.rejects(first.ledger.exportEdition(first.request.headId, 1, path.join(first.base, "corrupt-export")), (error) => error.code === "BUNDLE_INTEGRITY_FAILED");
  await assert.rejects(first.ledger.backup(path.join(first.base, "corrupt-backup")), (error) => error.code === "BUNDLE_INTEGRITY_FAILED");

  const second = await fixture();
  await second.ledger.mint(second.request);
  const secondEdition = await second.ledger.readEdition(second.request.headId, 1);
  const custodyPath = path.join(secondEdition.directory, ".custody.private.json");
  const custody = JSON.parse(await fsp.readFile(custodyPath, "utf8"));
  custody.posterSourceAbsolutePath = "/Users/alice/private/tampered-poster.jpg";
  await fsp.chmod(custodyPath, 0o644);
  await fsp.writeFile(custodyPath, `${JSON.stringify(custody, null, 2)}\n`);
  await assert.rejects(second.ledger.exportEdition(second.request.headId, 1, path.join(second.base, "custody-export")), (error) => error.code === "BUNDLE_INTEGRITY_FAILED");
  await assert.rejects(second.ledger.backup(path.join(second.base, "custody-backup")), (error) => error.code === "BUNDLE_INTEGRITY_FAILED");
});

test("transfer gates reject destination symlink escapes and undeclared edition symlinks", async () => {
  const { base, root, ledger, request } = await fixture();
  await ledger.mint(request);
  const outsideLink = path.join(base, "outside-link-to-ledger");
  await fsp.symlink(root, outsideLink, "dir");
  await assert.rejects(ledger.exportEdition(request.headId, 1, path.join(outsideLink, "nested-export")), (error) => error.code === "INVALID_EXPORT_TARGET");
  await assert.rejects(ledger.backup(path.join(outsideLink, "nested-backup")), (error) => error.code === "INVALID_BACKUP_TARGET");
  const edition = await ledger.readEdition(request.headId, 1);
  await fsp.chmod(edition.directory, 0o755);
  await fsp.symlink(path.join(base, "outside-link-to-ledger"), path.join(edition.directory, "undeclared-link"));
  await assert.rejects(ledger.exportEdition(request.headId, 1, path.join(base, "symlink-export")), (error) => error.code === "BUNDLE_INTEGRITY_FAILED");
});

test("backup restore rejects any tampered edition file instead of trusting only heads.json", async () => {
  const { base, sourceRoot, ledger, request } = await fixture();
  await ledger.mint(request);
  const backupPath = path.join(base, "tampered-backup");
  await ledger.backup(backupPath);
  const backupLedger = JSON.parse(await fsp.readFile(path.join(backupPath, "heads.json"), "utf8"));
  const relativeEdition = backupLedger.heads[request.headId].editions[0].path;
  const backedUpMaster = path.join(backupPath, relativeEdition, "media", "master.mp4");
  await fsp.chmod(backedUpMaster, 0o644);
  await fsp.writeFile(backedUpMaster, "tampered backup master");
  const restoreLedger = new SongCardMintLedger({ root: path.join(base, "tampered-restore"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  await assert.rejects(restoreLedger.restore(backupPath), (error) => error.code === "BACKUP_INTEGRITY_FAILED");
});

test("edition export and import preserve revocation governance instead of reactivating content", async () => {
  const { base, root, sourceRoot, ledger, request } = await fixture();
  await ledger.mint(request);
  const privateReason = "C:\\Users\\Alice\\private\\rights-withdrawn-a.pdf";
  const secondPrivateReason = "C:\\Users\\Alice\\private\\rights-withdrawn-b.pdf";
  await ledger.revokeEdition(request.headId, 1, { reason: privateReason });
  await ledger.revokeEdition(request.headId, 1, { reason: privateReason });
  await ledger.revokeEdition(request.headId, 1, { reason: secondPrivateReason });
  await ledger.revokeEdition(request.headId, 1, { reason: secondPrivateReason });
  const exportPath = path.join(base, "revoked-export");
  const exported = await ledger.exportEdition(request.headId, 1, exportPath);
  assert.equal(exported.governance.status, "revoked");
  assert.equal(exported.governance.reason, "[private governance reason redacted]");
  assert.equal(await fsp.access(path.join(exportPath, ".custody.private.json")).then(() => true).catch(() => false), false, "portable export excludes private custody paths");
  assert.equal((await fsp.readFile(path.join(exportPath, "export-manifest.json"), "utf8")).includes(privateReason), false);
  assert.equal((await fsp.readFile(path.join(exportPath, "export-manifest.json"), "utf8")).includes(secondPrivateReason), false);
  const privateGovernance = (await fsp.readFile(path.join(root, ".governance.private.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(privateGovernance.map((event) => event.reason), [privateReason, secondPrivateReason]);
  const importLedger = new SongCardMintLedger({ root: path.join(base, "revoked-import"), allowedSourceRoots: [sourceRoot], mediaProbe: async () => GOOD_PROBE });
  const imported = await importLedger.importEdition(exportPath);
  assert.equal(imported.governance.status, "revoked");
  assert.equal((await importLedger.getHead(request.headId)).editions[0].status, "revoked");
  const importedEvents = (await fsp.readFile(path.join(importLedger.root, "governance.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(importedEvents.filter((row) => row.schemaVersion === "hapa.song-card.lifecycle-event.v1" && row.type === "revoked").length, 1);
});

test("v1 and Native Show migration creates an immutable receipt", async () => {
  const { ledger, request } = await fixture();
  await assert.rejects(ledger.migrateLegacyCard({
    legacyCard: { schemaVersion: "hapa.music-viz.native-show-card.v2", id: "empty-native", video: "" },
    mintRequest: request,
  }), (error) => error.code === "MIGRATION_EMPTY_NATIVE_CARD");
  const migrated = await ledger.migrateLegacyCard({
    legacyCard: { schemaVersion: "hapa.song-card.v1", id: "dear-papa", title: "Dear Papa" },
    mintRequest: request,
  });
  assert.equal(migrated.created, true);
  assert.equal(migrated.migrationReceipt.sourceSchema, "hapa.song-card.v1");
  assert.equal(migrated.migrationReceipt.targetEdition, 1);
  assert.equal(JSON.parse(await fsp.readFile(path.join(ledger.root, migrated.migrationReceiptPath), "utf8")).migrationId, migrated.migrationReceipt.migrationId);
});
