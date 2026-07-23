import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  ExternalLink,
  GitCompareArrows,
  History,
  Link2,
  ListTree,
  Map,
  Network,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";

const MODES = [
  { id: "listen", label: "Listen" },
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "story", label: "Story path" },
  { id: "activity", label: "Activity" },
  { id: "review", label: "Review" },
];

const LENSES = [
  { id: "all", label: "All routes" },
  { id: "evidence", label: "Evidence" },
  { id: "review", label: "Reviewed" },
  { id: "works", label: "Works / people / places" },
  { id: "motifs", label: "Motifs" },
  { id: "mechanics", label: "Mechanics" },
  { id: "emotions", label: "Emotions" },
  { id: "unresolved", label: "Unresolved" },
  { id: "challenged", label: "Challenged" },
];

function statusSymbol(status) {
  if (status === "approved") return "✓";
  if (status === "challenged") return "!";
  if (status === "rejected") return "×";
  if (status === "pending-review") return "◌";
  return "?";
}

function evidenceLabel(value) {
  return String(value || "unresolved").replaceAll("-", " ");
}

function cardMatchesLens(card, lens) {
  if (lens === "all") return true;
  if (lens === "evidence") return ["direct", "source-backed-candidate"].includes(card.authority?.evidenceClass);
  if (lens === "review") return ["pending-review", "approved"].includes(card.authority?.reviewStatus);
  if (lens === "works") return ["external-work", "person", "place", "media"].includes(card.referenceType);
  if (lens === "motifs") return card.referenceType === "motif";
  if (lens === "mechanics") return (card.mechanics || []).length > 0;
  if (lens === "emotions") return (card.emotions || []).length > 0;
  if (lens === "unresolved") return card.authority?.evidenceClass === "unresolved" || (card.unresolved || []).length > 0;
  if (lens === "challenged") return card.authority?.reviewStatus === "challenged";
  return true;
}

function cardSearchText(card) {
  return [
    card.title,
    card.summary,
    ...(card.aliases || []),
    ...(card.themes || []),
    ...(card.mechanics || []),
    ...(card.emotions || []),
    ...(card.occurrences || []).flatMap((occurrence) => [occurrence.songTitle, occurrence.lyricSpan?.lyricText]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function cueAtTime(timeline, currentTime) {
  const timed = (timeline || []).filter((cue) => cue.startSeconds !== null);
  if (!timed.length) return null;
  return timed.find((cue) => (
    currentTime >= Number(cue.startSeconds || 0)
    && currentTime <= Number(cue.endSeconds ?? cue.startSeconds ?? 0)
  )) || [...timed].reverse().find((cue) => currentTime >= Number(cue.startSeconds || 0)) || timed[0];
}

function initialDeepLink() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    return {
      songId: params.get("referenceSong") || "",
      cardId: params.get("referenceCard") || "",
      lens: params.get("referenceLens") || "all",
      mode: params.get("referenceMode") || "explore",
    };
  } catch {
    return { songId: "", cardId: "", lens: "all", mode: "explore" };
  }
}

function syncDeepLink({ songId, cardId, lens, mode }) {
  try {
    const url = new URL(globalThis.location.href);
    const setOrDelete = (key, value, fallback = "") => {
      if (value && value !== fallback) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    setOrDelete("referenceSong", songId);
    setOrDelete("referenceCard", cardId);
    setOrDelete("referenceLens", lens, "all");
    setOrDelete("referenceMode", mode, "explore");
    globalThis.history?.replaceState?.(globalThis.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Embedded or test surfaces may not expose a writable location.
  }
}

function graphLayout(nodes = []) {
  const songs = nodes.filter((node) => node.type === "song");
  const cards = nodes.filter((node) => node.type === "reference-card");
  const center = songs[0] || nodes[0];
  const ordered = center ? [center, ...nodes.filter((node) => node.id !== center.id)] : nodes;
  return new Map(ordered.map((node, index) => {
    if (index === 0) return [node.id, { x: 320, y: 210 }];
    const ringIndex = index - 1;
    const ring = Math.floor(ringIndex / 14);
    const ringItems = Math.min(14, ordered.length - 1 - ring * 14);
    const ordinal = ringIndex % 14;
    const angle = ((ordinal / Math.max(1, ringItems)) * Math.PI * 2) - Math.PI / 2;
    const radius = 112 + ring * 72;
    return [node.id, {
      x: 320 + Math.cos(angle) * radius,
      y: 210 + Math.sin(angle) * Math.min(radius, 165),
      isCard: cards.some((card) => card.id === node.id),
    }];
  }));
}

function EchoReferenceMindMap({ graph, focusedCardId, currentSongId, privacyProjection, onFocusCard }) {
  const [relationFilter, setRelationFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contextFilter, setContextFilter] = useState("all");
  const [minimumConfidence, setMinimumConfidence] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [trail, setTrail] = useState([]);
  const [trailCursor, setTrailCursor] = useState(-1);
  const focusCardWithTrail = useCallback((cardId, relationType = "focus") => {
    if (!cardId) return;
    const node = (graph?.nodes || []).find((item) => item.id === cardId);
    const nextTrail = [
      ...trail.slice(0, trailCursor + 1),
      { nodeId: cardId, label: node?.label || cardId, relationType },
    ];
    setTrail(nextTrail);
    setTrailCursor(nextTrail.length - 1);
    onFocusCard(cardId);
  }, [graph?.nodes, onFocusCard, trail, trailCursor]);
  useEffect(() => {
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem("echo-reference-map-view.v1") || "null");
      if (!saved) return;
      setRelationFilter(saved.relationFilter || "all");
      setEvidenceFilter(saved.evidenceFilter || "all");
      setStatusFilter(saved.statusFilter || "all");
      setContextFilter(saved.contextFilter || "all");
      setMinimumConfidence(Number(saved.minimumConfidence || 0));
      setFocusMode(saved.focusMode === true);
    } catch {
      // Deterministic defaults remain available when embedded storage is unavailable.
    }
  }, []);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem("echo-reference-map-view.v1", JSON.stringify({
        relationFilter,
        evidenceFilter,
        statusFilter,
        contextFilter,
        minimumConfidence,
        focusMode,
      }));
    } catch {
      // View persistence is optional; layout remains deterministic without it.
    }
  }, [contextFilter, evidenceFilter, focusMode, minimumConfidence, relationFilter, statusFilter]);
  const filteredEdges = useMemo(() => (graph?.edges || []).filter((edge) => {
    if (relationFilter !== "all" && edge.relationType !== relationFilter) return false;
    if (evidenceFilter !== "all" && edge.evidenceClass !== evidenceFilter) return false;
    if (statusFilter !== "all" && edge.status !== statusFilter) return false;
    if ((edge.confidence || 0) < minimumConfidence) return false;
    if (contextFilter === "mechanics" && !String(edge.relationType).includes("mechanic")) return false;
    if (contextFilter === "emotions" && !String(edge.relationType).includes("emotion")) return false;
    if (contextFilter === "narrative" && !["alludes-to", "narrative-continuation", "transforms"].includes(edge.relationType)) return false;
    if (focusMode && focusedCardId && edge.fromId !== focusedCardId && edge.toId !== focusedCardId) return false;
    return true;
  }), [contextFilter, evidenceFilter, focusMode, focusedCardId, graph?.edges, minimumConfidence, relationFilter, statusFilter]);
  const connectedIds = useMemo(() => new Set(filteredEdges.flatMap((edge) => [edge.fromId, edge.toId])), [filteredEdges]);
  const nodes = useMemo(() => (graph?.nodes || [])
    .filter((node) => !focusMode || !focusedCardId || connectedIds.has(node.id) || node.id === focusedCardId)
    .slice(0, 44), [connectedIds, focusMode, focusedCardId, graph?.nodes]);
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = useMemo(
    () => filteredEdges.filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)).slice(0, 96),
    [filteredEdges, nodeIds],
  );
  const positions = useMemo(() => graphLayout(nodes), [nodes]);
  return (
    <section className="echo-ref-map" aria-label="Echo Album relational mind map">
      <header>
        <span><Network size={15} /> Relational mind map</span>
        <em>{nodes.length} visible nodes · {edges.length} paths · {privacyProjection}</em>
      </header>
      <div className="echo-ref-map-filters" aria-label="Mind map filters">
        <select aria-label="Edge relation" value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}>
          <option value="all">All relations</option>
          {[...new Set((graph?.edges || []).map((edge) => edge.relationType))].sort().map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Evidence class" value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value)}>
          <option value="all">All evidence</option>
          {[...new Set((graph?.edges || []).map((edge) => edge.evidenceClass))].sort().map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Review status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {[...new Set((graph?.edges || []).map((edge) => edge.status))].sort().map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Contextual layer" value={contextFilter} onChange={(event) => setContextFilter(event.target.value)}>
          <option value="all">All contextual layers</option>
          <option value="mechanics">Mechanics</option>
          <option value="emotions">Emotions</option>
          <option value="narrative">Narrative</option>
        </select>
        <label>
          Confidence ≥ {Math.round(minimumConfidence * 100)}%
          <input type="range" min="0" max="1" step="0.1" value={minimumConfidence} onChange={(event) => setMinimumConfidence(Number(event.target.value))} />
        </label>
        <button type="button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>
          {focusMode ? "Show album topology" : "Focus neighborhood"}
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}>−</button>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}>+</button>
        <button type="button" disabled={trailCursor <= 0} onClick={() => {
          const next = Math.max(0, trailCursor - 1);
          setTrailCursor(next);
          onFocusCard(trail[next]?.nodeId || "");
        }}>Back</button>
        <button type="button" disabled={trailCursor >= trail.length - 1} onClick={() => {
          const next = Math.min(trail.length - 1, trailCursor + 1);
          setTrailCursor(next);
          onFocusCard(trail[next]?.nodeId || "");
        }}>Forward</button>
      </div>
      <nav className="echo-ref-map-breadcrumbs" aria-label="Graph traversal breadcrumbs">
        {trail.slice(0, trailCursor + 1).map((hop, index) => (
          <button key={`${hop.nodeId}:${index}`} type="button" onClick={() => {
            setTrailCursor(index);
            onFocusCard(hop.nodeId);
          }}>
            {index > 0 ? `${hop.relationType} → ` : ""}{hop.label}
          </button>
        ))}
        <button type="button" onClick={() => globalThis.document?.querySelector("audio, [aria-label*='playback']")?.focus?.()}>
          Return to playback
        </button>
      </nav>
      {nodes.length ? (
        <>
          <svg viewBox="0 0 640 420" role="img" aria-label="Focused relationship graph">
            <g transform={`translate(${320 * (1 - zoom)} ${210 * (1 - zoom)}) scale(${zoom})`}>
            <g className="echo-ref-map-edges">
              {edges.map((edge) => {
                const from = positions.get(edge.fromId);
                const to = positions.get(edge.toId);
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    data-status={edge.status}
                    data-evidence={edge.evidenceClass}
                    role="button"
                    tabIndex="0"
                    aria-label={`Inspect ${edge.relationType} connection from ${edge.fromId} to ${edge.toId}`}
                    onClick={() => focusCardWithTrail(
                      edge.fromType === "reference-card" ? edge.fromId : edge.toType === "reference-card" ? edge.toId : "",
                      edge.relationType,
                    )}
                    onKeyDown={(event) => {
                      if (["Enter", " "].includes(event.key)) {
                        event.preventDefault();
                        focusCardWithTrail(
                          edge.fromType === "reference-card" ? edge.fromId : edge.toType === "reference-card" ? edge.toId : "",
                          edge.relationType,
                        );
                      }
                    }}
                  />
                );
              })}
            </g>
            <g className="echo-ref-map-nodes">
              {nodes.map((node) => {
                const position = positions.get(node.id);
                const focused = node.id === focusedCardId;
                const isSong = node.type === "song";
                return (
                  <g
                    key={node.id}
                    transform={`translate(${position.x} ${position.y})`}
                    data-kind={node.type}
                    data-focused={focused ? "true" : "false"}
                    data-current-song={node.songId === currentSongId ? "true" : "false"}
                    tabIndex={node.type === "reference-card" ? 0 : -1}
                    role={node.type === "reference-card" ? "button" : "img"}
                    aria-label={`${node.type}: ${node.label}`}
                    onClick={() => node.type === "reference-card" && focusCardWithTrail(node.id)}
                    onKeyDown={(event) => {
                      if (node.type === "reference-card" && ["Enter", " "].includes(event.key)) {
                        event.preventDefault();
                        focusCardWithTrail(node.id);
                      }
                    }}
                  >
                    {isSong ? <rect x="-34" y="-18" width="68" height="36" rx="9" /> : <circle r={focused ? 13 : 9} />}
                    <text y={isSong ? 4 : 23} textAnchor="middle">
                      {String(node.label || node.id).slice(0, isSong ? 24 : 18)}
                    </text>
                  </g>
                );
              })}
            </g>
            </g>
          </svg>
          <svg className="echo-ref-map-minimap" viewBox="0 0 640 420" role="img" aria-label="Graph minimap orientation">
            {nodes.map((node) => {
              const point = positions.get(node.id);
              return <circle key={`mini:${node.id}`} cx={point.x} cy={point.y} r={node.id === focusedCardId ? 7 : 3} />;
            })}
          </svg>
          <ol className="echo-ref-map-screenreader">
            {edges.map((edge) => (
              <li key={`list-${edge.id}`}>
                {edge.fromId} {edge.relationType} {edge.toId}. {edge.rationale}
              </li>
            ))}
          </ol>
        </>
      ) : <p className="echo-ref-empty">No graph paths match this lens.</p>}
    </section>
  );
}

