import { useCallback, useEffect, useMemo, useState } from "react";
import { BookHeart, ExternalLink, Film, Image as ImageIcon, Link2, Plus, Save, Sparkles, Users } from "lucide-react";
import {
  attachAvatarToSong,
  attachCardToSong,
  detachAvatarFromSong,
} from "../domain/song.js";
import { addSongKnowledgeEntry, markSongResearchReference } from "../domain/song-knowledge.js";

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

function EntryList({ title, entries = [] }) {
  return (
    <section className="echo-notebook-entry-list">
      <h5>{title} <span>{entries.length}</span></h5>
      {entries.map((entry) => (
        <article key={entry.id}>
          <p>{entry.body}</p>
          {entry.futureUse && <small>Future use: {entry.futureUse}</small>}
          {entry.relatedFeature && <small>Connect later: {entry.relatedFeature}</small>}
          <em>{entry.authorName || entry.authorType} · {entry.createdAt || "saved"}</em>
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
  const knowledge = song?.knowledge || { notes: [], anecdotes: [], lessons: [], researchReferences: [] };
  const linkedAvatarIds = useMemo(() => new Set((song?.attachments?.avatarLinks || []).map((link) => link.avatarId)), [song?.attachments?.avatarLinks]);
  const manualTarotLinks = (song?.attachments?.cardLinks || []).filter((link) => link.role === "tarot-song-correspondence");
  const creativeAnchors = (song?.media || []).filter((asset) => asset.creativeAnchor || asset.role === "creative-visual-anchor");

  function submitEntry(event) {
    event.preventDefault();
    if (!song || !entry.body.trim()) return;
    const next = addSongKnowledgeEntry(song, entry.kind, {
      body: entry.body,
      futureUse: entry.futureUse,
      relatedFeature: entry.relatedFeature,
      authorName: "Hapa operator",
      tags: ["echo-album", entry.kind],
    });
    void commitSong(next, `${entry.kind === "lesson" ? "Lesson" : entry.kind === "anecdote" ? "Anecdote" : "Note"} saved for ${song.title}.`);
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
      {error && <p className="echo-ref-feedback error" role="alert">{error}</p>}

      <div className="echo-song-notebook-grid">
        <form onSubmit={submitEntry}>
          <h5>Notes, anecdotes & lessons</h5>
          <select value={entry.kind} onChange={(event) => setEntry((current) => ({ ...current, kind: event.target.value }))}>
            <option value="note">Free-text note</option>
            <option value="anecdote">Anecdote</option>
            <option value="lesson">Lesson / teaching</option>
          </select>
          <textarea required rows="4" value={entry.body} onChange={(event) => setEntry((current) => ({ ...current, body: event.target.value }))} placeholder="Record anything a future human or agent should understand about this song." />
          {entry.kind === "lesson" && <>
            <input value={entry.futureUse} onChange={(event) => setEntry((current) => ({ ...current, futureUse: event.target.value }))} placeholder="How should this lesson guide future content?" />
            <input value={entry.relatedFeature} onChange={(event) => setEntry((current) => ({ ...current, relatedFeature: event.target.value }))} placeholder="Future feature, mechanic, or content connection" />
          </>}
          <button type="submit" disabled={saving || !entry.body.trim()}><Plus size={13} /> Add {entry.kind}</button>
        </form>

        <form onSubmit={submitReference}>
          <h5><Link2 size={13} /> Mark for future research</h5>
          <input value={reference.label} onChange={(event) => setReference((current) => ({ ...current, label: event.target.value }))} placeholder="Reference, work, person, place, or source" />
          <input type="url" value={reference.url} onChange={(event) => setReference((current) => ({ ...current, url: event.target.value }))} placeholder="https://… (optional)" />
          <textarea rows="3" value={reference.notes} onChange={(event) => setReference((current) => ({ ...current, notes: event.target.value }))} placeholder="Why this matters and what a future researcher should investigate" />
          <button type="submit" disabled={saving || (!reference.label.trim() && !reference.url.trim())}><Plus size={13} /> Mark reference</button>
          <div className="echo-notebook-reference-list">
            {(knowledge.researchReferences || []).map((item) => (
              <article key={item.id}>
                <strong>{item.label}</strong><p>{item.notes}</p>
                {item.url && <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /> Open source</a>}
                <em>{item.status}</em>
              </article>
            ))}
          </div>
        </form>
      </div>

      <div className="echo-song-notebook-grid">
        <section>
          <h5><Users size={13} /> Characters from the Hapa avatar pool</h5>
          <div className="echo-notebook-avatar-grid">
            {(payload.avatars || []).map((avatar) => <button key={avatar.id} type="button" className={linkedAvatarIds.has(avatar.id) ? "active" : ""} onClick={() => toggleAvatar(avatar)}><b>{avatar.name}</b><small>{linkedAvatarIds.has(avatar.id) ? "Added" : "Add"}</small></button>)}
          </div>
        </section>

        <section>
          <h5><ImageIcon size={13} /> Creative / visual anchors</h5>
          <textarea rows="2" value={anchorNotes} onChange={(event) => setAnchorNotes(event.target.value)} placeholder="What tone, composition, palette, motion, or feeling should future generation preserve?" />
          <label className="echo-notebook-upload"><Film size={13} /> Attach image still or video<input type="file" accept="image/*,video/*" onChange={(event) => { void uploadAnchor(event.target.files?.[0]); event.target.value = ""; }} /></label>
          <div className="echo-notebook-anchor-grid">
            {creativeAnchors.map((asset) => <article key={asset.id}>{asset.type === "video" ? <video src={mediaUri(apiBase, asset.uri)} controls preload="metadata" /> : <img src={mediaUri(apiBase, asset.uri)} alt={asset.name} loading="lazy" />}<strong>{asset.name}</strong><p>{asset.creativeAnchor?.toneNotes || asset.notes}</p></article>)}
          </div>
        </section>
      </div>

      <section className="echo-notebook-tarot">
        <header><div><h5><Sparkles size={13} /> Tarot ↔ song logic</h5><p>The attached Echoes from Other Eras mapping is shown as an editorial proposal, never silent canon.</p></div><span>{payload.tarotConnections?.length || 0} supplied · {manualTarotLinks.length} human</span></header>
        <div className="echo-notebook-tarot-grid">
          {(payload.tarotConnections || []).map((connection) => <article key={connection.id}><span>{connection.editionCardId} · {connection.arcana}</span><h5>{connection.cardTitle}</h5><strong>{connection.role}</strong><p>{connection.logic}</p><details><summary>Evidence and interpretive logic</summary>{connection.evidence.map((item, index) => <blockquote key={`${connection.id}:evidence:${index}`}>“{item.excerpt}” <small>{item.source_id} line {item.line}</small></blockquote>)}<p>{connection.thematicSynthesis}</p>{connection.interpretiveGuardrail && <em>{connection.interpretiveGuardrail}</em>}</details></article>)}
          {manualTarotLinks.map((link) => <article key={link.cardId} data-human="true"><span>Human-added connection</span><h5>{link.cardTitle}</h5><p>{link.reason}</p></article>)}
        </div>
        <form onSubmit={submitCard}>
          <select required value={cardDraft.cardId} onChange={(event) => setCardDraft((current) => ({ ...current, cardId: event.target.value }))}><option value="">Choose a Tarot Card…</option>{(payload.availableCards || []).map((card) => <option key={card.id} value={card.id}>{card.title} · {card.source?.editionId ? "Echoes edition" : "Builder library"}</option>)}</select>
          <textarea required rows="3" value={cardDraft.logic} onChange={(event) => setCardDraft((current) => ({ ...current, logic: event.target.value }))} placeholder="Why does this card belong with this song? Record the human logic future agents must preserve." />
          <button type="submit" disabled={saving || !cardDraft.cardId || !cardDraft.logic.trim()}><Plus size={13} /> Add card with logic</button>
        </form>
      </section>

      <div className="echo-song-notebook-grid echo-notebook-history">
        <EntryList title="Notes" entries={knowledge.notes} />
        <EntryList title="Anecdotes" entries={knowledge.anecdotes} />
        <EntryList title="Lessons" entries={knowledge.lessons} />
      </div>
      <footer>Stored on the normalized Song Card. Marked URLs are research leads, media anchors are direction context, and tarot mappings retain their source status and logic.</footer>
    </section>
  );
}
