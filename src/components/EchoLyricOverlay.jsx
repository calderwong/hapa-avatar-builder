import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderEchoLyricSurface, sizeEchoLyricSurface } from '../domain/echo-lyric-presentation.js';
import { resolveEchoOutputProfile } from '../domain/echo-output-profile.js';
import { resolveEchoLyricTemplateFrame } from '../domain/echo-lyric-template-runtime.js';
import { prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock } from '../domain/echo-lyric-clock.js';

export default memo(function EchoLyricOverlay({ contract: activeLyricContract, lines = [], position = 'bottom-center', themeId = 'neon-cyan', outputProfile, clockRef, audioRef, initialTime = 0, playing = false, powerMode = 'active', hidden = false }) {
  const activeOutputProfile = resolveEchoOutputProfile(outputProfile);
  const rate = powerMode === 'docked' ? Math.min(15, activeOutputProfile.fps) : Math.min(60, activeOutputProfile.fps);
  const [frame, setFrame] = useState(() => Math.floor(initialTime * rate));
  const prepared = useMemo(() => prepareEchoLyricIntervals(lines), [lines]);
  const renders = useRef(0); renders.current++;
  useLayoutEffect(() => {
    if (hidden || !activeLyricContract.enabled || powerMode === 'hidden') return undefined;
    return observeEchoLyricClock({ fps: rate, active: playing,
      getTime: () => Number(audioRef?.current?.currentTime ?? clockRef?.current ?? initialTime) || 0,
      onFrame: setFrame });
  }, [rate, playing, hidden, activeLyricContract.enabled, powerMode, clockRef, audioRef, initialTime]);
  const surfaceRef = useRef(null);
  const viewportRef = useRef({width:0,height:0});
  const currentTime = frame / rate;
  const currentLine = echoLyricIntervalAt(prepared, currentTime);
  const visible = !hidden && powerMode !== 'hidden' && activeLyricContract.enabled && currentLine;
  const lyricTemplateFrame = visible ? resolveEchoLyricTemplateFrame({ contract: activeLyricContract, line: currentLine, timeSeconds: currentTime, fps: activeOutputProfile.fps }) : null;
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    renderEchoLyricSurface(surface, {contract:{...activeLyricContract, position, style:themeId},frame:lyricTemplateFrame,line:currentLine,outputProfile:activeOutputProfile});
    sizeEchoLyricSurface(surface,activeOutputProfile,viewportRef.current.width,viewportRef.current.height);
  });
  useLayoutEffect(() => {
    const surface=surfaceRef.current;if(!surface)return;
    // Measure once before first paint; subsequent frames reuse ResizeObserver geometry.
    viewportRef.current={width:surface.clientWidth,height:surface.clientHeight};
    sizeEchoLyricSurface(surface,activeOutputProfile,viewportRef.current.width,viewportRef.current.height);
    const observer=new ResizeObserver(([entry])=>{viewportRef.current={width:entry.contentRect.width,height:entry.contentRect.height};sizeEchoLyricSurface(surface,activeOutputProfile,entry.contentRect.width,entry.contentRect.height)});
    observer.observe(surface);return()=>observer.disconnect();
  },[Boolean(visible),activeOutputProfile]);
  if (!visible) return null;
  return <div ref={surfaceRef} data-testid="echo-lyrics-overlay" data-frame={frame} data-fps={rate} data-render-count={renders.current}
    aria-label="Song lyrics" aria-live="off" style={{ position:'absolute',inset:0,pointerEvents:'none',zIndex:10 }} />;
});
