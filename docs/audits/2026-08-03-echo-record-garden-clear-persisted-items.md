# Echo Record Garden persisted-item clearing

- Objective: give the operator a visible way to remove 3D scene items that otherwise return after every reload.
- Evidence inspected: the canonical `EchoRecordGarden3DView` control dock, the `hapa.echo-record-garden.v1` browser snapshot, scene restore/snapshot behavior, and existing Record Garden persistence tests.
- What worked: the existing versioned snapshot already separates moved-record transforms and printed Card projections from library-owned source data.
- Noise avoided: the API stores and source record/Card libraries are not the cause of these scene objects returning and are not modified.
- Correction: “clear records and cards” is implemented as clearing their saved 3D placements/projections, not deleting their authoring records.
- Change: added a confirmed `Clear 3D items` control that returns the player record, resets moved records, removes printed Cards, cancels an in-flight Card print, writes the cleared snapshot immediately, and rebuilds the live scene.
- Reusable outcome: `clearEchoRecordGardenPersistedItems` is the single domain operation for future UI/CLI parity.
- Guardrail: preserve browsing, selection, filter, mute, and camera preferences while clearing; the confirmation must continue to state that source records and Cards remain in their libraries.
