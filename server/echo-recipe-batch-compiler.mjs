import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
import {projectToEditorGraph} from '../src/domain/multitrack-editor.js';
import {contentHash} from '../src/domain/echo-director-v2.js';
import {reidentifyEchoCompiledShowGraph,validateEchoCompiledShowGraph} from '../src/domain/echo-compiled-show-graph.js';

/** Prepared-input compile only. This path has no network, model, decode,
 * enrichment, registry mutation or final-render adapter. */
export function compileEchoRecipeSnapshot(input) {
  const {project,options,inputHash,compilerHash,sourceHashes}=input;
  const recut=createEchoNarrativeRecut({project,...options,range:options.range||{startSeconds:0,endSeconds:Number(project.duration)}});
  let graph=projectToEditorGraph(recut.project);
  const parentSource=graph.directorV2?.source||null;
  const sourceProjectHash=contentHash(project);
  graph.directorV2={...graph.directorV2,
    source:{sourceProjectHash,inputHashes:{snapshot:contentHash(project),settings:contentHash(options),media:contentHash(sourceHashes),compiler:String(compilerHash).replace(/^sha256:/,'')}},
    provenance:{...graph.directorV2?.provenance,sourceProjectHash},
    recipeBatch:{schemaVersion:'hapa.echo.recipe-batch-lineage.v1',inputHash,compilerHash,parentCutId:project.active_direction_script_variant?.id||'legacy',parentSource,recipe:options.recipeId,seed:options.seed,plan:recut.receipt},
  };
  graph=reidentifyEchoCompiledShowGraph(graph);
  const validation=validateEchoCompiledShowGraph({project:recut.project,sourceProject:project,graph});
  if(!validation.ok)throw new Error('Compiled recipe graph failed validation: '+validation.reasons.join(', '));
  return {schemaVersion:'hapa.echo.recipe-batch-result.v1',inputHash,compilerHash,songId:project.song_id,
    project:{...recut.project,director_show_graph:graph},graph,
    receipt:{inputHash,graphHash:graph.directorV2.variantHash,parentCutId:project.active_direction_script_variant?.id||'legacy',sourceProjectHash,recipeId:options.recipeId,seed:options.seed,plan:recut.receipt,validation,
      analysisCalls:0,enrichmentCalls:0,modelCalls:0,sourceAuthoringWrites:0,rendered:false}};
}
