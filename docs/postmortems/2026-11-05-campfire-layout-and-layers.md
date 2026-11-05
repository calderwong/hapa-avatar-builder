# Campfire controls, Always On layers and foreground occlusion

Codex /root, 2026-11-05. Requested outcome: transport immediately below the
picture, optional Always On shaders over Campfire, and diagnose the dark area
using script and visible evidence rather than asking for a timestamp.

## Result and cause

Play/Pause/Record and the playhead now precede the compact Campfire row. The
larger direction, Score Dust and quality controls sit in a collapsed Visual
settings disclosure below them. This applies to compact and expanded previews.

Blend Always On shaders is opt-in, with a strength slider. The existing enabled
persistent slots supply the light blend, with black neutral. Scheduled cut
media and changing shaders are excluded from this overlay. Underlay dimming and
stale normal-cut fallback frames cannot cover the fire. The recording compositor
uses the same selected strength and screen blend before lyrics. The mode is a
preview/quick-recording option, reset when switching songs/cuts; it is not a new
saved final-render scene contract or a shader-input binding to the fire canvas.

The original forest begins at four metres while portrait subject framing can
pull the camera back to 6.2 metres. Approximate float32 scene-hash evaluation
places a tree at radius 5.822 m and yaw 0.338 radians, within the moving portrait
camera envelope. The foreground geometry can cover the entire fire when the
camera approaches or passes a trunk. Both forest rings now start 4.5 metres
farther out, preserving their deterministic pattern and keeping trees beyond
the camera even after cluster offsets, lean and radius through subject height.

An initial smoke-projection hypothesis was not supported by the portrait camera
bounds. Its exploratory edit was reverted; smoke rendering is unchanged.

## Evidence and limits

- Existing Luna recording 12, 2026-11-05T21-10-47Z, is nearly completely black
  at 44.6 s except for lyrics and edge ground. Updated browser preview at song
  time 44.6 s, requested/presented frame 1338, shows the fire and formations at
  the same lyric. Before/after previews retained in the scoped workspace.
- UI verified the compact row, collapsed settings and enabled Cyclotron1
  persistent shader over Campfire. Shader pool reports exact ready/presented.
- Quick recording b433cd04-abb3-43df-9ce6-bfe9794bd2d8 completed and exposes
  Download. Existing owner location: data/media/echo-preview-recordings/
  Luna di Clara - recording 13 - 00m23s - 2026-11-05T21-20-45Z.mp4.
  59,591,279 bytes, 22.9778 s container duration, H264 1080x1920 + AAC.
  Inspected a 360px frame: Campfire, shader, formed words and subtitles present.
  No second full media copy; bounded derivative previews only. The take remained
  below the declared 64 MiB whole-take cap; no storage policy migration claimed.
- 67 focused Campfire/stage/recording/performance tests passed; one additional
  forest-envelope regression passed (68 total distinct tests).
- Production build and receipt check passed; semantic digest
  sha256:6882e8630704094d2b5784504d44089356c72913eb3a6c64c9f517b1be1c917d.

Source/build includes the changes, but the user's original Electron window was
not reloaded because it holds an unsaved working cut. The separate test tab's
shader enablement was not saved as a cut. Shared rendering change applies to
all songs; this is a matched Luna visual check, not another whole-album GPU run.
No overall Echo workflow acceptance is implied.

The prototype integration remains mixed with pre-existing uncommitted work.
Independent helper/tests/docs are committed; integration deltas and original
source snapshots are preserved in work/echo-recording-repair/campfire-layout
in the current Codex workspace. This focused commit is not a standalone package
of the pre-existing prototype.

## Lesson

Camera fitting and scenery placement must share a spatial envelope. A correct
subject framing algorithm can move the camera into geometry authored for the
old distance. Test portrait framing against actual world occluders, and keep
preview and recorded compositing on the same blend/opacity contract.
