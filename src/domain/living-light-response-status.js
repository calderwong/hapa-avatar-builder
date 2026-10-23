const measured = row => ['present', 'silent'].includes(row?.availability) && Number.isFinite(row?.value);
const names = roles => roles.map(role => role.replaceAll('-', ' ')).join(', ');

/** Report the sources actually admitted at this frame, not the requested role
 * names. Keep numeric samples/time out so the status does not rerender at 60 Hz. */
export function livingLightResponseStatus(response, diagnostic = {}) {
 const stemRoles = [], masterRoles = [], fallbackRoles = [], unavailableRoles = [];
 const result = (state, message) => ({state, message, stemRoles, masterRoles, fallbackRoles, unavailableRoles});
 if (!response) {
  if (diagnostic.features === 'unavailable') return result('authored-motion', 'Journey active · authored motion');
  if (diagnostic.features === 'basic-master-rms' || diagnostic.features === 'exact-assets-master-response') return result('master-response', 'Journey active · measured master mix');
  return result('prepared-input', 'Journey active · prepared audio bindings');
 }
 if (response.intensity === 0) return result('response-off', 'Journey active · music response off');
 for (const [role, row] of Object.entries(response.roles || {})) {
  if (row.enabled === false) continue;
  if (!measured(row)) { unavailableRoles.push(role); continue; }
  if (row.state === 'explicit-master-fallback') {
   masterRoles.push(role); fallbackRoles.push(role); continue;
  }
  const used = (row.selected?.contributions || []).filter(source => source.weight > 0 && measured(source));
  if (used.some(source => source.sourceRef?.kind === 'stem')) stemRoles.push(role);
  if (used.some(source => source.sourceRef?.kind === 'master')) masterRoles.push(role);
 }
 const parts = [];
 if (stemRoles.length) parts.push('measured stems: ' + names(stemRoles));
 const directMasterRoles = masterRoles.filter(role => !fallbackRoles.includes(role));
 if (masterRoles.length && !stemRoles.length) parts.push('measured master mix only');
 else if (directMasterRoles.length) parts.push('master mix drives: ' + names(directMasterRoles));
 if (fallbackRoles.length) parts.push('master mix fallback: ' + names(fallbackRoles));
 if (unavailableRoles.length) parts.push('unavailable: ' + names(unavailableRoles));
 const state = stemRoles.length ? (masterRoles.length ? 'mixed-response' : 'stem-response') : masterRoles.length ? 'master-response' : unavailableRoles.length ? 'unavailable' : 'response-off';
 return result(state, 'Journey active · ' + (parts.join(' · ') || 'music response off'));
}
