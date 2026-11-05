// Campfire uses only enabled/scheduled Always On cards from the existing graph.
// Black remains neutral both in CSS screen blending and the recording canvas.
export function campfireShaderCards(cards = []) {
  return cards.filter(card => card?.alwaysOn === true || Boolean(card?.persistentSlotId));
}
export function paintCampfireShaderOverlay(context, canvas, width, height, strength = .65) {
  const alpha = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  if (!alpha || !canvas?.width || !canvas?.height) return false;
  context.save();
  try {
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = alpha;
    context.drawImage(canvas, 0, 0, width, height);
  } finally { context.restore(); }
  return true;
}
