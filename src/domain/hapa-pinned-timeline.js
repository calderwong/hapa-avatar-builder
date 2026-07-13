(function installHapaPinnedTimeline(root) {
  "use strict";

  const enqueueMicrotask = typeof root.queueMicrotask === "function"
    ? root.queueMicrotask.bind(root)
    : (callback) => Promise.resolve().then(callback);

  class HapaPinnedTimeline {
    constructor(duration, render) {
      this._duration = Math.max(0, Number(duration) || 0);
      this._render = render;
      this._time = 0;
      this._paused = true;
      this._renderPending = false;
      this._lastRenderResult = undefined;
      this._lastRenderedTime = null;
    }

    _paint() {
      this._lastRenderedTime = this._time;
      this._lastRenderResult = this._render(this._time);
      return this._lastRenderResult;
    }

    _schedulePaint() {
      if (this._renderPending) return;
      this._renderPending = true;
      // HyperFrames probes static media volume by issuing thousands of seeks in
      // one task. Paint once after that task, at the final requested time.
      enqueueMicrotask(() => {
        if (!this._renderPending) return;
        this._renderPending = false;
        this._paint();
      });
    }

    seek(value) {
      // HyperFrames reads generic timeline state with seek() before restoring
      // it after a media-envelope probe, matching the getter form of time().
      if (value === undefined) return this._time;
      this._time = Math.max(0, Math.min(this._duration, Number(value) || 0));
      this._schedulePaint();
      return this;
    }

    time(value) {
      return value === undefined ? this._time : this.seek(value);
    }

    progress(value) {
      return value === undefined
        ? (this._duration ? this._time / this._duration : 0)
        : this.seek((Number(value) || 0) * this._duration);
    }

    duration() {
      return this._duration;
    }

    pause() {
      this._paused = true;
      return this;
    }

    play() {
      this._paused = false;
      return this;
    }

    flush() {
      if (!this._renderPending) return this._lastRenderResult;
      this._renderPending = false;
      return this._paint();
    }

    renderNow() {
      this._renderPending = false;
      return this._paint();
    }

    get lastRenderedTime() {
      return this._lastRenderedTime;
    }
  }

  root.HapaPinnedTimeline = HapaPinnedTimeline;
})(globalThis);
