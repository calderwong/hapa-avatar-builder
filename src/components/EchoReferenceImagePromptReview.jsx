import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Image as ImageIcon, Layers3, X } from "lucide-react";
import "../echo-reference-image-prompts.css";

export default function EchoReferenceImagePromptReview({ apiBase = "", songId = "", prompts = [], onNotice = () => {} }) {
  const [run, setRun] = useState(null);
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

  const jobByPrompt = useMemo(() => new Map((run?.jobs || []).map((job) => [job.promptId, job])), [run]);
  const songJobs = (run?.jobs || []).filter((job) => job.songId === songId);
  const completed = (run?.jobs || []).filter((job) => job.hasOutput);

  async function copyPrompt(prompt) {
    await navigator.clipboard.writeText(prompt);
    onNotice("Reference-image prompt copied.");
  }

  return <section className="echo-reference-prompt-review" aria-label="Echo Reference Atlas image prompts">
    <header>
      <div><ImageIcon size={15} /><span><small>GPT Image 2.5 · Reference Atlas</small><strong>{prompts.length} staged visual {prompts.length === 1 ? "prompt" : "prompts"}</strong></span></div>
      <button type="button" onClick={() => setGalleryOpen(true)} disabled={!completed.length}><Layers3 size={13} /> Album gallery {completed.length}/{run?.counts?.total || prompts.length}</button>
    </header>
    {run?.runId && <p className="echo-reference-run-line"><CheckCircle2 size={12} /> {run.state} · {run.model} · {run.counts?.completed || 0}/{run.counts?.total || 0} complete · ${Number(run.usage?.estimatedCostUsd || 0).toFixed(2)} estimated</p>}
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
