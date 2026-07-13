#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { prepareSemanticMediaCandidate, rankSemanticMediaCandidates } from "../src/domain/semantic-media-ranker-v2.js";
import { semanticBlindPacketHash } from "../src/domain/semantic-blind-review.js";

const root = path.resolve(import.meta.dirname, "..");
const projectRoot = path.join(root, "data/music-video-projects");
const artifactRoot = path.join(root, "artifacts/echo-semantic-ranker-v2");
const outputRoot = "/Users/calderwong/Documents/Codex/2026-07-10/re/outputs/dear-papa-director-v2-demo/semantic-review";
const apply = process.argv.includes("--apply");
const [itemStore, sceneStore] = await Promise.all(["item-manager-store.json", "scene-store.json"].map((file) => fs.readFile(path.join(root, "data", file), "utf8").then(JSON.parse)));
const catalog = [];
for (const parent of itemStore.cards || []) for (const asset of parent.mediaAssets || []) if (asset.type === "video") catalog.push(prepareSemanticMediaCandidate(asset, parent));
for (const parent of sceneStore.scenes || []) for (const asset of parent.assets || []) if (asset.type === "video") catalog.push(prepareSemanticMediaCandidate(asset, parent));
const candidates = [...new Map(catalog.filter((item) => item.uri && item.technical?.status === "verified-source-file").map((item) => [item.id, item])).values()];
const files = (await fs.readdir(projectRoot)).filter((file) => file.endsWith("-video-project.json")).sort();
const reviewSongs = new Set(["dear-papa-song-dear-papa", "dear-papa-song-red", "dear-papa-song-green-xx-asia"]);
const reviews = [];
const summary = { schemaVersion: "hapa.echo.semantic-ranking-report.v2", projects: files.length, catalogCandidates: candidates.length, slots: 0, proposedChanges: 0, confidenceAboveCap: 0, reviewComparisons: 0 };

