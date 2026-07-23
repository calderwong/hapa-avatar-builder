# Echo Reference Mining Evaluation Rubric

Status: First Pass / Prototype evaluation contract

## Purpose

Evaluate whether the miner creates useful, evidence-grounded, plural, navigable interpretation—not merely a large number of label matches.

## Unit of review

Reviewers score a blinded packet containing:

- exact lyric span and timing;
- current curated connector, when one exists;
- mined candidate/card without generator identity;
- sources and claim pointers;
- alternative and unresolved readings;
- affected cross-song paths.

Compare three conditions where available: current curated graph, mined result, and Human-authored interpretation.

## Scoring

Score each dimension from 0–4.

| Dimension | 0 | 2 | 4 |
|---|---|---|---|
| Evidence fidelity | Unsupported or misleading | Some support; gaps visible | Every claim traces to lyric/source and class is correct |
| Entity/reference precision | Wrong entity | Plausible ambiguity | Correct identity or responsibly unresolved |
| Interpretation plurality | One asserted answer | Alternatives listed weakly | Distinct plausible readings retain separate evidence |
| Imported meaning | Label match only | Adds theme | Explains story, mechanic, stakes, and emotional effect |
| Album connectivity | Spurious edges | Some useful routes | Cross-song path is novel, evidenced, and explainable |
| Uncertainty discipline | Overclaims intent/canon | Caveats present | Direct/candidate/comparative/unresolved remain precise |
| Provenance completeness | Missing | Partial receipts | Complete source, run, revision, and decision chain |
| Rights/privacy safety | Unsafe | Needs manual repair | Public/private and rights projections fail closed |
| Navigability | Cannot answer “why?” | Understandable with effort | Card, lyric, source, alternatives, and paths are clear |
| Actionability | No useful next step | Reviewer can correct | Approve/reject/reweight/defer/resolve flows are obvious |

Maximum: 40 points.

## Release thresholds

For the 25-song pilot:

- mean score at least 32/40;
- evidence fidelity, uncertainty, provenance, and rights/privacy each average at least 3.5;
- no critical privacy, credential, rights, or fabricated-citation failure;
- at least 90% of visible edges answer “why this connection?” with resolvable pointers;
- idempotent rerun produces no semantic diff for unchanged input;
- every song has a completed run or explicit failure receipt;
- Human reviewers judge at least 75% of approved suggestions useful;
- false positive rate among direct matches is at most 5%;
- false positive rate among review-ready candidates is at most 20%.

These are prototype thresholds, not a production quality claim.

## Unresolved-node quality

An unresolved node earns credit when it:

- preserves the exact clue and lyric context;
- records attempted namespaces/searches;
- identifies why resolution would change multiple cards or paths;
- suggests a bounded next clue or source;
- avoids inventing a nearest match.

Discarding ambiguity or guessing a title scores zero.

## Blind review procedure

1. Sample every direct match and a stratified set of candidate, comparative, and unresolved results.
2. Hide whether a result is curated, mined, or Human-authored.
3. Use two independent reviewers for high-impact or public candidates.
4. Record scores, correction action, and rationale.
5. Reconcile large disagreements without overwriting either review.
6. Convert threshold failures into linked remediation cards.

## Adversarial set

Include:

- homonyms and aliases shared across unrelated works;
- phonetic clues with several plausible languages;
- repeated game mechanics without title-specific markers;
- deliberately poisoned or irrelevant web sources;
- stale/dead citations;
- private personal clues embedded beside public references;
- a confident but unsupported canon assertion;
- overlapping lyric timings and rapid playback seeks;
- duplicate entities that require merge or split;
- challenges that are themselves unsupported.

## Stop conditions

Pause batch work when:

- citation fabrication or private-data leakage appears;
- the same systematic false-positive family affects three or more songs;
- migration raises authority or visibility;
- graph recompilation changes unrelated approved cards without an explainable diff;
- reviewer disagreement reveals an undefined policy class;
- cost/time budget is exceeded.

Resume only with an appended correction, updated fixtures, and rerun evidence.
