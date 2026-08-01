import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ClipboardCheck,
  Flag,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS,
  createEchoRecordGardenAcceptanceRun,
  evaluateEchoRecordGardenAcceptance,
  snapshotEchoRecordGardenDiagnostics,
} from "../domain/echo-record-garden-acceptance.js";

const DIAGNOSTICS_KEY = "__HAPA_ECHO_RECORD_GARDEN_DIAGNOSTICS__";
const RECORD_GARDEN_REVIEW_TITLE_ID = "echo-record-garden-review-title";
const RECORD_GARDEN_CHUNK_NAME = /^EchoRecordGarden3DView-[A-Za-z0-9_-]+\.js$/;
const RECORD_GARDEN_BROWSER_DELIVERY_SCHEMA = "hapa.echo-record-garden.browser-delivery-proof.v1";
const MAX_RECORD_GARDEN_CHUNK_BYTES = 8 * 1024 * 1024;
const ACCEPTANCE_PANEL_MODULE_URL = import.meta.url;
const FINAL_CAPTURE_SIGNAL_IDS = new Set(["browser-chunk", "review-timeline"]);
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function apiRoot(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function reviewEnabled() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("recordGardenReview") === "1";
  } catch {
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function emptyChecks() {
  return Object.fromEntries(ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS.map(({ id }) => [id, "pending"]));
}

function initialDraft() {
  return {
    operator: "",
    observedAt: nowIso(),
    browserDevice: "Current browser and device",
    viewport: `${globalThis.innerWidth || 0} × ${globalThis.innerHeight || 0}`,
    songsTested: [],
    directorTimecodes: [],
    evidencePaths: [],
    consoleErrors: "",
    notes: "",
    checks: emptyChecks(),
  };
}

function listText(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function parseLines(value) {
  return [...new Set(String(value || "").split(/\n/).map((item) => item.trim()).filter(Boolean))];
}

function captureRuntimeDiagnostics() {
  const source = globalThis[DIAGNOSTICS_KEY] || {};
  return snapshotEchoRecordGardenDiagnostics({ ...source, capturedAt: nowIso() });
}

function stopAcceptanceRun(reason = "review-stopped") {
  const diagnostics = globalThis[DIAGNOSTICS_KEY];
  const run = diagnostics?.acceptanceRun;
  if (!run || typeof run !== "object" || run.running !== true) return false;
  run.running = false;
  run.endedAt = nowIso();
  run.endReason = String(reason || "review-stopped");
  return true;
}

function sha256Hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function captureLoadedRecordGardenDeliveryProof() {
  const pageUrl = new URL(globalThis.location?.href || "http://127.0.0.1/");
  const componentUrl = new URL(ACCEPTANCE_PANEL_MODULE_URL, pageUrl);
  const componentChunkFile = componentUrl.pathname.split("/").filter(Boolean).at(-1) || "";
  if (componentUrl.origin !== pageUrl.origin || !RECORD_GARDEN_CHUNK_NAME.test(componentChunkFile)) {
    throw new Error("Record Garden acceptance requires the hashed production component chunk loaded by this page.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot hash the loaded Record Garden component chunk.");
  }
  const response = await fetch(componentUrl.href, {
    headers: { Accept: "text/javascript, application/javascript" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`The loaded Record Garden component chunk could not be read (${response.status}).`);
  }
  const responseUrl = new URL(response.url || componentUrl.href, pageUrl);
  if (responseUrl.origin !== pageUrl.origin || responseUrl.pathname !== componentUrl.pathname) {
    throw new Error("The loaded Record Garden component chunk redirected away from its exact page resource.");
  }
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_RECORD_GARDEN_CHUNK_BYTES) {
    throw new Error("The loaded Record Garden component chunk has an invalid byte length.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const sanitizedComponentUrl = `${componentUrl.origin}${componentUrl.pathname}`;
  const componentChunkSha256 = `sha256:${sha256Hex(digest)}`;
  return {
    schemaVersion: RECORD_GARDEN_BROWSER_DELIVERY_SCHEMA,
    capturedAt: nowIso(),
    origin: pageUrl.origin,
    path: componentUrl.pathname,
    url: sanitizedComponentUrl,
    sha256: componentChunkSha256,
    pageOrigin: pageUrl.origin,
    pagePathname: pageUrl.pathname,
    componentChunkPath: componentUrl.pathname,
    componentChunkFile,
    componentChunkUrl: sanitizedComponentUrl,
    componentChunkSha256,
    byteLength: bytes.byteLength,
    discoverySource: "import-meta-url",
  };
}

function assertBrowserDeliveryMatchesContext(proof = {}, context = {}) {
  const expectedPath = String(context?.component?.path || context?.componentChunkPath || "");
  const expectedFile = expectedPath.split("/").filter(Boolean).at(-1) || "";
  const expectedSha256 = String(context?.component?.sha256 || context?.componentChunkSha256 || "");
  if (!expectedFile || proof.componentChunkFile !== expectedFile || proof.componentChunkSha256 !== expectedSha256) {
    throw new Error("This page is not running the Record Garden component chunk named by the current server delivery.");
  }
}

function assertSameBrowserDelivery(start = {}, end = {}) {
  for (const field of ["pageOrigin", "componentChunkPath", "componentChunkSha256", "byteLength"]) {
    if (!start[field] || start[field] !== end[field]) {
      throw new Error("The browser-loaded Record Garden delivery changed during acceptance. Start a fresh review.");
    }
  }
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

async function bootstrapLocalSession(base) {
  const response = await fetch(`${base}/api/local-ui-session`, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Local review session could not start (${response.status}).`);
}

async function fetchAcceptanceContext(base) {
  const response = await fetch(`${base}/api/echos/record-garden/acceptance-context`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.context) {
    throw new Error(payload?.message || `Acceptance context is unavailable (${response.status}).`);
  }
  return payload.context;
}

export default function EchoRecordGardenAcceptancePanel({ apiBase = "", captureCheckpoint }) {
  const enabled = useMemo(reviewEnabled, []);
  const launcherRef = useRef(null);
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(initialDraft);
  const [contextStart, setContextStart] = useState(null);
  const [contextFinish, setContextFinish] = useState(null);
  const [browserDeliveryStart, setBrowserDeliveryStart] = useState(null);
  const [browserDeliveryFinish, setBrowserDeliveryFinish] = useState(null);
  const [diagnostics, setDiagnostics] = useState(captureRuntimeDiagnostics);
  const [checkpoints, setCheckpoints] = useState([]);
  const [environmentSessions, setEnvironmentSessions] = useState([]);
  const [message, setMessage] = useState("Start a review to reset the evidence counters.");
  const [savedReceipt, setSavedReceipt] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = globalThis.setInterval(() => setDiagnostics(captureRuntimeDiagnostics()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, [open]);

  const closePanel = useCallback(() => {
    stopAcceptanceRun("panel-closed");
    setDiagnostics(captureRuntimeDiagnostics());
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const focusFrame = globalThis.requestAnimationFrame?.(() => panel?.focus({ preventScroll: true }));
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => (
        element instanceof HTMLElement
        && !element.hidden
        && element.getAttribute("aria-hidden") !== "true"
        && element.getClientRects().length > 0
      ));
      if (!focusable.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = globalThis.document?.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active) || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active) || active === panel)) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event) => {
      if (panel && !panel.contains(event.target)) panel.focus({ preventScroll: true });
    };
    globalThis.document?.addEventListener("keydown", handleKeyDown, true);
    globalThis.document?.addEventListener("focusin", handleFocusIn, true);
    return () => {
      if (focusFrame != null) globalThis.cancelAnimationFrame?.(focusFrame);
      globalThis.document?.removeEventListener("keydown", handleKeyDown, true);
      globalThis.document?.removeEventListener("focusin", handleFocusIn, true);
      const restoreTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restoreTarget?.isConnected && typeof restoreTarget.focus === "function") {
        restoreTarget.focus({ preventScroll: true });
      }
    };
  }, [closePanel, open]);

  useEffect(() => () => {
    stopAcceptanceRun("panel-unmounted");
  }, []);

  const evaluation = useMemo(() => evaluateEchoRecordGardenAcceptance({
    draft,
    diagnostics,
    service: contextFinish || contextStart || {},
    contextStart: contextStart || {},
    contextEnd: contextFinish || contextStart || {},
    browserDeliveryStart: browserDeliveryStart || {},
    browserDeliveryEnd: browserDeliveryFinish || {},
    environmentSessions,
    checkpoints,
  }), [
    browserDeliveryFinish,
    browserDeliveryStart,
    checkpoints,
    contextFinish,
    contextStart,
    diagnostics,
    draft,
    environmentSessions,
  ]);

  if (!enabled) return null;

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const setCheck = (id, result) => setDraft((current) => ({
    ...current,
    checks: { ...current.checks, [id]: result },
  }));

  const beginReview = async () => {
    stopAcceptanceRun("review-restarted");
    setBusy(true);
    setSavedReceipt(null);
    try {
      const base = apiRoot(apiBase);
      await bootstrapLocalSession(base);
      const context = await fetchAcceptanceContext(base);
      const loadedDelivery = await captureLoadedRecordGardenDeliveryProof();
      assertBrowserDeliveryMatchesContext(loadedDelivery, context);
      const globalDiagnostics = globalThis[DIAGNOSTICS_KEY] || {};
      globalDiagnostics.acceptanceRun = createEchoRecordGardenAcceptanceRun();
      globalDiagnostics.inputCounts = { keyboard: 0, mouse: 0, pen: 0, touch: 0 };
      globalThis[DIAGNOSTICS_KEY] = globalDiagnostics;
      setContextStart(context);
      setContextFinish(null);
      setBrowserDeliveryStart(loadedDelivery);
      setBrowserDeliveryFinish(null);
      setCheckpoints([]);
      setEnvironmentSessions([]);
      setDiagnostics(captureRuntimeDiagnostics());
      setDraft((current) => ({
        ...initialDraft(),
        operator: current.operator,
        browserDevice: current.browserDevice || "Current browser and device",
      }));
      setMessage("Review started on this exact production bundle. Perform the checklist, then capture desktop and compact checkpoints.");
    } catch (error) {
      setMessage(error?.message || "The acceptance review could not start.");
    } finally {
      setBusy(false);
    }
  };

  const cancelReview = () => {
    stopAcceptanceRun("review-cancelled");
    setContextStart(null);
    setContextFinish(null);
    setBrowserDeliveryStart(null);
    setBrowserDeliveryFinish(null);
    setCheckpoints([]);
    setEnvironmentSessions([]);
    setSavedReceipt(null);
    setDiagnostics(captureRuntimeDiagnostics());
    setDraft((current) => ({
      ...initialDraft(),
      operator: current.operator,
      browserDevice: current.browserDevice,
    }));
    setMessage("Review cancelled. Its telemetry counters are frozen and were not saved.");
  };

  const capture = () => {
    if (!contextStart) {
      setMessage("Start the review before capturing a checkpoint.");
      return;
    }
    try {
      const checkpoint = captureCheckpoint?.();
      if (!checkpoint?.id) throw new Error("The live renderer did not return a checkpoint.");
      const kind = (globalThis.innerWidth || Infinity) <= 760 ? "compact" : "desktop";
      const environment = {
        ...checkpoint.environment,
        id: `${checkpoint.id}-${kind}`,
        kind,
        capturedAt: checkpoint.capturedAt,
      };
      setCheckpoints((current) => [...current, checkpoint].slice(-12));
      setEnvironmentSessions((current) => [
        ...current.filter((session) => session.kind !== kind),
        environment,
      ].slice(-4));
      setDraft((current) => ({
        ...current,
        viewport: `${globalThis.innerWidth || 0} × ${globalThis.innerHeight || 0}`,
        songsTested: checkpoint.songTitle
          ? [...new Set([...current.songsTested, checkpoint.songTitle])]
          : current.songsTested,
        directorTimecodes: checkpoint.songTitle && checkpoint.cueId
          ? [...new Set([...current.directorTimecodes, `${checkpoint.songTitle} · ${formatSeconds(checkpoint.audioTime)} · ${checkpoint.cueId}`])]
          : current.directorTimecodes,
      }));
      setDiagnostics(captureRuntimeDiagnostics());
      setMessage(`${kind === "compact" ? "Compact" : "Desktop"} checkpoint captured at ${formatSeconds(checkpoint.audioTime)}.`);
    } catch (error) {
      setMessage(error?.message || "Checkpoint capture failed.");
    }
  };

  const saveReceipt = async (result) => {
    if (!contextStart || !browserDeliveryStart) {
      setMessage("Start the review before saving evidence.");
      return;
    }
    setBusy(true);
    setSavedReceipt(null);
    try {
      const base = apiRoot(apiBase);
      stopAcceptanceRun("receipt-save-requested");
      const finalDiagnostics = captureRuntimeDiagnostics();
      setDiagnostics(finalDiagnostics);
      const browserDeliveryEnd = await captureLoadedRecordGardenDeliveryProof();
      const contextEnd = await fetchAcceptanceContext(base);
      assertBrowserDeliveryMatchesContext(browserDeliveryEnd, contextEnd);
      assertSameBrowserDelivery(browserDeliveryStart, browserDeliveryEnd);
      const finalEvaluation = evaluateEchoRecordGardenAcceptance({
        draft,
        diagnostics: finalDiagnostics,
        service: contextEnd,
        contextStart,
        contextEnd,
        environmentSessions,
        checkpoints,
        browserDeliveryStart,
        browserDeliveryEnd,
      });
      if (result === "pass" && !finalEvaluation.canRecordPass) {
        const missing = [
          ...finalEvaluation.missingFields,
          ...finalEvaluation.pendingChecks,
          ...finalEvaluation.failedChecks,
          ...finalEvaluation.failedSignals,
        ];
        throw new Error(`Passing evidence is not complete: ${missing.join(", ") || "review the checklist"}.`);
      }
      if (result === "fail" && !finalEvaluation.canRecordFailure) {
        throw new Error("Mark at least one row Problem and add exact reproduction notes before saving an issue receipt.");
      }
      const response = await fetch(`${base}/api/echos/record-garden/acceptance-receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          result,
          draft,
          diagnostics: finalDiagnostics,
          contextStart,
          contextEnd,
          environmentSessions,
          checkpoints,
          browserDeliveryStart,
          browserDeliveryEnd,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || `Receipt save failed (${response.status}).`);
      setContextFinish(contextEnd);
      setBrowserDeliveryFinish(browserDeliveryEnd);
      setSavedReceipt(payload);
      setMessage(result === "pass"
        ? "Passing human-observed receipt saved. Board closeout remains a separate append-only review."
        : "Issue receipt saved without closing or mutating the board.");
    } catch (error) {
      setMessage(`${error?.message || "Acceptance receipt could not be saved."} The review is frozen; restart it to collect more evidence.`);
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    restoreFocusRef.current = globalThis.document?.activeElement || launcherRef.current;
    setOpen(true);
  };

  const reviewRunning = Boolean(contextStart && diagnostics.acceptanceRun.running);
  const passReadyForFinalCapture = Boolean(
    browserDeliveryStart
    && !evaluation.missingFields.length
    && !evaluation.pendingChecks.length
    && !evaluation.failedChecks.length
    && evaluation.failedSignals.every((id) => FINAL_CAPTURE_SIGNAL_IDS.has(id)),
  );

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="hapa-btn echo-record-review-launcher"
        data-testid="echo-record-review-launcher"
        onClick={openPanel}
        aria-expanded={open}
        aria-controls="echo-record-review-panel"
      >
        <ClipboardCheck size={14} aria-hidden="true" />
        Verify experience
      </button>
      {open && (
        <div className="echo-record-review-backdrop">
          <aside
            ref={panelRef}
            id="echo-record-review-panel"
            className="echo-record-review-panel hapa-panel"
            data-variant="notch"
            role="dialog"
            aria-modal="true"
            aria-labelledby={RECORD_GARDEN_REVIEW_TITLE_ID}
            aria-busy={busy}
            tabIndex={-1}
          >
          <header>
            <div>
              <span>HUMAN-OBSERVED GATE</span>
              <h3 id={RECORD_GARDEN_REVIEW_TITLE_ID}>Record Garden acceptance</h3>
            </div>
            <button type="button" onClick={closePanel} aria-label="Close Record Garden acceptance panel"><X size={18} aria-hidden="true" /></button>
          </header>

          <div className="echo-record-review-actions">
            <button className="hapa-btn" type="button" onClick={beginReview} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
              {contextStart ? "Restart review" : "Start review"}
            </button>
            <button className="hapa-btn" type="button" onClick={capture} disabled={!reviewRunning || busy}>
              <Camera size={14} aria-hidden="true" /> Capture checkpoint
            </button>
            <button className="hapa-btn" type="button" onClick={cancelReview} disabled={!contextStart || busy}>
              <X size={14} aria-hidden="true" /> Cancel review
            </button>
          </div>

          <div className="echo-record-review-progress" aria-label="Live acceptance counters">
            <span><strong>{Math.floor(diagnostics.acceptanceRun.playbackSeconds)}s</strong> playback</span>
            <span><strong>{diagnostics.acceptanceRun.recordChanges}</strong> record changes</span>
            <span><strong>{diagnostics.acceptanceRun.seekGestures}</strong> seeks</span>
            <span><strong>{diagnostics.acceptanceRun.cardResults}</strong> Card results</span>
            <span><strong>{checkpoints.length}</strong> checkpoints</span>
          </div>

          <div className="echo-record-review-signals" role="list" aria-label="Browser-reported supporting signals">
            {evaluation.automatedSignals.map((signal) => (
              <span key={signal.id} role="listitem" data-state={signal.pass ? "pass" : "pending"}>
                {signal.pass ? <Check size={14} aria-hidden="true" /> : <Flag size={14} aria-hidden="true" />}
                <span className="echo-record-review-signal-label">{signal.label}</span>
                <strong className="echo-record-review-signal-state">{signal.pass ? "Passed" : "Not yet"}</strong>
              </span>
            ))}
          </div>

          <div className="echo-record-review-checks">
            {ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS.map((check) => (
              <div key={check.id} className="echo-record-review-check">
                <span>{check.label}</span>
                <div role="group" aria-label={`${check.label} result`}>
                  <button type="button" data-state={draft.checks[check.id] === "pass" ? "active" : "idle"} aria-pressed={draft.checks[check.id] === "pass"} onClick={() => setCheck(check.id, "pass")}>Pass</button>
                  <button type="button" data-state={draft.checks[check.id] === "fail" ? "active" : "idle"} aria-pressed={draft.checks[check.id] === "fail"} onClick={() => setCheck(check.id, "fail")}>Problem</button>
                </div>
              </div>
            ))}
          </div>

          <div className="echo-record-review-fields">
            <label>Operator<input value={draft.operator} onChange={(event) => setField("operator", event.target.value)} /></label>
            <label>Browser / device<input value={draft.browserDevice} onChange={(event) => setField("browserDevice", event.target.value)} /></label>
            <label>Songs tested<textarea value={listText(draft.songsTested)} onChange={(event) => setField("songsTested", parseLines(event.target.value))} /></label>
            <label>Director cue samples<textarea value={listText(draft.directorTimecodes)} onChange={(event) => setField("directorTimecodes", parseLines(event.target.value))} /></label>
            <label>Screenshot or recording paths<textarea value={listText(draft.evidencePaths)} onChange={(event) => setField("evidencePaths", parseLines(event.target.value))} /></label>
            <label>Console / page / network errors<textarea value={draft.consoleErrors} onChange={(event) => setField("consoleErrors", event.target.value)} /></label>
            <label>Notes or exact reproduction steps<textarea value={draft.notes} onChange={(event) => setField("notes", event.target.value)} /></label>
          </div>

          <div className="echo-record-review-save-actions">
            <button className="hapa-btn" data-intent="primary" type="button" disabled={busy || (!evaluation.canRecordPass && !passReadyForFinalCapture)} onClick={() => void saveReceipt("pass")}>
              <Save size={14} aria-hidden="true" /> Save passing receipt
            </button>
            <button className="hapa-btn" data-intent="warning" type="button" disabled={busy || !evaluation.canRecordFailure} onClick={() => void saveReceipt("fail")}>
              <Flag size={14} aria-hidden="true" /> Save issue receipt
            </button>
          </div>
          <p className="echo-record-review-message" role="status" aria-live="polite">{message}</p>
          {savedReceipt && (
            <p className="echo-record-review-receipt" data-testid="echo-record-review-receipt">
              Saved: {savedReceipt.relativePath} · {savedReceipt.sha256}
            </p>
          )}
          <small>Human observations and browser telemetry are saved separately from the append-only Kanban. This panel never mints, publishes, or closes a board card.</small>
          </aside>
        </div>
      )}
    </>
  );
}
