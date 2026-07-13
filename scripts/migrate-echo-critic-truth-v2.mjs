#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const projectDir = path.join(root, "data", "music-video-projects");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, "data", "backups", `echo-critic-truth-v2-${stamp}`);
const files = fs.readdirSync(projectDir).filter((file) => file.endsWith("-video-project.json")).sort();
let shots = 0;
let falseMoodClaims = 0;
fs.mkdirSync(backupDir, { recursive: true });

for (const file of files) {
  const sourcePath = path.join(projectDir, file);
  const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const project = payload.music_video_project || payload;
  fs.copyFileSync(sourcePath, path.join(backupDir, file));
  const alternatives = [...new Map((project.timeline || []).filter((shot) => shot.media_id && shot.media_id !== "none").map((shot) => [shot.media_id, { mediaId: shot.media_id, title: shot.media_title || shot.media_id }])).values()];
  project.timeline = (project.timeline || []).map((shot) => {
    shots += 1;
    if (/matching (red|blue|green) mood/i.test(String(shot.edit_reason || ""))) falseMoodClaims += 1;
    const pure = !shot.media_id || shot.media_id === "none";
    const activeStems = Array.isArray(shot.active_stems) ? shot.active_stems : [];
    const truthStatus = pure ? "deterministic-visualizer-cadence" : "legacy-selection-semantic-fit-unmeasured";
    const rejectedAlternatives = alternatives.filter((item) => item.mediaId !== shot.media_id).slice(0, 4).map((item) => ({
      ...item,
      reason: "project-treatment-alternate; not semantically rejected",
    }));
    return {
      ...shot,
      edit_reason: pure
        ? `Pure visualizer interval retained from the legacy deterministic cadence in ${shot.section_label || shot.section_id || "section"}; musical-fit judgment is unmeasured. Active stems: ${activeStems.join(", ") || "none declared"}.`
        : `Use ${shot.media_title || shot.media_id} in ${shot.section_label || shot.section_id || "section"}; legacy selection was deterministic, not a verified mood or music match. Apply transition: ${shot.transition || "cut"}.`,
      confidence: null,
      confidence_basis: "unmeasured-no-human-or-semantic-evaluation",
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v2",
        truthStatus,
        scoreComponents: {
          sectionBoundary: { value: true, basis: `timeline-section:${shot.section_id || "unknown"}` },
          durationFit: { value: Number(shot.end_sec) > Number(shot.start_sec), basis: "timeline-window" },
          semanticMusicMatch: { value: null, basis: "unmeasured" },
          emotionalArc: { value: null, basis: "unmeasured" },
          continuity: { value: null, basis: "unmeasured" },
        },
        evidence: [`section:${shot.section_id || "unknown"}`, `transition:${shot.transition || "cut"}`, `active-stems:${activeStems.join("|") || "none"}`],
        rejectedAlternatives,
        confidence: { value: null, basis: "unmeasured-no-human-or-semantic-evaluation" },
      },
    };
  });
  const dimensions = ["song_structure_alignment", "emotional_arc", "visual_variety", "continuity", "overcutting_risk"];
  project.critic_scores = Object.fromEntries(dimensions.map((dimension) => [dimension, null]));
  project.critic_assessment = {
    schemaVersion: "hapa.echo.critic-assessment.v2",
    status: "unmeasured",
    basis: "No measured critic fixture or recorded human judgment is attached; hashes are identity/cache tools only.",
    dimensions: Object.fromEntries(dimensions.map((dimension) => [dimension, { value: null, status: "unmeasured", basis: "no-measured-evidence" }])),
  };
  fs.writeFileSync(sourcePath, `${JSON.stringify(payload, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, shots, falseMoodClaimsRemoved: falseMoodClaims, backupDir }, null, 2)}\n`);
