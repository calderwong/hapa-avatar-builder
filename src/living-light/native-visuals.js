/** The supplied app's shared-context visual stack, in its installation order.
 * Figure treatment remains unqualified. Install Octave's synchronous corridors
 * directly instead of starting Reliquary's asynchronous figure/texture loader.
 * Realm installs Contour internally. No vendor source or global is changed. */
export const LIVING_LIGHT_VISUAL_HOOKS=Object.freeze([
 'HapaFlowVisuals','HapaPassageRenderer','HapaHorizonVisuals','HapaRealmVisuals',
 'HapaOctaveVisuals','HapaWaterVisuals','HapaFireVisuals','HapaWindVisuals',
 'HapaDynamicsVisuals','HapaElectricVisuals','HapaGeometryDanceVisuals',
 'HapaElementVisuals','HapaStageVisuals','HapaJourneyVisuals',
]);
export function installLivingLightNativeVisuals(native,renderer){
 // Refuse an incomplete namespace before leaving a partially installed stack.
 for(const name of LIVING_LIGHT_VISUAL_HOOKS)if(typeof native[name]!=='function')throw Error(`Missing Living Light visual module: ${name}`);
 for(const name of LIVING_LIGHT_VISUAL_HOOKS){
  native[name](renderer);
  // Realm's depth-of-field pass shares this shader with the figure renderer.
  // It needs the optical program, not asynchronous figure textures/geometry.
  if(name==='HapaRealmVisuals')renderer.programs.reliquaryFocus=native.HapaRenderer.program(renderer.gl,native.HapaShaders.vertex,native.HapaReliquaryShaders.focus,'per-view linear depth focus');
 }
}
