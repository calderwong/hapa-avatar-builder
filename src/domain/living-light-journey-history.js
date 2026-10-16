/** A recipe replacement changes its save owner as well as its visible draft.
 * Keep them together so Undo cannot save an old draft into a different recipe. */
export function journeyEditorSnapshot({draft,identity=null,selectedId=null,dirty=false}){
 return structuredClone({draft,identity,selectedId,dirty});
}
export function recordJourneyEditorEdit({current,past},next){
 return {current:journeyEditorSnapshot(next),past:current?.draft?[...past.slice(-49),journeyEditorSnapshot(current)]:[],future:[]};
}
export function stepJourneyEditorHistory({current,past,future},direction){
 if(!['undo','redo'].includes(direction))throw Error('Choose Undo or Redo.');
 const source=direction==='undo'?past:future;if(!source.length)return null;
 return direction==='undo'
  ?{current:journeyEditorSnapshot(past.at(-1)),past:past.slice(0,-1),future:[journeyEditorSnapshot(current),...future].slice(0,50)}
  :{current:journeyEditorSnapshot(future[0]),past:[...past.slice(-49),journeyEditorSnapshot(current)],future:future.slice(1)};
}
