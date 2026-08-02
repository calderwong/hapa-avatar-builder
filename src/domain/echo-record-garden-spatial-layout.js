const freezePoint = (point) => Object.freeze({ ...point });

/**
 * Shared scene-space contract for the Record Garden hero composition.
 *
 * Table-bound visuals and interactions use a local coordinate frame so saved
 * Record/Card transforms remain stable when the complete table ensemble moves.
 * Screen-adjacent scenery uses explicit clearance values to keep the Director
 * surface unobstructed after the screen was enlarged.
 */
export const ECHO_RECORD_GARDEN_SPATIAL_LAYOUT = Object.freeze({
  tableStage: freezePoint({ x: 0, y: 0, z: 0.25 }),
  screen: freezePoint({ x: 0, y: 2.72, z: -4.1, ry: 0, scale: 2 }),
  screenHalfWidth: 7.44,
  screenHalfDepth: 0.2,
  directorFrame: Object.freeze({
    position: freezePoint({ x: 0, y: -1.5, z: -5.3 }),
    scale: freezePoint({ x: 2, y: 1.7, z: 1 }),
  }),
  directorPlanters: Object.freeze({
    x: 8,
    z: -4.55,
  }),
  parasol: freezePoint({ x: -11.2, y: 1.7, z: -2.8 }),
});
