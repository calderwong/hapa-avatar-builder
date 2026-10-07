# Living Light Phase 1 acceptance contract

> Portable planning specification with an execution-scope delta, October 6, 2026. Criteria describe intended behavior; current evidence and incomplete states are in [the integration record](../LIVING_LIGHT_INTEGRATION.md) and [the live board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). The original planning artifacts remain preserved.

Planning specification, 2026-10-06 Pacific. No checks below were executed by this planning pass. Read with [requirements](REQUIREMENTS.md), [prototype audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder), [Builder audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder) and [inventory receipt](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). Sol 6.1 should implement these gates in the existing owner boundaries, then attach actual evidence to the corresponding board cards.

## 1. Honest coverage and release labels

The current inventory contains **200 unique Song IDs and readable MP3 master headers; 137 complete MP3 stem sets comprising 1,641 roles (136 × 12 + 9); 62 songs without declared stems; and one song declaring 12 unavailable stems**. Refresh this inventory immediately before qualification and record additions/removals. Stored `localAvailable` flags are not the source of truth.

Keep independent result columns; none implies the next:

| Evidence level | What passed | Permitted claim |
|---|---|---|
| Inventory | Record/path/stat/container-header lookup | Source is listed and appears locally readable |
| Decode probe | Finite start/middle/end segments decode | Selected segments decode; full duration remains untested |
| Signal contract | Source-bound feature metadata/arrays validate and finite windows evaluate | Requested features are usable for those windows |
| Runtime sample | Actual audio-clock playback and visible rendering at sampled times | Sampled preview works on the recorded machine/browser |
| Full-duration playback | One uninterrupted real-clock run from start to terminal state | This exact song/source/recipe/quality completed |
| Visual review | A person inspected specified renders/playback | Named reviewer accepted specified visual qualities |

Phase 1 may be labeled **album-wide selection/routing and reusable authoring qualified** after all gates below pass, with the full-playback coverage count stated separately. “All 200 songs fully played” requires 200 corresponding uninterrupted records. “Every stem fully decodes” requires full decode coverage of every available stem source. Six representative playthroughs cannot establish either claim. Human artistic acceptance remains a separate board state.

Audio scope is one audible master **or one selected actual stem audition**. Multiple available prepared stem roles may drive visualization together. A 12-track audible mixer is not an acceptance dependency or implied deliverable.

## 2. Finite release matrix

| Gate | Scope and required result | Evidence |
|---|---|---|
| A01 Supplied-source baseline | Pin supplied HTML and newly supplied source ZIP hashes, all102 manifest input/module hashes, existing dirty Builder file signatures and inherited shader credits. Preserve originals. Safely unpack supplied source and reproduce the playable with reviewed tools/build.py; enumerate differences. Configure supplied Linux-oriented browser QA for the Mac and explicitly account for its absent sibling108.1 comparison baseline without silently skipping current checks. | Source-arrival manifest, unpack/rebuild report, QA runner decision and preserved notice paths |
| A02 Album identity | All 200 IDs enumerate without decode/preparation on list; repeated titles stay distinct; new local-ingest fixture appears without renderer edits. | Exact-ID manifest and API/UI/CLI comparison |
| A03 Available audio | All 200 master routes and every available role in 137 sets pass bounded probes below. Failed probes remain explicit and prevent a false available/qualified badge. The 62 no-role songs and one unavailable declared set still use masters. | Per-source decode/status receipt; no title-based joins |
| A04 Source/feature truth | Exact media revision, duration, role mapping, normalization and analysis version are checked before use; missing/silent/unmapped states stay distinct. | Fixture outcomes and real-source binding table |
| A05 Catalog accounting | Six continuous profiles, 21 legacy passage styles and 23 destination IDs each have a stable manifest/Card and capability/readiness entry. | Machine-readable source-to-Thing map plus visible library |
| A06 Independent composition | Required permutations and boundary cases below pass atomically, preserving locks, source selection, notes and immutable revisions. | Saved/reloaded fixtures and revision/undo assertions |
| A07 Cards/discussion | General and instance notes persist with attribution and conflict detection; no tile starts an audio/GL instance. | Two-client concurrency results, reload/restart readback and UI capture |
| A08 Transport/lifecycle | One source clock and one audible output; generation cancellation, seek/end/replay, hidden-view pause, cleanup and context restoration pass. | Clock/source/resource trace and actual listening observation |
| A09 Real visual qualification | Sample every distinct implementation family; inspect reference/detail, lighting/depth, aspect and motion. Run representative full-duration recipes. | Contact sheets, short clips, exact timestamps and reviewer notes |
| A10 Performance/regression | Bounded resource policy, provisional targets, accessibility and affected owner regressions are checked on the target machine. | Browser/GPU/config metrics, test/build results and limitations |

All catalog entries must be accounted for. Only tested compatible entries become `ready`; aliases/variants and unresolved dependencies stay visible. A minimum of three distinct compatible Locations and two distinct bridge Tunnels must work in multiple orderings. This is not permission to mark an untested 23 × 21 × 23 cross-product compatible.