for (const file of files) {
  const filePath = path.join(projectRoot, file);
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  const project = payload.music_video_project || payload;
  const sections = new Map((project.song_edit_map?.sections || []).map((section) => [section.id, section]));
  const previous = [];
  project.timeline = (project.timeline || []).map((shot, index) => {
    summary.slots += 1;
    const section = sections.get(shot.section_id) || {};
    const lyricText = (project.timed_lyrics || []).filter((line) => Number(line.start) < Number(shot.end_sec) && Number(line.end) > Number(shot.start_sec)).map((line) => line.text).join(" ");
    const baselineId = shot.media_id;
    const ranking = rankSemanticMediaCandidates({
      slot: { sectionLabel: shot.section_label, sectionType: shot.section_type, editReason: shot.edit_reason, energy: section.energy ?? null, preferredAspect: shot.media_contract?.dimensions?.height > shot.media_contract?.dimensions?.width ? "portrait" : "landscape" },
      candidates,
      canon: project.canon_affordance_graph || {},
      lyricText,
      previous,
      pins: shot.semantic_pins || [],
      bans: shot.semantic_bans || [],
      topK: 5,
    });
    if (ranking.selected?.mediaId) previous.push(ranking.selected.mediaId);
    if (ranking.selected?.mediaId && ranking.selected.mediaId !== baselineId) summary.proposedChanges += 1;
    if (Number(ranking.selected?.confidence || 0) > 0.55) summary.confidenceAboveCap += 1;
    const decision = { ...ranking, baselineMediaId: baselineId, selectionStatus: "proposed-pending-blind-review" };
    if (reviewSongs.has(project.song_id) && reviews.filter((item) => item.songId === project.song_id).length < 6 && ranking.selected?.uri && shot.media_uri) {
      const flip = (index + project.song_id.length) % 2 === 0;
      const baseline = { mediaId: baselineId, title: shot.media_title, uri: shot.runtime_media_uri || shot.media_uri };
      const proposed = { mediaId: ranking.selected.mediaId, title: ranking.selected.title, uri: ranking.selected.uri, confidence: ranking.selected.confidence, components: ranking.selected.components };
      reviews.push({ id: `${project.song_id}:${index}`, songId: project.song_id, songTitle: project.song_title, section: shot.section_label, lyricText, A: flip ? baseline : proposed, B: flip ? proposed : baseline, answer: flip ? "A" : "B" });
    }
    return { ...shot, semantic_casting: decision };
  });
  if (apply) await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
summary.reviewComparisons = reviews.length;
summary.reviewStatus = "awaiting-human-blind-ab";
await fs.mkdir(artifactRoot, { recursive: true });
await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(artifactRoot, "report.json"), `${JSON.stringify(summary, null, 2)}\n`);
const reviewPacket = { schemaVersion: "hapa.echo.semantic-blind-review.v3", comparisons: reviews.map(({ answer, ...item }) => item) };
const packetHash = semanticBlindPacketHash(reviewPacket);
await fs.writeFile(path.join(outputRoot, "review-packet.json"), `${JSON.stringify(reviewPacket, null, 2)}\n`);
await fs.writeFile(path.join(artifactRoot, "review-answer-key.json"), `${JSON.stringify({ schemaVersion: "hapa.echo.semantic-blind-answer-key.v2", sealedAnswers: reviews.map((item) => ({ id: item.id, answer: item.answer })) }, null, 2)}\n`);
const cards = reviews.map((item, index) => `<article class="card" data-id="${item.id}" tabindex="0"><header><small>Comparison ${index + 1} of ${reviews.length}</small><h2>${item.songTitle}</h2><p>${item.section} · ${item.lyricText || "instrumental / no aligned lyric"}</p></header><div class="pair">${["A", "B"].map((side) => `<section><h3>${side}</h3><video src="http://127.0.0.1:8787${item[side].uri}" muted loop controls playsinline preload="metadata"></video><button onclick="vote('${item.id}','${side}')">Choose ${side}</button></section>`).join("")}</div><div class="choices"><button onclick="vote('${item.id}','TIE')">Tie</button><button onclick="vote('${item.id}','NEITHER')">Neither fits</button></div><label>Optional note <input id="n-${item.id}" maxlength="500" oninput="note('${item.id}',this.value)"></label><output id="o-${item.id}">unreviewed</output></article>`).join("\n");
const html = `<!doctype html><meta charset="utf-8"><title>Echo Semantic Casting Blind Review</title><style>body{font-family:system-ui;background:#07111d;color:#e8fbff;margin:24px;max-width:1200px}.toolbar{position:sticky;top:0;z-index:3;background:#07111df2;padding:14px;border:1px solid #21d9ff55}.card{border:1px solid #21d9ff55;padding:18px;margin:18px 0;background:#0d1d2d}.card.done{border-color:#58ec96}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}video{width:100%;aspect-ratio:16/9;background:#000;object-fit:cover}button,.file{padding:10px 18px;margin:5px;background:#12d5dd;color:#001;border:0;font-weight:800;cursor:pointer}.choices button{background:#ffd66b}output{display:block;margin-top:12px;color:#ffd66b}input{width:min(650px,80%);padding:8px;background:#10283c;color:white;border:1px solid #21d9ff55}progress{width:260px}small{color:#8dddec}</style><h1>Blind music-to-media review</h1><p>Judge only how well each clip fits the named musical section and lyric. The proposed/baseline identity is sealed. “Tie” and “Neither” are valid; do not force a preference.</p><div class="toolbar"><strong id="progressText"></strong> <progress id="progress" max="${reviews.length}" value="0"></progress><button onclick="download()">Export completed ballot</button><label class="file">Import ballot<input type="file" accept="application/json" hidden onchange="importBallot(this.files[0])"></label><button onclick="clearBallot()">Clear local ballot</button><div><small>Packet SHA-256: ${packetHash}</small></div></div>${cards}<script>const packetHash='${packetHash}',total=${reviews.length};let state=JSON.parse(localStorage.echoSemanticBallotV3||'{"votes":{},"notes":{}}');state.votes=state.votes||{};state.notes=state.notes||{};function persist(){localStorage.echoSemanticBallotV3=JSON.stringify(state);render()}function vote(id,v){state.votes[id]=v;persist();const card=document.querySelector('[data-id="'+CSS.escape(id)+'"]');const next=card?.nextElementSibling;if(next)next.scrollIntoView({behavior:'smooth',block:'start'})}function note(id,v){state.notes[id]=v;localStorage.echoSemanticBallotV3=JSON.stringify(state)}function render(){document.querySelectorAll('.card').forEach(card=>{const id=card.dataset.id,v=state.votes[id],o=document.getElementById('o-'+id);o.textContent=v?'chosen '+v:'unreviewed';card.classList.toggle('done',!!v);const n=document.getElementById('n-'+id);if(n&&document.activeElement!==n)n.value=state.notes[id]||''});const count=Object.keys(state.votes).length;progress.value=count;progressText.textContent=count+' / '+total+' reviewed'}function ballot(){return{schemaVersion:'hapa.echo.semantic-blind-votes.v3',packetHash,reviewerId:'human-local-'+new Date().toISOString().slice(0,10),completedAt:Object.keys(state.votes).length===total?new Date().toISOString():null,votes:state.votes,notes:state.notes}}function download(){if(Object.keys(state.votes).length!==total&&!confirm('This ballot is incomplete. Export it anyway?'))return;const blob=new Blob([JSON.stringify(ballot(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='echo-semantic-blind-votes.json';a.click();URL.revokeObjectURL(a.href)}async function importBallot(file){if(!file)return;const incoming=JSON.parse(await file.text());if(incoming.packetHash&&incoming.packetHash!==packetHash){alert('This ballot belongs to a different review packet.');return}state={votes:incoming.votes||{},notes:incoming.notes||{}};persist()}function clearBallot(){if(confirm('Clear every local vote and note?')){state={votes:{},notes:{}};persist()}}render()</script>`;
await fs.writeFile(path.join(outputRoot, "index.html"), html);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
