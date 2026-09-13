import { useEffect, useRef, useState } from "react";

function reducedMotionQuery() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
}

export default function EchoHoverLoopMedia({
  imageUri = "",
  loopUri = "",
  alt = "",
  loopAriaLabel = "",
  className = "",
  active = false,
  loading = "lazy",
}) {
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const [engaged, setEngaged] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => Boolean(reducedMotionQuery()?.matches));
  const shouldPlay = Boolean(loopUri && !reducedMotion && (active || engaged));

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return undefined;
    const onChange = (event) => setReducedMotion(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const owner = root?.closest?.("button, a, [tabindex]");
    if (!root) return undefined;
    const engage = () => setEngaged(true);
    const disengage = () => setEngaged(false);
    root.addEventListener("focus", engage);
    root.addEventListener("blur", disengage);
    if (owner && owner !== root) {
      owner.addEventListener("focus", engage);
      owner.addEventListener("blur", disengage);
    }
    return () => {
      root.removeEventListener("focus", engage);
      root.removeEventListener("blur", disengage);
      if (owner && owner !== root) {
        owner.removeEventListener("focus", engage);
        owner.removeEventListener("blur", disengage);
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) {
      const request = video.play();
      request?.catch?.(() => {});
      return;
    }
    video.pause();
    try { video.currentTime = 0; } catch { /* Media may not be seekable before metadata loads. */ }
  }, [shouldPlay]);

  return (
    <div
      ref={rootRef}
      className={`echo-hover-loop-media ${className}`.trim()}
      data-has-loop={loopUri ? "true" : "false"}
      data-playing={shouldPlay ? "true" : "false"}
      aria-label={loopUri && loopAriaLabel ? loopAriaLabel : undefined}
      tabIndex={loopUri ? 0 : undefined}
      onPointerEnter={() => setEngaged(true)}
      onPointerLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
    >
      {imageUri
        ? <img src={imageUri} alt={alt} loading={loading} decoding="async" />
        : <span className="echo-hover-loop-media-placeholder" aria-hidden="true">No visual</span>}
      {loopUri && (
        <video
          ref={videoRef}
          src={loopUri}
          poster={imageUri || undefined}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
        />
      )}
      {loopUri && <span className="echo-hover-loop-badge">{reducedMotion ? "Loop available" : "Hover · loop"}</span>}
    </div>
  );
}
