# Reviewed Dreamer designs → existing Hell Week artwork

First-pass owner adapter, November 4, 2026. Reuses Builder’s semantic v2 artwork,
transport, external storage, unknown-outcome hold and Item custody registrar.
Dreamer-authored designs bypass discovery. No LEO/Thor call rewrites them.

`node cli/hell-week-designs.cjs prepare PACKET.json --dry-run` validates only.
`check PACKET.json` reads the exact native run; `prepare PACKET.json` saves designs.
`status RUN_ID --offset=N` is a bounded reader. These commands cannot read provider
credentials, buy images, resume workers or register Cards. The existing native
Hell Week UI/CLI owns separately explicit artwork execution and registration.
An already open Electron main process must be reopened before using new source;
no application restart is performed by this interface.

Packet `hapa.dreamer.builder-designs.v1` freezes request identity, exact set edition,
model, quality, 1024×1536 size, and 1–128 reviewed designs (512 KiB transfer ceiling).
Each includes the exact encoded Dreamer record and SHA-256, plus raw UTF-8 prompt
hash. Name, description, flavor, structured abilities, typed parameters and image
prompt survive the adapter. Empty parameters need a reason. Unsupported settings
refuse; no seed is silently dropped. This route has no Avatar foundations yet.
Its transfer bound is independent of native discovery count or image allowances.

Native run identity derives from Dreamer’s illustration-run identity. Reimport
of identical bytes reuses saved work; changed bytes conflict. Original raw designs
and references remain attributable; references are not invented quotations.
Artwork uses the exact saved prompt. Registration includes original design
commitments before origin custody creation; human review, publication and canon
remain separate states. A second-model comparison is a new run over the same
source editions, preserving the prior run and its receipts.

The existing owner profile/control cap (128 MiB) and registered external store
remain authoritative. One ≤512 KiB packet and per-Card design records are saved
externally; compact controls stay local. No input media or full artwork is copied
into Dreamer. External preflight and shared admission run before writes; the
adapter reserves 9 MiB local control headroom. The import window is 45 seconds
with a 15-second next-unit reserve and cursor after each committed Card. At most
one unfinished Card/index checkpoint can require reconciliation; accepted
Cards are retained. Operator pause is never cleared. This is not a restoration
project or independent-backup qualification.

Readback returns exact design identities, prompt hashes, current native states,
image digests and registration receipts, without raw provider bodies or images.
A complete import readback acknowledges design intake, not successful artwork.
Reads spanning several pages reject a changing run snapshot.

Verification: 30 focused native checks passed, including exact receipt readback
and two import interruptions. Fixtures exercise exact prompts, new-model variants, two image-before-
registration interruptions and uncertain paid outcomes. No live generation has
been purchased for this change. Existing broad Echo/Director failures documented
in HELL_WEEK_BUILDER.md are outside this slice; no clean whole-repository release
claim is made. Reuse decision/Lesson candidate: import a reviewed artifact into
its owner’s existing execution stage instead of regenerating it from source.
Source: Calder’s Hapa Dreamer requirements 9–10 and delivery-priority corrections.
