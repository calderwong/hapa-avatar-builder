import { useCallback, useEffect, useMemo, useState } from "react";
import { BookHeart, ExternalLink, Film, Image as ImageIcon, LayoutDashboard, Lightbulb, Link2, Pencil, Plus, Quote, Save, Sparkles, Users } from "lucide-react";
import {
  attachAvatarToSong,
  attachCardToSong,
  detachAvatarFromSong,
} from "../domain/song.js";
import { addSongKnowledgeEntry, markSongResearchReference } from "../domain/song-knowledge.js";
import EchoTarotGenerationMonitor from "./EchoTarotGenerationMonitor.jsx";
import EchoTarotImagePromptReview from "./EchoTarotImagePromptReview.jsx";
import EchoReferenceImagePromptReview from "./EchoReferenceImagePromptReview.jsx";

function mediaUri(apiBase, uri = "") {
  if (!uri || /^(data:|blob:|https?:)/.test(uri)) return uri;
  if (uri.startsWith("/media/") || uri.startsWith("/api/")) return `${apiBase}${uri}`;
  if (uri.startsWith("/Users/")) return `${apiBase}/api/local-file?path=${encodeURIComponent(uri)}`;
  return uri;
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("The media file could not be read."));
    reader.readAsDataURL(file);
  });
}

function EntryList({ title, entries = [], onEdit = null }) {
  return (
    <section className="echo-notebook-entry-list">
      <h5>{title} <span>{entries.length}</span></h5>
      {entries.map((entry) => (
        <article key={entry.id}>
          <p>{entry.body}</p>
          {entry.futureUse && <small>Future use: {entry.futureUse}</small>}
          {entry.relatedFeature && <small>Connect later: {entry.relatedFeature}</small>}
          <em>{entry.authorName || entry.authorType} · {entry.createdAt || "saved"}</em>
          {onEdit && <button type="button" className="echo-notebook-edit" onClick={() => onEdit(entry)}><Pencil size={11} /> Edit</button>}
        </article>
      ))}
      {!entries.length && <p className="echo-ref-empty">Nothing recorded yet.</p>}
    </section>
  );
}

