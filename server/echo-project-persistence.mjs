import { attachEchoOutputProfile } from "../src/domain/echo-output-profile.js";

export const ECHO_PROJECT_DELIVERY_ONLY_FIELDS = Object.freeze([
  "director_detail_profile",
  "selected_direction_script_variant_id",
  "director_show_graph",
  "directorShowGraph",
  "director_show_graph_receipt",
  "directorShowGraphReceipt",
  "runtime_shader_repair_receipt",
  "runtimeShaderRepairReceipt",
  "execution_preview",
  "executionPreview",
]);

export function prepareEchoProjectForPersistence(project = {}) {
  const persisted = attachEchoOutputProfile(project);
  for (const field of ECHO_PROJECT_DELIVERY_ONLY_FIELDS) delete persisted[field];
  if (Array.isArray(persisted.direction_script_variants)) {
    const embeddedVariants = persisted.direction_script_variants.filter(
      (variant) => variant?.variant_source?.kind !== "append-only-project-variant",
    );
    if (embeddedVariants.length) persisted.direction_script_variants = embeddedVariants;
    else delete persisted.direction_script_variants;
  }
  return persisted;
}
