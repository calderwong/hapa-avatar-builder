// Sample the existing opaque 2D stage surface, including its held picture
// while the GPU catches up. Live capture must not drive a second stage clock.
export function paintEchoCampfireRecording(context, surface, width, height) {
  if (surface?.error) throw new Error(`Campfire recording stopped: ${surface.error}`);
  if (!surface?.ready || !surface.canvas?.width || !surface.canvas?.height) {
    throw Object.assign(new Error('Waiting for the Campfire picture.'), { code: 'campfire_capture_waiting' });
  }
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(surface.canvas, 0, 0, width, height);
  } finally { context.restore(); }
  return true;
}
