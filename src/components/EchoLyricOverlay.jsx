import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveEchoOutputProfile } from '../domain/echo-output-profile.js';
import { resolveEchoLyricTemplateFrame } from '../domain/echo-lyric-template-runtime.js';
import { prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock } from '../domain/echo-lyric-clock.js';

function getLyricPlacementStyle(position = "bottom-center", outputProfile = null) {
  const profile = resolveEchoOutputProfile(outputProfile);
  const titleInset = `${Math.round(profile.safeArea.titleInset * 100)}%`;
  const lyricBottom = `${Math.round(profile.safeArea.lyricBottom * 100)}%`;
  const isVerticalOutput = profile.id === "vertical";
  const base = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 10,
    width: isVerticalOutput ? "min(82%, 620px)" : "min(92%, 760px)"
  };
  const placements = {
    "bottom-center": { left: "50%", right: "auto", top: "auto", bottom: lyricBottom, transform: "translateX(-50%)", textAlign: "center" },
    "top-center": { left: "50%", right: "auto", top: titleInset, bottom: "auto", transform: "translateX(-50%)", textAlign: "center" },
    center: { left: "50%", right: "auto", top: "50%", bottom: "auto", transform: "translate(-50%, -50%)", textAlign: "center" },
    "lower-left": { left: titleInset, right: "auto", top: "auto", bottom: lyricBottom, transform: "none", textAlign: "left", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "lower-right": { left: "auto", right: titleInset, top: "auto", bottom: lyricBottom, transform: "none", textAlign: "right", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "upper-left": { left: titleInset, right: "auto", top: titleInset, bottom: "auto", transform: "none", textAlign: "left", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "upper-right": { left: "auto", right: titleInset, top: titleInset, bottom: "auto", transform: "none", textAlign: "right", width: isVerticalOutput ? "72%" : "min(78%, 620px)" },
    "side-right": { left: "auto", right: titleInset, top: "50%", bottom: "auto", transform: "translateY(-50%)", textAlign: "right", width: isVerticalOutput ? "58%" : "min(45%, 360px)" }
  };
  return { ...base, ...(placements[position] || placements["bottom-center"]) };
}

function getLyricTheme(style = "neon-cyan") {
  const themes = {
    "neon-cyan": {
      panelBackground: "rgba(2, 6, 23, 0.72)",
      panelBorder: "1px solid rgba(6, 182, 212, 0.3)",
      textColor: "#e0faff",
      activeColor: "var(--hapa-neon-cyan)",
      inactiveColor: "rgba(224,250,255,0.62)",
      textShadow: "0 0 10px rgba(6, 182, 212, 0.55)",
      fontFamily: "monospace",
      fontSize: "12px",
      textTransform: "none"
    },
    "magenta-glow": {
      panelBackground: "rgba(24, 5, 34, 0.76)",
      panelBorder: "1px solid rgba(236, 72, 153, 0.36)",
      textColor: "#ffe4f2",
      activeColor: "var(--hapa-neon-magenta)",
      inactiveColor: "rgba(255,228,242,0.62)",
      textShadow: "0 0 12px rgba(236, 72, 153, 0.7)",
      fontFamily: "monospace",
      fontSize: "12px",
      textTransform: "none"
    },
    "gold-caption": {
      panelBackground: "rgba(31, 23, 7, 0.78)",
      panelBorder: "1px solid rgba(246, 201, 109, 0.38)",
      textColor: "#fff7dc",
      activeColor: "var(--hapa-neon-gold)",
      inactiveColor: "rgba(255,247,220,0.64)",
      textShadow: "0 0 10px rgba(246, 201, 109, 0.55)",
      fontFamily: "serif",
      fontSize: "13px",
      textTransform: "none"
    },
    "paper-white": {
      panelBackground: "rgba(247, 244, 235, 0.9)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.42)",
      textColor: "#101827",
      activeColor: "#111827",
      inactiveColor: "rgba(17,24,39,0.62)",
      textShadow: "none",
      fontFamily: "Georgia, serif",
      fontSize: "13px",
      textTransform: "none"
    },
    "minimal-subtitle": {
      panelBackground: "rgba(0, 0, 0, 0.68)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.18)",
      textColor: "#ffffff",
      activeColor: "#ffffff",
      inactiveColor: "rgba(255,255,255,0.72)",
      textShadow: "0 2px 5px rgba(0,0,0,0.9)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      textTransform: "none"
    }
  };
  return themes[style] || themes["neon-cyan"];
}


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
  const currentTime = frame / rate;
  const currentLine = echoLyricIntervalAt(prepared, currentTime);
  if (hidden || powerMode === 'hidden' || !activeLyricContract.enabled || !currentLine) return null;
  const lyricTemplateFrame = resolveEchoLyricTemplateFrame({ contract: activeLyricContract, line: currentLine, timeSeconds: currentTime, fps: activeOutputProfile.fps });
  const renderTemplate = () => {
    const activeTemplateId = activeLyricContract.templateId;
    const lyricPlacement = getLyricPlacementStyle(position, activeOutputProfile);
    const lyricTheme = { ...getLyricTheme(themeId) };
    if (lyricTemplateFrame.timingPolicy.mode === 'phrase') lyricTheme.inactiveColor = lyricTheme.textColor;

    const renderWords = (customWordStyle) => {
      return currentLine.words?.length ? currentLine.words.map((w, wIdx) => {
        const frameWord = lyricTemplateFrame.words[wIdx] || {};
        if (frameWord.display === false) return null;
        const wordStyle = customWordStyle(frameWord.active, frameWord.completed, wIdx, frameWord);
        return (
          <span
            key={wIdx}
            data-lyric-word-active={frameWord.active ? "true" : "false"}
            data-lyric-word-progress={frameWord.progress ?? 0}
            style={{
              display: 'inline-block',
              color: lyricTheme.inactiveColor,
              opacity: frameWord.opacity ?? 1,
              transform: `translate(${frameWord.translateX || 0}px, ${frameWord.translateY || 0}px) rotate(${frameWord.rotateDegrees || 0}deg) scale(${frameWord.scale || 1})`,
              transformOrigin: 'center',
              ...wordStyle,
              backgroundImage: `linear-gradient(${lyricTheme.activeColor}, ${lyricTheme.activeColor})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left bottom',
              backgroundSize: `${(frameWord.underlineProgress || 0) * 100}% 2px`,
            }}
          >
            {frameWord.displayText || w.word}
          </span>
        );
      }) : currentLine.text;
    };

    switch (activeTemplateId) {
      case "kinetic-word-burst-v1":
        return (
          <div style={{
            position: 'absolute',
            bottom: '25px',
            right: '15px',
            background: lyricTheme.panelBackground,
            border: lyricTheme.panelBorder,
            borderLeft: `3px solid ${lyricTheme.activeColor}`,
            padding: '6px 12px',
            borderRadius: '4px 0 0 4px',
            maxWidth: '80%',
            textAlign: 'right',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            ...lyricPlacement
          }}>
            <div style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: lyricTheme.textColor,
              textShadow: lyricTheme.textShadow,
              fontFamily: lyricTheme.fontFamily,
              fontSize: lyricTheme.fontSize,
              textTransform: lyricTheme.textTransform,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '5px',
              flexWrap: 'wrap'
            }}>
              {renderWords((isActive, isCompleted, _wordIndex, frameWord) => ({
                color: isActive ? lyricTheme.activeColor : isCompleted ? lyricTheme.textColor : lyricTheme.inactiveColor,
                textShadow: isActive ? lyricTheme.textShadow : 'none',
                fontWeight: isActive ? 900 : 700,
                paddingBottom: '2px',
                '--lyric-progress': frameWord.progress,
              }))}
            </div>
          </div>
        );

      case "stacked-hook-echo-v1":
        return (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            width: '100%',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            ...lyricPlacement
          }}>
            <div style={{
              position: 'absolute',
              top: '-2px',
              left: '2px',
              width: '100%',
              opacity: 0.5,
              fontSize: '13px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: lyricTheme.activeColor,
              filter: 'blur(1px)'
            }}>
              {lyricTemplateFrame.displayText || currentLine.text}
            </div>
            <div style={{
              position: 'relative',
              fontSize: '13px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: lyricTheme.textColor,
              textShadow: lyricTheme.textShadow,
              fontFamily: lyricTheme.fontFamily,
              fontSize: lyricTheme.fontSize,
              textTransform: lyricTheme.textTransform,
              display: 'flex',
              justifyContent: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}>
              {renderWords((isActive) => ({
                color: isActive ? lyricTheme.activeColor : lyricTheme.textColor,
                textShadow: isActive ? lyricTheme.textShadow : 'none'
              }))}
            </div>
          </div>
        );

      case "orbit-caption-v1":
        return (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            width: 'calc(100% - 32px)',
            left: '16px',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            background: lyricTheme.panelBackground,
            border: lyricTheme.panelBorder,
            borderRadius: '4px',
            padding: '4px 10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            ...lyricPlacement
          }}>
            <div style={{
              fontSize: '9.5px',
              fontFamily: 'monospace',
              color: lyricTheme.textColor,
              textShadow: lyricTheme.textShadow,
              fontFamily: lyricTheme.fontFamily,
              fontSize: lyricTheme.fontSize,
              textTransform: lyricTheme.textTransform,
              display: 'flex',
              justifyContent: 'center',
              gap: '4px',
              flexWrap: 'wrap'
            }}>
              {renderWords((isActive) => ({
                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                fontWeight: isActive ? 'bold' : 'normal'
              }))}
            </div>
          </div>
        );

      case "scanline-phrase-ribbon-v1":
        return (
          <div style={{
            position: 'absolute',
            bottom: '15px',
            width: '100%',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            background: lyricTheme.panelBackground,
            border: lyricTheme.panelBorder,
            padding: '8px 0',
            boxShadow: '0 0 10px rgba(57, 255, 20, 0.1)',
            ...lyricPlacement
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
              backgroundSize: '100% 2px, 3px 100%',
              opacity: 0.8
            }} />
            <div style={{
              position: 'relative',
              fontSize: '12px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              color: lyricTheme.textColor,
              textShadow: lyricTheme.textShadow,
              fontFamily: lyricTheme.fontFamily,
              fontSize: lyricTheme.fontSize,
              textTransform: lyricTheme.textTransform,
              display: 'flex',
              justifyContent: 'center',
              gap: '5px',
              flexWrap: 'wrap',
              letterSpacing: '0.05em'
            }}>
              {renderWords((isActive) => ({
                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                textShadow: isActive ? lyricTheme.textShadow : 'none'
              }))}
            </div>
          </div>
        );

      case "phrase-window":
      default:
        return (
          <div style={{
            position: 'absolute',
            bottom: '15px',
            width: '100%',
            textAlign: 'center',
            pointerEvents: 'none',
            background: lyricTheme.panelBackground,
            border: lyricTheme.panelBorder,
            padding: '6px 0',
            zIndex: 10,
            ...lyricPlacement
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 'bold',
              color: lyricTheme.textColor,
              textShadow: lyricTheme.textShadow,
              fontFamily: lyricTheme.fontFamily,
              fontSize: lyricTheme.fontSize,
              textTransform: lyricTheme.textTransform,
              letterSpacing: '0.02em',
              display: 'flex',
              justifyContent: 'center',
              gap: '4px',
              flexWrap: 'wrap'
            }}>
              {renderWords((isActive) => ({
                color: isActive ? lyricTheme.activeColor : lyricTheme.inactiveColor,
                textShadow: isActive ? lyricTheme.textShadow : 'none'
              }))}
            </div>
          </div>
        );
    }

  };
  const policy = lyricTemplateFrame.timingPolicy;
  return <div data-testid="echo-lyrics-overlay" data-frame={frame} data-fps={rate} data-render-count={renders.current} data-timing-mode={policy.mode} data-timing-reason={policy.reason}
    aria-label="Song lyrics" aria-live="off" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
    {renderTemplate()}
    {policy.mode === 'phrase' && <span data-testid="echo-lyric-timing-label" style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, background: 'rgba(2,6,23,.85)', padding: '3px 6px', color: '#f8fafc' }}>{policy.label}</span>}
  </div>;
});
