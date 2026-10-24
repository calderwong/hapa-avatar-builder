// Loads the Song's musical timeline and saved direction from the Audio Atlas,
// keeps an editable draft, composes locally with the same pure composer the
// API/CLI use, and saves directions to the append-only ledger.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createAtlasClient } from "../domain/audio-atlas-ui.js";
import {
  buildEchoMusicalTimelineFromPerformance, composeEchoVisualScore, validateEchoVisualScore, validateEchoScoreDirection,
  normalizeDustPlaySettings, prepareEchoScorePlayback, reflexOnlyEchoTimeline,
} from "../domain/echo-visual-score.js";
import { scoreDustCastFor, scoreDustPictureOption, scoreDustModelOption } from "../domain/echo-score-dust-pictures.js";
import { createStemReflex } from "../domain/echo-score-dust-stems.js";
import { albumDustColour } from "../domain/echo-score-dust-album.js";

const NO_DIRECTION = Object.freeze({});

export function useEchoScoreDust({ enabled, songId, apiBase = "", preparedPerformance = null, lyricLines = null, lyricAudioHash = null, durationSeconds = 600, resolveUri = (uri) => uri }) {
  const client = useMemo(() => createAtlasClient(apiBase), [apiBase]);
  const [remote, setRemote] = useState({ status: "idle", songId: "" });
  const [draft, setDraft] = useState(null);
  const [save, setSave] = useState({ state: "idle", message: "" });
  const [reload, setReload] = useState(0);
  const [pictures, setPictures] = useState({ status: "idle", options: [] });
  const [album, setAlbum] = useState(null);
  const [songCard, setSongCard] = useState(null);

  // The Song's place in the album colour language, from Song Cards.
  useEffect(() => {
    if (!enabled || !songId) { setAlbum(null); return undefined; }
    let cancelled = false;
    fetch(`${apiBase}/api/hapa-songs`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      .then((store) => {
        if (cancelled) return;
        setAlbum(store ? albumDustColour(store.songs || [], songId) : null);
        const card = (store?.songs || []).find((s) => [s?.id, s?.songId, s?.cardId].includes(songId));
        setSongCard(card ? { title: card.title || "", mood: card.mood || "", tags: card.tags || [] } : null);
      }).catch(() => { if (!cancelled) setAlbum(null); });
    return () => { cancelled = true; };
  }, [enabled, songId, apiBase]);

  // Cast portraits available as picture motifs (song bindings, then evergreen cast).
  useEffect(() => {
    if (!enabled || !songId) { setPictures({ status: "idle", options: [] }); return undefined; }
    let cancelled = false;
    setPictures({ status: "loading", options: [] });
    Promise.all(scoreDustCastFor(songId).map(async (member) => {
      try {
        const response = await fetch(`${apiBase}/api/avatars/${encodeURIComponent(member.avatarId)}`, { credentials: "same-origin" });
        if (!response.ok) return null;
        const body = await response.json();
        const avatar = body.avatar || body;
        return [scoreDustPictureOption(avatar, member, resolveUri), scoreDustModelOption(avatar, member, resolveUri)];
      } catch { return null; }
    })).then((options) => { if (!cancelled) setPictures({ status: "ready", options: options.flat().filter(Boolean) }); });
    return () => { cancelled = true; };
  }, [enabled, songId, apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraft(null); setSave({ state: "idle", message: "" });
    if (!enabled || !songId) { setRemote({ status: "idle", songId: songId || "" }); return undefined; }
    let cancelled = false;
    setRemote({ status: "loading", songId });
    (async () => {
      try {
        const { jobs = [] } = await client.request(`/jobs?songId=${encodeURIComponent(songId)}`);
        const run = jobs.find((job) => job.state === "complete");
        if (!run) { if (!cancelled) setRemote({ status: "no-run", songId, message: "No completed Audio Atlas analysis for this Song yet." }); return; }
        const [value, ledger] = await Promise.all([
          client.request(`/jobs/${encodeURIComponent(run.id)}/query?op=visual-score`),
          client.request(`/jobs/${encodeURIComponent(run.id)}/visual-score-directions`),
        ]);
        if (!cancelled) setRemote({ status: "atlas", songId, runId: run.id, timeline: value.timeline, ledger: ledger.revisions || [], saved: ledger.latest || null });
      } catch (error) {
        if (!cancelled) setRemote({ status: "error", songId, message: String(error?.message || error) });
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, songId, client, reload]);

  const timelineInfo = useMemo(() => {
    if (remote.status === "atlas") return { timeline: remote.timeline, source: `atlas ${remote.runId}`, kind: "atlas" };
    if (preparedPerformance) {
      try { return { timeline: buildEchoMusicalTimelineFromPerformance(preparedPerformance), source: "prepared-performance", kind: "prepared" }; } catch { /* fall through */ }
    }
    return { timeline: reflexOnlyEchoTimeline(durationSeconds), source: "reflex-only", kind: "reflex" };
  }, [remote, preparedPerformance, durationSeconds]);

  // Stable identity: the host view re-renders on every playhead tick.
  // Same rule as the API: a saved revision that no longer validates is skipped.
  const savedInvalid = Boolean(remote.saved && !validateEchoScoreDirection(remote.saved.direction).ok);
  const direction = useMemo(() => {
    const chosen = draft ?? (remote.saved && !savedInvalid ? remote.saved.direction : NO_DIRECTION);
    // "album" without a stored spec resolves here exactly as the API does.
    return chosen.colour?.preset === "album" && !chosen.colour.album && album ? { ...chosen, colour: { ...chosen.colour, album } } : chosen;
  }, [draft, remote.saved, savedInvalid, album]);
  const composed = useMemo(() => {
    if (!enabled) return null;
    const { timeline } = timelineInfo;
    const directionCheck = validateEchoScoreDirection(direction);
    try {
      const score = composeEchoVisualScore(timeline, directionCheck.ok ? direction : {}, { lyricLines, lyricAudioHash });
      const validation = validateEchoVisualScore(score, { timeline, assets: pictures.status === "ready" ? pictures.options.map((o) => o.assetId) : null });
      if (!directionCheck.ok) validation.errors.unshift(...directionCheck.errors);
      // Reduced motion follows the OS setting unless the direction chooses.
      const osReduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const settings = normalizeDustPlaySettings({ ...(osReduced ? { reducedMotion: true } : {}), ...(direction.playSettings || {}) }, timeline);
      const playback = validation.ok ? prepareEchoScorePlayback(score, timeline, { pulse: settings.pulse }) : null;
      return { score, validation: { ...validation, ok: validation.ok && directionCheck.ok }, settings, playback };
    } catch (error) {
      return { score: null, validation: { ok: false, errors: [{ code: "compose", message: String(error?.message || error) }], warnings: [] }, settings: null, playback: null };
    }
  }, [enabled, timelineInfo, direction, lyricLines, lyricAudioHash, pictures]);

  const saveDraft = useCallback(async (note = "") => {
    if (remote.status !== "atlas" || !draft) return;
    setSave({ state: "saving", message: "" });
    try {
      const row = await client.request(`/jobs/${encodeURIComponent(remote.runId)}/visual-score-directions`, {
        method: "POST", body: JSON.stringify({ baseRevision: remote.saved?.revision || 0, direction: draft, note, lyricLines, lyricAudioHash }),
      });
      setRemote((current) => ({ ...current, saved: row, ledger: [...(current.ledger || []), row] }));
      setDraft(null);
      setSave({ state: "saved", message: `Saved direction r${row.revision}.` });
    } catch (error) {
      setSave({ state: "error", message: String(error?.message || error) });
    }
  }, [client, remote, draft, lyricLines, lyricAudioHash]);

  // Separated stems from the prepared performance (null for master-only songs).
  const stems = useMemo(() => { try { return enabled ? createStemReflex(preparedPerformance) : null; } catch { return null; } }, [enabled, preparedPerformance]);
  // Every play setting (seed, pulse, comfort, renderer tier) rebuilds the live host.
  const playbackKey = composed?.playback ? `${songId}:${timelineInfo.source}:${composed.score.fingerprint}:${JSON.stringify(composed.settings)}:${stems?.available.join("+") || "no-stems"}` : `${songId}:${timelineInfo.source}:none`;
  return {
    enabled, status: remote.status, message: remote.message || "", runId: remote.runId || null, kind: timelineInfo.kind, source: timelineInfo.source,
    timeline: timelineInfo.timeline, saved: remote.saved || null, savedInvalid, ledger: remote.ledger || [], direction, dirty: draft !== null,
    score: composed?.score || null, validation: composed?.validation || null, settings: composed?.settings || null, playback: composed?.playback || null, playbackKey,
    setDraft: (update) => setDraft((current) => (typeof update === "function" ? update(current ?? (savedInvalid ? {} : remote.saved?.direction ?? {})) : update)),
    discard: () => { setDraft(null); setSave({ state: "idle", message: "" }); },
    save: saveDraft, saveState: save, refresh: () => setReload((v) => v + 1), pictures, stems, album, song: songCard, lyricLines: Array.isArray(lyricLines) ? lyricLines : null,
  };
}
