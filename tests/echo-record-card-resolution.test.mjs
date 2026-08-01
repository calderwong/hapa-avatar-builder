import assert from "node:assert/strict";
import test from "node:test";

import {
  ECHO_RECORD_CARD_RESOLUTION_SCHEMA,
  createEchoRecordVisualCardResolver,
  echoRecordVisualCardPolicy,
  echoRecordVisualAttachmentId,
  echoRecordVisualTimestampMs,
} from "../src/domain/echo-record-card-resolution.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(body);
    },
  };
}

function project() {
  return {
    song_id: "sunday-signals",
    song_title: "Sunday Signals",
    duration: 12,
    timeline: [],
    provenance: { source: "resolution-fixture" },
  };
}

function timedVisual(overrides = {}) {
  return {
    id: "echo-surface:sunday-signals:now-playing:0",
    role: "now-playing",
    sourceType: "director-shot",
    sourceId: "shot-one",
    songId: "sunday-signals",
    title: "Garden opens",
    media: {
      kind: "video",
      uri: "/media/garden.mp4",
      posterUri: "/media/garden.jpg",
    },
    provenance: {
      mediaCardId: "media-card-one",
      startSeconds: 0,
      endSeconds: 4,
    },
    attachment: {
      cardId: "media-card-one",
      lookupId: "media-card-one",
      card: null,
    },
    clockLocked: true,
    startSeconds: 0,
    ...overrides,
  };
}

test("timed Director visuals reuse the immutable Song Card print path and validate its receipt", async () => {
  const calls = [];
  const timestampMs = 2500;
  const appearance = {
    appearanceId: "appearance:edition-2",
    snapshot: { id: "historical-card", title: "Historical Garden" },
  };
  const responses = [
    jsonResponse({ latestEdition: 2 }),
    jsonResponse({ truthStatus: "printable", primary: appearance, active: [appearance] }),
    jsonResponse({
      card: {
        ...appearance.snapshot,
        songCardPrint: {
          songId: "sunday-signals",
          edition: 2,
          timestampMs,
          appearanceId: appearance.appearanceId,
        },
      },
    }, 201),
  ];
  const resolve = createEchoRecordVisualCardResolver({
    apiBase: "http://builder.local",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return responses.shift();
    },
  });

  const result = await resolve({
    visual: timedVisual(),
    project: project(),
    clockSeconds: 2.5,
  });

  assert.equal(result.schemaVersion, ECHO_RECORD_CARD_RESOLUTION_SCHEMA);
  assert.equal(result.mode, "authoritative-edition-print");
  assert.equal(result.card.id, "historical-card");
  assert.equal(result.timestampMs, timestampMs);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "http://builder.local/api/song-cards/sunday-signals");
  assert.match(calls[1].url, /editions\/2\/cards-at-time\?timeMs=2500$/);
  assert.match(calls[2].url, /editions\/2\/print$/);
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    timeMs: timestampMs,
    appearanceId: appearance.appearanceId,
    surface: "echo-record-garden",
  });
});

test("Up Next resolves against its own visual start instead of the current song clock", () => {
  assert.equal(echoRecordVisualTimestampMs(timedVisual({
    role: "up-next",
    startSeconds: 5.125,
  }), 2.5), 5125);
});

test("mismatched authoritative print receipts fail closed without local substitution", async () => {
  const calls = [];
  const appearance = {
    appearanceId: "appearance:edition-2",
    snapshot: { id: "historical-card", title: "Historical Garden" },
  };
  const responses = [
    jsonResponse({ latestEdition: 2 }),
    jsonResponse({ truthStatus: "printable", primary: appearance, active: [appearance] }),
    jsonResponse({
      card: {
        ...appearance.snapshot,
        songCardPrint: {
          songId: "sunday-signals",
          edition: 1,
          timestampMs: 2500,
          appearanceId: appearance.appearanceId,
        },
      },
    }, 201),
  ];
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async (url) => {
      calls.push(url);
      return responses.shift();
    },
  });

  await assert.rejects(
    resolve({ visual: timedVisual(), project: project(), clockSeconds: 2.5 }),
    { code: "authoritative_print_receipt_mismatch" },
  );
  assert.equal(calls.length, 3, "receipt failure must not continue into a mutable lookup or local projection");
  assert.deepEqual(resolve.inspect(), { completed: 0, pending: 0 });
});

test("embedded Echo Reference Cards preserve their exact runtime identity without another lookup", async () => {
  const card = {
    id: "tarot-reference:porch-light",
    referenceCardId: "reference:porch-light",
    cardType: "reference_card",
    title: "Porch-light memory",
  };
  let calls = 0;
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("embedded Cards must not be fetched again");
    },
  });
  const visual = {
    id: "echo-surface:sunday-signals:reference:porch-light",
    role: "reference",
    sourceType: "echo-reference-card",
    sourceId: "reference:porch-light",
    songId: "sunday-signals",
    attachment: {
      cardId: card.id,
      lookupId: card.id,
      card,
    },
  };

  const result = await resolve({ visual, project: project(), clockSeconds: 3 });
  assert.equal(result.mode, "embedded-source-card");
  assert.equal(result.card.id, card.id);
  assert.equal(result.card.referenceCardId, "reference:porch-light");
  assert.equal(echoRecordVisualAttachmentId(visual), card.id);
  assert.equal(calls, 0);
});