export default function EchoSongNotebook({ apiBase = "", songId = "", onNotice = () => {} }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [entry, setEntry] = useState({ kind: "note", body: "", futureUse: "", relatedFeature: "" });
  const [reference, setReference] = useState({ label: "", url: "", notes: "" });
  const [anchorNotes, setAnchorNotes] = useState("");
  const [cardDraft, setCardDraft] = useState({ cardId: "", logic: "" });
  const [view, setView] = useState("overview");

  const load = useCallback(async () => {
    if (!songId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/echos/song-notebook?songId=${encodeURIComponent(songId)}`, { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.message || next.error || `Song notebook failed to load (${response.status}).`);
      setPayload(next);
    } catch (loadError) {
      setError(loadError.message || String(loadError));
    } finally {
      setLoading(false);
    }
  }, [apiBase, songId]);

  useEffect(() => { void load(); }, [load]);

  const commitSong = useCallback(async (nextSong, message) => {
    if (!nextSong?.id) return;
    setSaving(true);
    setError("");
    setPayload((current) => current ? { ...current, song: nextSong } : current);
    try {
      const response = await fetch(`${apiBase}/api/hapa-songs/${encodeURIComponent(nextSong.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSong),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.message || saved.error || `Song notebook save failed (${response.status}).`);
      setPayload((current) => current ? { ...current, song: saved } : current);
      onNotice(message);
    } catch (saveError) {
      setError(saveError.message || String(saveError));
      await load();
    } finally {
      setSaving(false);
    }
  }, [apiBase, load, onNotice]);

  const song = payload?.song || null;
  const knowledge = song?.knowledge || { understandings: [], notes: [], anecdotes: [], lessons: [], tarotRationales: [], researchReferences: [], songConnections: [], referenceImagePrompts: [], passProvenance: [] };
  const linkedAvatarIds = useMemo(() => new Set((song?.attachments?.avatarLinks || []).map((link) => link.avatarId)), [song?.attachments?.avatarLinks]);
  const manualTarotLinks = (song?.attachments?.cardLinks || []).filter((link) => link.role === "tarot-song-correspondence");
  const creativeAnchors = (song?.media || []).filter((asset) => asset.creativeAnchor || asset.role === "creative-visual-anchor");
  const tarotImagePrompts = payload?.tarotImagePrompts || [];

  function submitEntry(event) {
    event.preventDefault();
    if (!song || !entry.body.trim()) return;
    const next = addSongKnowledgeEntry(song, entry.kind, {
      id: entry.id,
      body: entry.body,
      futureUse: entry.futureUse,
      relatedFeature: entry.relatedFeature,
      authorName: "Hapa operator",
      tags: ["echo-album", entry.kind],
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString(),
    });
    void commitSong(next, `${entry.kind === "lesson" ? "Lesson" : entry.kind === "anecdote" ? "Anecdote" : entry.kind === "understanding" ? "Understanding" : "Note"} saved for ${song.title}.`);
    setEntry({ kind: entry.kind, body: "", futureUse: "", relatedFeature: "" });
  }

  function submitReference(event) {
    event.preventDefault();
    if (!song || (!reference.label.trim() && !reference.url.trim())) return;
    const next = markSongResearchReference(song, {
      ...reference,
      tags: ["echo-album", "future-research"],
    });
    void commitSong(next, `Research reference marked for ${song.title}.`);
    setReference({ label: "", url: "", notes: "" });
  }

  function editEntry(item) {
    setEntry({
      id: item.id,
      createdAt: item.createdAt,
      kind: item.kind || "note",
      body: item.body || "",
      futureUse: item.futureUse || "",
      relatedFeature: item.relatedFeature || "",
    });
    setView("notes");
  }

  function editReference(item) {
    setReference({
      id: item.id,
      createdAt: item.createdAt,
      label: item.label || "",
      url: item.url || "",
      notes: item.notes || "",
    });
    setView("references");
  }

  function toggleAvatar(avatar) {
    if (!song) return;
    const next = linkedAvatarIds.has(avatar.id)
      ? detachAvatarFromSong(song, avatar.id)
      : attachAvatarToSong(song, avatar, { role: "echo-album-character", reason: "Selected as a character for this song's future story, image, and video work." });
    void commitSong(next, `${avatar.name} ${linkedAvatarIds.has(avatar.id) ? "removed from" : "added to"} ${song.title}.`);
  }

  function submitCard(event) {
    event.preventDefault();
    if (!song || !cardDraft.cardId || !cardDraft.logic.trim()) return;
    const card = payload.availableCards?.find((item) => item.id === cardDraft.cardId);
    if (!card) return;
    const next = attachCardToSong(song, card, {
      role: "tarot-song-correspondence",
      reason: cardDraft.logic.trim(),
      contextReason: cardDraft.logic.trim(),
      tags: ["echo-album", "tarot", "human-authored-logic", card.source?.editionId ? "echo-tarot-edition" : "avatar-builder-tarot-library"],
    });
    void commitSong(next, `${card.title} connected to ${song.title} with human-authored logic.`);
    setCardDraft({ cardId: "", logic: "" });
  }

  async function uploadAnchor(file) {
    if (!song || !file) return;
    setSaving(true);
    setError("");
    try {
      const dataUrl = await fileDataUrl(file);
      const response = await fetch(`${apiBase}/api/hapa-songs/${encodeURIComponent(song.id)}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `echo-anchor-${Date.now().toString(36)}-${file.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          name: file.name,
          mimeType: file.type,
          dataUrl,
          role: "creative-visual-anchor",
          options: {
            role: "creative-visual-anchor",
            tags: ["echo-album", "creative-anchor", file.type.startsWith("video/") ? "video" : "image"],
            notes: anchorNotes,
            creativeAnchor: {
              toneNotes: anchorNotes,
              intendedUse: "future-generative-direction",
              tags: ["tone-anchor", "human-selected"],
              markedBy: "Hapa operator",
            },
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || `Creative anchor upload failed (${response.status}).`);
      setPayload((current) => current ? { ...current, song: result.song } : current);
      setAnchorNotes("");
      onNotice(`Creative anchor attached to ${song.title}.`);
    } catch (uploadError) {
      setError(uploadError.message || String(uploadError));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !payload) return <section className="echo-song-notebook"><p>Loading the song notebook…</p></section>;
  if (!song) return <section className="echo-song-notebook"><p className="echo-ref-warning">{error || "This song does not have a stored Song Card yet."}</p></section>;

  return (
    <section className="echo-song-notebook" aria-label={`Song notes and creative anchors for ${song.title}`}>
      <header>
        <div><p>Durable Song Card context</p><h4><BookHeart size={17} /> {song.title} notebook</h4></div>
        <span><Save size={13} /> {saving ? "Saving…" : "Available to future humans and agents"}</span>
      </header>
      {knowledge.passProvenance?.[0] && <aside className="echo-reference-run-line"><Sparkles size={12} /> Agent research pass: {knowledge.passProvenance[0].authorName} · {new Date(knowledge.passProvenance[0].authoredAt).toLocaleString()} · {knowledge.passProvenance[0].authority}</aside>}
      {error && <p className="echo-ref-feedback error" role="alert">{error}</p>}

      <nav className="echo-notebook-tabs" aria-label={`${song.title} notebook sections`}>
        {[
          ["overview", "At a glance", LayoutDashboard],
          ["references", `Research ${(knowledge.understandings || []).length + (knowledge.researchReferences || []).length}`, Link2],
          ["notes", `Notes & lessons ${(knowledge.notes || []).length + (knowledge.anecdotes || []).length + (knowledge.lessons || []).length}`, BookHeart],
          ["tarot", `Tarot logic ${(payload.tarotConnections || []).length + manualTarotLinks.length}`, Sparkles],
          ["anchors", `Anchors & cast ${creativeAnchors.length + linkedAvatarIds.size}`, ImageIcon],
        ].map(([id, label, Icon]) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={13} /> {label}</button>)}
      </nav>

      {view === "overview" && <div className="echo-notebook-overview">
        <section>
          <span><Link2 size={14} /> Research understanding</span>
          <b>{(knowledge.understandings || []).length}</b>
          <p>{knowledge.understandings?.[0]?.body || knowledge.researchReferences?.[0]?.notes || "No research understanding has been recorded yet."}</p>
          <button type="button" onClick={() => setView("references")}>{knowledge.researchReferences?.length ? "Review and update" : "Add a reference"}</button>
        </section>
        <section>
          <span><Quote size={14} /> Notes & anecdotes</span>
          <b>{(knowledge.notes || []).length + (knowledge.anecdotes || []).length}</b>
          <p>{knowledge.notes?.[0]?.body || knowledge.anecdotes?.[0]?.body || "Add what a future human or agent should know about the song."}</p>
          <button type="button" onClick={() => setView("notes")}>Open understanding</button>
        </section>
        <section>
          <span><Lightbulb size={14} /> Lessons</span>
          <b>{(knowledge.lessons || []).length}</b>
          <p>{knowledge.lessons?.[0]?.body || "Record what this song is trying to teach and how it should guide future work."}</p>
          <button type="button" onClick={() => setView("notes")}>Add or update lesson</button>
        </section>
        <section>
          <span><Sparkles size={14} /> Tarot rationale</span>
          <b>{(payload.tarotConnections || []).length + manualTarotLinks.length}</b>
          <p>{knowledge.tarotRationales?.[0]?.body || payload.tarotConnections?.[0]?.logic || manualTarotLinks[0]?.reason || "No Tarot pairing is currently explained for this song."}</p>
          <button type="button" onClick={() => setView("tarot")}>See cards and logic</button>
        </section>
      </div>}

      {view === "references" && <div className="echo-song-notebook-grid">
        <form onSubmit={submitReference}>
          <h5><Link2 size={13} /> Mark for future research</h5>
          <p>Name the actual work, person, place, symbol, or URL—then explain why it matters.</p>
          <input value={reference.label} onChange={(event) => setReference((current) => ({ ...current, label: event.target.value }))} placeholder="Reference, work, person, place, or source" />
          <input type="url" value={reference.url} onChange={(event) => setReference((current) => ({ ...current, url: event.target.value }))} placeholder="https://… (optional)" />
          <textarea rows="4" value={reference.notes} onChange={(event) => setReference((current) => ({ ...current, notes: event.target.value }))} placeholder="What is the connection? What should a future researcher verify or carry forward?" />
          <button type="submit" disabled={saving || (!reference.label.trim() && !reference.url.trim())}>{reference.id ? <Save size={13} /> : <Plus size={13} />} {reference.id ? "Save reference changes" : "Mark reference"}</button>
          {reference.id && <button type="button" onClick={() => setReference({ label: "", url: "", notes: "" })}>Cancel edit</button>}
        </form>
        <section className="echo-notebook-reference-list">
          <h5>Actual references and research logic</h5>
          {(knowledge.researchReferences || []).map((item) => (
            <article key={item.id}>
              <strong>{item.label || item.url}</strong>
              <p>{item.notes || "No rationale has been recorded yet."}</p>
              {item.url && <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /> Open source</a>}
              <em>{item.status}</em>
              <button type="button" className="echo-notebook-edit" onClick={() => editReference(item)}><Pencil size={11} /> Edit reference and logic</button>
            </article>
          ))}
          {!knowledge.researchReferences?.length && <p className="echo-ref-empty">No human-marked research references yet.</p>}
        </section>
        <EntryList title="Research understandings" entries={knowledge.understandings} onEdit={editEntry} />
        <section className="echo-notebook-reference-list">
          <h5>Searchable song connections</h5>
          {(knowledge.songConnections || []).map((item) => <article key={item.id}><strong>#{item.trackNumber} · {item.songTitle}</strong><p>{item.reason}</p><em>{(item.relationTypes || []).join(" · ")}</em></article>)}
          {!knowledge.songConnections?.length && <p className="echo-ref-empty">No cross-song research connections recorded yet.</p>}
        </section>
        <EchoReferenceImagePromptReview apiBase={apiBase} songId={song.id} prompts={knowledge.referenceImagePrompts || []} onNotice={onNotice} />
      </div>}

      {view === "notes" && <>
        <div className="echo-song-notebook-grid">
          <form onSubmit={submitEntry}>
            <h5>Notes, anecdotes & lessons</h5>
            <select value={entry.kind} disabled={Boolean(entry.id)} onChange={(event) => setEntry((current) => ({ ...current, kind: event.target.value }))}>
              <option value="understanding">Research understanding</option>
              <option value="note">Free-text note</option>
              <option value="anecdote">Anecdote</option>
              <option value="lesson">Lesson / teaching</option>
            </select>
            <textarea required rows="5" value={entry.body} onChange={(event) => setEntry((current) => ({ ...current, body: event.target.value }))} placeholder="Record anything a future human or agent should understand about this song." />
            {entry.kind === "lesson" && <>
              <input value={entry.futureUse} onChange={(event) => setEntry((current) => ({ ...current, futureUse: event.target.value }))} placeholder="How should this lesson guide future content?" />
              <input value={entry.relatedFeature} onChange={(event) => setEntry((current) => ({ ...current, relatedFeature: event.target.value }))} placeholder="Future feature, mechanic, or content connection" />
            </>}
            <button type="submit" disabled={saving || !entry.body.trim()}>{entry.id ? <Save size={13} /> : <Plus size={13} />} {entry.id ? "Save changes" : `Add ${entry.kind}`}</button>
            {entry.id && <button type="button" onClick={() => setEntry({ kind: entry.kind, body: "", futureUse: "", relatedFeature: "" })}>Cancel edit</button>}
          </form>
          <section className="echo-notebook-understanding-guide">
            <h5><Lightbulb size={13} /> What future readers receive</h5>
            <p><b>Understandings</b> separate evidence from interpretation. <b>Notes</b> hold open-ended context. <b>Anecdotes</b> preserve lived stories or clearly labeled questions. <b>Lessons</b> carry an intended teaching plus its future use and feature connection.</p>
          </section>
        </div>
        <div className="echo-song-notebook-grid echo-notebook-history">
          <EntryList title="Notes" entries={knowledge.notes} onEdit={editEntry} />
          <EntryList title="Anecdotes" entries={knowledge.anecdotes} onEdit={editEntry} />
          <EntryList title="Lessons" entries={knowledge.lessons} onEdit={editEntry} />
        </div>
      </>}

      {view === "anchors" && <div className="echo-song-notebook-grid">
        <section>
          <h5><Users size={13} /> Characters from the Hapa avatar pool</h5>
          <p>Select the cast slots future generation should consider for this song.</p>
          <div className="echo-notebook-avatar-grid">
            {(payload.avatars || []).map((avatar) => <button key={avatar.id} type="button" className={linkedAvatarIds.has(avatar.id) ? "active" : ""} onClick={() => toggleAvatar(avatar)}><b>{avatar.name}</b><small>{linkedAvatarIds.has(avatar.id) ? "Added" : "Add"}</small></button>)}
          </div>
        </section>
        <section>
          <h5><ImageIcon size={13} /> Creative / visual anchors</h5>
          <textarea rows="3" value={anchorNotes} onChange={(event) => setAnchorNotes(event.target.value)} placeholder="What tone, composition, palette, motion, or feeling should future generation preserve?" />
          <label className="echo-notebook-upload"><Film size={13} /> Attach image still or video<input type="file" accept="image/*,video/*" onChange={(event) => { void uploadAnchor(event.target.files?.[0]); event.target.value = ""; }} /></label>
          <div className="echo-notebook-anchor-grid">
            {creativeAnchors.map((asset) => <article key={asset.id}>{asset.type === "video" ? <video src={mediaUri(apiBase, asset.uri)} controls preload="metadata" /> : <img src={mediaUri(apiBase, asset.uri)} alt={asset.name} loading="lazy" />}<strong>{asset.name}</strong><p>{asset.creativeAnchor?.toneNotes || asset.notes}</p></article>)}
          </div>
        </section>
      </div>}

      {view === "tarot" && <section className="echo-notebook-tarot">
        <header><div><h5><Sparkles size={13} /> Tarot ↔ song logic</h5><p>The attached Echoes from Other Eras mapping and later agent/human additions remain reviewable proposals, never silent canon.</p></div><span>{payload.tarotConnections?.length || 0} supplied · {manualTarotLinks.length} later additions</span></header>
        <EntryList title="Agent-authored Tarot rationale" entries={knowledge.tarotRationales} />
        <aside className="echo-tarot-prompt-summary">
          <div><ImageIcon size={14} /><strong>GPT Image 2.5 Sunburst prompt review</strong></div>
          <p>Prompt v2 gives every Tarot Card + Song pairing three scene-first drafts—Hapa Main Man, Hapa Main Woman, and both as a couple—plus a visual thesis and human review checklist. Review or copy them here before any future image-generation run.</p>
          <span>{tarotImagePrompts.length} pairings · {tarotImagePrompts.reduce((total, set) => total + (set.variants?.length || 0), 0)} prompt variations</span>
        </aside>
        <EchoTarotGenerationMonitor songId={song.id} onNotice={onNotice} />
        <div className="echo-notebook-tarot-grid">
          {(payload.tarotConnections || []).map((connection) => {
            const promptSet = tarotImagePrompts.find((set) => set.sourceConnectionIds?.includes(connection.id) || set.cardId === connection.cardId);
            return <article key={connection.id}><span>{connection.editionCardId} · {connection.arcana}</span><h5>{connection.cardTitle}</h5><strong>{connection.role}</strong><p>{connection.logic}</p><details open><summary>Evidence and interpretive logic</summary>{connection.evidence.map((item, index) => <blockquote key={`${connection.id}:evidence:${index}`}>“{item.excerpt}” <small>{item.source_id} line {item.line}</small></blockquote>)}<p>{connection.thematicSynthesis}</p>{connection.interpretiveGuardrail && <em>{connection.interpretiveGuardrail}</em>}</details>{promptSet && <EchoTarotImagePromptReview promptSet={promptSet} onNotice={onNotice} />}</article>;
          })}
          {manualTarotLinks.map((link) => {
            const alreadySupplied = (payload.tarotConnections || []).some((connection) => connection.cardId === link.cardId);
            const promptSet = tarotImagePrompts.find((set) => set.cardId === link.cardId);
            const agentAuthored = link.tags?.includes("agent-authored-logic");
            return <article key={link.cardId} data-human={!agentAuthored}><span>{agentAuthored ? "OpenAI Codex proposal" : "Human-added connection"}</span><h5>{link.cardTitle}</h5><p>{link.reason}</p><button type="button" className="echo-notebook-edit" onClick={() => setCardDraft({ cardId: link.cardId, logic: link.reason || "" })}><Pencil size={11} /> Edit rationale</button>{promptSet && !alreadySupplied && <EchoTarotImagePromptReview promptSet={promptSet} onNotice={onNotice} />}</article>;
          })}
        </div>
        <form onSubmit={submitCard}>
          <h5>{manualTarotLinks.some((link) => link.cardId === cardDraft.cardId) ? "Update a human Tarot rationale" : "Add a Tarot Card with logic"}</h5>
          <select required value={cardDraft.cardId} onChange={(event) => setCardDraft((current) => ({ ...current, cardId: event.target.value }))}><option value="">Choose a Tarot Card…</option>{(payload.availableCards || []).map((card) => <option key={card.id} value={card.id}>{card.title} · {card.source?.editionId ? "Echoes edition" : "Builder library"}</option>)}</select>
          <textarea required rows="4" value={cardDraft.logic} onChange={(event) => setCardDraft((current) => ({ ...current, logic: event.target.value }))} placeholder="Why does this card belong with this song? Record the human logic future agents must preserve." />
          <button type="submit" disabled={saving || !cardDraft.cardId || !cardDraft.logic.trim()}>{manualTarotLinks.some((link) => link.cardId === cardDraft.cardId) ? <Save size={13} /> : <Plus size={13} />} {manualTarotLinks.some((link) => link.cardId === cardDraft.cardId) ? "Save card rationale" : "Add card with logic"}</button>
        </form>
      </section>}
      <footer>Stored on the normalized Song Card. Marked URLs are research leads, media anchors are direction context, and tarot mappings retain their source status and logic.</footer>
    </section>
  );
}
