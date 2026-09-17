import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { renderEchoLyricSurface, sizeEchoLyricSurface, prepareEchoLyricObstacles } from '../domain/echo-lyric-presentation.js';
import { EchoAccentPresentation } from '../domain/echo-accent-presentation.js';
import { resolveEchoOutputProfile } from '../domain/echo-output-profile.js';
import { resolveEchoLyricTemplateFrame, echoLyricFrameTime } from '../domain/echo-lyric-template-runtime.js';
import { prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock } from '../domain/echo-lyric-clock.js';

export default memo(function EchoLyricOverlay({ contract: activeLyricContract, lines = [], mediaTracks = null, accentEvents = [], position = 'bottom-center', themeId = 'neon-cyan', outputProfile, clockRef, audioRef, presentationRef, captureSurfaceRef, initialTime = 0, playing = false, powerMode = 'active', hidden = false }) {
  const activeOutputProfile = resolveEchoOutputProfile(outputProfile);
  const rate = powerMode === 'docked' ? Math.min(15, activeOutputProfile.fps) : Math.min(60, activeOutputProfile.fps);
  const prepared = useMemo(() => prepareEchoLyricIntervals(lines), [lines]);
  const protection = useMemo(() => prepareEchoLyricObstacles((mediaTracks || []).flatMap(track => (track.cards || []).filter(card => card.media && !card.visualization)), activeOutputProfile), [mediaTracks, activeOutputProfile]);
  const surfaceRef = useRef(null);
  const viewportRef = useRef({ width: 0, height: 0 });
  const renders = useRef(0); renders.current++;
  const enabled = !hidden && powerMode !== 'hidden' && activeLyricContract.enabled;
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return undefined;
    let previous = null;
    const paint = songTime => {
      const clock = echoLyricFrameTime(songTime, rate);
      if (clock.frame === previous) return;
      previous = clock.frame;
      const currentTime = clock.frame / rate;
      const currentLine = echoLyricIntervalAt(prepared, currentTime);
      const frame = currentLine ? resolveEchoLyricTemplateFrame({ contract: activeLyricContract, line: currentLine, timeSeconds: currentTime, fps: activeOutputProfile.fps }) : null;
      renderEchoLyricSurface(surface, { contract: { ...activeLyricContract, position, style: themeId }, frame, line: currentLine, outputProfile: activeOutputProfile, protection });
      sizeEchoLyricSurface(surface, activeOutputProfile, viewportRef.current.width, viewportRef.current.height);
      EchoAccentPresentation.lyric(surface, EchoAccentPresentation.frame(accentEvents, currentTime, { reducedMotion: activeLyricContract.reducedMotion === true }), currentLine?.id);
      surface.dataset.frame = String(clock.frame);
      surface.dataset.fps = String(rate);
    };
    const getTime = () => Number(audioRef?.current?.currentTime ?? clockRef?.current ?? initialTime) || 0;
    // The compositor paints this same existing surface synchronously before its
    // canvas. No React state commit or independent RAF can lag it by one frame.
    // Standalone consumers retain an audio-clock observer through this owner.
    let stop;
    if (presentationRef) { presentationRef.current = paint; paint(getTime()); }
    else stop = observeEchoLyricClock({ fps: rate, active: playing, getTime, onFrame: frame => paint(frame / rate) });
    return () => { stop?.(); if (presentationRef?.current === paint) presentationRef.current = null; };
  }, [enabled, rate, prepared, protection, activeLyricContract, accentEvents, position, themeId, activeOutputProfile, presentationRef, audioRef, clockRef, initialTime, playing]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current; if (!surface) return;
    viewportRef.current = { width: surface.clientWidth, height: surface.clientHeight };
    sizeEchoLyricSurface(surface, activeOutputProfile, viewportRef.current.width, viewportRef.current.height);
    const observer = new ResizeObserver(([entry]) => {
      viewportRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      sizeEchoLyricSurface(surface, activeOutputProfile, entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(surface); return () => observer.disconnect();
  }, [enabled, activeOutputProfile]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (captureSurfaceRef) captureSurfaceRef.current = surface;
    return () => { if (captureSurfaceRef?.current === surface) captureSurfaceRef.current = null; };
  }, [captureSurfaceRef, enabled]);
  if (!enabled) return null;
  return <div ref={surfaceRef} data-testid="echo-lyrics-overlay" data-render-count={renders.current}
    aria-label="Song lyrics" aria-live="off" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }} />;
});
