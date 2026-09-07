# The Echo Album — Enhancement List

> **What this is:** a critical self-audit of the two finished synthesis deliverables, plus a prioritized list of concrete ways to **deepen** (add new insight) and **sharpen** (fix or verify existing claims) the Echo Album analysis.
> **Audited work:** [ECHO_ALBUM_MASTER_STORY.md](ECHO_ALBUM_MASTER_STORY.md) (80.6KB, 4 parts, 199/199 deep read) and [ECHO_ALBUM_RESEARCH_NOTES.md](ECHO_ALBUM_RESEARCH_NOTES.md) (610KB, ledger + per-track notes #1–#199), both generated 2026-09-02.
> **Audit date:** 2026-09-02 (resumed pass). **Method:** mechanical evidence-gathering against `data/hapa-songs-store.json` (25.9MB, 199 songs) and `docs/echo-album-lyrics.md` (505KB, 199 sections) — field census, text-diff, similarity re-derivation, re-counting, and one network feasibility test. No claims below are unmeasured; every number was recomputed this pass (repro details in Appendix A).
> **Ground rule:** the store is the app's live workbench; the lyrics file is what the deep read used. Where they disagree, that is itself a finding, not an error to paper over.
> **Status (2026-09-03):** the P0 items below were **executed** that day as an **append-only improvement run** under the operator's **multiverse canon rule** (apparent conflicts = separate timelines of the same song, converging through communication over the music/lyrics). Execution marks are appended in place below, dated, with original wording preserved. The two deliverables received append-only edits verified character-level against pre-edit snapshots (every original character preserved in order); the store and songbook data files were not modified.

## How to read this file

- **Tag [DEEPEN]** = adds a new analytical dimension the finished docs never touched. **[SHARPEN]** = fixes, verifies, or re-baselines existing claims. **[FIX]** = concrete edit to an existing doc.
- **Priority:** **P0** = the finished docs contain a claim that is wrong or unverifiable as written; fix before any further work builds on them. **P1** = high-value new insight or data map. **P2** = valuable, lower urgency.
- Each item: *what / why / method / data source / effort* (S = under an hour, M = a session, L = a day+).

## Summary table

| ID | Item | Tag | Priority |
|---|---|---|---|
| A1 | 14 no-lyrics tracks: transcription task list (Suno is JS-gated) | SHARPEN/DEEPEN | P1 |
| A2 | 6 `not_found`-status tracks that *do* carry text (unverified provenance) | SHARPEN | P1 |
| A3 | Store and songbook disagree on 9 tracks' text (the app shows different lyrics than the deep read analyzed) | SHARPEN | P0 |
| A4 | 11 registry title drifts between file and store (incl. full rename of 114) | SHARPEN | P1 |
| A5 | Lyric-timing coverage: 181/199 have timings, only 48 carry a timing source | SHARPEN | P2 |
| A6 | Stem coverage: 62/199 have no stems | SHARPEN | P2 |
| A7 | Media/scene/visualizer coverage map (16 media, 57 scenes, 0 visualizers, 7-catalog) | DEEPEN | P1 |
| A8 | Connector coverage (37/199), empty `album.summary`, visualizerCatalog never mined | SHARPEN | P2 |
| B1 | Documented re-count of the quantitative anchors (claimed values are not reproducible) | SHARPEN | P0 |
| B2 | Mechanical doubles re-derivation → measured family tree (11 exact groups, 3 tiers) | SHARPEN | P0 |
| B3 | Language census per movement (CJK in only 4 tracks; Phuc/Thu in 15) | DEEPEN | P2 |
| B4 | Stage-cue / performance-identity census (278 cue kinds) | DEEPEN | P2 |
| B5 | Character-appearance census (proper-name density across 199) | DEEPEN | P1 |
| B6 | Chronology: 11-month composition window, 3 writing waves | DEEPEN | P1 |
| C1 | `🔗` convention is uneven (9 markers in Part IV, 1 on a row) → row-level status taxonomy | SHARPEN | P0 |
| C2 | Full 85-entry catalog → Part IV index coverage map (+ self-contradiction in index notes) | SHARPEN | P1 |
| C3 | Quotation spot-verification pass (quotes must be verbatim in the corpus) | SHARPEN | P2 |
| C4 | Track-count reconciliation: 199 / 185 / 176 / 14 — define the four numbers | SHARPEN | P0 |
| C5 | Reference-density audit of the densest tracks (150's bridge is unindexed) | SHARPEN | P2 |
| C6 | Internal traces: "handoff" mentions in the finished doc, stale Queued list, stale graph-doc numbers, "~60 refs" vs 114 rows | SHARPEN | P2 |
| D1 | New section: the cast of voices (avatar carries × voice functions × performance cues) | DEEPEN | P1 |
| D2 | New section: the grief ledger (every loss, its resolution state) | DEEPEN | P1 |
| D3 | New section: composition waves + provenance/lineage (how the album was written) | DEEPEN | P2 |
| D4 | New section: the Phuc & Thu subplot (the album's Vietnamese register) | DEEPEN | P2 |
| D5 | New section: the ghost-track map (the 14 named-but-unheard, with UUIDs) | DEEPEN | P1 |
| D6 | New section: dual projection (Dear Papa ↔ Echo Album identity rule, registry vs store) | DEEPEN | P2 |
| D7 | Minor dimensions: transmission family, place census, letter-form inventory, ×N convention | DEEPEN | P2 |
| E1 | Re-classify the doubles family in master story (5 claimed doubles are thematic; 2 exact reprises missing) | FIX | P0 |
| E2 | Replace the anchor table with documented numbers + methodology note | FIX | P0 |
| E3 | Reconcile the header counts (tracks, lyric lines, live/unreleased) | FIX | P0 |
| E4 | Fix per-track double annotations (176, 116, 183; add 87=199 and 14=198 identities) | FIX | P0 |
| E5 | Part IV index: uniform status column, index-notes rewrite, row count | FIX | P0 |
| E6 | XX-Asia textual-presence footnote; "Kats" cue wording | FIX | P1 |
| E7 | Research notes: ledger audit entry, clear the Queued section, refresh Quantitative Signals | FIX | P1 |

---

## Part A — Data-completeness gaps

*Evidence base: `data/hapa-songs-store.json` (audit block + per-song fields). The store's own `audit` object reports `readyForBuilder: true`; the gaps below are the fine print that claim deserves.*

### A1 — The 14 no-lyrics tracks need a transcription task list [SHARPEN/DEEPEN] · P1

- **What:** tracks 154, 155, 156, 157, 158, 159, 160, 162, 163, 164, 165, 169, 170, 171 (the 154–171 block minus 161/166/167/168) have empty lyric text in the store and the file. Each carries a Suno song UUID (full list in Appendix A).
- **Why:** the master story's final movement (150–199) is synthesized from titles for 14 of 50 tracks; Part III marks them *(no lyrics in the store)*, which is correct, but the docs never say the lyrics *exist somewhere* and how to recover them.
- **Finding this pass:** a direct HTTP fetch of a Suno song page returns 137KB of HTML containing the string "lyrics" **zero times** (JS app; `og:description` present but not lyrics). The page is JS-gated — a plain fetch cannot recover these texts.
- **Method:** add a "lyric recovery" task list (14 tracks, UUIDs pre-filled) to the research notes; when a human transcribes from the app/Suno, land the text as `lyrics.status: operator-supplied` per the store's existing ladder; re-run B2/B1 after.
- **Data:** file placeholder sections; Suno fetch test (Appendix A). **Effort:** S (list) + L (human transcription, outside the agent).

### A2 — Six `not_found`-status tracks that *do* carry text [SHARPEN] · P1

- **What:** the store's `lyrics.status` census (199): `matched_exact` 127, `operator-supplied` 16, `available` 16, `candidate_needs_review` 13, `matched_alias_or_probable` 7, `not_found` 20. Of the 20 `not_found`, **14 have no text** (A1) but **6 have text with unverified provenance**: 36 Mediterranean Moisture, 59 False Friends & Strange Fellows, 103 4:44 Denied Again, 107 Sailor Too, 110 Cross my Eye, 186 Summer Grain.
- **Why:** the deep read treated these as ordinary lyrics, but the store says their text never matched the registry — the provenance claim behind the readings is weaker than the docs imply. Track 110 is the severe case (see A3).
- **Method:** annotate these 6 in Part III with a provenance flag (`text present, registry match not_found`); a human confirms each text's source (operator copy vs manifest).
- **Data:** store `lyrics.status` × `lyrics.text` cross. **Effort:** S.

### A3 — Store and songbook disagree on 9 tracks' text [SHARPEN] · P0

- **What:** per-track diff of the store's `lyrics.text` against the file (what the deep read used): **175 exact, 1 near (139, 0.981), 9 different, 14 store-empty**. The 9:

| trk | file | store | ratio | store status |
|---|---|---|---|---|
| 23 Bok, Bok | 156 ln | 134 ln | 0.489 | candidate_needs_review |
| 59 False Friends & Strange Fellows | 111 ln | 70 ln | 0.215 | not_found |
| 106 2 a.m. Lights | 54 ln | 33 ln | 0.33 | candidate_needs_review |
| 110 Cross my Eye | 96 ln | 62 ln | **0.023** | not_found |
| 114 (Halfway Home) | 47 ln | 27 ln | 0.335 | candidate_needs_review |
| 117 'Til the Light Walks Inn.wandering() | 165 ln | 120 ln | 0.204 | candidate_needs_review |
| 131 First Date gl.itch("hf") | 43 ln | 24 ln | 0.379 | candidate_needs_review |
| 178 Check the .logS | 83 ln | 47 ln | 0.499 | candidate_needs_review |
| 183 Check One More | 159 ln | 117 ln | 0.619 | candidate_needs_review |

  In every case the file (songbook-derived) is *longer*; in all 9 the file appears to hold the fuller operator text and the store holds a shorter registry-side variant.
- **Why:** the app UI reads the store. For these 9 — including 110, whose store text is 97% unrelated to the deep-read text, and 117, the album's self-described "epic" — **the app displays different lyrics than the master story analyzed**. Any quote in the docs for these tracks may not match what the user sees on screen.
- **Method:** for each of the 9, a three-way check (file text vs store text vs registry/manifest source) and an operator decision on which text is canonical; then sync the two sources and note the canonical source in the store's `lyrics` dict. Until then, Part III quotes for these 9 should carry a "text source: songbook, differs from store" flag.
- **Data:** the diff table above (reproducible, Appendix A). **Effort:** M (decision is the human part; the mechanics are done).
- **Status (2026-09-03, executed under the multiverse rule):** the operator canon resolved the decision — the 9 are **parallel timelines, not an error to canonicalize**: the master story quotes the songbook timeline with per-track `[2026-09-03: …]` flags (110, 117 store-timeline divergence; 114/116 parallel) and the notes' Audit addendum §1 records the full table; the app displays the store timeline unchanged. No source text was synced or overwritten. Residue: which text the app shows **by default** for these 9 is a product decision (Appendix B1).

### A4 — Eleven registry title drifts between file and store [SHARPEN] · P1

- **What:** tracks whose file title ≠ store title: 19 (Trees Talk the Walk / Oie-Oie-Oie), 25 (Nameless & Nothing / Nameless Knew a Nothing), 67 (Shadows / Shadows Sings Silent), 103 and 104 and 177 and 184 (underscore-normalized clock titles, e.g. 4_44), 109 (dropped "?"), 114 (**Halfway Home / Stolen Toe Roots on Dirt** — a full rename), 117 (trailing comma in the store), 137 (moon/Moon case).
- **Why:** Part III already flags 19, 110, 116, 151, 164, 167, 177, 183 with registry notes, but **114's rename is unflagged** (the doc reads it as "Halfway Home" while the store/app says "Stolen Toe Roots on Dirt"); the underscore drifts are cosmetic but will confuse search.
- **Method:** add the missing registry-drift annotations in Part III; keep the file's title as the deep-read title with the store title in parentheses.
- **Data:** title diff (Appendix A). **Effort:** S.

### A5 — Lyric-timing coverage [SHARPEN] · P2

- **What:** 181/199 have `lyricTimings` (18 missing), but only **48** carry `lyricTimingSource` (store audit: `audio-derived-registry-timing`, synced 2026-08-26). The 18 without timings include tracks in every movement.
- **Why:** timing is what drives the music-video visualizer and the preview tab the user works in; a coverage map tells the user which videos can get sync for free.
- **Method:** a 199-row coverage column (has-timings / has-source / both / neither) in the research notes; flag the 18 for the timing pipeline.
- **Effort:** S.

### A6 — Stem coverage [SHARPEN] · P2

- **What:** 137/199 have stems (83×24, 43×25, 2×26, 3×36, 6×37 stems); **62 have none**.
- **Why:** stems are the raw material for director cuts (the horizontal/vertical camera work the user has been iterating on); a no-stems list tells which videos must fall back to mono-audio treatments.
- **Method:** list the 62 in the research notes; cross-reference against A7 media.
- **Effort:** S.

### A7 — Media / scene / visualizer coverage map [DEEPEN] · P1

- **What:** only **16/199** tracks have attached media — 2, 3, 6, 8, 9, 10, 13, 15, 18, 20, 24, 39, 191, 197, 198, 199 (13–14 items each: audio + doc + pdf + 11 images for Dear Papa). 183 tracks have none. `visualizers`: 0 songs (the 7-entry `visualizerCatalog` is album-level, never referenced in the docs). Scenes (audit `withScenes`: 57) live inside `storyBeats` (88 songs, 1,716 beats total, max 12).
- **Why:** this is the actual shape of the user's music-video work: the early "core" tracks (2–39) plus the finale (191, 197–199) are the media-complete set; everything else is audio-only. Notably, the 16 media tracks are almost exactly the 17 tracks that lack a `teamColor` in `performancePerspective` (16 of 17, minus 34) — the pre-trinity era and the finale got attachments; the middle 165 didn't.
- **Method:** a 199-row map (media / stems / timings / beats / connectors) in the research notes — one table, five columns; it doubles as the input for director-campaign planning.
- **Effort:** S.

### A8 — Connector coverage, empty album summary, unused catalog [SHARPEN] · P2

- **What:** `referenceConnectors` on 37/199 songs (136 total: 116 alludes-to / 16 candidate / 4 mechanical; 20 reviewable), `contextualLayers` on 37 (55 layers); 162 songs have none. `album.summary` is the **empty string** in the store (the master story is the only summary that exists). `songCardMint` and `comments`: 0/199.
- **Why:** the store is `readyForBuilder: true` with an empty album summary and 162/199 songs unconnected; the 85-entry catalog and 7-entry visualizerCatalog are the never-mined metadata the docs only cite by count.
- **Method:** fill `album.summary` from the master story's Part I (the doc literally exists to be that field); a connector-coverage column in the A7 map; mine `visualizerCatalog` (7 families/roles) into D1.
- **Effort:** S (summary) / M (mining).

---

## Part B — New quantitative passes

*The finished docs carry one quantitative table (Part II anchors) and a handful of per-movement intuitions. Each item here is a pass that has already been computed this audit and is ready to land as a documented table. All counts below were recomputed from the file unless noted; Appendix A has the exact methods.*

### B1 — Documented re-count of the quantitative anchors [SHARPEN] · P0

- **What:** the claimed anchor values are **not reproducible** from the current text under any reasonable method. Probes (file text):

| anchor | claimed | occurrences (ci) | lines containing | case-sensitive substring |
|---|---|---|---|---|
| one more | 314 | 310 | — | — |
| name | 236 | 276 (233 singular) | 232 | 195 |
| sea | 159 | 169 | 162 | 49 |
| wild | 159 | 205 | 148 | 46 |
| free | 125 | 139 | 136 | 22 |
| red | 82 | 82 | 82 | 185 |
| door | 67 | 103 | 103 | 43 |
| light | 68 | 186 | 185 | 166 |
| home | 88 | 166 | 164 | 80 |
| truth | 48 | 105 | 105 | 60 |
| war | 47 | 61 | 54 | 76 |
| eyes | 59 | 121 | 121 | 63 |
| Bella | 180 | 178 (word: 10) | 171 | 183 |
| Chiao | 55 | 54 | 31 | 0 |
| Elaine | 78 | 76 | 70 | 76 |
| Vroom | 66 | 99 | 40 | 66 |
| Thor | 47 | 47 | 47 | 46 |
| Toe | 49 | 57 | 57 | 62 |

  Only `red`, `Thor`, and `Vroom` (under one convention each) reproduce. Most claimed values sit *between* the three probe families, which points to an older text snapshot plus a mixed, undocumented counting convention.
- **Why:** the anchor table is the quantitative spine of Part II ("the album's engine = 314"); if a reader re-runs the count they get different numbers and the table loses its authority. This is the single biggest trust issue in the docs.
- **Method:** fix one method (proposed: case-insensitive word-boundary occurrences, plurals counted separately, stage-direction lines excluded) and publish it *with the table*, per-movement included. The re-computed per-movement density (this pass, occurrences) is ready to paste:

| motif | I | II | III | IV | V | VI | VII | total |
|---|---|---|---|---|---|---|---|---|
| one more | 0 | 48 | 4 | 16 | 79 | 19 | 144 | 310 |
| corner | 0 | 4 | 10 | 14 | 8 | 4 | 38 | 78 |
| light | 4 | 10 | 14 | 37 | 41 | 26 | 76 | 208 |
| lighthouse | 0 | 0 | 0 | 5 | 0 | 0 | 9 | 14 |
| coin | 1 | 1 | 6 | 9 | 3 | 0 | 5 | 25 |
| flame | 1 | 1 | 2 | 2 | 11 | 10 | 16 | 43 |
| bella (word) | 0 | 3 | 6 | 0 | 0 | 0 | 1 | 10 |
| elaine | 0 | 9 | 2 | 18 | 7 | 19 | 21 | 76 |
| sea | 7 | 27 | 34 | 59 | 12 | 12 | 18 | 169 |
| ocean | 4 | 11 | 38 | 15 | 6 | 3 | 5 | 82 |
| tide | 5 | 1 | 17 | 3 | 17 | 2 | 11 | 56 |
| ghost | 3 | 7 | 16 | 10 | 17 | 7 | 9 | 69 |
| mirror | 0 | 5 | 2 | 6 | 4 | 1 | 4 | 22 |
| watch | 4 | 11 | 10 | 9 | 15 | 2 | 18 | 69 |
| kiss | 1 | 1 | 1 | 0 | 0 | 1 | 6 | 10 |
| welcome | 0 | 9 | 3 | 3 | 3 | 0 | 6 | 24 |
| name | 0 | 45 | 13 | 39 | 43 | 31 | 105 | 276 |
| dear papa | 19 | 0 | 0 | 0 | 15 | 0 | 0 | 34 |
| boat | 6 | 0 | 3 | 4 | 1 | 0 | 8 | 22 |
| free | 13 | 22 | 42 | 13 | 14 | 10 | 25 | 139 |
| wild | 13 | 56 | 24 | 14 | 28 | 38 | 32 | 205 |

  (readings it supports: "one more" front-loads into the final descent; `sea` peaks in the Long Watch; `wild` peaks in the Braid Years; `name` and `elaine` peak in the final descent; `dear papa` is bimodal — opener + XX-Asia; the lighthouse exists only in IV and VII)
- **Data:** file text; store text (nearly identical results — Appendix A). **Effort:** S (numbers done; landing = E2).
- **Status (2026-09-03, executed — append-only method):** the re-count landed as a dated line **appended alongside the original snapshot rows** in the master story (Part II quantitative addendum — original rows preserved verbatim as the 2026-09-02 snapshot) and in the notes (Quantitative Signals); the per-movement density table was appended in both. Nothing in the original tables was replaced or hidden.

### B2 — Mechanical doubles re-derivation → a measured family tree [SHARPEN] · P0

- **What:** normalize each track's text (lowercase, strip punctuation/whitespace, keep CJK/kana) and compare. Result tiers (file, 185 content tracks):
  - **Exact re-recordings (11 groups):** [14, 198] · [43, 136] · [48, 185, 186] · [77, 173, 174] · [87, 199] · [103, 125] · [104, 184] · [111, 196] · [112, 148] · [130, 181] · [137, 180]
  - **Near re-recordings (0.9–0.999):** 137≈141 (0.997, so 137/141/180 is a verified triplet), 115≈130≈181 (0.973), 100≈161 (0.918)
  - **Derivatives/variants (0.25–0.85):** 129≈182 (0.798), 132→146 (0.324, the porch-tale), 128→151 (0.265, the B-side)
  - **Thematic siblings (claimed as doubles, actually < 0.05):** 152~183 (0.027), 20~21 (0.013), 128~129 (0.009), 51~61/96/123 (0.012/0.018/0.028), 66~75 (0.010), 63~77 (0.011), 83~85/145 (0.006/0.007), 172~115/199 (0.005/0.009), 144~176 (0.009), 110~116 (0.047), 118~2 (0.013), 121~15 (0.09), 187~10 (0.024), 149~13 (0.144), 166~26/44 (0.064/0.062)
- **Why:** the docs' "doubles" row (theme 17 + cross-cutting table) mixes all four tiers into one claim list; three of its pairs (152↔183, 20↔21, 66≈75) and one (51↔123) are thematically-only, while two verified **identical** reprises — 14=198 and 87=199 — are absent. Also: 87=199 being textually identical reframes Part I's "the last lines invert the first" — the finale is a literal reprise of 87; the inversion is a *re-listening*, not a new text. That is a stronger finding than the doc currently makes.
- **Method:** publish the four tiers with ratios as the doubles table; per-track annotations re-classified (E1/E4).
- **Data:** Appendix A (normalization spec + full ratio list). **Effort:** S (done; landing = E1/E4).
- **Status (2026-09-03, executed — append-only method):** the four tiers landed in the master story as an appended doubles addendum (theme 17 + the cross-cutting row preserved, with in-cell pointers) and in the notes' Audit addendum §7 (18 measured divergent pairs, incl. the 0.09/0.06 claim-criterion pairs).

### B3 — Language census per movement [DEEPEN] · P2

- **What:** tracks containing: CJK 4 (118, 121 in M-V; 149 in M-VI; 187 in M-VII), kana 4, Italian-cue language 28 (per movement 1/6/11/9/1/1/4), Slavic 1 (54), **Phuc 17 tracks, Thu 12** (union 15; Phuc: 26, 31, 41, 43, 47, 49, 57, 59, 69, 72, 79, 101, 119, 136, 145, 146, 153; Thu: 13, 23, 49, 50, 57, 65, 69, 79, 103, 125, 149, 153).
- **Why:** the "XX-Asia" theme (118/121/149/187/198-199) is a flagship of Parts I/II, but actual CJK lyric presence is 4 tracks — the theme is a *title-and-concept* cycle with a small textual footprint; 198/199, listed in the cycle, contain no CJK. Meanwhile the Phuc/Thu Vietnamese register (15 tracks, spanning M-II through M-VII) is a genuine under-theorized subplot the docs mention only in passing (153, 145, 103/125).
- **Method:** one census table per movement + the two feedstocks for D4 (and an E6 footnote on XX-Asia).
- **Effort:** S (done; landing = D4/E6).

### B4 — Stage-cue / performance-identity census [DEEPEN] · P2

- **What:** 278 distinct bracketed cue kinds across the file. Structural scaffolding (chorus 61, verse 1 32, verse 2 26, bridge 24, pre-chorus 23, intro 15, outro 10, hook 10, …) aside, the distinctive performance identities: Italian female singer ×8, 1940s radio talking head ×6, pitch-shifted vocal chops ×6, Ukrainian accent ×3, call-and-response ×3, layered harmonies ×3, Korean accent ×2, pipa+woodwind interlude ×2, waves-crashing SFX ×2, meow vocals (25–31 occurrences, mostly cue-less), throat-singing (12–15).
- **Why:** this is the "cast of voices" data (feeds D1) — the docs name a few of these in one anchor row but never quantify who-sings-what across 199 tracks, even though `performancePerspective` says the album is "lore-sung by Red, Blue, or Green."
- **Effort:** S (done; landing = D1). Note: the docs' cue "Kats" is the *title* of 47; the in-lyric character is "Kat" (4 lines) — E6.

### B5 — Character-appearance census [DEEPEN] · P1

- **What:** proper-name occurrences / tracks appearing (file, ci word-level): bella 178/37 · free 139/49 · calder 43/28, sailor 49/24, thor 47/24, tesoro 25/17, phuc 34/17, nameless 35/15, leo 35/15, mary 31/14, elaine 76/14, captain 32/19, mimi 31/10, kana 11/9, thu 15/12, chiao 54/11, ghost ship 19/10, c.j. 26/7, wendy 8/4, ruth 6/4, papa 40/5, domina 13/3, aang 3/2, lighthouse 12/2, fitz 1/1, korra 1/1.
- **Why:** a cast table (who appears where, per movement) is the missing connective tissue between the docs' per-track readings — it would show, e.g., that the Ghost Ship is a 10-track institution, that Mimi is a late-album cult (192/193), that Kana is a M-II–M-III courtship voice, and that "the missing one" (Elaine) appears in 14 tracks across the watch, not just the triptych.
- **Method:** per-movement × character matrix (compute from the file) → feeds D1/D2.
- **Effort:** M.

### B6 — Chronology: the album was written in three waves [DEEPEN] · P1

- **What:** `createdAt` by month: 2025-09 ×4 · 2025-11 ×3 · 2025-12 ×6 · 2026-01 ×3 · (no Feb/Mar) · 2026-04 ×8 · 2026-05 ×20 · **2026-06 ×64** · 2026-07 ×49 · 2026-08 ×42. `updatedAt` is a single burst 2026-07-23 → 2026-08-26.
- **Why:** the docs read the album as one arc but never date it. The data says: a 2025 seed (4 tracks), a 2025 Q4/2026-Q1 trickle, then a ~11-week composition sprint (Apr–Aug 2026) that produced 183/199 — 57% of the album in June–August alone. The final descent (150–199) is the *last-written* material. A chronology section (D3) can test whether track order ≈ writing order and re-read the movements as sessions, not just themes.
- **Method:** createdAt/updatedAt per track → movement × month matrix; check order-correlation.
- **Effort:** S–M.

---

## Part C — Verification passes

### C1 — `🔗` is not actually a uniform link layer → adopt a row-level status taxonomy [SHARPEN] · P0

- **What:** the docs promise "references marked 🔗 are researched." Actual marker census (80.6KB master story): 74 total = Part I/II 11, Part III 54, **Part IV 9 — of which 8 are group-header markers and 1 is a row**. Part IV's 114 index rows almost all carry *no* per-row verification status; they are distinguished by prose ("(catalog)", "Verified", "checked") inconsistently.
- **Why:** the index is the doc's "searchable link layer," but a reader (or a search) cannot tell which rows are this-session-verified, catalog-cited, standard-knowledge, checked-and-cleared, or private. The reference-graph contract ([ECHO_REFERENCE_GRAPH.md](ECHO_REFERENCE_GRAPH.md)) already defines the right vocabulary — the evidence ladder **direct / candidate / comparative** — plus review statuses; the index simply never adopts it.
- **Method:** add a per-row `status` column using five tags: `verified` (fetched this pass), `catalog` (store URL), `standard` (common knowledge), `cleared` (checked, no source), `private`; keep 🔗 only for `verified`; then (C2) the coverage map.
- **Effort:** M.
- **Status (2026-09-03, executed — append-only method):** the five-tag taxonomy landed in the master story's appended index status addendum, applying to all rows by rule. The per-row status **column** was not added — it would require rewriting all 114 rows, which the append-only policy forbids; reserved for a future rewrite pass if the operator approves one. The two "handoff" traces (C6a) were left as-is and noted in the addendum.

### C2 — Full 85-entry catalog → Part IV coverage map [SHARPEN] · P1

- **What:** the store's `referenceCatalog` has **85** entries (68 distinct kinds; each with `source`, `canonStatus`, `reviewStatus`); Part IV's index has **114 rows** across groups A–G (21/8/25/19/23/7/11), several of which fold multiple catalog entries. No explicit 85→index map exists. Additionally, the index notes contain a self-contradiction: references "not yet in the catalog (notably: chess, King Lear, Peter Pan, the Odyssey sirens, Valhalla, Ophelia, A Hard Rain, Do not go gentle, **Bruce Lee finger-moon is in the catalog**, Duck Hunt)" — the parenthetical lists a contradiction inside the "not in catalog" list.
- **Why:** the catalog is the app's data-level reference layer (and the UI's); the index is the thematic layer; a reader cannot currently audit what the catalog covers vs what the doc added vs what the doc still lacks. The catalog-expansion candidates (chess, *King Lear*, *Peter Pan*, *Odyssey*, *Valhalla*, *Ophelia*, *A Hard Rain*, *Do not go gentle*, *Duck Hunt* — plus this pass's finds: Plato's cave, Thebes/Alexander, Lake Garda, *Kat*?) need an owner.
- **Method:** one 85-row table (catalog entry → Part IV row or "not in index" → status tag per C1); rewrite the index notes as a clean expansion-candidate list.
- **Effort:** M.

### C3 — Quotation spot-verification pass [SHARPEN] · P2

- **What:** every quoted line in Parts I/III should be verbatim-present in the corpus. This pass has incidentally verified dozens (150, 87/199, 137/180, 141, 115/130/181, 118, 121, 187, the grain trio, the one-more choruses, 176's Tacoma-rain verse, 110's file-side duet text); all matched.
- **Why:** the risk zone is the 9 A3-divergent tracks: for those, a quote verified against the *file* may not exist in the *store* (the app's display text). A mechanical pass (extract quoted spans → search both corpora) would make the doc's quotes bulletproof and flag exactly which tracks need the A3 resolution.
- **Method:** script: pull all quoted strings from the master story, fuzzy-match against file and store text, report misses.
- **Effort:** M.

### C4 — Track-count reconciliation: define the four numbers [SHARPEN] · P0

- **What:** four legitimately different counts coexist and the docs blur them: **199** = store songs = file sections (all `status: active`) · **185** = songs with lyric text · **176** = `songRegistryTotal` (the Suno registry) · **14** = no-lyrics. The master story header says "199 · Lyrics: 13,719 lines" and Part III says "176 live songs + unreleased." The 13,719 figure is not reproducible (file = 17,112 raw lines; 14,103 clean content lines; store text = 15,136 lines).
- **Why:** a header number a reader cannot reproduce erodes the same trust as B1.
- **Method:** header becomes: "199 tracks (185 with lyrics, 14 without) · 176 in the Suno registry · 14,103 lyric lines in the consolidated file"; Part III's parenthetical keeps 176 but says "registry" explicitly.
- **Effort:** S (landing = E3).
- **Status (2026-09-03, executed — append-only method):** the four numbers (199 / 185 / 176 / 14) were defined in the master story's appended corpus status map (with the 11 title drifts + 9 text divergences + 6 not_found-with-text counts); the header line itself was **preserved**, and the unreproducible "13,719" figure is documented in a new dated header note as the 2026-08-26 snapshot. See E3.

### C5 — Reference-density audit of the densest tracks [SHARPEN] · P2

- **What:** track 150 (*What's an S?*) was fully re-read this pass: the chorus fuses Dylan Thomas ("rage, rage against the dying of the Light") with *Hard Rain* ("an endless Night") — the docs get this right. But the **bridge** carries references the Part IV index doesn't hold: Plato's cave ("the Cave / Like the one Plato said he found"), Thebes falling to Alexander ("When Thebes fell / To Philip's kid" — Alexander the Great), Lake Garda, a circus elephant, a beluga, porthole/starboard nautical register, "Cuomo."
- **Why:** the densest tracks are where the index under-covers most; 150's Part IV row lists only the two chorus references. Candidate audit targets: 5 (Gladiator), 8 (Wide and Narrows), 26 (I Knew a Bella), 80, 119, 150.
- **Method:** per-target: extract all proper-noun/phrase clusters → index row or checked-and-cleared entry.
- **Effort:** M per target.

### C6 — Internal traces and stale cross-doc numbers [SHARPEN] · P2

- **What:** (a) the finished master story quotes internal process in two Part IV rows ("*(Handoff's Ides hypothesis…)*" — Gladiator row; "the handoff said Kanye" — 4:44 row) — a finished deliverable should be self-contained (rewrite as "(earlier-draft hypothesis, unconfirmed in the lyric)"). (b) The research notes' **Queued** section still lists all 29 items as queued although the ledger says the queue was fully researched — the list was never cleared. (c) The notes' Quantitative Signals duplicate the B1 problem. (d) Part IV cites [ECHO_REFERENCE_GRAPH.md](ECHO_REFERENCE_GRAPH.md) (2026-07-19) whose "expanded corpus pass" numbers (18 nodes / 30 connectors / 19 routes) are stale against the current store (85 / 136 / 30) — the *contract* (evidence ladder, exposition model) is still the right citation; the counts are not. (e) The completion summary says "~60 refs" vs 114 index rows.
- **Method:** small edits; for (d) add a date-stamp note to the citation rather than rewriting the graph doc (it is app-team territory, not the synthesis's).
- **Effort:** S.

---

## Part D — New analytical dimensions (proposed sections)

*Each is a section the finished docs would gain, built from data measured this pass. These are the "deepen" items: new insight, not corrections.*

### D1 — The cast of voices (performance layer) [DEEPEN] · P1

The docs never use `performancePerspective` (present on 199/199) or the stage cues. What it measures:

- **Avatar carries per movement** (store `avatarName`):

| | I | II | III | IV | V | VI | VII | total |
|---|---|---|---|---|---|---|---|---|
| Red | 7 | 7 | 13 | 13 | 12 | 10 | 20 | 82 |
| Blue | 3 | 7 | 6 | 8 | 15 | 4 | 13 | 56 |
| Green | 1 | 8 | 14 | 12 | 7 | 2 | 14 | 58 |
| other (Bella 2, Little Toe 1, …) | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 3 |

- **Voice functions** cluster into the three standing *voice families* — Red pressure 72 (59 fire-control + 13 breach-testing variants) · Blue signal/memory/return-route 54 · Green care/repair 56 (39+17) = 182 — plus **17 one-off "lead-*" guest voices** (lead-wendy, lead-rip, lead-little-echo, lead-letter-bearer ×2, lead-protocol-searcher, lead-rescue-navigator, wide-route-wilderness-guide, two signal-pilot variants, a fire-control pilot, lead-network-searcher, lead-elemental-traveler, lead-memory-traveler, lead-traveler) — i.e., 182/199 songs are sung by the trinity in three standing roles and 17 songs carry unique guest voices.
- **Performance identities** (B4): Italian female singer, 1940s radio, Ukrainian accent, Korean accent, meow, throat-sung, pitch-shifted chops, call-and-response.

*Why it deepens:* the trinity is documented as a *thematic* RGB; the data shows it is also a **vocal instrument with a division of labor** — Red carries the final descent (20/50) and 59 pressure songs, Green is the M-III voice (14), Blue owns the Digital Turn (15). "Who sings what" is a whole critical axis the docs leave implicit. *Effort:* M (one section, tables ready).

### D2 — The grief ledger [DEEPEN] · P1

A single table of every loss in the album and its resolution state, read off the 199 notes:

| Loss | Introduced | Kept in | Resolution |
|---|---|---|---|
| Papa (dead) | 2 | 6, 118, 145, 150, 177 | debt → gift (199) |
| the Wife ("up there", thousand-eyed) | 2 | 150 ("thousand world Stare"), 150's returned smile | returns in the final descent |
| Elaine (missing) | 20 | 47, 69, 117, 143, 144, 152, 176, 177 | protocol: "Welcome back" (143/177) |
| the Sailor's Widow | 3 | 29, 64 | lends; ghost-crew member |
| Mary (ghost) | 21 | 29, 134 | married; gospel-quiet |
| the Nameless | 25 | 70, 115/130/181, 128, 129 | named; burns their heaven |
| Ruth | 87 | 199 | returned (87 = 199, literally) |
| the Pink Panther | 64 | 146 | gets a voice |
| the dead (crew) | 3, 4, 24 | 93, 132, 146, 167 | row on; lighthouse lit |
| the Broken | 179 | 179 | "protocol for the broken" |

*Why it deepens:* Part I narrates the grief; the ledger *accounts* for it — which losses are still open at track 199, which close, and in what order (the closing sequence is 87→199 coin-toss, the wife's smile at 150, the welcome-back at 177). It is also the natural home for the 14 ghost tracks (D5). *Effort:* M.

### D3 — Composition waves and provenance [DEEPEN] · P2

From B6 + the store's six `sourceAnchors` (comics folder, song registry, media-cards, Worldbuilding-Wiki songbook, song-card index, Suno playlist 369daf97…/79) + the album's identity rule ("Resolve stable song/card IDs and lyrics SHA-256 before album title; Echo Album is a later projection of the substantially same song corpus"): a short "how this album came to be" section — 2025 seed, 2026 sprint, registry vs store membership (176 vs 199: which 23 live outside the Suno registry and on which provenance rung), and the Dear Papa ↔ Echo Album dual-title rule. *Why:* the docs treat the corpus as a static artifact; its *production history* is in the store, mined nowhere. *Effort:* M.

### D4 — The Phuc & Thu subplot [DEEPEN] · P2

From B3/B5: a Vietnamese register the docs touch only in passing — Phuc in 17 tracks (26, 31, 41, 43, 47, 49, 57, 59, 69, 72, 79, 101, 119, 136, 145, 146, 153), Thu in 12 (13, 23, 49, 50, 57, 65, 69, 79, 103, 125, 149, 153), plus the "Phuc Pho Fee Phi" senpai thread (153), "Fought the Phuc with the Four-arms" (41), Cap'n Thu (103/125), "Oh Phuc, no!" (145). A subplot section (who Phuc/Thu are to the narrator; the 5 overlapping tracks 49/57/69/79/153 where both appear) — the album's second non-English *relationship* voice after the Italian. *Effort:* M (reading work on ~15 tracks).

### D5 — The ghost-track map [DEEPEN] · P1

The 14 no-lyrics tracks as a dedicated map: each with its Suno UUID (Appendix A), family role (siren 154 · cat 155 · circuit 156 · porch 157 · tongue 158 · lion+fire 159 · campfire 160/171 · morning 162 · tea 163 · Tristram gag 164 · bounce 165 · mountain 169 · weather 170), and the doc's current title-level reading marked as *inference*. Together with D2, this makes the final descent honest: 36 text-grounded tracks + 14 named-but-unheard. *Effort:* S (data ready; the transcription itself is A1).

### D6 — Dual projection, canon status [DEEPEN] · P2

The store's `loreStatus` is `hapa_lore_not_hard_canon` on 199/199; the album's `identityRule` and the 199 `lineage` fields carry the Dear Papa ↔ Echo Album rule. The docs cite the projection name but never the *canon boundary*. A short section: what "not hard canon" licenses (the synthesis may read freely; the store may not), and the `semanticTraversal` layer (thesis: "Meaning is not exhausted by the lyric surface…" — 4 exposition stages, 7 traversal rules, 3 context anchors incl. page-81/Asante, `reviewStatus: assistant-analyzed-pending-human-review`) — the store's own version of what the master story does, which the docs never compare against their own readings. *Effort:* S.

### D7 — Minor dimensions [DEEPEN] · P2

- **The transmission family:** 167 (numbers station), 122 (voicemail), 104/184 (timestamp), 131 ("nothing to edit"), 133 ("I held the signal Through the static flow"), 110 ("live nodes — in the same stream") — the song-as-transmission extends the "hook is a protocol" reading into a form family.
- **Place census:** Tacoma 8, lighthouse 12/2 tracks, West Beach, the Narrows, Hanoi, Bali, Rome, Troy, Xi'an, Norway, Krypton, San Diego→Montenegro — a geography table of where each thread lives.
- **Letter-form inventory:** the epistolary shapes (letter-to-dead-father 2/118/145, breakup letter 28, numbers station 167, voicemail 122, timestamp 104, spoken 132) — the album's *genres of address*.
- **The ×N convention:** the source text contains **zero** ×N markers (0 hits); the docs' "(×3)/(×8)" annotations are editorial — state the convention once so future readers don't mistake them for lyric text.

---

## Part E — Immediate doc fixes

*Concrete edits to the two existing docs. All measurements cited here were made this pass (Appendix A). Apply E1–E5 first (P0), then E6–E7.*

### E1 — Re-classify the doubles family [FIX] · P0

In `ECHO_ALBUM_MASTER_STORY.md`, Part II theme 17 and the Part III cross-cutting "Doubles" row: replace the flat list with the four tiers from B2. Concretely:

- Keep (verified): 43=136, 103=125, 112=148, 137=141=180, 104=184, 185=186, 173=174, 111=196, mirror triplet (115≈130=181), 51↔123 → re-tier as *phrase family* ("I was not lost, I was waiting" shared by 51/110/123).
- Re-classify to *thematic siblings*: 152↔183 (0.027), 20↔21 (0.013), 128↔129 (0.009), 66≈75 (0.010).
- Add the missing exacts: **14=198** and **87=199** (identical texts) and **48=185=186** (the grain trio is textually identical, not "re-sung for the season"), plus near-pair 100≈161 (0.918).
- Part II's "duplicate titles" anchor (Pocket Full of Butterflies ×3, mirror-said ×3) stands; add the 137/180 case-variant title to it.
- **Status (2026-09-03, executed — append-only method):** the four tiers were **appended** to the master story (doubles addendum) alongside the preserved flat list, with in-cell pointers on theme 17 and the cross-cutting row — the original row was kept, not replaced. The missing exacts (14=198, 87=199, 48=185=186) and the divergent re-tier are recorded in the notes' Audit addendum §7; under the multiverse rule the divergent pairs are *timelines*, so "re-classify" became "annotate with the measured tier + timeline class".

### E2 — Replace the anchor table with documented numbers [FIX] · P0

Swap Part II's anchor values for the B1 re-count (one fixed method, stated above the table: "case-insensitive, word-boundary, occurrences; stage directions excluded; plurals counted under the singular unless noted"), and move the per-movement density table (B1) alongside. Same replacement in the notes' "Quantitative Signals." Where a claimed value differs from the re-count by more than 5% (light, home, door, sea, wild, free, truth, war, eyes, night, Bella, Vroom, Toe), keep the old value in a parenthetical ("earlier snapshot: 68") so the drift is visible, not hidden.
- **Status (2026-09-03, executed — append-only method):** the B1 re-count was **appended as a dated addendum** in both docs — the original anchor rows are preserved verbatim as the 2026-09-02 snapshot with the re-count + method + per-movement density alongside (the "keep the old value" requirement is satisfied by preserving the original rows; no parenthetical surgery was needed or done).

### E3 — Reconcile header counts [FIX] · P0

Master story header: "**Tracks:** 199 (185 with lyrics, 14 without) · **Registry:** 176 · **Lyric lines (consolidated file):** 14,103"; drop "13,719" or footnote it as the 2026-08-26 snapshot figure. Part III boundaries note: "176 registry songs + 23 store-only" (see D6 for the 23's provenance) instead of "176 live + unreleased."
- **Status (2026-09-03, executed — append-only method):** the header and the Part III boundaries note were **preserved** (rewording or dropping the 13,719 figure would be a rewrite the append-only policy forbids); a new dated header note footnotes 13,719 as the 2026-08-26 snapshot (17,112 raw / 14,103 clean lines; store 15,136), and the four track counts are defined in the appended corpus status map — which is the append-only equivalent of this item's "footnote it" branch.

### E4 — Fix per-track double annotations [FIX] · P0

Part III: 176 "near re-recording of 144 (same sheet, variant ending)" → "thematic sibling of 144 (shared Elaine/corner phrasing; texts 0.9% similar)"; 116 "110 re-voiced on pipa" → add "sheet unrelated (4.7%); the pipa variant's *text* is distinct"; 183 keep "trap remix" (accurate) but drop it from the doubles row (E1); add "textually identical to 87" to 199 and "textually identical to 14" to 198; add the 114 registry-rename annotation (A4).
- **Status (2026-09-03, executed — append-only method):** every affected per-track line received a dated `[2026-09-03: …]` **append** that states the measured relationship alongside the original wording (176 = 0.9% divergent timeline; 116 = 4.7% sheet-distinct; 183 = 2.7% remix; 199 = 87 identical; 198 = 14 identical; 110/117 = parallel store timeline; 114 = registry rename; 137 = verified triplet; 87/14 = convergent reprises) — the originals were kept, not rewritten; the 183 "trap remix" wording is accurate and stands.

### E5 — Part IV index: uniform status column + notes rewrite [FIX] · P0

Add the C1 status column to all 114 rows; rewrite the Index notes: remove the self-contradictory parenthetical (Bruce Lee), state the 85-catalog ↔ 114-row relationship (C2 map), replace the two "handoff" mentions with neutral phrasing (C6), and correct "~60 references" → 114 rows / 85 catalog entries.
- **Status (2026-09-03, executed — append-only method):** the Bruce Lee self-contradiction received an in-line bracketed correction; the 85-catalog ↔ 114-rows relationship, the five-tag status taxonomy (C1), the corrected expansion-candidate list (incl. the three audit additions: Plato's cave, Thebes/Alexander, Lake Garda — appended as new rows), and the "~60 refs" correction all landed in an appended **index status addendum**. The per-row status column was not added (would rewrite all 114 rows); the two "handoff" traces remain (cosmetic, queued here for a future approved rewrite pass).

### E6 — XX-Asia footnote + cue wording [FIX] · P1

Theme 15 (XX-Asia): add "textual CJK presence: 4 tracks (118, 121, 149, 187); 198/199 carry the cycle by title and theme only" (B3). Part II anchor row: "Kats" → "Kat (in-lyric character, 47; 'Kats' is the title)."
- **Status (2026-09-03, executed — append-only method):** both were **appended in-cell** (theme 15 row + the stage-directions anchor row) with the original wording preserved; the Phuc/Thu subplot data from B3 landed in the master story's candidate themes instead of a new section.

### E7 — Research notes hygiene [FIX] · P1

(a) Ledger: add this audit as a completed pass (done — entry appended to the notes ledger this session). (b) Clear the stale Queued section (29 bullets) — move it under Researched with a "queue cleared 2026-09-02" note. (c) Refresh Quantitative Signals per E2. (d) Append the A1 transcription task list (14 UUIDs). (e) Append the A3 nine-track divergence table and the A7 five-column coverage map.
- **Status (2026-09-03, executed — append-only method):** (a) the execution ledger entry was appended (the audit entry itself was already in place); (b) the stale Queued list was **preserved** with a cleared-status marker line above it (deleting or moving it would be a rewrite — the marker is the append-only equivalent); (c) the B1 re-count line was appended to Quantitative Signals; (d)+(e) the 14-ghost transcription queue (all 14 Suno UUIDs), the A3 nine-track divergence table, the coverage maps (stems/media/beats/visualizers/connectors/timings/lore/perspective), the chronology, the doubles tiers, and the grief ledger draft all landed in the notes' **Audit addendum** (§1–§10). Nothing in the notes was deleted or rewritten (character-level verified).

---

## Appendix A — Audit method & reproducibility

**Corpora.** `data/hapa-songs-store.json` (25,889,046 bytes; `schemaVersion hapa.songs.store.v1`; 199 songs; top-level: `referenceCatalog` 85, `referenceGraphEdges` 30, `semanticTraversal` (8 keys), `visualizerCatalog` 7, `audit` (19 keys), `sourceAnchors` 6). `docs/echo-album-lyrics.md` (505,443 bytes; generated 2026-08-26 from `data/dear-papa-songbook.json`; 199 `## N. Title` sections).

**Parsing.** File sections split on `^## \d+\. `; structural lines removed: the `*lyrics status: …*` metadata line, the ` ``` ` fence lines, blank lines → 14,103 clean content lines. The 14 no-lyrics sections normalize to one identical boilerplate line.

**Normalization** (for all similarity work): lowercase; replace runs of characters outside `[0-9a-z]` + CJK + kana with single spaces; trim. **Similarity:** `difflib.SequenceMatcher.ratio()` on normalized strings. **Counts:** case-insensitive `\bword\b` occurrences unless tagged; the three probe families in B1 are occurrences / lines-containing / case-sensitive-substring.

**Key verified results (this pass).**

- Store×file text diff: 175 exact / 1 near (139: 0.981) / 9 different (23, 59, 106, 110, 114, 117, 131, 178, 183 — all file-longer; 110 = 0.023) / 14 store-empty.
- Exact duplicate groups (11): [14, 198] [43, 136] [48, 185, 186] [77, 173, 174] [87, 199] [103, 125] [104, 184] [111, 196] [112, 148] [130, 181] [137, 180]. Near: 137≈141 0.997, 115≈130 0.973, 115≈181 0.973, 100≈161 0.918. Thematic-only (<0.05): 152~183, 20~21, 128~129, 51~61/96/123, 66~75, 63~77, 83~85/145, 172~115/199, 144~176, 118~2, 187~10.
- `lyrics.status`: matched_exact 127 / operator-supplied 16 / available 16 / candidate_needs_review 13 / matched_alias_or_probable 7 / not_found 20 (14 empty; 6 with text: 36, 59, 103, 107, 110, 186).
- 14 no-lyrics tracks and Suno UUIDs: 154 Gilded Sirens 66f20af1-e12e-4d62-b4be-5ece01c52abb · 155 Meow-meow-pew a79cd5c4-045c-45dd-8925-9e57d3524559 · 156 Solder Heartbeat d9939f3a-2487-4e95-9ba9-e177028aa9d6 · 157 Tin Roof Valentine ec56c2ca-6e16-47d6-ad3a-a50ab06c760f · 158 Tongue-Tied Thunder 4fd61923-8884-488a-b93d-e9dff2c0b248 · 159 Lionfire Rhapsody 154c3aca-ff43-48aa-a837-47e88429379d · 160 Campfire Lullaby 892ead59-b878-4779-95e5-d5e87ead8e1e · 162 Copper Sunrise 8f56bfa5-717a-437a-a1ca-b69e2ea215a5 · 163 Calico Steam 43e8cc80-5b2e-4bbd-b0ee-b8f1fed46d5a · 164 TristrammyWhamBam 13a6e54e-d703-4d8d-a3d6-77a44ffd0afd · 165 BongBongBoink ec6c2dc5-3143-4f52-8a01-4a3061c25558 · 169 Mountain out of Me 1420a234-9d8e-4af7-a715-fd16f200484d · 170 Rust and Rain ae9dcc02-1087-44ba-b6df-8faa541b6765 · 171 Neon Campfire a2cac7a0-634c-47de-8f09-b1c5cfda9f2b.
- **Suno feasibility test:** `GET https://suno.com/song/66f20af1-…` (desktop UA) → 136,977 bytes HTML; `og:description` present; the string "lyrics" appears **0** times → lyrics are JS-gated; manual transcription is the only path (A1).
- 11 title drifts (file vs store): 19, 25, 67, 103, 104, 109, 114, 117, 137, 177, 184.
- 🔗 census: 74 total (Part I/II 11, Part III 54, Part IV 9 = 8 group headers + 1 row); Part IV rows: A 21 / B 8 / C 25 / D 19 / E 23 / F 7 / G 11 = 114.
- Track 150 (verified in full): chorus = Thomas ("rage, rage against the dying of the Light") fused with Hard Rain ("an endless Night"); bridge refs not indexed: Plato's cave, Thebes→Alexander ("Philip's kid"), Lake Garda, elephant, beluga, porthole/starboard.
- `lore.summary`: 199/199 present (101–374 chars, median 158); 133 mention "dear papa"; 1 debt, 1 boat, 1 letter, 3 elaine (20, 69, 143), 3 missing, 2 search — mixed bespoke/template register, never reconciled against the deep read.
- `createdAt` by month: 2025-09 ×4, 2025-11 ×3, 2025-12 ×6, 2026-01 ×3, 2026-04 ×8, 2026-05 ×20, 2026-06 ×64, 2026-07 ×49, 2026-08 ×42; `updatedAt` 2026-07-23 → 2026-08-26.
- Store coverage: stems 137 (62 none) · media 16 (183 none) · visualizers 0 · storyBeats 88 (1,716 beats) · referenceConnectors 37 (136) · lyricTimings 181 · lyricTimingSource 48 · performancePerspective 199 (Red 82 / Green 58 / Blue 56 / Little Toe 1 / Bella 2; teamColor 182 assigned, 17 unassigned: 2, 3, 6, 8, 9, 10, 13, 15, 18, 20, 24, 34, 39, 191, 197, 198, 199) · `album.summary` = "" · `readyForBuilder: true`.

**What was NOT changed:** no git staging/commits (worktree is shared with another agent on gitlab-main; the other agent's ~39 dirty entries untouched); `ECHO_ALBUM_MASTER_STORY.md` was not modified; the research notes received only the ledger entry (E7a); no store/songbook data modified.

## Appendix B — Open questions (need a decision, not a tool)

1. **Canonical text for the 9 divergent tracks (A3):** songbook/fuller text or store/registry text? This decides what the app shows and what the deep read "really" analyzed. (Recommendation: the fuller operator text, with the store's `lyrics.status` moved to `operator-supplied` once confirmed.)
   *(2026-09-03: **resolved by the operator's multiverse canon rule** — neither text is canonicalized; the 9 are parallel timelines that converge through the shared phrases, and both stand, flagged where they diverge. Residue: which text the app displays **by default** for these tracks is a product decision, not a canon one.)*
2. **The 14 ghost tracks (A1/D5):** who has Suno access to transcribe them? They are the only content gap in the final descent.
3. **Lore reconciliation (A8/D6):** should the store's 199 `lore.summary` fields be rewritten from the master story's readings (making the app's lore layer carry the deep read), or kept as technical provenance with the master story as the sole interpretive layer? The 133/199 boilerplate rate suggests the current layer serves provenance, not meaning.
4. **Movement boundaries:** still a proposal. B6's chronology can test whether the seven movements correspond to writing sessions (June's 64-track burst vs the 1–11/12–33 boundaries) — a data check, then keep or revise.
5. **Catalog expansion (C2):** approve the ~11 expansion candidates (chess, King Lear, Peter Pan, Odyssey, Valhalla, Ophelia, A Hard Rain, Do not go gentle, Duck Hunt, Plato's cave, Thebes/Alexander) for the store's 85-entry catalog?

*End of enhancement list. Companion files: [ECHO_ALBUM_MASTER_STORY.md](ECHO_ALBUM_MASTER_STORY.md) · [ECHO_ALBUM_RESEARCH_NOTES.md](ECHO_ALBUM_RESEARCH_NOTES.md)*
