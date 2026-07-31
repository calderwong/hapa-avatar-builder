import { Component, Fragment } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default class EchoRecordGardenBoundary extends Component {
  state = {
    error: null,
    revision: 0,
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Echo Record Garden view failed:", error, info);
  }

  retry = () => {
    this.setState((current) => ({
      error: null,
      revision: current.revision + 1,
    }));
  };

  reload = () => {
    globalThis.location?.reload?.();
  };

  render() {
    if (this.state.error) {
      return (
        <section className="tarot-draw-view tarot-draw-loading echo-record-garden-boundary" role="alert">
          <AlertTriangle size={24} />
          <strong>The Record Garden needs a fresh start.</strong>
          <span>{this.state.error?.message || "The 3D table could not open."}</span>
          <div className="echo-record-garden-boundary-actions">
            <button className="hapa-btn" type="button" onClick={this.retry}>
              <RotateCcw size={15} />
              Retry Record Garden
            </button>
            <button className="hapa-btn" type="button" onClick={this.reload}>
              Reload Builder
            </button>
          </div>
        </section>
      );
    }
    return <Fragment key={this.state.revision}>{this.props.children}</Fragment>;
  }
}
