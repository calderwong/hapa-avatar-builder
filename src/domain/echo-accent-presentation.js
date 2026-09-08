/** Shared, seekable accent presentation for native Preview and offline export.
 * No timer, random state, decoder, filter, or extra render loop. Callers place
 * each overlay at its actual layer; a missing explicit target is never rerouted.
 */
function createEchoAccentPresentation() {
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, finite(value)));
  const kinds = new Set(['scan', 'bloom', 'glitch', 'shutter', 'deck-swap', 'flicker']);
  function frame(events = [], timeSeconds = 0, { reducedMotion = false } = {}) {
    const time = finite(timeSeconds, -1);
    const active = events.filter(event => {
      const start = finite(event.atSeconds ?? event.startSeconds, -1), end = finite(event.endSeconds, -1);
      return start >= 0 && time >= start && time < end && event.target?.scope === 'single-layer' && kinds.has(event.kind);
    }).sort((a, b) => finite(b.priority) - finite(a.priority) || finite(a.atSeconds ?? a.startSeconds) - finite(b.atSeconds ?? b.startSeconds) || String(a.id).localeCompare(String(b.id)));
    // Runtime admission also protects authored/merged tracks. Planner receipts
    // remain intact; suppressed overlays are reported, not deleted from the cut.
    const selected = active.slice(0, reducedMotion ? 1 : 3);
    const eventsOut = selected.map(event => {
      const start = finite(event.atSeconds ?? event.startSeconds), duration = finite(event.endSeconds) - start;
      const progress = clamp((time - start) / duration);
      const frames = (event.keyframes || []).filter(row => Number.isFinite(Number(row.offset)) && Number.isFinite(Number(row.value)))
        .map(row => ({ offset: clamp(row.offset), value: clamp(row.value) })).sort((a, b) => a.offset - b.offset);
      let value;
      if (frames.length >= 2) {
        const right = frames.findIndex(row => row.offset >= progress);
        if (right === 0) value = frames[0].value;
        else if (right < 0) value = frames.at(-1).value;
        else { const a = frames[right - 1], b = frames[right]; value = a.value + (b.value - a.value) * clamp((progress - a.offset) / Math.max(1e-9, b.offset - a.offset)); }
      } else value = clamp(event.intensity, 0, 1) * Math.min(progress / .28, (1 - progress) / .72);
      const count = Math.max(1, selected.length);
      const peak = Math.max(1e-9, clamp(event.intensity), ...frames.map(row => row.value));
      const alpha = Math.min(.2 / count, clamp(event.safety?.luminanceDelta ?? .12, 0, .2)) * clamp(value / peak);
      return { ...event, progress, value, alpha, reducedMotion: reducedMotion || event.safety?.mode === 'reduced-motion',
        kind: reducedMotion || event.safety?.mode === 'reduced-motion' ? 'bloom' : event.kind,
        area: Math.min(.25 / count, clamp(event.safety?.frameArea ?? .16, 0, .25)) };
    });
    return { events: eventsOut, suppressedIds: active.slice(selected.length).map(row => row.id), timeSeconds: time };
  }
  function matches(event, target) {
    if (event.target?.layer !== target.layer) return false;
    let explicit = false;
    for (const key of ['instanceId', 'visualizerId', 'trackId', 'cardId', 'layerIndex']) {
      if (event.target[key] == null) continue;
      explicit = true;
      if (event.target[key] !== target[key]) return false;
    }
    return explicit || target.primary === true;
  }
  function paint(context, state, width, height, target = {}) {
    const receipts = [];
    if (!(width > 0 && height > 0)) return receipts;
    for (const event of state.events || []) {
      if (!matches(event, target) || !(event.alpha > 0 && event.area > 0)) continue;
      const side = Math.sqrt(event.area), w = width * side, h = height * side;
      const focal = event.target?.focalPoint || target.focalPoint || { x: .5, y: .5 };
      const x = clamp(focal.x, side / 2, 1 - side / 2) * width - w / 2;
      const y = clamp(focal.y, side / 2, 1 - side / 2) * height - h / 2;
      const p = event.reducedMotion ? .5 : event.progress;
      context.save();
      context.beginPath(); context.rect(x, y, w, h); context.clip();
      context.globalCompositeOperation = 'screen'; context.globalAlpha = event.alpha;
      context.fillStyle = event.kind === 'glitch' ? '#ff2d83' : event.kind === 'flicker' ? '#ffffff' : '#00f3ff';
      context.strokeStyle = context.fillStyle;
      if (event.kind === 'bloom') {
        context.lineWidth = Math.max(1, Math.min(w, h) * .07);
        context.beginPath(); context.ellipse(x + w / 2, y + h / 2, w * (.12 + .32 * p), h * (.12 + .32 * p), 0, 0, Math.PI * 2); context.stroke();
      } else if (event.kind === 'scan') {
        context.fillRect(x + (w * .88 * p), y, w * .12, h);
      } else if (event.kind === 'glitch') {
        for (let index = 0; index < 3; index++) context.fillRect(x + w * ((index % 2) * .2 + p * .12), y + h * (.12 + index * .28), w * .6, h * .08);
      } else if (event.kind === 'shutter') {
        const band = h * .2 * (1 - p);
        context.fillRect(x, y, w, band); context.fillRect(x, y + h - band, w, band);
      } else if (event.kind === 'deck-swap') {
        const thickness = Math.min(w, h) * .045;
        context.fillRect(x + w * p * .2, y, thickness, h);
        context.fillRect(x + w * (1 - p * .2) - thickness, y, thickness, h);
      } else context.fillRect(x, y, w, h);
      context.restore();
      receipts.push({ id: event.id, kind: event.kind, target: { ...target }, progress: p, alpha: event.alpha, rect: { x, y, width: w, height: h }, frameArea: event.area });
    }
    return receipts;
  }
  function lyric(surface, state, lineId = null) {
    const panel = surface?.__echoLyricSurface?.panel;
    if (!panel || surface.style.visibility === 'hidden') return [];
    let canvas = panel.querySelector('[data-echo-lyric-accents]');
    const selected = state.events?.some(event => matches(event, { layer: 'lyric-layer', primary: true, instanceId: lineId }));
    if (!canvas && !selected) return [];
    if (!canvas) { canvas = surface.ownerDocument.createElement('canvas'); canvas.dataset.echoLyricAccents = 'true'; Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' }); panel.append(canvas); }
    const width = Math.max(1, panel.clientWidth), height = Math.max(1, panel.clientHeight);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d'); context.clearRect(0, 0, width, height);
    const receipts = paint(context, state, width, height, { layer: 'lyric-layer', primary: true, instanceId: lineId });
    canvas.dataset.echoAccentReceipts = JSON.stringify(receipts);
    return receipts;
  }
  function report(state, receipts = [], { excludeLayers = [] } = {}) {
    const painted = new Set(receipts.map(row => row.id));
    return { painted: receipts, suppressedIds: state.suppressedIds || [],
      unresolved: (state.events || []).filter(event => event.alpha > 0 && !painted.has(event.id) && !excludeLayers.includes(event.target?.layer))
        .map(event => ({ id: event.id, target: event.target, reason: 'target-absent-or-not-presented' })) };
  }
  return { frame, matches, paint, lyric, report };
}

export const EchoAccentPresentation = createEchoAccentPresentation();
export function echoAccentPresentationBrowserSource() {
  return `const EchoAccentPresentation=(${createEchoAccentPresentation.toString()})();`;
}
