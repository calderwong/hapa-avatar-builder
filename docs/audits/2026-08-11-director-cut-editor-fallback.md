# Director cut editor fallback — 2026-08-11

## Objective

Allow an operator to switch from Legacy Baseline to any saved Echo Director cut even when an unrelated whole-album readiness certification holds the exact final-render graph lock.

## Evidence

`Appa Checkin' In` returned the selected Intentional Enrichment cut with its complete 54-shot immutable script, but its response reported `exact_cut_execution_graph_not_ready` because the execution pointer was missing while another live readiness process held the certification lock. The UI required that exact graph before changing the selector, so it remained on Legacy despite the cut being valid for copy-on-write editing.

## Guardrail

Saved cuts now open immediately as editable, cut-specific forks whenever the active verified graph can serve as a local editor template. The exact selected cut remains pinned in provenance, and background certification is requested without blocking navigation. Final rendering continues to require the exact certified execution graph; this fallback never authorizes a render from the template graph.

## Reuse

This uses the existing `deriveEchoSavedDirectionPlanningProject` local-projection contract rather than introducing a second cut representation. The pattern is reusable for other non-destructive editor surfaces with slow final-certification work.

## 2026-08-24 regression correction

The service-freshness guard still ran before the editor fallback. After any
Builder delivery change, a complete saved cut therefore returned
`server_restart_required` and the selector snapped back to Legacy even though
the cut was safe to open as a local editable copy. Saved non-Legacy cuts now
enter the existing editor fallback before service freshness is evaluated.
Legacy graph preparation and every final-render path remain freshness-gated;
the fallback never acts as a render certificate.
