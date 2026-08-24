import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  FileVideo2,
  Loader2,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  UserRoundCheck,
  XCircle,
} from "lucide-react";

// Avatar Likeness lane — the Human Enricher's likeness layout (layer L4).
//
// The matcher batch (layer L3) proposes Avatars for enricher-accepted
// media; nothing is truth until a human decides here. Each row previews
// the top-5 candidate table and records an ACCEPT (optionally re-pointed
// to a different candidate) or REJECT as a durable
// `origin: "avatar-likeness"` decision with the full score receipt.
//
// Browsable and non-blocking: the lane owns its own fetch against the
// likeness lane route; the rest of the Enricher does not wait on it.

const FILTERS = [
  { value: "proposed", label: "Proposed" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All verdicts" },
];

function mediaUri(uri, apiBase) {
  const value = String(uri || "");
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  if (/^\/(Users|private|tmp)\//.test(value)) return `${apiBase}/api/local-file?path=${encodeURIComponent(value)}`;
  return `${apiBase}${value.startsWith("/") ? "" : "/"}${value}`;
}

function marginFor(item) {
  const primary = item.likenessVerdict?.primary;
  if (!primary) return null;
  const runnerUp = item.likenessVerdict?.candidates?.[1]?.score ?? 0;
  return Number((primary.score - runnerUp).toFixed(3));
}

const CHANNEL_LABELS = [
  ["palette", "palette"],
  ["dHash", "dHash"],
  ["text", "text"],
  ["colorWords", "color words"],
];

function ChannelChips({ channels = {} }) {
  const active = CHANNEL_LABELS.filter(([key]) => channels[key] != null);
  if (!active.length) return <span className="human-likeness-channel none">no pixel data</span>;
  return <span className="human-likeness-channel">
    {active.map(([key, label]) => <em key={key} title={label}>{Number(channels[key]).toFixed(2)}</em>)}
  </span>;
}

export default function HumanEnricherLikenessLane({ apiBase = "", onNotify = () => {} }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState("proposed");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [decidingKeys, setDecidingKeys] = useState(() => new Set());
  const decidingKeysRef = useRef(new Set());
  const [expandedKey, setExpandedKey] = useState("");
  const [drafts, setDrafts] = useState(() => new Map()); // key → { chosenAvatarId, notes }
  const requestIdRef = useRef(0);

  async function load({ reset = false, append = false } = {}) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    const offset = append ? nextOffset : 0;
    if (!append) setItems((current) => (reset ? [] : current));
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: "60" });
      if (filter !== "all") params.set("state", filter);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`${apiBase}/api/human-enricher/likeness?${params}`, { headers: { accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Likeness lane failed to load (${response.status})`);
      if (requestId !== requestIdRef.current) return;
      setSummary(payload.summary || null);
      setHasMore(Boolean(payload.pagination?.hasMore));
      setNextOffset(Number(payload.pagination?.nextOffset || 0));
      setItems((current) => [...(append ? current : []), ...(payload.items || [])]);
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = globalThis.setTimeout(() => load(), query.trim() ? 240 : 0);
    return () => globalThis.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, filter, query]);

  function setDraft(key, patch) {
    setDrafts((current) => new Map(current).set(key, { chosenAvatarId: "", notes: "", ...(current.get(key) || {}), ...patch }));
  }

  async function decide(item, state) {
    const key = item.humanVideoKey;
    if (!key || decidingKeysRef.current.has(key)) return;
    const draft = drafts.get(key) || {};
    const primary = item.likenessVerdict?.primary || null;
    const decisionAvatarId = state === "accepted"
      ? (draft.chosenAvatarId || primary?.avatarId || "")
      : (primary?.avatarId || "");
    if (state === "accepted" && !decisionAvatarId) {
      onNotify("This verdict has no candidate Avatar to accept.", "error");
      return;
    }
    decidingKeysRef.current.add(key);
    setDecidingKeys(new Set(decidingKeysRef.current));
    const before = items;
    const optimisticDecision = {
      state,
      decisionAvatarId,
      decisionAvatarName: (item.likenessVerdict?.candidates || []).find((candidate) => candidate.avatarId === decisionAvatarId)?.name || primary?.name || "",
      notes: draft.notes || "",
      revision: Number(item.likenessDecision?.revision || 0) + 1,
      actorId: "human-enricher-likeness",
    };
    // Optimistic flip, reverted on failure (Quick Sort pattern).
    setItems((current) => current.map((candidate) => candidate.humanVideoKey === key
      ? { ...candidate, likenessDecision: { ...(candidate.likenessDecision || {}), ...optimisticDecision } }
      : candidate));
    try {
      const response = await fetch(`${apiBase}/api/human-enricher/likeness-decisions`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "x-hapa-actor-id": "human-enricher-likeness" },
        body: JSON.stringify({
          videoKey: key,
          videoId: item.id,
          state,
          decisionAvatarId,
          decisionAvatarName: optimisticDecision.decisionAvatarName,
          notes: draft.notes || "",
          expectedRevision: item.likenessDecision?.revision || 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Likeness decision failed (${response.status})`);
      setItems((current) => current.map((candidate) => candidate.humanVideoKey === key
        ? { ...candidate, likenessDecision: payload.decision || optimisticDecision }
        : candidate));
      // Optimistic summary nudge (Quick Sort pattern): the item leaves the
      // proposed queue and moves between decided buckets as recorded.
      setSummary((current) => {
        if (!current) return current;
        const was = item.likenessDecision?.state;
        const bucketFor = (decisionState) => decisionState === "accepted" ? "likenessAccepted" : decisionState === "rejected" ? "likenessRejected" : null;
        const fromBucket = bucketFor(was);
        const toBucket = bucketFor(state);
        const next = { ...current };
        if (!was) {
          next.likenessProposed = Math.max(0, Number(current.likenessProposed || 0) - 1);
          if (item.likenessVerdict?.verdict === "assigned") next.likenessAssignedProposed = Math.max(0, Number(current.likenessAssignedProposed || 0) - 1);
        }
        if (fromBucket && fromBucket !== toBucket) next[fromBucket] = Math.max(0, Number(current[fromBucket] || 0) - 1);
        if (toBucket) next[toBucket] = Math.max(0, Number(current[toBucket] || 0) + (fromBucket === toBucket ? 0 : 1));
        return next;
      });
      setDrafts((current) => { const next = new Map(current); next.delete(key); return next; });
      setExpandedKey((current) => (current === key ? "" : current));
      onNotify(state === "accepted"
        ? `Likeness accepted: ${optimisticDecision.decisionAvatarName || decisionAvatarId} for ${item.name || key}.`
        : `Likeness rejected for ${item.name || key}.`);
    } catch (decideError) {
      setItems(before);
      onNotify(decideError instanceof Error ? decideError.message : String(decideError), "error");
    } finally {
      decidingKeysRef.current.delete(key);
      setDecidingKeys(new Set(decidingKeysRef.current));
    }
  }

  const counts = useMemo(() => ({
    proposed: Number(summary?.likenessProposed || 0),
    accepted: Number(summary?.likenessAccepted || 0),
    rejected: Number(summary?.likenessRejected || 0),
    all: Number(summary?.likenessKnown || 0),
  }), [summary]);

  return (
    <main className="human-likeness-lane" aria-label="Avatar likeness decisions">
      <header className="human-likeness-toolbar hapa-panel">
        <div>
          <p className="eyebrow"><UserRoundCheck size={13} /> AVATAR LIKENESS · HUMAN GATE</p>
          <h3>Confirm who is in the footage.</h3>
          <p>The matcher proposes Avatars from palette, frame-hash, and text channels. Accepting records a durable cast decision the Director may consume; nothing here claims identity on its own.</p>
        </div>
        <div className="human-likeness-controls">
          <div className="human-likeness-filters" role="group" aria-label="Filter likeness lane">
            {FILTERS.map((entry) => (
              <button key={entry.value} type="button" aria-pressed={filter === entry.value} data-state={entry.value} onClick={() => setFilter(entry.value)}>
                {entry.label} · {counts[entry.value]}
              </button>
            ))}
          </div>
          <label className="search-box hapa-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a video…" /></label>
          <button className="hapa-btn" type="button" onClick={() => load({ reset: true })} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {error && <div className="human-enricher-error hapa-panel" role="alert">{error}</div>}

      {items.map((item) => {
        const verdict = item.likenessVerdict || null;
        const decision = item.likenessDecision || null;
        const laneState = decision?.state === "accepted" ? "accepted"
          : decision?.state === "rejected" ? "rejected"
          : verdict?.verdict === "assigned" ? "assigned" : "unresolved";
        const primary = verdict?.primary || null;
        const margin = marginFor(item);
        const expanded = expandedKey === item.humanVideoKey;
        const draft = drafts.get(item.humanVideoKey) || { chosenAvatarId: "", notes: "" };
        const deciding = decidingKeys.has(item.humanVideoKey);
        const chosen = (verdict?.candidates || []).find((candidate) => candidate.avatarId === draft.chosenAvatarId);
        return (
          <article key={item.humanVideoKey} className="human-likeness-row hapa-panel" data-state={laneState}>
            <div className="human-likeness-poster" aria-hidden="true">
              {item.thumbnailUri
                ? <img src={mediaUri(item.thumbnailUri, apiBase)} alt="" loading="lazy" />
                : <FileVideo2 size={22} />}
            </div>
            <div className="human-likeness-meta">
              <p className="human-likeness-name" title={item.name || item.humanVideoKey}>{item.name || item.humanVideoKey}</p>
              <div className="human-likeness-badges">
                <span data-variant={verdict?.verdict || "unresolved"}>
                  {verdict
                    ? <>matched {primary ? `${primary.name || primary.avatarId}` : "—"} · {Number(primary?.score || 0).toFixed(2)}{margin != null ? ` · Δ ${margin.toFixed(2)}` : ""}{verdict.staleSignature ? " · stale file" : ""}</>
                    : "no verdict"}
                </span>
                <span data-variant={decision?.state || "proposed"}>
                  {decision
                    ? <>{decision.state === "accepted" ? <BadgeCheck size={13} /> : <XCircle size={13} />} {decision.state}{decision.decisionAvatarName ? ` · ${decision.decisionAvatarName}` : ""} · r{decision.revision}</>
                    : "awaiting human"}
                </span>
              </div>
            </div>
            {verdict && (
              <div className="human-likeness-actions">
                <button type="button" aria-expanded={expanded} aria-label={expanded ? "Hide candidates" : "Review candidates"} onClick={() => setExpandedKey(expanded ? "" : item.humanVideoKey)}>
                  <ChevronDown size={15} className={expanded ? "flipped" : ""} />
                </button>
                {decision && !deciding && (
                  <button type="button" data-action="undo" title="Re-decide this video" onClick={() => { setDraft(item.humanVideoKey, { chosenAvatarId: decision.decisionAvatarId || "", notes: decision.notes || "" }); setExpandedKey(item.humanVideoKey); }}>
                    Re-decide
                  </button>
                )}
              </div>
            )}
            {expanded && verdict && (
              <div className="human-likeness-detail">
                <table className="human-likeness-candidates" aria-label="Likeness candidates">
                  <thead>
                    <tr><th>#</th><th>Avatar</th><th>Score</th><th>Channels</th><th /></tr>
                  </thead>
                  <tbody>
                    {(verdict.candidates || []).map((candidate, index) => {
                      const selected = (draft.chosenAvatarId || primary?.avatarId) === candidate.avatarId && !decision;
                      return (
                        <tr key={candidate.avatarId || index} data-selected={selected || undefined}>
                          <td>{index + 1}</td>
                          <td>{candidate.name || candidate.avatarId}</td>
                          <td>{Number(candidate.score || 0).toFixed(3)}</td>
                          <td><ChannelChips channels={candidate.channels} /></td>
                          <td>
                            {!decision && (
                              <button type="button" aria-pressed={selected} disabled={deciding} onClick={() => setDraft(item.humanVideoKey, { chosenAvatarId: candidate.avatarId })}>
                                {selected ? "will accept" : "accept as"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {decision && <p className="human-likeness-decision-note">Decided {decision.state}{decision.decisionAvatarName ? ` → ${decision.decisionAvatarName}` : ""} (r{decision.revision}, {decision.actorId}). Re-decide to change it.</p>}
                <div className="human-likeness-decide">
                  <input value={draft.notes} onChange={(event) => setDraft(item.humanVideoKey, { notes: event.target.value })} placeholder="Notes (optional) — why this placement?" maxLength={2000} />
                  {decision ? null : (
                    <>
                      <button className="hapa-btn" type="button" disabled={deciding || !(chosen || primary?.avatarId)} onClick={() => decide(item, "accepted")}>
                        {deciding ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />} Accept {chosen ? `· ${chosen.name || chosen.avatarId}` : ""}
                      </button>
                      <button type="button" data-action="reject" disabled={deciding} onClick={() => decide(item, "rejected")}>
                        {deciding ? <Loader2 size={14} className="spin" /> : <ThumbsDown size={14} />} Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}

      {!loading && !items.length && (
        <div className="human-video-empty hapa-panel">
          {filter === "proposed"
            ? "Nothing is awaiting a likeness decision. Re-run the matcher batch (scripts/avatar-likeness-match.mjs --apply) to refresh proposals."
            : `No ${filter} likeness decisions yet.`}
        </div>
      )}
      {hasMore && !loading && (
        <button className="human-video-load-more hapa-btn" type="button" onClick={() => load({ append: true })}>
          <Loader2 size={14} /> Load more
        </button>
      )}
    </main>
  );
}
