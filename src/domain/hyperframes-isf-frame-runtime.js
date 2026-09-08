// Called from setDateUniforms, after the vendor's texture-unit allocator reset.
// Binding images before Renderer.draw lets subsequent buffer bindings overwrite
// their texture units. Allocate target sizes before those bindings, too.
export function bindHyperFramesIsfFrameInputs(surface) {
  const renderer = surface.renderer;
  for (const pass of renderer.model.passes) {
    if (pass.target) pass.buffer.setSize(
      renderer.evaluateSize(surface.canvas, pass.width),
      renderer.evaluateSize(surface.canvas, pass.height),
    );
  }
  for (const [name, image] of surface.imageInputs || []) renderer.setValue(name, image);
}

// interactive-shader-format keeps two textures per target and flips once after
// all passes. Replaying a frame can restore the read/write selection: the prior
// read texture is untouched. This avoids copying GPU buffers or advancing a
// persistent effect twice when HyperFrames injects the final video image.
export function prepareHyperFramesIsfFrame(surface, visualTime, fps, persistent) {
  const delta = 1 / Math.max(1, Number(fps) || 30);
  const sameFrame = surface.frameStart
    && Math.abs(surface.frameStart.time - visualTime) < 1e-9;
  const sequential = surface.lastTime != null
    && Math.abs(visualTime - surface.lastTime - delta) <= delta * .25;
  if (persistent && surface.lastTime != null && !sameFrame && !sequential) {
    throw new Error("Persistent ISF timeline was not rendered sequentially");
  }
  const buffers = surface.renderer.renderBuffers || [];
  if (persistent && buffers.some(buffer => !Array.isArray(buffer.textures)
    || buffer.textures.length !== 2 || typeof buffer.flipFlop !== "boolean")) {
    throw new Error("Persistent ISF runtime does not expose paired render buffers");
  }
  if (sameFrame) {
    for (const { buffer, flipFlop } of surface.frameStart.buffers) buffer.flipFlop = flipFlop;
    surface.frameReplayCount = (surface.frameReplayCount || 0) + 1;
  } else {
    surface.frameStart = {
      time: visualTime,
      delta: sequential ? delta : 0,
      buffers: persistent ? buffers.map(buffer => ({ buffer, flipFlop: buffer.flipFlop })) : [],
    };
    surface.frameReplayCount = 0;
  }
  return {
    time: visualTime,
    delta: surface.frameStart.delta,
    index: Math.max(0, Math.floor(visualTime * Math.max(1, Number(fps) || 30) + 1e-8)),
  };
}