function EchoReferenceAtlas({ atlas, connectionMatrix = [], selectedSongId, onSelectSong, query }) {
  const [view, setView] = useState("small-multiples");
  const [sort, setSort] = useState("track");
  const [family, setFamily] = useState("all");
  const families = useMemo(() => [...new Set((atlas || []).flatMap((row) => Object.keys(row.referenceFamilies || {})))].sort(), [atlas]);
  const rows = useMemo(() => (atlas || [])
    .filter((row) => !query || `${row.title} ${row.songId}`.toLowerCase().includes(query.toLowerCase()))
    .filter((row) => family === "all" || (row.referenceFamilies?.[family] || 0) > 0)
    .sort((left, right) => {
      if (sort === "confidence") return right.averageConfidence - left.averageConfidence;
      if (sort === "unresolved") return right.unresolvedCount - left.unresolvedCount;
      if (sort === "cards") return right.cardCount - left.cardCount;
      return left.trackNumber - right.trackNumber;
    }), [atlas, family, query, sort]);
  const maxCards = Math.max(1, ...rows.map((row) => row.cardCount || 0));
  return (
    <section className="echo-ref-atlas" aria-label="Echo Album reference atlas">
      <header>
        <span><Map size={15} /> Album atlas</span>
        <em>{rows.length} songs · gaps mean incomplete evidence, not absent meaning</em>
      </header>
      <div className="echo-ref-atlas-controls">
        <button type="button" onClick={() => setView("small-multiples")}>Song × family</button>
        <button type="button" onClick={() => setView("connections")}>Song × song</button>
        <select aria-label="Atlas sort" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="track">Track order</option>
          <option value="confidence">Confidence</option>
          <option value="cards">Card count</option>
          <option value="unresolved">Unresolved leverage</option>
        </select>
        <select aria-label="Reference family" value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="all">All reference families</option>
          {families.slice(0, 120).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {view === "small-multiples" ? <div className="echo-ref-atlas-grid">
        {rows.map((row) => (
          <button
            key={row.songId}
            type="button"
            className={row.songId === selectedSongId ? "active" : ""}
            onClick={() => onSelectSong(row.songId)}
            title={`${row.title}: ${row.cardCount} cards, ${row.unresolvedCount} unresolved`}
          >
            <span>{row.trackNumber}. {row.title}</span>
            <i style={{ "--echo-ref-coverage": `${Math.max(4, (row.cardCount / maxCards) * 100)}%` }} />
            <small>
              {row.cardCount} cards · {Math.round((row.averageConfidence || 0) * 100)}% avg confidence
              {" · "}{row.unresolvedCount ? `${row.unresolvedCount} coverage gap` : "covered"}
            </small>
          </button>
        ))}
      </div> : (
        <div className="echo-ref-atlas-connections" aria-label="Song by song connection density matrix">
          {connectionMatrix.slice(0, 500).map((cell) => (
            <button
              key={cell.id}
              type="button"
              onClick={() => onSelectSong(cell.sourceSongId)}
              title={`${cell.connectionCount} supporting cards · ${Math.round(cell.averageConfidence * 100)}% average confidence`}
            >
              <span>{cell.sourceSongId} ↔ {cell.targetSongId}</span>
              <b>{cell.connectionCount}</b>
              <small>{cell.cardIds.length} cards · open supporting lyric moments and graph edges</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EchoReferenceOperations({ metrics }) {
  if (!metrics) return null;
  return (
    <section className="echo-ref-operations" aria-label="Reference mining observability and immutable audit">
      <header>
        <span><Waypoints size={15} /> Mining operations & audit</span>
        <em>{metrics.queue?.status} · content-free private metrics</em>
      </header>
      <div>
        <span><b>{metrics.coverage?.songsCovered}/{metrics.coverage?.songCount}</b> songs covered</span>
        <span><b>{metrics.cards?.candidates}</b> candidates</span>
        <span><b>{metrics.cards?.approved}</b> approved</span>
        <span><b>{metrics.cards?.rejected}</b> rejected</span>
        <span><b>{metrics.cards?.unresolved}</b> unresolved</span>
        <span><b>{metrics.review?.pending}</b> pending review</span>
        <span><b>{metrics.citations?.stale}</b> stale/deferred citations</span>
        <span><b>{metrics.queue?.budgetStops}</b> budget stops</span>
      </div>
      <small>
        Run {metrics.receiptLinks?.runId} · graph {metrics.receiptLinks?.graphHash}
        {" · "}Every metric links to immutable run/decision receipts; private clue and restricted evidence content are excluded.
      </small>
    </section>
  );
}

function EchoUnresolvedQueue({ nodes, onAddClue }) {
  if (!nodes?.length) return null;
  return (
    <section className="echo-ref-unresolved" aria-label="Unresolved reference investigation queue">
      <header>
        <span><CircleHelp size={15} /> Unresolved high-leverage nodes</span>
        <em>{nodes.length} ranked leads · evidence gaps remain visible</em>
      </header>
      <div>
        {nodes.slice(0, 24).map((node) => (
          <article key={node.id}>
            <span>#{node.rank || "—"} · {node.possibleNamespaces?.join(" / ") || "unknown namespace"}</span>
            <strong>{node.label}</strong>
            <small>
              leverage {Math.round((node.leverage || 0) * 100)}%
              {node.nearbyMotifs?.length ? ` · nearby: ${node.nearbyMotifs.slice(0, 5).join(", ")}` : ""}
            </small>
            <button type="button" onClick={() => onAddClue(node)}>
              <CirclePlus size={12} /> Add clue and request scoped rerun
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function groupEchoReferenceTimeline(timeline = []) {
  const groups = new Map();
  for (const cue of timeline) {
    const anchor = cue.startSeconds === null
      ? `line:${cue.lineStart}`
      : `time:${Math.round(Number(cue.startSeconds || 0) * 2) / 2}`;
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push(cue);
  }
  return [...groups.entries()].map(([id, cues]) => ({
    id,
    cues: [...cues].sort((left, right) => (
      (right.priority || 0) - (left.priority || 0)
      || (right.confidence || 0) - (left.confidence || 0)
      || left.id.localeCompare(right.id)
    )),
  }));
}

function EchoReferenceTimeline({ song, unresolved = [], focusedCardId, currentTime, onSeek, onFocusCard }) {
  const timeline = song?.timeline || [];
  const [expandedGroupId, setExpandedGroupId] = useState("");
  const groups = useMemo(() => groupEchoReferenceTimeline(timeline), [timeline]);
  const maximum = Math.max(
    1,
    ...timeline.map((cue) => Number(cue.endSeconds ?? cue.startSeconds ?? cue.lineEnd ?? 1))
  );
  const density = useMemo(() => Array.from({ length: 12 }, (_, index) => timeline.filter((cue) => {
    const value = Number(cue.startSeconds ?? cue.lineStart ?? 0);
    const bucket = Math.min(11, Math.floor((value / maximum) * 12));
    return bucket === index;
  }).length), [maximum, timeline]);
  const maxDensity = Math.max(1, ...density);
  return (
    <section className="echo-ref-timeline" aria-label="Lyric reference timeline">
      <header>
        <span><Waypoints size={15} /> Lyric reference timeline</span>
        <em>{timeline.length} cues · {timeline.some((cue) => cue.startSeconds === null) ? "line fallback active" : "timed"}</em>
      </header>
      <div className="echo-ref-density" aria-label="Reference density heatmap">
        {density.map((count, index) => (
          <i key={index} data-density={count} style={{ "--echo-ref-density": count / maxDensity }}>
            <span>{count} references in segment {index + 1}</span>
          </i>
        ))}
      </div>
      <div className="echo-ref-timeline-track">
        {groups.map((group) => {
          const cue = group.cues[0];
          const value = Number(cue.startSeconds ?? cue.lineStart ?? 0);
          const left = Math.max(0, Math.min(98, (value / maximum) * 100));
          const active = cue.cardId === focusedCardId
            || (cue.startSeconds !== null && currentTime >= cue.startSeconds && currentTime <= (cue.endSeconds ?? cue.startSeconds));
          return (
            <button
              key={group.id}
              type="button"
              className={active ? "active" : ""}
              data-status={cue.reviewStatus}
              style={{ left: `${left}%` }}
              aria-label={`${group.cues.length} grouped reference${group.cues.length === 1 ? "" : "s"}: ${cue.label}, line ${cue.lineStart}, ${evidenceLabel(cue.evidenceClass)}`}
              title={`${cue.label}${group.cues.length > 1 ? ` + ${group.cues.length - 1} overlapping` : ""} · line ${cue.lineStart}${cue.startSeconds !== null ? ` · ${cue.startSeconds.toFixed(1)}s` : " · untimed section fallback"}`}
              onClick={() => {
                if (group.cues.length > 1) setExpandedGroupId((current) => current === group.id ? "" : group.id);
                onFocusCard(cue.cardId);
                if (cue.startSeconds !== null) onSeek(cue.startSeconds);
              }}
            >
              <span>{statusSymbol(cue.reviewStatus)}{group.cues.length > 1 ? group.cues.length : ""}</span>
            </button>
          );
        })}
        <i style={{ left: `${Math.max(0, Math.min(100, (currentTime / maximum) * 100))}%` }} aria-hidden="true" />
      </div>
      {expandedGroupId && (
        <div className="echo-ref-timeline-overlaps" aria-label="Expanded overlapping references">
          {groups.find((group) => group.id === expandedGroupId)?.cues.map((cue) => (
            <button key={cue.id} type="button" onClick={() => {
              onFocusCard(cue.cardId);
              if (cue.startSeconds !== null) onSeek(cue.startSeconds);
            }}>
              {statusSymbol(cue.reviewStatus)} {cue.label} · line {cue.lineStart}
            </button>
          ))}
        </div>
      )}
      <div className="echo-ref-timeline-legend">
        <span>✓ approved</span><span>◌ reviewable</span><span>! challenged</span><span>? unresolved</span>
        {unresolved.length > 0 && <span>? {unresolved.length} unresolved song leads</span>}
        {timeline.some((cue) => cue.startSeconds === null) && <span>≈ section-based fallback (reduced precision)</span>}
      </div>
    </section>
  );
}

function EchoReferenceCardRail({
  cards,
  focusedCardId,
  pinned,
  onFocusCard,
  onTogglePin,
  onAdd,
  onChallenge,
}) {
  return (
    <section className="echo-ref-card-rail" aria-label="Reference Cards">
      <header>
        <span><BookOpen size={15} /> Hapa Reference Cards</span>
        <em>{cards.length} visible</em>
      </header>
      <div className="echo-ref-card-strip">
        {cards.map((card) => {
          const focused = card.id === focusedCardId;
          const occurrence = card.occurrences?.[0];
          return (
            <article
              key={card.id}
              className={focused ? "active" : ""}
              data-evidence={card.authority?.evidenceClass}
              data-status={card.authority?.reviewStatus}
            >
              <button type="button" className="echo-ref-card-focus" onClick={() => onFocusCard(card.id)}>
                <span className="echo-ref-card-status">
                  {statusSymbol(card.authority?.reviewStatus)} {evidenceLabel(card.authority?.reviewStatus)}
                </span>
                <strong>{card.title}</strong>
                <p>{card.summary}</p>
                <small>
                  {evidenceLabel(card.authority?.evidenceClass)} · {Math.round((occurrence?.confidence || 0) * 100)}% · {card.interpretations?.length || 0} readings
                </small>
              </button>
              {focused && (
                <footer>
                  <button type="button" onClick={onTogglePin}>
                    {pinned ? <PinOff size={12} /> : <Pin size={12} />} {pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" onClick={() => onAdd(card)}><CirclePlus size={12} /> Add</button>
                  <button type="button" onClick={() => onChallenge(card)}><CircleHelp size={12} /> Challenge</button>
                </footer>
              )}
            </article>
          );
        })}
        {!cards.length && <p className="echo-ref-empty">No cards match this lens. Try All routes or inspect unresolved gaps.</p>}
      </div>
    </section>
  );
}

function EchoReferenceInspector({ card, inspection, mode, onClose, onAdd, onChallenge, onJumpOccurrence }) {
  if (!card) return null;
  return (
    <aside className="echo-ref-inspector" aria-label="Reference evidence and provenance inspector">
      <header>
        <div>
          <span><ShieldCheck size={14} /> Evidence & provenance</span>
          <strong>{card.title}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector"><X size={16} /></button>
      </header>
      <div className="echo-ref-authority-grid">
        <span><b>Evidence</b>{evidenceLabel(card.authority?.evidenceClass)}</span>
        <span><b>Review</b>{evidenceLabel(card.authority?.reviewStatus)}</span>
        <span><b>Canon</b>{evidenceLabel(card.authority?.canonStatus)}</span>
        <span><b>Visibility</b>{card.rightsAndPrivacy?.visibility || "private"}</span>
      </div>
      <section>
        <h4>Where it appears</h4>
        {(card.occurrences || []).map((occurrence) => (
          <article key={occurrence.id}>
            <strong>{occurrence.songTitle || occurrence.songId} · line {occurrence.lyricSpan?.lineStart}</strong>
            <blockquote>{occurrence.lyricSpan?.lyricText || "Lyric pointer available without quoted text."}</blockquote>
            <small>{occurrence.lyricSpan?.startSeconds !== null ? `${occurrence.lyricSpan.startSeconds.toFixed(1)}s` : "Section/line timing fallback"}</small>
            <button type="button" onClick={() => onJumpOccurrence(occurrence)}>
              Jump to related song moment
            </button>
          </article>
        ))}
      </section>
      <section>
        <h4>Claims and caveats</h4>
        {(card.claims || []).map((claim) => (
          <article key={claim.id}>
            <strong>{claim.kind} · {evidenceLabel(claim.evidenceClass)}</strong>
            <p>{claim.text}</p>
            {claim.caveat && <small>{claim.caveat}</small>}
          </article>
        ))}
      </section>
      <section>
        <h4>Sources</h4>
        {(card.citations || []).length ? card.citations.map((citation) => (
          <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> {citation.label || citation.url}
            <small>{citation.sourceClass} · {citation.freshness?.status || "unchecked"} · {citation.rights?.licenseStatus}</small>
          </a>
        )) : <p className="echo-ref-warning"><AlertTriangle size={12} /> No external citation; this remains an album-internal comparison.</p>}
      </section>
      <section>
        <h4><History size={13} /> Revision lineage</h4>
        <p>{card.revisionId}</p>
        <small>{card.parentRevisionId ? `Parent: ${card.parentRevisionId}` : "First migrated or mined revision"}</small>
        {(inspection?.revisionHistory || []).map((revision) => (
          <article key={revision.revisionId}>
            <strong>{revision.revisionId}</strong>
            <p>{revision.actor} · {revision.authority?.reviewStatus || "proposed"}</p>
            <small>{revision.contentDigest} · {revision.createdAt}</small>
          </article>
        ))}
      </section>
      <section>
        <h4>Why this connection</h4>
        <p>{inspection?.edgeDecisionReason || card.summary}</p>
        <small>
          Detector/synthesis: {inspection?.provenance?.method || card.provenance?.method || "unspecified"}
          {" · "}Source run: {inspection?.provenance?.sourceRunId || card.provenance?.sourceRunId || "local"}
        </small>
        {(inspection?.unsupportedClaimIds || []).length > 0 && (
          <p className="echo-ref-warning">
            <AlertTriangle size={12} /> Unsupported or privately hidden claims: {inspection.unsupportedClaimIds.join(", ")}
          </p>
        )}
      </section>
      <section>
        <h4>Downstream impact</h4>
        <p>
          {inspection?.downstreamImpact?.affectedSongIds?.length || card.occurrences?.length || 0} songs
          {" · "}{inspection?.downstreamImpact?.affectedGraphPathIds?.length || card.relationships?.length || 0} paths
          {" · "}{inspection?.downstreamImpact?.affectedDirectorPacketIds?.length || 0} director packets
        </p>
        <small>Inspecting evidence does not approve, publish, canonize, or alter playback context.</small>
      </section>
      {mode === "compare" && (
        <section className="echo-ref-compare">
          <h4><GitCompareArrows size={13} /> Competing interpretations</h4>
          <p>No forced winner: plural readings remain side by side unless evidence and a Human decision justify a status change.</p>
          <div>
            {(card.interpretations || []).map((interpretation) => {
              const historical = ["rejected", "superseded", "withdrawn"].includes(interpretation.status);
              const claimOccurrenceIds = new Set((card.claims || [])
                .filter((claim) => (interpretation.claimIds || []).includes(claim.id))
                .flatMap((claim) => claim.occurrenceIds || []));
              const pathOccurrence = (card.occurrences || []).find((occurrence) => claimOccurrenceIds.has(occurrence.id))
                || card.occurrences?.[0];
              return (
                <article key={interpretation.id} data-historical={historical}>
                  <strong>{interpretation.title}</strong>
                  {historical && <span>Historical — not current guidance</span>}
                  <p>{interpretation.summary}</p>
                  <small>
                    Confidence: {Math.round((interpretation.confidence || 0) * 100)}% · Authority: {interpretation.status}
                    {" · "}Evidence: {interpretation.claimIds?.length || 0} claims
                    {" · "}Lyric scope: {claimOccurrenceIds.size || card.occurrences?.length || 0} moments
                  </small>
                  <p>Mechanics: {card.mechanics?.join(", ") || "none imported"}</p>
                  <p>Emotions: {card.emotions?.join(", ") || "none imported"}</p>
                  <p>{interpretation.caveats?.join(" · ")}</p>
                  <button type="button" onClick={() => pathOccurrence && onJumpOccurrence(pathOccurrence)}>
                    Follow this reading’s path
                  </button>
                </article>
              );
            })}
          </div>
          <small>
            Difference highlights: lyric scope, cited claim IDs, confidence, mechanic/emotion, status, and authority.
            Rejected or superseded readings remain historical and are not current guidance.
          </small>
        </section>
      )}
      <footer>
        <button type="button" onClick={() => onAdd(card)}><CirclePlus size={13} /> Add reference</button>
        <button type="button" onClick={() => onChallenge(card)}><CircleHelp size={13} /> Challenge / counterinterpret</button>
      </footer>
    </aside>
  );
}

function EchoReferenceReviewWorkbench({ card, inspection, submitting, onSubmit }) {
  const [reason, setReason] = useState("");
  const [weight, setWeight] = useState("0.5");
  const [relatedCardIds, setRelatedCardIds] = useState("");
  useEffect(() => {
    setReason("");
    setRelatedCardIds("");
  }, [card?.id]);
  const submit = useCallback((action) => {
    if (!card || !reason.trim()) return;
    onSubmit({
      cardId: card.id,
      action,
      reason: reason.trim(),
      actor: "local-reviewer",
      weight: Number(weight),
      relatedCardIds: relatedCardIds.split(",").map((value) => value.trim()).filter(Boolean),
      affectedEdgeIds: inspection?.selectedEdge?.id ? [inspection.selectedEdge.id] : [],
    });
  }, [card, inspection?.selectedEdge?.id, onSubmit, reason, relatedCardIds, weight]);
  useEffect(() => {
    const handleKeyboard = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
      const action = ({
        a: "approve",
        x: "reject",
        d: "defer",
        w: "reweight",
        q: "request-research",
      })[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        submit(action);
      }
    };
    globalThis.addEventListener?.("keydown", handleKeyboard);
    return () => globalThis.removeEventListener?.("keydown", handleKeyboard);
  }, [submit]);
  if (!card) return null;
  return (
    <section className="echo-ref-review-workbench" aria-label="Reference Card Human review workbench">
      <header>
        <span><ShieldCheck size={14} /> Human review workbench</span>
        <em>{evidenceLabel(card.authority?.evidenceClass)} evidence · {card.authority?.canonStatus || "non-canon"}</em>
      </header>
      <p>
        {card.occurrences?.length || 0} lyric moments · {card.interpretations?.length || 0} alternative readings
        {" · "}{Math.round(Math.max(...(card.occurrences || []).map((item) => item.confidence || 0), 0) * 100)}% strongest occurrence confidence
      </p>
      <label>
        <span>Required reason</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain the evidence, uncertainty, privacy, or graph-impact basis for this action."
        />
      </label>
      <div className="echo-ref-review-inputs">
        <label>
          <span>Reweight</span>
          <input type="number" min="0" max="1" step="0.05" value={weight} onChange={(event) => setWeight(event.target.value)} />
        </label>
        <label>
          <span>Related card IDs for merge/split</span>
          <input value={relatedCardIds} onChange={(event) => setRelatedCardIds(event.target.value)} placeholder="card:a, card:b" />
        </label>
      </div>
      <div className="echo-ref-review-actions">
        {[
          ["approve", "A · Approve"],
          ["reject", "X · Reject"],
          ["reweight", "W · Reweight"],
          ["defer", "D · Defer"],
          ["request-research", "Q · More research"],
          ["merge", "Merge"],
          ["split", "Split"],
        ].map(([action, label]) => (
          <button
            key={action}
            type="button"
            disabled={submitting || !reason.trim() || (["merge", "split"].includes(action) && !relatedCardIds.trim())}
            onClick={() => submit(action)}
          >
            {label}
          </button>
        ))}
      </div>
      <small>
        Every action is append-only and card-scoped. Bulk plans still run these checks per card.
        Public activation and canon require separate Human authority.
      </small>
    </section>
  );
}

function EchoReferenceStoryPath({ card, onHandoff }) {
  if (!card) return null;
  const authorityType = card.provenance?.method === "authored-path"
    ? "Authored path"
    : card.authority?.reviewStatus === "approved"
      ? "Approved interpretive path"
      : "Automatically suggested path";
  const relation = card.relationships?.[0]?.relationType || "recurs-with";
  const explanation = ({
    "contrasts-with": "The signal changes through contrast across these lyric contexts.",
    transforms: "The signal transforms in role, consequence, or emotional charge.",
    "imports-mechanic": "The route proposes an operational mechanic recurring across songs.",
    "imports-emotion": "The route follows a recurring emotional turn.",
    "narrative-continuation": "The route can be read as a possible narrative continuation.",
    "recurs-with": "The signal recurs across independently readable lyric moments.",
  })[relation] || "This is a reviewable cross-song path; it does not establish authorial intent.";
  return (
    <section className="echo-ref-story-path" aria-label="Cross-song connection path and playback handoff">
      <header>
        <span><Waypoints size={14} /> {authorityType}</span>
        <em>{relation} · {card.authority?.evidenceClass}</em>
      </header>
      <p>{explanation}</p>
      <ol>
        {(card.occurrences || []).map((occurrence, index) => (
          <li key={occurrence.id}>
            <span>{index + 1}</span>
            <div>
              <strong>{occurrence.songTitle || occurrence.songId}</strong>
              <p>{occurrence.lyricSpan?.lyricText || `Line ${occurrence.lyricSpan?.lineStart}`}</p>
              <small>
                {occurrence.relationType} · {Math.round((occurrence.confidence || 0) * 100)}% · {occurrence.status}
              </small>
            </div>
            <button type="button" onClick={() => onHandoff(occurrence)}>
              Play next linked moment
            </button>
          </li>
        ))}
      </ol>
      <small>Playback handoff preserves the focused card and graph trail.</small>
    </section>
  );
}

function EchoReferenceActivity({ activity, selectedSongId, focusedCardId, onFollow }) {
  return (
    <section className="echo-ref-activity" aria-label="Reference contribution activity and graph diffs">
      <header>
        <span><History size={14} /> Activity & change status</span>
        <div>
          <button type="button" onClick={() => selectedSongId && onFollow("song", selectedSongId)}>
            Opt in: follow this song
          </button>
          <button type="button" disabled={!focusedCardId} onClick={() => focusedCardId && onFollow("card", focusedCardId)}>
            Opt in: follow this card
          </button>
        </div>
      </header>
      <p>
        Status legend: submitted · validation-needed · review-ready · under-review · challenged · resolved · rejected
        · superseded · withdrawn · appealed. Contributor, moderator, report, and private evidence details stay hidden.
      </p>
      <ol>
        {(activity?.items || []).slice(0, 80).map((item) => (
          <li key={item.id}>
            <span>{item.status}</span>
            <div>
              <strong>{item.label}</strong>
              <p>{item.diff?.explanation}</p>
              <small>
                {item.revisionId ? `Revision ${item.revisionId}` : item.decisionId ? `Decision ${item.decisionId}` : "Pending exact revision"}
                {" · "}{item.affectedSongIds?.length || 0} songs
                {" · "}{item.affectedOccurrenceIds?.length || 0} moments
                {" · "}{item.affectedPathIds?.length || 0} paths
              </small>
            </div>
            <a href={item.pointer}>Open exact revision or decision</a>
          </li>
        ))}
      </ol>
      {!activity?.items?.length && <p className="echo-ref-empty">No contribution activity has been recorded yet.</p>}
    </section>
  );
}

function EchoReferenceContributionComposer({ state, onChange, onSubmit, onPreview, onClose, submitting, feedback, cluePreview }) {
  if (!state) return null;
  const challenge = state.kind === "challenge";
  const clue = state.isClue === true;
  return (
    <div className="echo-ref-composer-backdrop" role="presentation">
      <form className="echo-ref-composer" onSubmit={onSubmit} aria-label={clue ? "Add clue" : challenge ? "Challenge reference" : "Add reference"}>
        <header>
          <div>
            <span>{challenge || clue ? <CircleHelp size={15} /> : <CirclePlus size={15} />} {clue ? "Add a Human hint" : challenge ? "Challenge / counterinterpret" : "Add a possible reference"}</span>
            <strong>{state.cardTitle || state.songTitle}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close contribution composer"><X size={16} /></button>
        </header>
        <p className="echo-ref-policy-note">
          {clue
            ? "This is a hint, not evidence or canon. It creates append-only history and can be corrected or withdrawn."
            : "This creates an append-only local review item. It does not edit an approved card, publish data, or establish canon."}
        </p>
        <label>
          Contributor
          <input required value={state.actor} onChange={(event) => onChange({ actor: event.target.value })} />
        </label>
        <label>
          {clue ? "Clue or namespace hint" : challenge ? "Counterinterpretation and reason" : "Possible reference and interpretation"}
          <textarea required rows="5" value={state.body} onChange={(event) => onChange({ body: event.target.value })} />
        </label>
        {!challenge && !clue && (
          <label>
            Proposal type
            <select value={state.proposalType} onChange={(event) => onChange({ proposalType: event.target.value })}>
              <option value="new-card">New Reference Card</option>
              <option value="occurrence">Occurrence</option>
              <option value="cross-song-relationship">Cross-song relationship</option>
              <option value="alias">Alias / translation</option>
              <option value="source">Source evidence</option>
              <option value="alternative-interpretation">Alternative interpretation</option>
            </select>
          </label>
        )}
        {challenge && (
          <div className="echo-ref-composer-grid">
            <label>
              Challenge type
              <select value={state.challengeType} onChange={(event) => onChange({ challengeType: event.target.value })}>
                <option value="factual-correction">Factual correction</option>
                <option value="missing-evidence">Missing evidence</option>
                <option value="alternate-reading">Alternate reading / counterinterpretation</option>
                <option value="confidence-dispute">Confidence dispute</option>
                <option value="scope-dispute">Lyric or context scope dispute</option>
                <option value="privacy-rights-concern">Privacy / rights concern</option>
                <option value="abuse-report">Abuse report</option>
              </select>
            </label>
            <label>
              Disputed fields
              <input
                value={state.disputedFields}
                onChange={(event) => onChange({ disputedFields: event.target.value })}
                placeholder="identity, evidence, confidence, lyric scope, relation, interpretation"
              />
            </label>
          </div>
        )}
        {clue && (
          <div className="echo-ref-composer-grid">
            <label>
              Candidate namespaces
              <input required value={state.namespaces} onChange={(event) => onChange({ namespaces: event.target.value })} placeholder="motif, mechanic, person" />
            </label>
            <label>
              Target scope
              <select value={state.targetType} onChange={(event) => onChange({ targetType: event.target.value })}>
                <option value="unresolved-node">Unresolved node</option>
                <option value="song">Song</option>
                <option value="lyric-span">Lyric span</option>
                <option value="reference-card">Reference Card</option>
                <option value="album-namespace">Album namespace</option>
              </select>
            </label>
          </div>
        )}
        <div className="echo-ref-composer-grid">
          <label>
            Lyric line start
            <input type="number" min="1" value={state.lyricSpan?.lineStart || 1} onChange={(event) => onChange({ lyricSpan: { ...state.lyricSpan, lineStart: Number(event.target.value) } })} />
          </label>
          <label>
            Lyric line end
            <input type="number" min={state.lyricSpan?.lineStart || 1} value={state.lyricSpan?.lineEnd || state.lyricSpan?.lineStart || 1} onChange={(event) => onChange({ lyricSpan: { ...state.lyricSpan, lineEnd: Number(event.target.value) } })} />
          </label>
          <label>
            Citation label
            <input value={state.citationLabel} onChange={(event) => onChange({ citationLabel: event.target.value })} />
          </label>
          <label>
            Citation URL
            <input type="url" value={state.citationUrl} onChange={(event) => onChange({ citationUrl: event.target.value })} />
          </label>
          <label>
            Evidence visibility
            <select value={state.citationVisibility} onChange={(event) => onChange({ citationVisibility: event.target.value })}>
              <option value="shared">Shared with invited reviewers</option>
              <option value="private">Private to author/reviewer</option>
            </select>
          </label>
        </div>
        <label className="echo-ref-checkbox">
          <input type="checkbox" checked={state.containsPrivateClues} onChange={(event) => onChange({ containsPrivateClues: event.target.checked })} />
          Contains private clues (kept local/shared and excluded from public projection)
        </label>
        <p role={feedback?.tone === "error" ? "alert" : "status"}>{feedback?.message || ""}</p>
        {cluePreview && (
          <p className="echo-ref-policy-note">
            Scope preview: {cluePreview.expected?.songs || 0} songs · {cluePreview.expected?.eligiblePairs || 0} pairs
            {" · "}$0 paid external cost · post-run created/removed/reweighted/merged/invalidated diff.
          </p>
        )}
        <footer>
          <span><ShieldCheck size={13} /> Shared visibility · local/invited gate</span>
          {clue && <button type="button" onClick={onPreview}>Preview scope/cost</button>}
          <button type="submit" disabled={submitting}>{submitting ? "Recording…" : "Record for review"}</button>
        </footer>
      </form>
    </div>
  );
}

export default function EchoReferenceExplorer({
  apiBase = "",
  initialSongId = "",
  currentTime = 0,
  onSelectSong = () => {},
  onSeek = () => {},
  onNotice = () => {},
}) {
  const deepLinkRef = useRef(initialDeepLink());
  const initialLensIds = deepLinkRef.current.lens.split(",").filter((id) => LENSES.some((item) => item.id === id));
  const [summary, setSummary] = useState(null);
  const [projection, setProjection] = useState(null);
  const [selectedSongId, setSelectedSongId] = useState(deepLinkRef.current.songId || initialSongId);
  const [focusedCardId, setFocusedCardId] = useState(deepLinkRef.current.cardId);
  const [lens, setLens] = useState(initialLensIds[0] || "all");
  const [secondaryLenses, setSecondaryLenses] = useState(initialLensIds.slice(1));
  const [mode, setMode] = useState(MODES.some((item) => item.id === deepLinkRef.current.mode) ? deepLinkRef.current.mode : "explore");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [composer, setComposer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [batchPreview, setBatchPreview] = useState(null);
  const [cluePreview, setCluePreview] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [showCandidates, setShowCandidates] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [activity, setActivity] = useState(null);
  const projectionRequestRef = useRef(0);

  const loadSummary = useCallback(async () => {
    const response = await fetch(`${apiBase}/api/echos/references?summary=1`);
    if (!response.ok) throw new Error(`Reference atlas failed to load (${response.status}).`);
    const payload = await response.json();
    setSummary(payload);
    setSelectedSongId((current) => current || initialSongId || payload.songs?.[0]?.id || "");
    return payload;
  }, [apiBase, initialSongId]);

  const loadSong = useCallback(async (songId) => {
    if (!songId) return null;
    const request = projectionRequestRef.current + 1;
    projectionRequestRef.current = request;
    const response = await fetch(`${apiBase}/api/echos/references?songId=${encodeURIComponent(songId)}`);
    if (!response.ok) throw new Error(`Reference neighborhood failed to load (${response.status}).`);
    const payload = await response.json();
    if (projectionRequestRef.current !== request) return null;
    setProjection(payload);
    setFocusedCardId((current) => (
      payload.cards?.some((card) => card.id === current) ? current : payload.cards?.[0]?.id || ""
    ));
    return payload;
  }, [apiBase]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSummary()
      .catch((error) => active && onNotice(error.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadSummary, onNotice]);

  useEffect(() => {
    fetch(`${apiBase}/api/echos/references/batches/preview`)
      .then((response) => response.ok ? response.json() : null)
      .then(setBatchPreview)
      .catch(() => setBatchPreview(null));
  }, [apiBase]);

  useEffect(() => {
    fetch(`${apiBase}/api/echos/references/metrics`)
      .then((response) => response.ok ? response.json() : null)
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, [apiBase, summary?.runHash]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => {
      fetch(`${apiBase}/api/echos/references/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : { results: [] })
        .then((payload) => setSearchResults(payload.results || []))
        .catch(() => setSearchResults([]));
    }, 120);
    return () => {
      globalThis.clearTimeout(timeout);
      controller.abort();
    };
  }, [apiBase, query]);

  useEffect(() => {
    if (mode !== "activity") return undefined;
    let active = true;
    fetch(`${apiBase}/api/echos/references/activity`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => active && setActivity(payload))
      .catch(() => active && setActivity(null));
    return () => { active = false; };
  }, [apiBase, mode]);

  useEffect(() => {
    if (!selectedSongId) return undefined;
    let active = true;
    setLoading(true);
    loadSong(selectedSongId)
      .catch((error) => active && onNotice(error.message))
      .finally(() => active && setLoading(false));
    onSelectSong(selectedSongId);
    return () => { active = false; };
  }, [loadSong, onNotice, onSelectSong, selectedSongId]);

  useEffect(() => {
    syncDeepLink({ songId: selectedSongId, cardId: focusedCardId, lens: [lens, ...secondaryLenses].join(","), mode });
  }, [focusedCardId, lens, mode, secondaryLenses, selectedSongId]);

  const authorityCards = useMemo(() => (projection?.cards || []).filter((card) => (
    showCandidates || card.authority?.reviewStatus === "approved"
  )), [projection?.cards, showCandidates]);
  const authorityCardIds = useMemo(() => new Set(authorityCards.map((card) => card.id)), [authorityCards]);
  const playbackSong = useMemo(() => projection?.song ? {
    ...projection.song,
    timeline: (projection.song.timeline || []).filter((cue) => authorityCardIds.has(cue.cardId)),
  } : null, [authorityCardIds, projection?.song]);
  const visibleGraph = useMemo(() => {
    const graph = projection?.graph || { nodes: [], edges: [] };
    const nodeIds = new Set((graph.nodes || [])
      .filter((node) => node.type !== "reference-card" || authorityCardIds.has(node.id))
      .map((node) => node.id));
    return {
      ...graph,
      nodes: (graph.nodes || []).filter((node) => nodeIds.has(node.id)),
      edges: (graph.edges || []).filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)),
    };
  }, [authorityCardIds, projection?.graph]);
  const activeCue = useMemo(() => cueAtTime(playbackSong?.timeline, currentTime), [currentTime, playbackSong?.timeline]);
  useEffect(() => {
    if (!pinned && activeCue?.cardId) setFocusedCardId(activeCue.cardId);
  }, [activeCue?.cardId, pinned]);

  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activeLenses = [lens, ...secondaryLenses].filter((value) => value !== "all");
    return authorityCards.filter((card) => (
      (activeLenses.length === 0 || activeLenses.every((activeLens) => cardMatchesLens(card, activeLens)))
      && (!normalizedQuery || cardSearchText(card).includes(normalizedQuery))
    ));
  }, [authorityCards, lens, query, secondaryLenses]);
  const focusedCard = useMemo(() => (
    authorityCards.find((card) => card.id === focusedCardId) || null
  ), [authorityCards, focusedCardId]);
  const selectedSong = useMemo(() => (
    (summary?.songs || projection?.songs || []).find((song) => song.id === selectedSongId) || null
  ), [projection?.songs, selectedSongId, summary?.songs]);
  const focusedIndex = visibleCards.findIndex((card) => card.id === focusedCardId);

  useEffect(() => {
    if (!focusedCardId) {
      setInspection(null);
      return undefined;
    }
    let active = true;
    const params = new URLSearchParams({
      cardId: focusedCardId,
      songId: selectedSongId,
      playbackSeconds: String(currentTime || 0),
    });
    fetch(`${apiBase}/api/echos/references/inspector?${params}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => active && setInspection(payload))
      .catch(() => active && setInspection(null));
    return () => { active = false; };
  }, [apiBase, currentTime, focusedCardId, selectedSongId]);

  useEffect(() => {
    const handleKeys = (event) => {
      if (composer || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "[" && visibleCards.length) {
        event.preventDefault();
        setFocusedCardId(visibleCards[(focusedIndex - 1 + visibleCards.length) % visibleCards.length].id);
      }
      if (event.key === "]" && visibleCards.length) {
        event.preventDefault();
        setFocusedCardId(visibleCards[(focusedIndex + 1) % visibleCards.length].id);
      }
    };
    globalThis.addEventListener?.("keydown", handleKeys);
    return () => globalThis.removeEventListener?.("keydown", handleKeys);
  }, [composer, focusedIndex, visibleCards]);

  const runWholeAlbum = async () => {
    setMining(true);
    setFeedback(null);
    onNotice("Mining all Echo songs locally. Every song is being compared against every other song…");
    try {
      const response = await fetch(`${apiBase}/api/echos/references/mine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, maxCandidatesPerSong: 8 }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Album mining failed.");
      await loadSummary();
      await loadSong(selectedSongId);
      const message = `${payload.work.songs} songs processed across ${payload.work.pairsCompared.toLocaleString()} pairs; ${payload.work.cards.toLocaleString()} local cards compiled. Public and canon remain off.`;
      setFeedback({ tone: "success", message });
      onNotice(message);
    } catch (error) {
      const message = error.message || String(error);
      setFeedback({ tone: "error", message });
      onNotice(message);
    } finally {
      setMining(false);
    }
  };

  const runSelectedSong = async () => {
    if (!selectedSongId) return;
    setMining(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiBase}/api/echos/references/mine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, songId: selectedSongId, maxCandidatesPerSong: 8 }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Song mining failed.");
      await loadSummary();
      await loadSong(selectedSongId);
      const message = `${selectedSong?.title || selectedSongId} compared locally against all other album sources across ${payload.work.pairsCompared} scoped pairs. No candidate was auto-approved.`;
      setFeedback({ tone: "success", message });
      onNotice(message);
    } catch (error) {
      setFeedback({ tone: "error", message: error.message || String(error) });
    } finally {
      setMining(false);
    }
  };

  const openComposer = (kind, card = null) => {
    setFeedback(null);
    setCluePreview(null);
    setComposer({
      kind,
      proposalType: "new-card",
      challengeType: "alternate-reading",
      disputedFields: "",
      actor: "local-human",
      body: "",
      songId: selectedSongId,
      songTitle: selectedSong?.title || selectedSongId,
      targetId: card?.id || "",
      targetRevisionId: card?.revisionId || "",
      cardTitle: card?.title || "",
      citationLabel: "",
      citationUrl: "",
      citationVisibility: "shared",
      containsPrivateClues: false,
      isClue: card?.isClue === true || String(card?.id || "").startsWith("unresolved:"),
      targetType: card?.targetType || "unresolved-node",
      namespaces: (card?.possibleNamespaces || []).join(", "),
      lyricSpan: card?.occurrences?.find((occurrence) => occurrence.songId === selectedSongId)?.lyricSpan || {
        lineStart: 1,
        lineEnd: 1,
        startSeconds: currentTime,
        endSeconds: currentTime,
      },
    });
  };

  const submitContribution = async (event) => {
    event.preventDefault();
    if (!composer) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (composer.isClue) {
        const clueResponse = await fetch(`${apiBase}/api/echos/references/clues`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor: composer.actor,
            hint: composer.body,
            targetType: composer.targetType,
            targetId: composer.targetType === "song" ? composer.songId : composer.targetId,
            songIds: [composer.songId],
            lyricSpan: composer.lyricSpan,
            namespaces: composer.namespaces.split(",").map((value) => value.trim()).filter(Boolean),
            visibility: "shared",
            containsPrivateClues: composer.containsPrivateClues,
          }),
        });
        const cluePayload = await clueResponse.json();
        if (!clueResponse.ok || cluePayload.ok === false) throw new Error(cluePayload.message || cluePayload.error || "Clue was not recorded.");
        setFeedback({ tone: "success", message: "Clue recorded as a hint for scoped rerun; evidence, approval, public, and canon states are unchanged." });
        setComposer(null);
        return;
      }
      const citations = composer.citationUrl ? [{
        label: composer.citationLabel || composer.citationUrl,
        url: composer.citationUrl,
        sourceClass: "user-supplied",
        visibility: composer.citationVisibility,
      }] : [];
      const response = await fetch(`${apiBase}/api/echos/references/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: composer.kind,
          proposalType: composer.proposalType,
          challengeType: composer.kind === "challenge" ? composer.challengeType : undefined,
          disputedFields: composer.kind === "challenge"
            ? composer.disputedFields.split(",").map((value) => value.trim()).filter(Boolean)
            : [],
          counterinterpretation: composer.kind === "challenge" && composer.challengeType === "alternate-reading"
            ? composer.body
            : "",
          proposedTitle: composer.cardTitle || composer.body.split(/\r?\n/)[0],
          actor: composer.actor,
          displayName: composer.actor,
          body: composer.body,
          songId: composer.songId,
          targetId: composer.targetId,
          targetRevisionId: composer.targetRevisionId,
          lyricSpan: composer.lyricSpan,
          citations,
          visibility: "shared",
          containsPrivateClues: composer.containsPrivateClues,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Contribution was not recorded.");
      if (payload.duplicateRoute) {
        setFocusedCardId(payload.duplicateRoute.cardId);
        setMode("compare");
        setComposer(null);
        const duplicateMessage = `Possible duplicate routed to existing card: ${payload.duplicateRoute.title}.`;
        setFeedback({ tone: "success", message: duplicateMessage });
        onNotice(duplicateMessage);
        return;
      }
      const message = `${composer.kind === "challenge" ? "Challenge" : "Reference proposal"} recorded for local review. Approved cards and canon are unchanged.`;
      setFeedback({ tone: "success", message });
      onNotice(message);
      await loadSong(selectedSongId);
      setComposer(null);
    } catch (error) {
      setFeedback({ tone: "error", message: error.message || String(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const previewClue = async () => {
    if (!composer?.isClue) return;
    const response = await fetch(`${apiBase}/api/echos/references/clues/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: composer.actor,
        hint: composer.body,
        targetType: composer.targetType,
        targetId: composer.targetType === "song" ? composer.songId : composer.targetId,
        songIds: [composer.songId],
        lyricSpan: composer.lyricSpan,
        namespaces: composer.namespaces.split(",").map((value) => value.trim()).filter(Boolean),
        visibility: "shared",
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      setFeedback({ tone: "error", message: payload.message || payload.error || "Clue preview failed." });
      return;
    }
    setCluePreview(payload);
  };

  const followReferenceScope = async (scopeType, scopeId) => {
    try {
      const response = await fetch(`${apiBase}/api/echos/references/follows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followerId: "local-listener",
          scopeType,
          scopeId,
          optIn: true,
          maxNotificationsPerHour: 5,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "Follow could not be recorded.");
      setFeedback({ tone: "success", message: `Following this ${scopeType}; notifications are private, opt-in, and limited to five per hour.` });
    } catch (error) {
      setFeedback({ tone: "error", message: error.message || String(error) });
    }
  };

  const submitReviewDecision = async (review) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiBase}/api/echos/references/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || "Review decision was not recorded.");
      const message = `${review.action} recorded append-only for ${focusedCard?.title || review.cardId}. Public and canon authority remain unchanged.`;
      setFeedback({ tone: "success", message });
      onNotice(message);
      await loadSong(selectedSongId);
    } catch (error) {
      setFeedback({ tone: "error", message: error.message || String(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !summary) {
    return <div className="echo-ref-loading"><Sparkles size={18} /> Building the album reference atlas…</div>;
  }

  return (
    <section className="echo-reference-explorer" data-mode={mode} aria-label="Echo Album Reference Explorer">
      <header className="echo-ref-hero">
        <div>
          <p>Hapa Reference Atlas · local first</p>
          <h3><Network size={20} /> Mine References across the complete album</h3>
          <span>
            Every one of {summary?.album?.songCount || 0} songs can be both a target and a reference source.
            Suggestions remain reviewable; public and canon authority stay separate.
          </span>
        </div>
        <div className="echo-ref-run-controls">
          <span><b>{summary?.audit?.pairsCompared?.toLocaleString() || "8,911"}</b> song pairs</span>
          <span><b>{summary?.graph?.counts?.cards?.toLocaleString() || summary?.audit?.validCards?.toLocaleString() || "—"}</b> cards</span>
          <span><b>{summary?.unresolved?.length || 0}</b> unresolved</span>
          <span><b>{batchPreview?.estimatedLocalWorkUnits?.toLocaleString() || "—"}</b> local work units · $0 paid</span>
          <button type="button" onClick={runSelectedSong} disabled={mining || !selectedSongId}>
            <Search size={14} /> Mine selected song
          </button>
          <button type="button" onClick={runWholeAlbum} disabled={mining}>
            <Sparkles size={14} /> {mining ? "Mining all songs…" : "Mine all songs locally"}
          </button>
        </div>
      </header>

      <nav className="echo-ref-mode-tabs" aria-label="Reference explorer mode">
        {MODES.map((item) => (
          <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
            {item.label}
          </button>
        ))}
        <span>Keyboard: [ previous card · ] next card</span>
      </nav>

      <div className="echo-ref-toolbar">
        <label>
          <span>Song</span>
          <select value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)}>
            {(summary?.songs || []).map((song) => (
              <option key={song.id} value={song.id}>{song.trackNumber}. {song.title}</option>
            ))}
          </select>
        </label>
        <label className="echo-ref-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards, lyrics, motifs, mechanics…" />
        </label>
        <div className="echo-ref-lenses" aria-label="Semantic reference lenses">
          {LENSES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={lens === item.id || secondaryLenses.includes(item.id) ? "active" : ""}
              onClick={(event) => {
                if ((event.shiftKey || event.metaKey || event.ctrlKey) && item.id !== "all" && lens !== item.id) {
                  setSecondaryLenses((current) => current.includes(item.id)
                    ? current.filter((value) => value !== item.id)
                    : [...current, item.id]);
                } else {
                  setLens(item.id);
                  setSecondaryLenses([]);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={showCandidates ? "active" : ""}
          aria-pressed={showCandidates}
          onClick={() => setShowCandidates((value) => !value)}
        >
          {showCandidates ? "Hide review candidates" : "Show review candidates"}
        </button>
      </div>
      <p className="echo-ref-lens-legend">
        Legend: song ▭ · Reference Card ● · solid/dashed edge = approved/proposed · ✓/◌/!/? = approved/review/challenged/unresolved
        {" · "}confidence is numeric. Shift-click compatible lenses to combine.
        {authorityCards.length > visibleCards.length ? ` ${authorityCards.length - visibleCards.length} cards hidden by the current lens or search.` : ""}
      </p>
      {searchResults.length > 0 && (
        <div className="echo-ref-search-results" role="listbox" aria-label="Album reference graph search results">
          {searchResults.slice(0, 12).map((result) => (
            <button key={result.id} type="button" role="option" onClick={() => {
              if (result.type === "song") setSelectedSongId(result.id.replace(/^song:/, ""));
              else if (result.type === "reference-card") {
                setFocusedCardId(result.id);
                setShowCandidates(true);
              } else {
                setLens("unresolved");
                setSecondaryLenses([]);
              }
              setQuery("");
            }}>
              <span>{result.type}</span> {result.label}
            </button>
          ))}
        </div>
      )}

      {feedback?.message && (
        <p className={`echo-ref-feedback ${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.tone === "error" ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />} {feedback.message}
        </p>
      )}

      <EchoReferenceTimeline
        song={playbackSong}
        unresolved={projection?.unresolved}
        focusedCardId={focusedCardId}
        currentTime={currentTime}
        onSeek={onSeek}
        onFocusCard={setFocusedCardId}
      />

      <div className="echo-ref-card-nav">
        <button
          type="button"
          disabled={!visibleCards.length}
          onClick={() => visibleCards.length && setFocusedCardId(visibleCards[(focusedIndex - 1 + visibleCards.length) % visibleCards.length].id)}
          aria-label="Previous Reference Card"
        ><ChevronLeft size={15} /></button>
        <EchoReferenceCardRail
          cards={visibleCards}
          focusedCardId={focusedCardId}
          pinned={pinned}
          onFocusCard={setFocusedCardId}
          onTogglePin={() => setPinned((value) => !value)}
          onAdd={(card) => openComposer("proposal", card)}
          onChallenge={(card) => openComposer("challenge", card)}
          onJumpOccurrence={(occurrence) => {
            setSelectedSongId(occurrence.songId);
            if (occurrence.lyricSpan?.startSeconds !== null) onSeek(occurrence.lyricSpan.startSeconds);
          }}
        />
        <button
          type="button"
          disabled={!visibleCards.length}
          onClick={() => visibleCards.length && setFocusedCardId(visibleCards[(focusedIndex + 1) % visibleCards.length].id)}
          aria-label="Next Reference Card"
        ><ChevronRight size={15} /></button>
      </div>

      <div className="echo-ref-workspace">
        <EchoReferenceMindMap
          graph={visibleGraph}
          focusedCardId={focusedCardId}
          currentSongId={selectedSongId}
          privacyProjection={showCandidates ? "review candidates explicitly enabled" : "approved-safe projection"}
          onFocusCard={setFocusedCardId}
        />
        <EchoReferenceInspector
          card={focusedCard}
          inspection={inspection}
          mode={mode}
          onClose={() => setFocusedCardId("")}
          onAdd={(card) => openComposer("proposal", card)}
          onChallenge={(card) => openComposer("challenge", card)}
        />
      </div>

      {mode === "review" && (
        <EchoReferenceReviewWorkbench
          card={focusedCard}
          inspection={inspection}
          submitting={submitting}
          onSubmit={submitReviewDecision}
        />
      )}

      {mode === "story" && (
        <EchoReferenceStoryPath
          card={focusedCard}
          onHandoff={(occurrence) => {
            setPinned(true);
            setSelectedSongId(occurrence.songId);
            if (occurrence.lyricSpan?.startSeconds !== null) onSeek(occurrence.lyricSpan.startSeconds);
          }}
        />
      )}

      {mode === "activity" && (
        <EchoReferenceActivity
          activity={activity}
          selectedSongId={selectedSongId}
          focusedCardId={focusedCardId}
          onFollow={followReferenceScope}
        />
      )}

      {mode !== "listen" && (
        <>
          <EchoReferenceOperations metrics={metrics} />
          <EchoUnresolvedQueue
            nodes={projection?.unresolved}
            onAddClue={(node) => openComposer("proposal", {
              id: node.id,
              revisionId: "",
              title: node.label,
              occurrences: [],
              isClue: true,
              targetType: "unresolved-node",
              possibleNamespaces: node.possibleNamespaces,
            })}
          />
          <EchoReferenceAtlas
            atlas={summary?.atlas}
            connectionMatrix={summary?.songConnectionMatrix}
            selectedSongId={selectedSongId}
            onSelectSong={setSelectedSongId}
            query={query}
          />
        </>
      )}

      <footer className="echo-ref-local-gate">
        <span><ShieldCheck size={14} /> Local/invited gate active</span>
        <span><ListTree size={14} /> Append-only proposals and challenges</span>
        <span><Link2 size={14} /> Every visible path keeps evidence and lineage</span>
        <button type="button" onClick={() => openComposer("proposal", focusedCard)}>
          <CirclePlus size={13} /> Add another possible reference
        </button>
      </footer>

      <EchoReferenceContributionComposer
        state={composer}
        onChange={(patch) => setComposer((current) => ({ ...current, ...patch }))}
        onSubmit={submitContribution}
        onPreview={previewClue}
        onClose={() => setComposer(null)}
        submitting={submitting}
        feedback={feedback}
        cluePreview={cluePreview}
      />
    </section>
  );
}