`halo-vault` must explicitly map to the Lumen Arcade compatibility alias. Golden Loom `breathline-weave` is the additional corridor world, not a 24th destination. Continuous family IDs are `fractal`, `cathedral`, `weave`, `electric`, `glass`, `star`. “Tidal Glass” must not claim physical refraction. Cards preserve original provenance and module-specific rights rather than applying one blanket license.

## 3. Deterministic fixtures

Use small generated or locally authored fixtures in tests; do not modify album records to create failures. Keep expected packets calculated independently of the implementation where practical.

1. **Identity:** duplicate titles with different IDs/hashes; same ID with changed source hash; stale `localAvailable`; resolver failure; local-ingest custody versus registry verification; archive/role placeholders; unsupported URL/code reference.
2. **Stem sets:** zero, one, nine, twelve and thirteen roles; two assets sharing a role; unknown-role label; missing lead vocals/keyboard; intentionally silent stem; master-only; partial availability and corrupt one-of-twelve. Every actual stem remains individually selectable. `FX`→prototype `other` is an explicit documented mapping, never an assumed identity.
3. **Feature fidelity:** zero energy, one impulse, ramp, alternating roles; absent band/onset capability; corrupt/truncated/nonfinite arrays; differing analysis Hz; stale algorithm/source digest; disabled visual contribution. Zero input creates no measured onset, while documented resting motion can remain.
4. **Time:** durations 0.5, 2, 4 and 8 seconds plus a long fixture; nonzero stem offset, shorter/longer stem, unequal sample rate, end padding, negative/out-of-range request. Use explicit silence outside valid source range; never stretch alignment implicitly.
5. **Determinism:** seed A/A matches and seed A/B changes only seeded behavior; direct seek versus forward/reverse evaluation at identical source times; evaluate after 15/30/60 fps schedules. Pure packets should match exactly where arithmetic permits; otherwise establish per-field tolerances before testing, not after a failure.
6. **Validation/migration:** invalid numeric range/enums; unknown renderer/revision; optional missing Journey subtree imports as Standard; malicious note HTML; oversized payload; unsupported code reference; old saved take; conflicts and interrupted atomic writes. Rejected operations leave persisted and active state unchanged.

The required real-source mismatch regression is **prototype Dear Papa: 183.024 s / eight stem records / reconstructed audition** versus **canonical `dear-papa-song-dear-papa`: stored duration 258.44 s / twelve declared available roles**. The latter duration is current metadata until independently decoded. Matching title does not authorize reuse of the former score. Reject its feature attachment unless the exact audio fingerprint and explicit validated time mapping match; do not stretch the 183-second analysis across the canonical master.

## 4. Bounded album and representative real-song checks

Qualification is a deliberate execution operation, never work triggered by library mount. Produce an immutable run manifest listing source IDs/hashes, inventory revision, runtime/analysis revisions, device/browser, requested scope and concurrency. Resume by manifest, not by silently skipping failures. Initial concurrency: at most two audio probe/preparation jobs and one GPU test at a time; use existing cancellation routes and process contracts.

For **each of 200 master sources**, resolve the exact route and decode at most three two-second windows: start, midpoint and end (clamped/deduplicated for short clips). Confirm finite decoded samples and credible actual duration/terminal position. For **each available role in all 137 sets**, perform the same bounded source test and validate prepared-signal identity/shape; test selection of that role as the single audition source. When alignment is unverified, require labeled stem-source-local time, a held Journey and exact prior song-position restoration; this does not pass synchronized-signal qualification. The missing declared set must produce missing-role state, not 12 fake zero channels. This is approximately 1,841 sources and at most 5,523 probe windows in the current snapshot, explicitly bounded and resumable. A container library that requires full decode must report that cost and actual scope; do not describe it as a two-second decode.

For every song, exercise a single low-cost canonical ready recipe at `0`, `min(5,duration/4)`, midpoint and `max(0,duration−0.1)` using existing or deliberately prepared source-bound signals. Record load/seek/end, no exceptions/NaNs, actual source ID and readiness. Real decoded silence is valid; “nonzero” is not a universal pass criterion. Reuse decoded/prepared data when identity matches rather than repeating analysis.

Run full-duration real-clock playback on this representative set, with at least one continuous recipe and one tour represented across the runs:

| Exact canonical ID | Reason |
|---|---|
| `dear-papa-song-brave-tongues` | Common twelve-role set; inherited electricity character |
| `dear-papa-song-gnow-her` | Nine-role local-ingest custody; WAV/MP3 alternatives |
| `dear-papa-song-i-knew-a-bella` | Master-only and longer 338.12-second declared duration |
| `dear-papa-song-bread-conviction-and-poop-in-the-tub` | Twelve declared unavailable stems with available master |
| `dear-papa-song-dear-papa` | Prototype/canonical source mismatch regression |
| One exact ID selected from a repeated-title group | Ambiguous display name; include its sibling as a rapid-switch comparison |