test("source Card lookup uses the exact attachment id and dedupes pending and completed requests", async () => {
  let release;
  let calls = 0;
  const response = new Promise((resolve) => {
    release = () => resolve(jsonResponse({ id: "avatar-green", title: "Green" }));
  });
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, "/api/tarot/card/avatar-green");
      return response;
    },
  });
  const input = {
    visual: {
      id: "echo-surface:sunday-signals:character:green",
      role: "character",
      sourceType: "avatar-card",
      sourceId: "display-green",
      songId: "sunday-signals",
      attachment: {
        cardId: "avatar-green",
        lookupId: "avatar-green",
        card: null,
      },
    },
    project: project(),
    clockSeconds: 4,
  };

  const first = resolve(input);
  const second = resolve(input);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(resolve.inspect(), { completed: 0, pending: 1 });
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.card.id, "avatar-green");
  assert.equal(secondResult.card.id, "avatar-green");
  assert.equal(firstResult.mode, "attached-source-card");
  assert.deepEqual(resolve.inspect(), { completed: 1, pending: 0 });

  const cached = await resolve(input);
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
});

test("exact Preview Card resolution returns the requested id or fails closed without a local substitute", async () => {
  const visual = timedVisual({
    id: "director-preview-card:exact-frame",
    role: "director-preview-exact-card",
    sourceType: "director-preview-exact-card",
    sourceId: "preview-card-exact",
    clockLocked: false,
    resolutionPolicy: "exact-id-or-fail",
    attachment: {
      cardId: "preview-card-exact",
      lookupId: "preview-card-exact",
      card: null,
    },
  });

  const resolvedCalls = [];
  const resolveExact = createEchoRecordVisualCardResolver({
    fetchImpl: async (url) => {
      resolvedCalls.push(url);
      return jsonResponse({ id: "preview-card-exact", title: "Exact preview frame" });
    },
  });
  const result = await resolveExact({ visual, project: project(), clockSeconds: 2 });
  assert.equal(result.mode, "attached-source-card");
  assert.equal(result.card.id, "preview-card-exact");
  assert.deepEqual(resolvedCalls, ["/api/tarot/card/preview-card-exact"]);

  const missingCalls = [];
  const resolveMissingExact = createEchoRecordVisualCardResolver({
    fetchImpl: async (url) => {
      missingCalls.push(url);
      return jsonResponse({ error: "not_found" }, 404);
    },
  });
  await assert.rejects(
    resolveMissingExact({ visual, project: project(), clockSeconds: 2 }),
    { code: "attached_card_exact_lookup_failed", status: 404 },
  );
  assert.deepEqual(missingCalls, ["/api/tarot/card/preview-card-exact"]);
  assert.deepEqual(resolveMissingExact.inspect(), { completed: 0, pending: 0 });
});

test("only a confirmed missing source attachment falls back to a truth-labelled local projection", async () => {
  const calls = [];
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse({ error: "not_found" }, 404);
    },
  });

  const result = await resolve({
    visual: timedVisual(),
    project: project(),
    clockSeconds: 2,
  });
  assert.deepEqual(calls, [
    "/api/song-cards/sunday-signals",
    "/api/tarot/card/media-card-one",
  ]);
  assert.equal(result.mode, "local-unminted-projection");
  assert.equal(result.card.persistence.minted, false);
  assert.equal(result.card.persistence.status, "not-persisted");
  assert.match(result.card.persistence.message, /No Card was persisted or minted/);
});

test("source service failures stay unavailable instead of impersonating a local success", async () => {
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async () => jsonResponse({ error: "offline" }, 503),
  });
  await assert.rejects(
    resolve({
      visual: {
        id: "character:green",
        role: "character",
        sourceType: "avatar-card",
        sourceId: "avatar-green",
        attachment: { cardId: "avatar-green", lookupId: "avatar-green", card: null },
      },
      project: project(),
    }),
    { code: "attached_card_lookup_failed", status: 503 },
  );
});

test("explicit rights, consent, and stale-attachment blocks fail before any Card API call", async () => {
  let calls = 0;
  const resolve = createEchoRecordVisualCardResolver({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({}, 500);
    },
  });
  const rightsBlocked = timedVisual({
    rights: {
      status: "source-declared",
      licenseStatus: "reference-only",
      consentStatus: "revoked",
    },
  });
  assert.deepEqual(echoRecordVisualCardPolicy(rightsBlocked), {
    allowed: false,
    code: "rights_or_consent_blocked",
    reason: "Card generation is blocked by the source rights or consent record.",
    reviewRequired: true,
  });
  await assert.rejects(
    resolve({ visual: rightsBlocked, project: project(), clockSeconds: 2 }),
    { code: "rights_or_consent_blocked", status: 403 },
  );

  const stale = timedVisual({
    id: "stale-visual",
    attachment: {
      cardId: "old-card",
      lookupId: "old-card",
      freshnessStatus: "stale",
      stale: true,
    },
  });
  await assert.rejects(
    resolve({ visual: stale, project: project(), clockSeconds: 2 }),
    { code: "stale_attachment_blocked", status: 403 },
  );
  assert.equal(calls, 0);
});

test("cancelling or clearing the resolver aborts pending Card network work", async () => {
  let aborts = 0;
  const fetchImpl = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      aborts += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const resolve = createEchoRecordVisualCardResolver({ fetchImpl });
  const firstVisual = timedVisual({ id: "cancel-me" });
  const first = resolve({ visual: firstVisual, project: project(), clockSeconds: 1 });
  await Promise.resolve();
  assert.equal(resolve.cancelVisual("cancel-me"), true);
  await assert.rejects(first, { name: "AbortError" });
  assert.deepEqual(resolve.inspect(), { completed: 0, pending: 0 });

  const second = resolve({
    visual: timedVisual({ id: "clear-me" }),
    project: project(),
    clockSeconds: 2,
  });
  await Promise.resolve();
  resolve.clear();
  await assert.rejects(second, { name: "AbortError" });
  assert.equal(aborts, 2);
  assert.deepEqual(resolve.inspect(), { completed: 0, pending: 0 });
});
