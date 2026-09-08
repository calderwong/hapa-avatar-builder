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
export function prepareHyperFramesIsfFrame(surface, visualTime, fps, persistent, songTime = visualTime) {
  const delta = 1 / Math.max(1, Number(fps) || 30);
  const frameIndex = Math.floor(songTime / delta + 1e-8);
  const sameFrame = surface.frameStart
    && surface.frameStart.frameIndex === frameIndex;
  const sequential = surface.lastTime != null
    && (surface.lastFrameIndex == null
      ? Math.abs(visualTime - surface.lastTime - delta) <= delta * .25
      : frameIndex === surface.lastFrameIndex + 1);
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
      frameIndex,
      previousTime: sequential ? surface.lastTime : null,
      delta: sequential ? visualTime - surface.lastTime : 0,
      buffers: persistent ? buffers.map(buffer => ({ buffer, flipFlop: buffer.flipFlop })) : [],
    };
    surface.frameReplayCount = 0;
  }
  return {
    time: visualTime,
    delta: surface.frameStart.previousTime == null ? 0 : visualTime - surface.frameStart.previousTime,
    index: Math.max(0, Math.floor(visualTime * Math.max(1, Number(fps) || 30) + 1e-8)),
  };
}

// Checkpoints belong to one compiled layer/source/input identity and canvas size.
// Preserve native float buffers as floats: quantizing history changes the effect.
export function createHyperFramesIsfCheckpointStore(surface, {
  intervalFrames = 30, maxBytes = 128 * 1024 * 1024,
} = {}) {
  if (!Number.isInteger(intervalFrames) || intervalFrames < 1 || !Number.isFinite(maxBytes) || maxBytes < 0) throw new Error('Invalid ISF checkpoint budget');
  const entries = new Map();
  let bytes = 0;
  const gl = surface.renderer.gl;
  const buffers = () => surface.renderer.renderBuffers.filter(buffer => buffer.name);
  const withFramebuffer = work => {
    const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const fbo = gl.createFramebuffer();
    try { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); return work(); }
    finally { gl.bindFramebuffer(gl.FRAMEBUFFER, previous); gl.deleteFramebuffer(fbo); }
  };
  const attach = texture => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('ISF checkpoint framebuffer unavailable');
  };
  const reset = () => {
    bindHyperFramesIsfFrameInputs({ ...surface, imageInputs: [] });
    const color = gl.getParameter(gl.COLOR_CLEAR_VALUE), mask = gl.getParameter(gl.COLOR_WRITEMASK);
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    try {
      gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0);
      withFramebuffer(() => { for (const buffer of buffers()) {
        for (const texture of buffer.textures) { attach(texture); gl.clear(gl.COLOR_BUFFER_BIT); }
        buffer.flipFlop = false;
      } });
    } finally {
      gl.clearColor(...color); gl.colorMask(...mask); if (scissor) gl.enable(gl.SCISSOR_TEST);
    }
    surface.lastTime = null; surface.lastFrameIndex = null; surface.frameStart = null;
  };
  const record = frame => {
    if ((frame + 1) % intervalFrames !== 0) return;
    const list = buffers();
    const required = list.reduce((total, buffer) => total + buffer.textures.reduce((n, t) => n + t.width * t.height * 4 * (t.float ? 4 : 1), 0), 0);
    if (!Number.isFinite(required) || required > maxBytes) return;
    const old = entries.get(frame); if (old) { bytes -= old.bytes; entries.delete(frame); }
    while (bytes + required > maxBytes && entries.size) {
      const first = entries.keys().next().value; bytes -= entries.get(first).bytes; entries.delete(first);
    }
    const state = withFramebuffer(() => list.map(buffer => ({
      name: buffer.name, flipFlop: buffer.flipFlop,
      textures: buffer.textures.map(texture => {
        attach(texture);
        const data = texture.float ? new Float32Array(texture.width * texture.height * 4) : new Uint8Array(texture.width * texture.height * 4);
        gl.readPixels(0, 0, texture.width, texture.height, gl.RGBA, texture.float ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('ISF checkpoint readback failed');
        return { width: texture.width, height: texture.height, float: Boolean(texture.float), data };
      }),
    })));
    entries.set(frame, { state, bytes: required, time: surface.lastTime }); bytes += required;
  };
  const latestBefore = frame => [...entries.keys()].filter(key => key < frame).sort((a, b) => b - a)[0];
  const restoreBefore = frame => {
    const key = latestBefore(frame);
    if (key == null) { reset(); return null; }
    const entry = entries.get(key), list = buffers();
    const textureBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      for (const saved of entry.state) {
        const buffer = list.find(buffer => buffer.name === saved.name);
        if (!buffer) throw new Error('ISF checkpoint source changed');
        buffer.setSize(saved.textures[0].width, saved.textures[0].height);
        for (let i = 0; i < saved.textures.length; i++) {
          const texture = saved.textures[i];
          gl.bindTexture(gl.TEXTURE_2D, buffer.textures[i].texture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, gl.RGBA, texture.float ? gl.FLOAT : gl.UNSIGNED_BYTE, texture.data);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('ISF checkpoint restore failed');
        }
        buffer.flipFlop = saved.flipFlop;
      }
    } finally { gl.bindTexture(gl.TEXTURE_2D, textureBinding); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip); }
    surface.lastTime = entry.time; surface.lastFrameIndex = key; surface.frameStart = null;
    return key;
  };
  return { record, restoreBefore, latestBefore, reset, clear: () => { entries.clear(); bytes = 0; },
    diagnostics: () => ({ schemaVersion: 'hapa.isf.checkpoints.v1', count: entries.size, bytes, maxBytes, intervalFrames }) };
}

// Preparation is asynchronous and yields in bounded batches. A cold or evicted
// checkpoint requires source preparation from cue start; never invent history.
export async function prepareHyperFramesIsfSeek(surface, targetFrame, {
  startFrame = 0, prepareFrame, drawFrame, signal, batchFrames = 8,
  yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0)), onProgress = () => {},
} = {}) {
  if (signal?.aborted) throw new Error('ISF seek cancelled');
  if (surface.isfSeekPreparing) throw new Error('ISF seek already preparing');
  if (![targetFrame, startFrame, batchFrames].every(Number.isInteger) || batchFrames < 1) throw new Error('Invalid ISF seek frame');
  if (targetFrame < startFrame) throw new Error('ISF seek precedes cue');
  if (surface.lastFrameIndex === targetFrame || surface.lastFrameIndex === targetFrame - 1) return { replayed: 0, ready: true };
  const store = surface.checkpoints;
  if (!store) throw new Error('ISF seek requires its checkpoint store');
  surface.isfSeekPreparing = true;
  try {
    let last = surface.lastFrameIndex;
    if (last == null || last >= targetFrame) last = store.restoreBefore(targetFrame);
    // Prefer a later retained checkpoint when seeking forward across many frames.
    else if (store.latestBefore(targetFrame) > last) last = store.restoreBefore(targetFrame);
    let replayed = 0;
    for (let frame = last == null ? startFrame : last + 1; frame < targetFrame; frame++) {
      if (signal?.aborted) throw new Error('ISF seek cancelled');
      await prepareFrame(frame);
      if (signal?.aborted) throw new Error('ISF seek cancelled');
      drawFrame(frame); replayed++;
      if (replayed % batchFrames === 0) { onProgress({ frame, targetFrame, replayed }); await yieldFrame(); }
    }
    return { replayed, ready: true, checkpoint: store.diagnostics() };
  } finally { surface.isfSeekPreparing = false; }
}
