# Tarot 3D canonical Formations

Tarot Draw keeps its Three.js renderer and native interactions, but `src/overcard/tarotFormationAdapter.js` owns the semantic boundary shared with CSS Overcard.

## Mapping

- Field, Drop, Media Pool, Center, and Dock are canonical Formation member zones/roles.
- x/y/z, pitch/yaw/roll, and scale are canonical poses.
- copy instances receive stable per-Formation entity IDs while retaining the original Card ID in renderer preferences.
- stack layer, placement order, focus, offsets, compact Card restore data, table settings, and camera stay in the `hapa-avatar-builder:tarot-3d` projection.
- the `cssOvercard` projection points at the same semantic Formation; CSS and Three.js do not maintain separate member/role/pose truth.

Saved `hapa.tarot-draw.scene-snapshot.v1` cards migrate idempotently when loaded. New Save Scene cards contain both the rollback-compatible snapshot and canonical `hapa.formation.v2`. Loading converts through the canonical Formation and restores settings, camera, transforms, and zones.

## Attached context

Active Avatar attachments on the Tarot HostTarget select the host Avatar. Active Card, Deck, and Set attachments form the draw context through shared collection membership; paused/detached attachments are ignored. If an attached collection is unavailable or has no drawable production match, the context reports that condition and the existing local Deck fallback remains explicit.

Transient Webcam, Phone, Blue Avatar, and Roomlet participant cards remain renderer-local and are intentionally excluded from saved Formations.
