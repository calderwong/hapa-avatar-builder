import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Copy, Image as ImageIcon, Layers3, Pause, Play, X } from "lucide-react";
import "../echo-reference-image-prompts.css";

export default function EchoReferenceImagePromptReview({ apiBase = "", songId = "", prompts = [], onNotice = () => {} }) {
  const [run, setRun] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [intelligenceBusy, setIntelligenceBusy] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/echos/reference-image-generation`, { cache: "no-store" });
        const payload = await response.json();
        if (alive && response.ok) setRun(payload);
        if (alive && ["queued", "running"].includes(payload.state)) timer = setTimeout(load, 4000);
      } catch {
        if (alive) setRun(null);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [apiBase]);

  useEffect(() => {
    let alive = true;
    let timer;
    const bridge = window.hapaEchoReferenceIntelligence;
    if (!bridge?.status) return () => {};
    const load = async () => {
      try {
        const payload = await bridge.status({ songId });
        if (alive) setIntelligence(payload);
        if (alive && ["queued", "running"].includes(payload.state)) timer = setTimeout(load, 5000);
      } catch (error) {
        if (alive) setIntelligenceError(error.message || String(error));
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [songId]);

  const jobByPrompt = useMemo(() => new Map((run?.jobs || []).map((job) => [job.promptId, job])), [run]);
  const songJobs = (run?.jobs || []).filter((job) => job.songId === songId);
  const completed = (run?.jobs || []).filter((job) => job.hasOutput);

  async function copyPrompt(prompt) {
    await navigator.clipboard.writeText(prompt);
    onNotice("Reference-image prompt copied.");
  }

  async function runIntelligence(action) {
    const bridge = window.hapaEchoReferenceIntelligence;
    if (!bridge?.[action]) return;
    setIntelligenceBusy(true);
    setIntelligenceError("");
    try {
      const payload = await bridge[action]();
      if (payload?.ok === false) throw new Error(payload.message || "The intelligence operation failed.");
      setIntelligence(await bridge.status({ songId }));
      onNotice(action === "startPilot" ? "Eight-song intelligence pilot started." : action === "continueFull" ? "Full Echo intelligence pass started." : action === "pause" ? "Pause requested after current reasoning calls." : action === "audit" ? "Album-wide distinctiveness assessment complete." : action === "resumeLocal" ? "Missing prompt work resumed on the local Qwen model." : "Echo intelligence pass resumed.");
    } catch (error) {
      setIntelligenceError(error.message || String(error));
    } finally { setIntelligenceBusy(false); }
  }

  const intelligenceJob = intelligence?.jobs?.[0];
  const intelligencePlan = intelligenceJob?.plan;
  const concepts = (intelligencePlan?.connections || []).flatMap((connection) => (connection.concepts || []).map((concept) => ({ ...concept, connection })));

  return <section className="echo-reference-prompt-review" aria-label="Echo Reference Atlas image prompts">
    <header>
      <div><ImageIcon size={15} /><span><small>GPT Image 2.5 · Reference Atlas</small><strong>{prompts.length} staged visual {prompts.length === 1 ? "prompt" : "prompts"}</strong></span></div>
      <button type="button" onClick={() => setGalleryOpen(true)} disabled={!completed.length}><Layers3 size={13} /> Album gallery {completed.length}/{run?.counts?.total || prompts.length}</button>
    </header>
    {run?.runId && <p className="echo-reference-run-line"><CheckCircle2 size={12} /> {run.state} · {run.model} · {run.counts?.completed || 0}/{run.counts?.total || 0} complete · ${Number(run.usage?.estimatedCostUsd || 0).toFixed(2)} estimated</p>}
    {window.hapaEchoReferenceIntelligence && <section className="echo-reference-intelligence" aria-label="LLM-authored Echo visual intelligence">
      <header>
        <div><BrainCircuit size={16} /><span><small>Reasoning-authored foundations</small><strong>{intelligence?.counts?.concepts || 0} retained concepts · {intelligence?.counts?.ready || 0} API-ready</strong></span></div>
        <div className="echo-reference-intelligence-actions">
          {intelligence?.state === "not-started" && <button type="button" disabled={intelligenceBusy} onClick={() => void runIntelligence("startPilot")}><Play size={12} /> Author 8-song pilot</button>}
          {String(intelligence?.state || "").startsWith("pilot-complete") && <button type="button" disabled={intelligenceBusy} onClick={() => void runIntelligence("continueFull")}><Play size={12} /> Author full album</button>}
          {["queued", "running"].includes(intelligence?.state) && <button type="button" disabled={intelligenceBusy} onClick={() => void runIntelligence("pause")}><Pause size={12} /> Pause after current</button>}
          {["paused", "complete-with-errors", "pilot-complete-with-errors"].includes(intelligence?.state) && <button type="button" disabled={intelligenceBusy} onClick={() => void runIntelligence("resumeLocal")}><Play size={12} /> Resume missing prompts locally</button>}
          {["complete", "complete-with-errors"].includes(intelligence?.state) && !intelligence?.corpusQualityAssessedAt && <button type="button" disabled={intelligenceBusy} onClick={() => void runIntelligence("audit")}><CheckCircle2 size={12} /> Assess album distinctiveness</button>}
        </div>
      </header>
      {intelligence?.runId && <p className="echo-reference-run-line"><BrainCircuit size={12} /> {intelligence.state} · {intelligence.authoringProvider || "openai"} · {intelligence.model} / {intelligence.reasoningEffort} · {intelligence.counts?.completed || 0}/{intelligence.counts?.songs || 0} songs · {intelligence.counts?.missingConnections || 0}/{intelligence.counts?.sourceConnections || 0} source opportunities missing · {Number(intelligence.counts?.averageQuality || 0).toFixed(2)}/5 average</p>}
      {intelligenceError && <p className="echo-ref-warning"><AlertTriangle size={12} /> {intelligenceError}</p>}
      {intelligenceJob?.status === "running" && <p className="echo-ref-empty">This song’s foundations are being authored now.</p>}
      {intelligenceJob?.status === "held" && <p className="echo-ref-empty">This song is staged behind the completed quality pilot.</p>}
      {intelligenceJob?.error && <p className="echo-ref-warning">{intelligenceJob.error}</p>}
      {intelligencePlan?.songFoundation && <details className="echo-intelligence-foundation" open>
        <summary>Song foundation and recognition test</summary>
        <dl>
          <div><dt>Literal situation</dt><dd>{intelligencePlan.songFoundation.literalSituation}</dd></div>
          <div><dt>Emotional movement</dt><dd>{intelligencePlan.songFoundation.emotionalMovement}</dd></div>
          <div><dt>Lesson</dt><dd>{intelligencePlan.songFoundation.lessonSynthesis}</dd></div>
          <div><dt>Tarot transformation</dt><dd>{intelligencePlan.songFoundation.tarotSynthesis}</dd></div>
          <div><dt>Recognition test</dt><dd>{intelligencePlan.songFoundation.recognitionTest}</dd></div>
        </dl>
      </details>}
      {!!concepts.length && <div className="echo-intelligence-concepts">
        {concepts.map((concept) => <article key={concept.id} className={concept.qualityAssessment?.ready ? "ready" : "needs-revision"}>
          <span>{concept.connection.referenceId || "Lyric only"} · {concept.qualityAssessment?.ready ? <><CheckCircle2 size={11} /> Ready for image API</> : <><AlertTriangle size={11} /> Needs revision</>}</span>
          <h5>{concept.title}</h5>
          <p className="echo-intelligence-hook">{concept.memoryHook}</p>
          <p>{concept.foundationRationale}</p>
          <small>Quality {Number(concept.qualityAssessment?.average || 0).toFixed(2)}/5 · {(concept.retrievalTags || []).join(" · ")}</small>
          <details><summary>Meaning chain, symbols, assessment, and production prompt</summary>
            <dl>
              <div><dt>Lyric</dt><dd>{concept.lyricMechanic}</dd></div>
              <div><dt>Reference</dt><dd>{concept.referenceMechanic}</dd></div>
              <div><dt>Lesson</dt><dd>{concept.lessonMechanic}</dd></div>
              <div><dt>Tarot</dt><dd>{concept.tarotMechanic}</dd></div>
            </dl>
            <ul>{(concept.symbols || []).map((symbol, index) => <li key={`${concept.id}-symbol-${index}`}><b>{symbol.symbol}</b> — {symbol.meaning} · {symbol.placement}</li>)}</ul>
            {!!concept.qualityAssessment?.gateReasons?.length && <p className="echo-ref-warning">{concept.qualityAssessment.gateReasons.join(" · ")}</p>}
            {concept.corpusAssessment?.nearestSongTitle && <p>Nearest album concept: {concept.corpusAssessment.nearestSongTitle} · similarity {Number(concept.corpusAssessment.nearestSimilarity || 0).toFixed(2)}</p>}
            <pre>{concept.imagePrompt}</pre>
          </details>
          <button type="button" onClick={() => void copyPrompt(concept.imagePrompt)}><Copy size={11} /> Copy intelligent prompt</button>
        </article>)}
      </div>}
    </section>}
    <div className="echo-reference-prompt-grid">
      {prompts.map((item) => {
        const job = jobByPrompt.get(item.id);
        return <article key={item.id}>
          {job?.hasOutput && <button type="button" className="echo-reference-generated-preview" onClick={() => window.open(`${apiBase}${job.outputHref}`, "_blank", "noopener,noreferrer")}><img src={`${apiBase}${job.outputHref}`} alt={`${item.songTitle} ${item.referenceTitle} generated reference`} loading="lazy" /></button>}
          <span>{item.referenceId || "Lyric only"} · evidence {item.evidenceClass}</span>
          <h5>{item.referenceTitle}</h5>
          <p>{item.theme}</p>
          <small>{item.symbols}</small>
          <details>
            <summary>Review full prompt</summary>
            <pre>{item.generationPrompt || item.prompt}</pre>
          </details>
          <footer><em>{job?.status || item.generationStatus} · {item.author?.name || "OpenAI Codex"} · {new Date(item.authoredAt).toLocaleString()}</em><button type="button" onClick={() => void copyPrompt(item.generationPrompt || item.prompt)}><Copy size={11} /> Copy</button></footer>
          {job?.error && <p className="echo-ref-warning">{job.error}</p>}
        </article>;
      })}
    </div>
    {galleryOpen && <div className="echo-reference-album-gallery" role="dialog" aria-modal="true" aria-label="All generated Echo research images">
      <header><div><small>Echo Album · OpenAI GPT Image</small><h3>Research image gallery</h3><p>{completed.length} generated of {run?.counts?.total || 0} staged visual connections.</p></div><button type="button" onClick={() => setGalleryOpen(false)} aria-label="Close album gallery"><X size={18} /></button></header>
      <main>{completed.map((job) => <article key={job.id}><button type="button" onClick={() => window.open(`${apiBase}${job.outputHref}`, "_blank", "noopener,noreferrer")}><img src={`${apiBase}${job.outputHref}`} alt={`${job.songTitle} ${job.referenceTitle}`} loading="lazy" /></button><span>#{job.trackNumber} · {job.referenceId || "lyric-only"}</span><strong>{job.songTitle}</strong><p>{job.referenceTitle}</p></article>)}</main>
    </div>}
  </section>;
}
