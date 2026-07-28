# Vibes Reference Transition Ring Goal — 2026-07-28

Status: active prototype campaign

## Objective

Generate, download, register, and cross-link at least one Vibes transition
video for every valid Hapa Avatar Builder Reference image while maintaining a
three-video provider buffer.

## Evidence inspected

- Canonical Builder Reference transition catalog and queue.
- The signed-in Vibes project Generate and Media surfaces.
- Five completed POC imports with local SHA-256 custody and two endpoint
  relationships each.
- The Hapa Media Generation Queue Protocol and Builder transition-link flow.

## Checkpoint reflection

- What worked: deterministic claim, submit, download, digest, media-library
  writeback, endpoint relationships, and one-for-one buffer replenishment.
- What was noise: Vibes completion order does not match submission order, so
  visual grid position cannot be treated as queue identity.
- What was misunderstood: a provider redirect may preserve the project URL
  while rendering the public landing surface, and the generation-type button
  label can remain `Video` without proving the next output will be a video.
  URL equality and button text alone are not sufficient health signals.
- What changed: the campaign now seeds a closed Reference ring with one
  outbound job per valid Reference and reports truthful coverage. A session
  health gate records healthy, recovering, and auth-required states.
- What remains reusable: the existing Builder queue, claim packets, media
  store, append-only events, import reports, and three-active-slot invariant.
- New guardrail: session recovery may reuse an existing visible provider
  session, but it must pause at password, passkey, CAPTCHA, OTP, or account
  selection. Claims remain active during that pause. Every submission actively
  selects `Video`, and every result must expose the `Edit video` playback
  surface before download or Builder writeback.

## Reusable candidates

- Flow explainer: authenticated provider-session health gate.
- Lesson Card: provider URL is not sufficient proof of authenticated UI state.
- Decision Card: cover a finite media catalog with a deterministic closed ring
  so every source receives exactly one outbound generation job.
