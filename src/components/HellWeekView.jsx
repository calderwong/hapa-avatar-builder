import { useEffect, useState, useRef } from "react";
import {
  Flame,
  Search,
  Maximize2,
  Film,
  Tags,
  RefreshCw,
  Sparkles,
  Layers3,
  Play,
  Pause,
  BookOpen
} from "lucide-react";
import { builderPickupDataset } from "../overcard/pickup.js";
import { useOvercardPlacement, useOvercardResponsibility, useOvercardStore } from "@hapa/overcard/react";
import { commitPlacementCommand, createAttachCommand } from "@hapa/overcard/core";
import { transitionHellWeekBinding } from "../overcard/hellWeekResponsibility.js";

export default function HellWeekView({ onExpand, onPreview, onPreviewHide }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sourceState, setSourceState] = useState({ status: "loading", lastKnownCards: 0 });
  const [search, setSearch] = useState("");
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterType, setFilterType] = useState("all");
  const [sortType, setSortType] = useState("richness");
  const videoRef = useRef(null);
  const responsibilityBindings = useOvercardResponsibility();
  const placement = useOvercardPlacement();
  const overcardStore = useOvercardStore();
  const [responsibilityRun, setResponsibilityRun] = useState({ status: "idle", message: "", receipt: null });
  const hellWeekBinding = Object.values(responsibilityBindings).filter((binding) => binding.target?.nodeId === "hapa-dev-proto" && binding.target?.processId === "hell-week").sort((a, b) => String(b.activatedAt || b.createdAt).localeCompare(String(a.activatedAt || a.createdAt)))[0] || null;

  // Telemetry states
  const [stats, setStats] = useState({
    total: 0,
    videos: 0,
    imagesOnly: 0,
    noArt: 0
  });

  const PAGE_SIZE = 24;
  const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
  const API_BASE = electronApiBase || (globalThis.location?.port === "5178" ? "http://127.0.0.1:8787" : "");

  // Always fetch the full list of Hell Week cards from the server
  const loadCards = async ({ refresh = false } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/hell-week/cards?envelope=1${refresh ? "&refresh=1" : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const message = data?.error?.message || `Hell Week source returned HTTP ${res.status}`;
        const dependency = data?.error?.dependency || "hapa-dev-proto-sqlite";
        setSourceState({
          status: "degraded",
          dependency,
          lastKnownCards: data?.counts?.lastKnownCards || sourceState.lastKnownCards || cards.length,
          lastSuccess: data?.lastSuccess || sourceState.lastSuccess || null
        });
        throw new Error(`${dependency}: ${message}`);
      }
      const loadedCards = Array.isArray(data?.cards) ? data.cards : [];

      // Calculate stats on raw data
      const total = loadedCards.length;
      let videos = 0;
      let imagesOnly = 0;
      let noArt = 0;

      loadedCards.forEach(card => {
        if (!card) return;
        const hasVideo = card.assets && card.assets.some(a => a && a.type === "video");
        const hasImage = card.assets && card.assets.some(a => a && a.type === "image");
        if (hasVideo) videos++;
        else if (hasImage) imagesOnly++;
        else noArt++;
      });

      setStats({ total, videos, imagesOnly, noArt });
      setCards(loadedCards);
      setSourceState({
        status: "healthy",
        adapter: data?.source?.adapter || "sqlite-readonly",
        owner: data?.source?.owner || "hapa-dev-proto",
        generatedAt: data?.generatedAt || null,
        cursor: data?.cursor?.token || null,
        lastKnownCards: total,
        lastSuccess: data?.generatedAt || null
      });

      if (loadedCards.length > 0) {
        // Find the first complete/media-rich card to default select
        const sortedForDefault = [...loadedCards].sort((a, b) => {
          const getMediaScore = (card) => {
            if (!card) return 0;
            const hasVideo = card.assets && card.assets.some(a => a && a.type === "video");
            const hasImage = card.assets && card.assets.some(a => a && a.type === "image");
            const hasNarrative = !!(card.three_paragraph_background_narrative?.origin || card.mind?.summary || "").trim();
            const hasSkills = !!(card.mind?.skills && card.mind.skills.length > 0);
            if (hasImage && hasVideo && hasNarrative && hasSkills) return 10;
            if (hasImage && hasVideo) return 8;
            if (hasVideo) return 6;
            if (hasImage) return 4;
            return 0;
          };
          return getMediaScore(b) - getMediaScore(a);
        });
        setSelectedCardId(sortedForDefault[0].id);
      }
    } catch (err) {
      console.error("Failed to load Hell Week cards:", err);
      setError(err?.message || "Failed to load cards. Make sure hapa-dev-proto DB is accessible.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  useEffect(() => {
    if (!selectedCardId) return undefined;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/hell-week/cards/${encodeURIComponent(selectedCardId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Hell Week detail returned HTTP ${response.status}`);
        return response.json();
      })
      .then((fullCard) => {
        if (!fullCard?.id) return;
        setCards((current) => current.map((card) => card?.id === fullCard.id ? fullCard : card));
      })
      .catch((detailError) => {
        if (detailError?.name !== "AbortError") {
          console.warn("Failed to hydrate full Hell Week card narrative:", detailError);
        }
      });
    return () => controller.abort();
  }, [API_BASE, selectedCardId]);

  // Compute filtered and sorted cards dynamically on render
  const filteredAndSortedCards = cards
    .filter(card => {
      if (!card) return false;
      
      // 1. Search filter
      const query = search.toLowerCase();
      const name = card.primaryName || "";
      const summary = card.mind?.summary || "";
      const skillsText = (card.mind?.skills || []).map(s => `${s?.name || ""} ${s?.description || ""}`).join(" ");
      const setsText = (card.three_paragraph_background_narrative?.manifesto || "");
      const matchesSearch = (
        name.toLowerCase().includes(query) ||
        summary.toLowerCase().includes(query) ||
        skillsText.toLowerCase().includes(query) ||
        setsText.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;

      // 2. Tab/Category filter type
      const hasVideo = card.assets && card.assets.some(a => a && a.type === "video");
      const hasImage = card.assets && card.assets.some(a => a && a.type === "image");
      const hasNarrative = !!(card.three_paragraph_background_narrative?.origin || card.mind?.summary || "").trim();
      const hasSkills = !!(card.mind?.skills && card.mind.skills.length > 0);
      const isComplete = hasImage && hasVideo && hasNarrative && hasSkills;

      if (filterType === "complete") return isComplete;
      if (filterType === "video") return hasVideo;
      if (filterType === "image") return hasImage;
      if (filterType === "text") return !hasVideo && !hasImage;
      return true; // "all"
    })
    .sort((a, b) => {
      // 3. Sorting logic
      if (sortType === "name-asc") {
        return (a.primaryName || "").localeCompare(b.primaryName || "");
      }
      if (sortType === "name-desc") {
        return (b.primaryName || "").localeCompare(a.primaryName || "");
      }
      if (sortType === "newest") {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortType === "oldest") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      
      // "richness" (default complete cards first)
      const getMediaScore = (card) => {
        if (!card) return 0;
        const hasVideo = card.assets && card.assets.some(a => a && a.type === "video");
        const hasImage = card.assets && card.assets.some(a => a && a.type === "image");
        const hasNarrative = !!(card.three_paragraph_background_narrative?.origin || card.mind?.summary || "").trim();
        const hasSkills = !!(card.mind?.skills && card.mind.skills.length > 0);

        if (hasImage && hasVideo && hasNarrative && hasSkills) return 10;
        if (hasImage && hasVideo) return 8;
        if (hasVideo) return 6;
        if (hasImage) return 4;
        return 0;
      };
      const scoreA = getMediaScore(a);
      const scoreB = getMediaScore(b);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return (a.primaryName || "").localeCompare(b.primaryName || "");
    });

  const visibleCards = filteredAndSortedCards.slice(0, visibleCount);

  const selectedCard = cards.find(c => c && c.id === selectedCardId);

  const handleScroll = (e) => {
    const target = e.currentTarget || e.target;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const remaining = scrollHeight - scrollTop - clientHeight;
    
    // Log scroll parameters for diagnostic clarity in browser dev console
    console.log(`[HellWeekScroll] scrollTop: ${scrollTop}, scrollHeight: ${scrollHeight}, clientHeight: ${clientHeight}, remaining: ${remaining}px`);

    if (remaining < 400) {
      if (visibleCount < filteredAndSortedCards.length) {
        console.log(`[HellWeekScroll] Threshold hit. Loading next page. Old count: ${visibleCount}`);
        setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredAndSortedCards.length));
      }
    }
  };

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  async function prepareNextRun() {
    if (!hellWeekBinding || hellWeekBinding.status !== "active") return;
    setResponsibilityRun({ status: "preparing", message: "Freezing Red's next-run context…", receipt: null });
    try {
      const response = await fetch(`${API_BASE}/api/overcard/hell-week/prepare-next-run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ binding: hellWeekBinding, confirmed: true, confirmationId: crypto.randomUUID(), actor: "calder", traceId: hellWeekBinding.provenance?.traceId }) });
      const result = await response.json().catch(() => ({})); if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `Prepare failed: ${response.status}`);
      setResponsibilityRun({ status: "ready", message: `${result.prepared?.principal?.label || result.prepared?.principal?.entityId} will manage the next Hell Week run.`, receipt: result });
    } catch (error) { setResponsibilityRun({ status: "degraded", message: `${error.message}. Hell Week will keep process defaults.`, receipt: null }); }
  }

  async function controlResponsibility(status) {
    if (!hellWeekBinding) return;
    const at = new Date().toISOString(); setResponsibilityRun({ status: "updating", message: `${status} responsibility…`, receipt: null });
    try {
      const response = await fetch(`${API_BASE}/api/overcard/hell-week/binding-control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bindingId: hellWeekBinding.id, status, actor: "calder" }) });
      const result = await response.json().catch(() => ({})); if (!response.ok || result.ok === false) throw new Error(result.message || result.error || `Control failed: ${response.status}`);
      const transition = transitionHellWeekBinding(hellWeekBinding, status, "calder", at);
      await overcardStore.dispatch("state.upsert", { record: { kind: "responsibility-binding", id: transition.binding.id, value: transition.binding, summary: `Hell Week responsibility ${status}` } });
      const attachment = Object.values(placement.attachments).find((item) => item.bindingId === hellWeekBinding.id);
      if (attachment) {
        const ctx = { id: `hell-week-${status}:${at}`, actor: "calder", at, provenance: { source: "hapa-avatar-builder:hell-week-control", actor: "calder", createdAt: at, traceId: `${hellWeekBinding.provenance.traceId}:${status}` } };
        const receipt = commitPlacementCommand(placement, createAttachCommand({ state: placement, ...ctx, attachment: { ...structuredClone(attachment), status: transition.attachmentStatus, updatedAt: at } }));
        await overcardStore.dispatch("state.upsert", { record: { kind: "placement-ledger", id: "canonical", value: receipt.state, summary: `Hell Week attachment ${status}` } });
      }
      setResponsibilityRun({ status, message: `${status}: current run ${transition.currentRun}; next run uses process defaults.`, receipt: result });
    } catch (error) { setResponsibilityRun({ status: "degraded", message: `${error.message}. Next run remains on process defaults.`, receipt: null }); }
  }

  const getAssetUrl = (asset) => {
    if (!asset || !asset.uri) return "";
    return asset.uri.startsWith("http") ? asset.uri : `${API_BASE}${asset.uri}`;
  };

  const imageAsset = selectedCard?.assets?.find(a => a && a.type === "image");
  const videoAsset = selectedCard?.assets?.find(a => a && a.type === "video");

  return (
    <div className="tarot-workspace" style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "20px", height: "100%", minHeight: "680px", maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>
      <section className="hapa-panel" data-variant="notch" data-hell-week-responsibility={hellWeekBinding?.status || "defaults"} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "10px 14px" }}>
        <div><strong>{hellWeekBinding ? `${hellWeekBinding.principal.label || hellWeekBinding.principal.entityId} / ${hellWeekBinding.role}` : "Hell Week process defaults"}</strong><p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: "11px" }}>{hellWeekBinding ? `Avatar context available · executable runtime ${responsibilityRun.status === "ready" ? "queued" : "not yet queued"} · ${hellWeekBinding.status}` : "No active ResponsibilityBinding; no avatar is impersonated."}</p><p role="status" aria-live="polite" style={{ margin: "3px 0 0", fontSize: "11px" }}>{responsibilityRun.message}</p></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="hapa-btn" type="button" disabled={!hellWeekBinding || hellWeekBinding.status !== "active" || responsibilityRun.status === "preparing"} onClick={prepareNextRun}>Prepare next run</button>
          <button className="hapa-btn" type="button" disabled={!hellWeekBinding || hellWeekBinding.status !== "active"} onClick={() => controlResponsibility("paused")}>Pause</button>
          <button className="hapa-btn" type="button" disabled={!hellWeekBinding || ["revoked", "removed"].includes(hellWeekBinding.status)} onClick={() => controlResponsibility("revoked")}>Revoke</button>
          <button className="hapa-btn" type="button" disabled={!hellWeekBinding} onClick={() => controlResponsibility("removed")}>Remove</button>
        </div>
      </section>
      
      {/* Grid view showing cards as tiles */}
      <section className="panel hapa-panel" data-variant="notch" style={{ display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden", height: "100%" }}>
        <div className="section-head hapa-panel-head" style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Flame size={15} color="#ec4899" className="pulse" />
            Hell Week Tarot Cards (Database Source)
          </span>
          <div style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
            <span style={{ background: sourceState.status === "healthy" ? "rgba(113,247,191,0.12)" : "rgba(248,113,113,0.12)", color: sourceState.status === "healthy" ? "#71f7bf" : "#f87171", padding: "2px 6px", borderRadius: "4px", border: `1px solid ${sourceState.status === "healthy" ? "rgba(113,247,191,0.25)" : "rgba(248,113,113,0.3)"}` }}>
              {sourceState.status === "healthy" ? "SOURCE LIVE" : "SOURCE DEGRADED"}
            </span>
            <span style={{ background: "rgba(236,72,153,0.15)", color: "#ec4899", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(236,72,153,0.3)" }}>
              {stats.total} Total
            </span>
            <span style={{ background: "rgba(113,247,191,0.12)", color: "#71f7bf", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(113,247,191,0.25)" }}>
              {stats.videos} Videos
            </span>
            <span style={{ background: "rgba(122,213,255,0.12)", color: "#7ad5ff", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(122,213,255,0.25)" }}>
              {stats.imagesOnly} Images
            </span>
            <span style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(148,163,184,0.25)" }}>
              {stats.noArt} No Art
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <label className="search-box hapa-field" style={{ flex: 1 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search by title, skills, set lore..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE); // reset infinite scroll count on search
              }}
              style={{ width: "100%", background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: "12px" }}
            />
          </label>
          <button
            className="hapa-btn"
            onClick={() => loadCards({ refresh: true })}
            disabled={loading}
            title="Reload from local database"
            style={{ padding: "6px 10px", display: "grid", placeItems: "center" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Sort & Filter Controls */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", flexShrink: 0, paddingBottom: "4px", fontSize: "11px" }}>
          {/* Filter Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "var(--muted)" }}>Filter:</span>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              style={{ background: "transparent", border: "none", color: "#7ad5ff", outline: "none", cursor: "pointer", fontWeight: "700" }}
            >
              <option value="all" style={{ background: "#0b1528", color: "#7ad5ff" }}>All Cards</option>
              <option value="complete" style={{ background: "#0b1528", color: "#7ad5ff" }}>Complete Compiled</option>
              <option value="video" style={{ background: "#0b1528", color: "#7ad5ff" }}>Has Video Loop</option>
              <option value="image" style={{ background: "#0b1528", color: "#7ad5ff" }}>Has Image Art</option>
              <option value="text" style={{ background: "#0b1528", color: "#7ad5ff" }}>Text-Only / No Art</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "var(--muted)" }}>Sort by:</span>
            <select
              value={sortType}
              onChange={(e) => {
                setSortType(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              style={{ background: "transparent", border: "none", color: "#ec4899", outline: "none", cursor: "pointer", fontWeight: "700" }}
            >
              <option value="richness" style={{ background: "#0b1528", color: "#ec4899" }}>Richness (Complete First)</option>
              <option value="name-asc" style={{ background: "#0b1528", color: "#ec4899" }}>Title (A-Z)</option>
              <option value="name-desc" style={{ background: "#0b1528", color: "#ec4899" }}>Title (Z-A)</option>
              <option value="newest" style={{ background: "#0b1528", color: "#ec4899" }}>Newest Created</option>
              <option value="oldest" style={{ background: "#0b1528", color: "#ec4899" }}>Oldest Created</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: "11px", color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px dashed rgba(248,113,113,0.3)", padding: "8px", borderRadius: "6px", flexShrink: 0 }}>
            <strong>Hell Week source degraded.</strong> {error}
            {sourceState.lastKnownCards > 0 ? ` Last successful projection contained ${sourceState.lastKnownCards} cards.` : ""}
          </div>
        )}

        {/* Tile Grid Container with Infinite Scroll observer */}
        <div 
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}
        >
          {visibleCards.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "16px", padding: "4px" }}>
              {visibleCards.map((card) => {
                if (!card) return null;
                const cardImage = (card.assets || []).find(a => a && a.type === "image");
                const cardVideo = (card.assets || []).find(a => a && a.type === "video");
                const imageUrl = getAssetUrl(cardImage);
                const isActive = card.id === selectedCardId;
                const isHovered = card.id === hoveredCardId;

                return (
                  <button
                    {...builderPickupDataset({ id: card.id, entityType: "card", sourceSystem: "hapa-dev-proto", title: card.primaryName || card.title || card.id, subtitle: "Hell Week read-only projection", readOnly: true, uri: `/api/hell-week/cards/${encodeURIComponent(card.id)}` })}
                    key={card.id}
                    className={`hapa-card-tile ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCardId(card.id);
                      setIsPlaying(true);
                    }}
                    onMouseEnter={(e) => {
                      setHoveredCardId(card.id);
                      cardImage && onPreview(cardImage, e);
                    }}
                    onMouseLeave={() => {
                      setHoveredCardId(null);
                      onPreviewHide();
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      background: isActive ? "rgba(236,72,153,0.08)" : "rgba(8,19,36,0.5)",
                      border: isHovered
                        ? (cardVideo ? "1px solid #71f7bf" : "1px solid #ec4899")
                        : (isActive ? "1px solid #ec4899" : "1px solid rgba(255,255,255,0.08)"),
                      borderRadius: "12px",
                      padding: "8px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      alignItems: "stretch",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      transform: isHovered ? "translateY(-4px)" : "none",
                      outline: "none",
                      boxShadow: isHovered
                        ? (cardVideo ? "0 4px 16px rgba(113,247,191,0.25)" : "0 4px 16px rgba(236,72,153,0.25)")
                        : (isActive ? "0 0 12px rgba(236,72,153,0.15)" : "none"),
                      position: "relative"
                    }}
                  >
                    {/* Media Type Overlay Indicator */}
                    {cardVideo ? (
                      <div style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(0,0,0,0.7)", border: "1px solid #71f7bf", padding: "2px 4px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "2px", zIndex: 5 }}>
                        <Film size={8} color="#71f7bf" />
                        <span style={{ fontSize: "8px", color: "#71f7bf", fontWeight: "700" }}>LIT</span>
                      </div>
                    ) : cardImage ? (
                      <div style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(0,0,0,0.7)", border: "1px solid #7ad5ff", padding: "2px 4px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "2px", zIndex: 5 }}>
                        <Sparkles size={8} color="#7ad5ff" />
                        <span style={{ fontSize: "8px", color: "#7ad5ff", fontWeight: "700" }}>IMG</span>
                      </div>
                    ) : null}

                    {/* Visual box inside tile */}
                    <div style={{ 
                      aspectRatio: "3/4", 
                      borderRadius: "8px", 
                      overflow: "hidden", 
                      background: "#020617", 
                      border: isHovered
                        ? (cardVideo ? "1px solid rgba(113,247,191,0.3)" : "1px solid rgba(236,72,153,0.3)")
                        : (isActive ? "1px solid rgba(236,72,153,0.3)" : "1px solid rgba(255,255,255,0.05)"),
                      position: "relative",
                      marginBottom: "8px"
                    }}>
                      {isHovered && cardVideo ? (
                        <video
                          src={getAssetUrl(cardVideo)}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : imageUrl ? (
                        <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ height: "100%", display: "grid", placeItems: "center", fontSize: "11px", color: "var(--muted)" }}>
                          No Art
                        </div>
                      )}
                    </div>
                    {/* Label details */}
                    <span style={{ 
                      display: "-webkit-box", 
                      WebkitLineClamp: 1, 
                      WebkitBoxOrient: "vertical", 
                      fontSize: "11px", 
                      fontWeight: "700", 
                      color: isActive ? "#fff" : "#cbd5e1",
                      textTransform: "uppercase", 
                      letterSpacing: "0.3px", 
                      overflow: "hidden",
                      whiteSpace: "normal"
                    }}>
                      {card.primaryName}
                    </span>
                    <span style={{ 
                      display: "-webkit-box", 
                      WebkitLineClamp: 2, 
                      WebkitBoxOrient: "vertical", 
                      fontSize: "10px", 
                      color: "var(--muted)", 
                      marginTop: "2px", 
                      overflow: "hidden",
                      lineHeight: "1.3"
                    }}>
                      {card.mind?.summary || "No description available."}
                    </span>
                    <span style={{ marginTop: "6px", fontSize: "8px", color: "#7ad5ff", fontWeight: "800", letterSpacing: "0.7px" }}>
                      DEV PROTO · READ ONLY
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: "300px" }}>
              <div style={{ textAlign: "center", color: "var(--muted)" }}>
                <Flame size={40} color="rgba(236,72,153,0.2)" style={{ marginBottom: "8px" }} />
                <h3>No Matching Cards</h3>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Detail panel on the right side */}
      <aside className="panel hapa-panel" data-variant="notch" style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", height: "100%", padding: "16px" }}>
        {selectedCard ? (
          <>
            {/* Stage details header */}
            <div className="stage-header" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "12px", flexShrink: 0 }}>
              <span className="eyebrow" style={{ textTransform: "uppercase", fontSize: "9px", letterSpacing: "1.5px", color: "#ec4899", fontWeight: "900" }}>
                Card Details
              </span>
              <h3 style={{ margin: "4px 0 0", fontSize: "18px", color: "#fff", lineHeight: "1.2" }}>
                {selectedCard.primaryName}
              </h3>
            </div>

            {/* Stage Media Display */}
            <div className="card-shell" style={{ position: "relative", borderRadius: "18px", padding: "6px", background: "linear-gradient(#081324, #081324) padding-box, var(--holo) border-box", border: "2px solid transparent", flexShrink: 0 }}>
              <div className="holo-frame" style={{ position: "relative", aspectRatio: "3/4", borderRadius: "14px", overflow: "hidden", background: "#020617" }}>
                {videoAsset ? (
                  <video
                    ref={videoRef}
                    src={getAssetUrl(videoAsset)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : imageAsset ? (
                  <img src={getAssetUrl(imageAsset)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                    No media generated
                  </div>
                )}
                <div className="scanline" />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", padding: "0 2px" }}>
                <span style={{ fontSize: "9px", color: "#f59e0b", fontWeight: "900", letterSpacing: "1px" }}>HELL WEEK EDITION</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  {videoAsset && (
                    <button
                      className="hapa-btn"
                      onClick={togglePlayback}
                      style={{ padding: "3px 6px", fontSize: "9px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      {isPlaying ? <Pause size={8} /> : <Play size={8} />}
                    </button>
                  )}
                  {(imageAsset || videoAsset) && (
                    <button
                      className="hapa-btn"
                      onClick={() => onExpand(videoAsset || imageAsset, selectedCard?.assets || [])}
                      style={{ padding: "3px 6px", fontSize: "9px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <Maximize2 size={8} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Lore/Narrative */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#c4b5fd", fontSize: "11px", fontWeight: "700", textTransform: "uppercase" }}>
                  <BookOpen size={13} />
                  <span>Narrative</span>
                </div>
                <p style={{ margin: 0, color: "#cbd5e1", fontSize: "12px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                  {selectedCard.three_paragraph_background_narrative?.origin || "No narrative available."}
                </p>
              </div>

              {/* Skills */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#71f7bf", fontSize: "11px", fontWeight: "700", textTransform: "uppercase" }}>
                  <Layers3 size={13} />
                  <span>Skills</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {selectedCard.mind?.skills && selectedCard.mind.skills.length > 0 ? (
                    selectedCard.mind.skills.map((skill) => {
                      if (!skill) return null;
                      return (
                        <div key={skill.id} style={{ border: "1px solid rgba(122,213,255,0.1)", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.15)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px", alignItems: "center" }}>
                            <strong style={{ fontSize: "11px", color: "#fff", textTransform: "uppercase" }}>{skill.name}</strong>
                            <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", background: skill.kind === "Passive" ? "rgba(113,247,191,0.08)" : "rgba(255,105,210,0.08)", color: skill.kind === "Passive" ? "#71f7bf" : "#ff69d2" }}>
                              {skill.kind}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: "1.3" }}>{skill.description}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>No skills mapped.</p>
                  )}
                </div>
              </div>

              {/* Set Info */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f59e0b", fontSize: "11px", fontWeight: "700", textTransform: "uppercase" }}>
                  <Tags size={13} />
                  <span>Set Association</span>
                </div>
                <p style={{ margin: 0, color: "#cbd5e1", fontSize: "11px", lineHeight: "1.4" }}>
                  {selectedCard.three_paragraph_background_narrative?.manifesto || "No sets."}
                </p>
              </div>

              {/* Path provenance */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px", fontSize: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>Source:</span>
                  <span style={{ color: "#7ad5ff", textAlign: "right" }}>{selectedCard.handoff?.source?.system || "hapa-dev-proto"} · {selectedCard.handoff?.source?.store || "sqlite"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>Source ID:</span>
                  <span style={{ color: "#c4b5fd", wordBreak: "break-all", textAlign: "right" }}>{selectedCard.handoff?.cardId || selectedCard.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>Run:</span>
                  <span style={{ color: "#f59e0b", wordBreak: "break-all", textAlign: "right" }}>{selectedCard.handoff?.source?.runIds?.join(", ") || "not recorded"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>Truth:</span>
                  <span style={{ color: "#71f7bf", textAlign: "right" }}>{selectedCard.handoff?.truthStatus || "verified_source_projection"}</span>
                </div>
                {imageAsset && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                    <span style={{ color: "var(--muted)", flexShrink: 0 }}>Art Path:</span>
                    <span style={{ color: "#71f7bf", wordBreak: "break-all", textAlign: "right" }}>{imageAsset.path}</span>
                  </div>
                )}
                {videoAsset && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                    <span style={{ color: "var(--muted)", flexShrink: 0 }}>Video Path:</span>
                    <span style={{ color: "#71f7bf", wordBreak: "break-all", textAlign: "right" }}>{videoAsset.path}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
            <span style={{ color: "var(--muted)" }}>Select a card to view details</span>
          </div>
        )}
      </aside>
    </div>
  );
}
