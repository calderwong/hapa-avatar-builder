# Exact painted media acceptance — October 16, 2026

Status: LL-914 technical criteria accepted. The broader integration and human creative review remain open.
Source: Codex /root, chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.

The existing saved-cut reader and Living Light resolver provide exact media
without opening the source cut. This audit checks LL-914's original criteria;
it does not add a general media-library browser or transfer asset rights.
Dependency LL-911 is already technically accepted.

| Original criterion | Evidence and scope |
| --- | --- |
| Resolve saved refs through existing owners with the source cut closed | The protected resolver loads exact Song/cut identities and derives candidates through `livingLightCutMedia`; repeated references share one cut read. Current resolution tests exercise shared-cut reads, wrong-cut refusal and no mutation. Actual saved modular pilot reopens both painted clips from closed source cuts. The different-video pilot retains an item media Card reference from the earlier cut; native and packaged output paint that exact video. |
| Changed, missing and imported references stay explicit; no title fallback or duplicate store | Tests refuse changed URI/source declarations, wrong Song/cut, deleted shot, owner read failure, substituted owner response, injected URI and excessive references. Portable import retains named unresolved media dependencies and refuses commit. Same-title assets retain distinct five-field pins. No new media or Card store is used. |
| Preserve origin, rights, source windows, fit/crop, loop and lineage; bounded lookup/decoders | Saved pins retain original Song, cut, shot, media Card ID and declaration digest. Source owner records remain unchanged: rights and custody remain with those records, with no new rights grant or invented ownership field. Placement settings persist independently through save/reopen, immutable old revisions and portable metadata. Native twelve-sample framing proof verifies Fit/Fill, crop orientation and bars; actual distinct-video swap preserves framing, trim, loop, brightness and the other surface. Resolution accepts at most two references; the visible destination resolves one pin with a 30-second abortable request. Painted runtime owns at most two muted decoders/textures, refuses stale seeks and disposes owned resources. |

## Current checks and reused evidence

26 focused checks pass at Builder source `3d43166`, covering exact resolution,
owner save/reopen, rejected import, framing, moving/reverse seeks and decoder
cleanup. The bounded supervisor reports restored process baseline. No runtime
source change is needed for this audit, so prior native/build evidence is reused.
The live audio-bound pilot's native pixel QA also resolves its original source
pins; its full encode is separate work and not a prerequisite added to LL-914.

Private source-chat evidence under `execution/living-light/`:

- `audio-bound-pilot/media-acceptance-tests.log` and receipt: current26checks.
- `modular-pilot/reopened-ui.txt`, `verification.json`: live closed-cut reopen;
  all39 prior cuts and prior Journey preserved.
- `hand-roundtrip/swap-verification.json`, `new-clip-painted.jpg`: distinct
  original media ID, preserved settings/other cues and40 prior cut files.
- `framing/final-pixel-proof.json`, `final-native-diagnostics.json`: native
  framing and independently painted surfaces.
- `audio-bound-pilot/saved-verification.json`: subsequent preservation of all41
  prior cut files and prior Journey payloads.

The saved reference hashes the owner declaration, not necessarily all source
bytes. Managed packaging additionally hashes copied local bytes. A file changed
in place under a declaration with no byte digest is outside the declaration's
identity claim; final export still freezes and checks the packaged bytes.
General Media library selection and arbitrary remote/imported assets remain
unavailable rather than silently substituted. Existing UI wording that calls a
closed-cut retained clip unavailable in the current picker remains a clarity
issue; saved playback resolves it correctly through its original owner.

Learning delta: separate choosing a replacement from resolving an existing pin.
The current picker inventory is not the complete set of resolvable saved media.
Acceptance requires both negative owner-identity checks and actual reopened
painted output; a matching title or a schema-only check is insufficient.
