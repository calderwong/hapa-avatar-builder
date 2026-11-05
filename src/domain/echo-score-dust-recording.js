import { echoScoreDustLayerFrame } from './echo-score-dust-layer.js';

// Live recording samples the same already-painted surface the viewer sees.
// Its opacity is baked into the canvas; the CSS blend must be applied here.
// Never seek the decoder from capture: that can stall the shared audio clock.
export function paintEchoScoreDustRecording(context, track, surface, time, width, height) {
  if (!track?.layer?.render) throw new Error('Render the Score Dust layer before recording.');
  const frame = echoScoreDustLayerFrame(track, time);
  if (!frame.active) return false;
  if (surface?.error) throw new Error('The Score Dust layer video could not be decoded.');
  if (!surface?.painted || !surface.canvas?.width || !surface.canvas?.height) {
    throw Object.assign(new Error('Waiting for the Score Dust picture.'), { code: 'score_dust_capture_waiting' });
  }
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = surface.blend || frame.canvasComposite;
    const canvas = surface.canvas;
    const scale = Math.max(width / canvas.width, height / canvas.height);
    const sw = width / scale, sh = height / scale;
    context.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, width, height);
  } finally { context.restore(); }
  return true;
}