Choose the last exact ID from the fresh inventory and freeze it in the test manifest before testing. Interruptions, stalls, decode failures, unexpected end or clock reset invalidate uninterrupted status. Preserve partial evidence and retry that case after a correction. Individual stem auditions need bounded qualification for every available source; full-duration stem listening across 1,641 roles is a separately recorded coverage dimension, not inferred from master runs.

## 5. Composition and boundary checks

Freeze a tested compatibility set containing Locations A/B/C and bridge Tunnels X/Y. Verify A→X→B, A→Y→B, A→X→C, A→Y→C and reversed endpoints where declared compatible; separately run all six continuous families and an automatic family schedule. Test a duplicate module used twice with distinct overrides and notes.

At each boundary evaluate `t−1 ms`, `t`, `t+1 ms`, then seek backward through it. Cover entry, reveal, arrival, song end, automatic chapter blend and apparition encounter. No negative duration, gaps, overlapping exclusive placements, invalid camera vector, uncontrolled roll, NaN or wrong destination is permitted. Short tracks must use an explicit valid fallback recipe instead of violating the legacy four-second passage minimum.

Replacing a destination must atomically update the adjacent route chain and preserve unrelated references. Test rejection under locked shots/cameras, stale revision, unsupported pairing and missing module. On failure, compare the complete before/after recipe and note targets. On success, check one undo/redo step restores exact prior/new state. Change a Tunnel without changing Locations, and a Location without changing the Tunnel. Switching Continuous/Standard cannot rewrite saved Standard arrivals. Fork-to-song shows timing conversion before commit and never rescales measured events as if reanalysis occurred.

## 6. Notes, clock and resource gates

Use two clients reading revision N: A commits N+1; B's write against N returns a conflict with recoverable text. Test retry/readback, note edit/retraction history, author-type attribution, reload and owner-service restart. Thing, variant and placement note targets remain distinct after duplicate/fork/reorder. Simulate failed save and offline service: preserve draft and unsaved badge. Assert unrelated Song lyrics/knowledge, Place lore, Card birth receipt and renderer state are unchanged. Local save is not remote acknowledgement or publication.

Rapidly switch A→B→A while delays deliberately reorder media/feature responses; only the latest generation may attach. Cancel preparation and unmount mid-load. Master-to-stem audition switches must leave exactly one audible source. Verified maps use the song clock/offset contract; unverified maps use explicit stem-source-local audition with the Journey held and prior song position restored. Verify both by graph inspection **and listening**. Preserve the existing maximum **six silent live stem analyser decoders**. Prepared signals may cover every available role without allocating one decoder per role. Define how stale live samples become unavailable when source generation, paused state or the existing 0.12-second drift threshold fails.

Implement explicit budgets before stress tests: suggested starting caps are 128 MiB resident decoded/prepared **feature cache** with LRU eviction and pinned active entry, the existing 32 MiB prepared-publication limit, at most four retained inactive song banks within the byte cap, one active Living Light canvas/animation scheduler, and no GL/audio instance per tile. Audio decode buffers have their own measured budget; they must not disappear from accounting under a feature-cache label. Record allocations and peak transient preparation separately. Reject/stream an oversized active source with a useful state rather than exceeding the cap silently.

Stress: warm the selected recipe, then 20 song/Location/Tunnel/quality swaps, 10 mount/unmount cycles, resize in all three aspects, and one forced WebGL context loss/restore. After disposal, tracked per-instance resource counts return to baseline; after cache warmup no unexplained monotonically increasing GPU objects, listeners, decoders or retained banks. Wait for known cleanup completion before comparing; browser heap noise alone is not proof of a leak.

## 7. Visual/performance evidence and exit

Capture each family/location implementation at named source times with beauty and fixed-light/rest views. Inspect geometry silhouette, depth/occlusion, camera continuity, readable actor scale, palette, highlights, portrait framing and meaningful response to isolated signal fixtures. State equality proves deterministic evaluation; pixel comparisons detect regression under a controlled device/media frame; **neither substitutes for visual inspection or Calder's creative judgment**. Preserve known intentional differences and the historical Luna video-screen discrepancy.

Provisional qualification target: Balanced preview at 1280×720, target 30 presented fps, steady-state p95 frame interval ≤50 ms over a measured 60-second window; UI action acknowledgement ≤150 ms p95; warm prepared song selection to first valid frame ≤2 seconds. These are starting acceptance targets to measure on the actual Mac/browser, not existing guarantees. Record cold preparation separately, GPU timing availability, quality tier and sample count. If a target fails, optimize or propose a documented narrower supported profile; never relabel CPU submission as presented fps or reduce quality silently. High, 4K and Safari support need their own evidence.

Run affected audio, inventory, source-binding, composition, notes, lifecycle and Overcard regressions, then the owner's coherent release build/UI checks. Preserve uncommitted work and GitHub freeze. Every failure gets a linked issue, exact reproduction and disposition; blocking failures prevent release labeling.

Phase 2 video surfaces/compositing, external-transport recording, deterministic final encodes, VR and 4K/60 remain separate. Phase 1 exports truthful capability declarations and preserves existing 2D cuts; it does not mint final Song Cards or mark an unqualified renderer final-ready.
