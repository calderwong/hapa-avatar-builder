// An unscheduled media interval is an empty program input, not a decoder failure.
// Require an explicit false so unknown/missing projection state cannot hide a failure.
// A single transparent texel is sufficient; output resolution remains the shader's.
export function createEchoEmptyShaderMedia({ createCanvas = () => document.createElement("canvas") } = {}) {
  let frame = null;
  return {
    at(hasScheduledMedia) {
      if (hasScheduledMedia !== false) return null;
      if (!frame) {
        const element = createCanvas();
        element.width = 1;
        element.height = 1;
        const context = element.getContext("2d", { alpha: true });
        if (!context) throw new Error("Empty shader media requires a transparent canvas");
        context.clearRect(0, 0, 1, 1);
        element.dataset.echoSourceMediaId = "";
        element.dataset.echoFrameRoute = "empty-media-interval";
        frame = { element, receipt: { route: "empty-media-interval", policy: "transparent-input", sourceHash: null } };
      }
      return frame;
    },
  };
}
