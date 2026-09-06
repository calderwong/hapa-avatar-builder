import React, { useMemo, useState } from "react";
import { inspectStoredShotDecision } from "../domain/shot-decision-inspector.js";

const words = value => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
const scoreText = value => typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(3)) : "unmeasured";
const buttonStyle = { minHeight: 32, fontSize: 12, padding: "5px 9px" };

export default function ShotDecisionInspectorPanel({ shot, onReview, mediaTitles = {} }) {
  const inspector = useMemo(() => inspectStoredShotDecision(shot), [shot]);
  const [feedback,setFeedback]=useState(null);
  const [pending,setPending]=useState(false);
  const pinned=Array.isArray(shot?.locks)&&shot.locks.includes("media");
  const exclusions=Array.isArray(shot?.mediaConstraints?.bans)?shot.mediaConstraints.bans:[];
  const excluded=exclusions.includes(shot?.media_id);
  const submit=async review=>{
    if(!onReview||pending)return;
    setPending(true);
    try{await onReview(review);setFeedback({shotId:inspector.shotId,error:false,message:review.action==="replace"?"Preference recorded. Use the media picker for an immediate replacement.":"Working-cut preference updated. Save the cut to keep it."});}
    catch(error){setFeedback({shotId:inspector.shotId,error:true,message:error.message||String(error)});}
    finally{setPending(false);}
  };
  return <details data-testid="shot-decision-inspector" style={{ border: "1px solid rgba(80,227,255,.25)", padding: 10, background: "#06101b" }}>
    <summary style={{ cursor: "pointer", color: "#50e3ff", fontWeight: 700, fontSize: 13 }}>Why this shot? · {words(inspector.reviewStatus)}</summary>
    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere" }}>
      <div>{inspector.scoreLabel}: {scoreText(inspector.selectedScore.utility)} · confidence: {inspector.selectedScore.confidence ?? "unmeasured"}</div>
      <div>{inspector.scoreLabel === "Recipe preference" ? "Scores use declared recipe metadata. Visual matching remains unmeasured." : inspector.observedContent ? "Scores combine recipe preferences with sampled label and OCR overlap. This does not verify the scene or calibrate cut confidence." : words(inspector.selectedScore.confidenceBasis)}</div>
      {inspector.observedContent && <div data-testid="observed-lyric-evidence" style={{ marginTop: 8 }}>
        <strong>Consumed lyric evidence · {words(inspector.observedContent.status)}</strong>
        {inspector.observedContent.sourceWindow && <div>Source window: {scoreText(inspector.observedContent.sourceWindow.startSeconds)}–{scoreText(inspector.observedContent.sourceWindow.endSeconds)} s · {inspector.observedContent.frameCount} sampled frames</div>}
        {["phrase", "section"].map(part => { const match = inspector.observedContent[part]; return match && <div key={part}>
          {part === "phrase" ? "Current phrase" : "Section context"}: {scoreText(match.value)} · {match.matchCount}/{match.tokenCount} tokens matched
          {match.matches?.length > 0 && <div>Annotation confidence: {match.matches.map(row => `${row.token} (${scoreText(row.confidence)})`).join(", ")}{match.matchCount > match.matches.length ? ` · showing ${match.matches.length} matches` : ""}</div>}
        </div>; })}
        <div>Lyric timing: {words(inspector.observedContent.lyricTimingSource)}{inspector.observedContent.phrases?.length ? ` · ${[...new Set(inspector.observedContent.phrases.map(row => words(row.mode)))].join(", ")}` : " · no active phrase"}</div>
        {inspector.observedContent.reason && <div>Unavailable: {words(inspector.observedContent.reason)}</div>}
      </div>}
      {inspector.selectionBasis && <div>Selection: {words(inspector.selectionBasis)}</div>}
      <div>Cues: {inspector.cueEvidence.join(" · ") || "none stored"}</div>
      <div>Renderer: {inspector.rendererTruth.type || inspector.rendererTruth.status || "unknown"}</div>
      {inspector.continuityRisks.length > 0 && <div>Stored constraint flags: {[...new Set(inspector.continuityRisks)].map(words).join(", ")}</div>}
      {inspector.lyricCanonMediaEvidence.length > 0 && <div style={{ overflowX: "auto", marginTop: 8 }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <caption style={{ textAlign: "left", fontWeight: 700 }}>Stored score components</caption>
        <thead><tr><th scope="col">Component</th><th scope="col">Value</th><th scope="col">Basis</th></tr></thead>
        <tbody>{inspector.lyricCanonMediaEvidence.map(row => <tr key={row.dimension}><th scope="row" style={{ textAlign: "left", fontWeight: 400 }}>{words(row.dimension)}</th><td>{scoreText(row.value)}</td><td>{words(row.status)}</td></tr>)}</tbody>
      </table></div>}
      {inspector.storedEvidence.length > 0 && <p>Stored reasons: {inspector.storedEvidence.join(" · ")}</p>}
      {inspector.missingData.length > 0 && <p>Missing or limited: {inspector.missingData.map(words).join(" · ")}</p>}
      {inspector.alternativeCount > 0 && <div style={{ marginTop: 8 }}>
        <strong>Alternatives ({inspector.alternativeCount})</strong>
        <ul style={{ paddingLeft: 20 }}>{inspector.alternatives.slice(0, 8).map((row, index) => <li key={`${row.mediaId}:${index}`}>
          {row.posterUri && <img src={row.posterUri} alt={`Stored thumbnail for ${row.title || row.mediaId}`} loading="lazy" decoding="async" width="96" height="54" style={{objectFit:"cover",display:"block",marginTop:6}}/>}
          {row.title || row.mediaId} · {inspector.scoreLabel.toLowerCase()}: {scoreText(row.utility)}
          {row.evidence.length > 0 && <div>{row.evidence.join(" · ")}</div>}
          <button type="button" disabled={!onReview || pending} style={buttonStyle} onClick={() => submit({ inspector, action: "replace", targetMediaId: row.mediaId, rationale: "Preferred stored alternative from shot inspector." })}>Record preference</button>
        </li>)}</ul>
        {inspector.alternativeCount > Math.min(8, inspector.alternatives.length) && <div>Showing {Math.min(8, inspector.alternatives.length)} of {inspector.alternativeCount} alternatives.</div>}
      </div>}
      {inspector.rejected.length > 0 && <details style={{ marginTop: 8 }}><summary>Rejected candidates ({inspector.rejectedCount})</summary>
        <ul style={{ paddingLeft: 20 }}>{inspector.rejected.map((row, index) => <li key={`${row.mediaId}:${index}`}>{row.mediaId}: {row.reasons.map(words).join(", ")}</li>)}</ul>
        {inspector.rejectedCount > inspector.rejected.length && <div>Showing {inspector.rejected.length} stored examples.</div>}
      </details>}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" disabled={!onReview || pending} style={buttonStyle} aria-pressed={pinned} onClick={() => submit({ inspector, action: pinned ? "unpin" : "pin", targetMediaId: inspector.selectedMedia.id, rationale: pinned ? "Released the media lock for this shot." : "Pinned current media for this shot." })}>{pinned ? "Unpin this shot" : "Pin this shot"}</button>
        <button type="button" disabled={!onReview || pending || !inspector.selectedMedia.id || inspector.selectedMedia.id === "none"} style={buttonStyle} aria-pressed={excluded} title="Excludes this media from future recuts of this shot." onClick={() => submit({ inspector, action: excluded ? "unban" : "ban", targetMediaId: inspector.selectedMedia.id, rationale: excluded ? "Removed the current-media exclusion for this shot." : "Excluded current media from future recuts of this shot." })}>{excluded ? "Remove exclusion" : "Exclude here"}</button>
      </div>
      {exclusions.length > 0 && <details><summary>Sources excluded from this shot ({exclusions.length})</summary>
        <ul style={{paddingLeft:20}}>{exclusions.map(id=><li key={id}>{mediaTitles[id] || id} <button type="button" style={buttonStyle} disabled={!onReview || pending} onClick={()=>submit({inspector,action:"unban",targetMediaId:id,rationale:"Removed a stored exclusion for this shot."})}>Remove this exclusion</button></li>)}</ul>
      </details>}
      {excluded && <p>Exclusion applies to this shot. Replace its current footage before saving.</p>}
      {feedback?.shotId === inspector.shotId && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
    </div>
  </details>;
}
