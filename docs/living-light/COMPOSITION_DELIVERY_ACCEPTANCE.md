# Painted composition and current delivery acceptance

October 22 amendment: LL-902 remains in progress and now also requires the
[album music-response work](MUSIC_RESPONSE_PLAN.md). The dated evidence below
does not establish expressive stem-driven choreography across the album.

October 16, 2026 · Technical evidence for LL-902 and LL-910.
Source: Codex /root chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.
Human art-direction review remains pending. This is local prototype acceptance.

## LL-902 — composition

| Original criterion | Evidence and scope |
| --- | --- |
| 3D audio response and selected 2D footage share one clock; no duplicate soundtrack. | Actual saved 11:23 prepared scene diagnostics identify the exact master energy binding, muted painted media, zero owned audio contexts and zero owned animation loops. The Director offset test samples signals at Song time and route/media at the explicitly mapped Journey time, without stretching either. The restored-stack 25-second encoded excerpt has one master soundtrack and source correlation 0.9985697445 at zero lag. Neutral album arrangements remain labeled authored motion, not measured musical direction. |
| Wall/screen crop, occlusion, colour transform and resource bounds. | Twelve existing native crop/Fit/Fill samples plus six framing checks establish the source rectangles. The new production-material WebGL fixture passes nine direct pixel samples: linear SDR conversion, brightness, native grade, near/far depth ordering, portal center/discard, and the actual native optical composite at exposures 1 and 2. All tested GL resources release and every sample reports zero GL error. Current/next residency and native lifecycle evidence establish bounded decoders and cleanup. This is SDR/optical-composite evidence, not HDR display calibration or a claim about every later finishing effect. |
| Camera comfort and fallback reviewed; no implied physical refraction/VR. | Current Landscape and Vertical framed previews were visually inspected; both expose Hold motion. The host honors reduced-motion preference; Explore provides keyboard/direct jump without forced animated travel. Existing native reduced-motion arrival and driver tests verify held motion, pause, seek and hidden cleanup. Missing sources and failed graphics preparation stay explicit, bounded and retryable; they do not silently substitute another scene. These are usable comfort controls, not a guarantee of individual comfort. Native perspective/depth and optical effects do not establish physical refraction or VR. |
| Representative Location → painted tunnel → Location; panel/portal limits and human review. | The saved three-stop pilot travels Tidal → Fractal Loom → Tidal → Silken Current → Resonance. Full-app travel, arrival, exact destination media and Card inspection are recorded in the modular acceptance audit. Painting uses supported depth panels and circular portals, with at most two enabled placements per recipe. Arbitrary mesh UV projection remains outside this integration. Human art-direction review is still pending. |

## LL-910 — current delivery

| Original criterion | Evidence and scope |
| --- | --- |
| Build/source/API freshness agrees; safe reload preserves owner data. | The existing production build passed at `f911cb5`; no production source changed in this acceptance batch. Strict owner build-identity inspection validates the served bundle against current inputs. A fresh read found the old API stale, with no active streams, inflight reads or render children. One existing launchd reload changed PID 1026 to 15075 and reports fresh source. The refreshed app reopens the selected Album Pass. No new server or render was started. |
| Real song drives a saved route; reopen preserves exact media. | Real 11:23 Album Pass reopens after the service refresh. At 14.1 seconds its saved transition paints Fractal Loom wall video. Previous saved-owner and full-app proofs retain exact Journey/media revisions, including source cuts that are no longer the catalog head. The current media checks verify save/reopen and reject replacement source declarations. |
| Pause/reverse/loop/end/missing/reduced/leave-return are bounded with one soundtrack. | Forty-four current targeted checks cover media time mapping and terminal hold, exact decoder seeks, stale callbacks, missing/failing media, source-offset signal routing, cue entry/exit, paused/hidden/reduced-motion behavior, recorder frame ownership and cleanup. They supplement actual saved-route travel, paused bookmark/Hand return, three fresh entries, twenty full-app switches and ten component unmounts. Current reopened preview contains one paused audio element at 14.1 seconds. Test behavior is not described as a full-album watch-through. |
| Landscape and Vertical framing inspected; source/unrelated data unchanged. | Current restored visual stack was inspected at the same 14.1-second painted passage in both output profiles. Native canvases measure 894×502 Landscape and 282×502 Vertical, while the UI names the actual 1920×1080 and 1080×1920 output targets. The complete portrait frame visibly retains the tunnel and painted panels. Landscape was restored without saving a derivative. Rehashing all 7,809 pre-existing project/cut files against the album baseline gives zero mismatches. No recording or source audio was changed. |

## Exact evidence and reproduction

Under this source chat's `execution/living-light/album-director-pass/`:

- `composition-current.json`: nine passing native samples after the fixture's
  final cleanup correction; `composition-final.png` shows the same sample results.
- `composition-delivery-tests.log` and its receipt: 44 passing checks, no failed
  tests or remaining owned descendants.
- `delivery-reload-receipt.json`, `delivery-freshness.json`: supervised reload
  and strict current source/build/API identity.
- `delivery-vertical.json/png`, `delivery-landscape.json/png`: actual reopened
  Album Pass, one audio element, framed painted output, selected orientation.
- `delivery-source-preservation.json`: all 7,809 original project/cut hashes match.

Reused evidence: `framing/final-pixel-proof.json`,
`audio-bound-pilot/stable-entry-prepared.json`, `stable-entry-verification.json`,
`native-lifecycle-verification.json`, and
`audio-bound-pilot/restored-excerpt/inspection/acceptance.json` beneath the same
`execution/living-light/` root. Full-app navigation and current/next resource
evidence are linked in [modular acceptance](MODULAR_NAVIGATION_ACCEPTANCE.md).
Earlier full/portrait exports retain their original renderer attribution; the
new portrait proof is preview evidence, not a new encoded portrait release.

To reproduce the pixel proof, use the existing development server and open
`tests/fixtures/living-light-composition-pixels.html`, then Run composition checks.
It uses the production material and native composite with synthetic pixels;
it reads no album data and creates no audio. The targeted check command is:

```sh
node --test --test-concurrency=1 tests/living-light-media.test.mjs tests/living-light-framing.test.mjs tests/living-light-signal-routing.test.mjs tests/echo-living-light-preview.test.mjs tests/living-light-preview-driver.test.mjs
```

Learning: reused native paint, shared clocks and prior lifecycle evidence rather
than changing the renderer for an acceptance audit. An initial fixture cleanup
check retained a currently bound program; unbinding before deletion corrected
the fixture, not a production leak. Program handles are now tracked immediately
after each successful compile. An initial preservation script used a Python API
absent on this host; bounded streamed hashing completed the same read-only check.
Neither failed attempt changed source stores. Lesson Card candidate: separate
direct pixel proof, native interaction, source integrity and creative review;
one green catalog or screenshot cannot stand in for all four.


## October 23 — amended composition and current delivery accepted

LL-902 and LL-910 now satisfy their full technical criteria, including the
October 22 music-response amendment. The [final delivery audit](INTEGRATION_DELIVERY.md#october-23--final-amended-scope-delivery-audit)
maps every criterion to current checks and retained native evidence. The shared
response path is verified across all 202 songs, with controlled native clips and
five paired Director samples. The current source/build/API delivery check passes
after one supervised idle refresh. Current 115 integrated checks pass; all 8,014
original files and 203 original Journey payloads still match. Human art direction
remains pending, and exact-cut export readiness remains independent.
