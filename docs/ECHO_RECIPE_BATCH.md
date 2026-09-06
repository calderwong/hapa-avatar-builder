# Executable Echo recipe batches

The local batch compiler reuses prepared cuts, footage, canonical cues and the five Variation Lab recipes. It produces new project/native-graph artifacts in a separate directory. It does not write the song registry or saved direction cuts, run models or media analysis, render a master video, or mint a Song Card.

Create a request with the exact songs and prepared project JSON files to process. A prepared file contains the selected project and its canonical `director_show_graph`, including source cues. Source media must remain locally available. Cast/scene requests use the current canonical evidence index; missing evidence is reported rather than inferred from titles.

```json
{
  "songs": [
    {"id": "dear-papa-song-dear-papa", "projectPath": "prepared/dear-papa.json"}
  ],
  "recipes": ["letter-intimate", "performance-kinetic"],
  "seed": "album-take-1",
  "timingMode": "supported-cues",
  "changeAmount": 1,
  "locks": [],
  "requiredCharacterIds": [],
  "requiredSceneIds": [],
  "outputProfile": "landscape"
}
```

Project paths resolve relative to the request file. Omit `outputProfile` to preserve each source profile. Other recipes are `ensemble-response`, `comic-journey`, and `ambient-instrumental`. Use `timingMode: "preserve"` to retain all cut timing. Supported-cue timing obeys existing cue permissions, tolerances and locks.

```sh
node --max-old-space-size=1024 scripts/compile-echo-recipe-batch.mjs --request=/absolute/path/album-request.json --output=artifacts/my-recipe-batch
```

Repeat the same command to resume. Verified completed artifacts are reused; only requested songs/recipes appear in the active queue. `--max-jobs=5` pauses after five new compilations. Ctrl+C cancels the current owned worker and preserves resumable state. After repairing a deterministic failure, `--retry-failed` retries jobs whose inputs have not changed. Changed project, source bytes, settings or compiler dependencies create new input identities automatically.

`batch.json` records state, measured worker cost, cache hits and failures. `queue-view.json` projects it through the existing album queue contract. `inputs/` retains immutable prepared snapshots. Each `jobs/<input-hash>/` directory contains a validated `result.json`, byte-hash receipt, worker metrics and log. A result contains the candidate project, native graph, recipe/seed, moved boundaries and parent lineage. Promotion uses the existing append-only cut-save workflow. Final rendering still needs its own current media, shader and timing certification.

Use the shown Node option to bound the coordinating CLI old-space allocation to 1,024 MiB. The current executor runs one worker at a time with a 1,536 MiB JavaScript old-space limit, a 120-second deadline, 64 MiB snapshot input limit and 192 MiB result limit. Old-space size is neither total heap nor total process memory; measured resident peaks are recorded separately. Global cache eviction and coordination with other render/analysis queues remain separate work.
