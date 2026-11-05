import { echoLyricBoundary } from '../domain/echo-lyric-time.js';

// A reading surface over the existing cut/source lyrics, not another editor
// or timing owner. Opening it never changes the cut or its video overlay.
export default function EchoSongLyricsPanel({ project, sourceText = '', currentTime = 0, onSeek, onEditTiming }) {
  const lines = Array.isArray(project?.timed_lyrics) ? project.timed_lyrics : [];
  const written = typeof sourceText === 'string' ? sourceText : '';
  const hasWritten = Boolean(written.trim());
  const hasLines = lines.some(line => typeof line?.text === 'string' && line.text.trim());
  return (
    <details open className="echo-song-lyrics" data-testid="echo-song-lyrics" style={{ border: '1px solid rgba(34,211,238,.3)', borderRadius: 6, background: 'rgba(2,6,23,.82)', padding: 12 }}>
      <summary style={{ cursor: 'pointer', color: '#a5f3fc', fontSize: 15, fontWeight: 650 }}>Song lyrics · {project?.song_title || project?.title || 'Selected song'}</summary>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0', color: '#94a3b8', fontSize: 12 }}>
        <span>{hasWritten ? 'Written lyrics' : hasLines ? 'Selected cut’s lyric lines · click a time to seek' : 'No lyrics available for this cut.'}</span>
        {onEditTiming && <button type="button" className="hapa-btn" onClick={onEditTiming} style={{ fontSize: 11 }}>Open lyric timing editor</button>}
      </div>
      <div role="region" aria-label="Full song lyrics" tabIndex={0} style={{ maxHeight: 360, overflowY: 'auto', overscrollBehavior: 'contain', color: '#f1f5f9', fontSize: 15, lineHeight: 1.65 }}>
        {hasWritten ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{written}</div> : hasLines ? lines.map((line, index) => {
          if (typeof line?.text !== 'string' || !line.text.trim()) return null;
          const start = echoLyricBoundary(line, 'start', NaN), end = echoLyricBoundary(line, 'end', NaN);
          const canSeek = Number.isFinite(start) && start >= 0 && (!Number.isFinite(Number(project?.duration)) || start <= Number(project.duration));
          const active = canSeek && Number.isFinite(end) && currentTime >= start && currentTime < end;
          const time = canSeek ? `${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, '0')}` : '';
          return <div key={index} aria-current={active ? 'true' : undefined} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 6px', borderRadius: 4, background: active ? 'rgba(34,211,238,.12)' : 'transparent' }}>
            {canSeek && onSeek && <button type="button" aria-label={`Seek lyric line ${index + 1} at ${time}`} onClick={() => onSeek(start)} style={{ flex: '0 0 44px', color: '#67e8f9', background: 'transparent', border: 0, padding: 0, fontSize: 12, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{time}</button>}
            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line.text}</span>
          </div>;
        }) : <p style={{ margin: 0 }}>Open the Lyrics tab to review the available lyric source.</p>}
      </div>
    </details>
  );
}
