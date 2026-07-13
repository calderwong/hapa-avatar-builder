# Echo Director Plan v2 contract

`hapa.echo.director-plan.v2` extends `hapa.music-viz.native-show-graph.v2`; it does not define a competing playback format. The executable envelope remains a Native Show Graph with Track A media, Track B IVF/ISF layers, and Track C accents.

The `directorV2` extension is content-addressed and carries the expensive decision result: source/input hashes, canonical cue graph, ranked media candidates, hydrated visualizer layers, stem buses, camera keyframes, typed modulation bindings, visual-time modulation, effects, locks, safety ceilings, renderer truth, and patch lineage. Cheap recipe/seed compiles reuse that envelope.

Renderer routes are closed vocabulary and must be explicit:

- `exact-native`: executable without semantic substitution.
- `approximate-native`: executable through a declared intent port with unsupported features listed.
- `browser-proxy`: preview/showcase route, not Native export truth.
- `pending`: unsupported until a renderer declares a capability and fallback.

Unknown or unsupported fields may not silently disappear. Adapters must either preserve them on decode/re-encode or emit a loss report. An empty `unsupported` list is meaningful only for `exact-native`.

Timing truth is inherited from the cue graph. A missing sidecar may remain usable as an inferred projection, but it cannot be relabeled exact. Patch lineage is append-only and range-scoped; treatments and approved variants remain immutable parents.
