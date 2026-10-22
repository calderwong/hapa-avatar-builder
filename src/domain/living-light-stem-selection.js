// Selection is separate from exact-asset identity. Legacy saved bindings retain
// their original declaration set; new album passes opt into one coherent set.
export const LIVING_LIGHT_COHERENT_STEMS='coherent-stems-v1';
export function livingLightStemSelection(value=null){
 if(value!==null&&value!==LIVING_LIGHT_COHERENT_STEMS)throw Object.assign(Error('Unknown Living Light stem selection.'),{code:'living_light_selection_invalid',statusCode:422});
 return value;
}
export function livingLightBindingSelection(bindingRef){
 return bindingRef?.bindingId?.startsWith('prepared-coherent:')?LIVING_LIGHT_COHERENT_STEMS:null;
}

/** An unsaved musical draft explicitly selects the coherent bank. Saved exact
 * binding identity always wins, including older legacy bindings. */
export function livingLightJourneySelection(journey){
 return journey.sourceBindingRef?livingLightBindingSelection(journey.sourceBindingRef):journey.instances?.some(i=>i.musicResponse)?LIVING_LIGHT_COHERENT_STEMS:null;
}
