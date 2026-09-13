import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, X } from "lucide-react";

const PROVIDERS = Object.freeze([
  { id: "openai", label: "OpenAI", envName: "OPENAI_API_KEY", placeholder: "Paste an OpenAI API key" },
  { id: "fal", label: "FAL.com", envName: "FAL_KEY", placeholder: "Paste a FAL.com API key" },
  { id: "xai", label: "xAI", envName: "XAI_API_KEY", placeholder: "Paste an xAI API key" },
]);

function formatUpdatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString();
}

export default function ProviderCredentialsPanel({ onClose }) {
  const bridge = globalThis.hapaCredentials;
  const [drafts, setDrafts] = useState({ openai: "", fal: "", xai: "" });
  const [providerStatus, setProviderStatus] = useState({});
  const [pendingProvider, setPendingProvider] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const available = Boolean(bridge?.status && bridge?.save && bridge?.remove);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener?.("keydown", handleKeyDown);
    return () => globalThis.removeEventListener?.("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    if (!available) return () => { active = false; };
    bridge.status().then((result) => {
      if (!active) return;
      if (!result?.ok) throw new Error(result?.message || "Credential storage is unavailable.");
      setProviderStatus(Object.fromEntries((result.providers || []).map((provider) => [provider.id, provider])));
    }).catch((statusError) => {
      if (active) setError(statusError?.message || "Credential storage is unavailable.");
    });
    return () => { active = false; };
  }, [available, bridge]);

  async function saveProvider(providerId) {
    setPendingProvider(providerId);
    setError("");
    setNotice("");
    try {
      const result = await bridge.save(providerId, drafts[providerId]);
      if (!result?.ok) throw new Error(result?.message || "The API key could not be saved.");
      setProviderStatus((current) => ({ ...current, [providerId]: result.provider }));
      setDrafts((current) => ({ ...current, [providerId]: "" }));
      setNotice(`${result.provider.label} key saved locally.`);
    } catch (saveError) {
      setError(saveError?.message || "The API key could not be saved.");
    } finally {
      setPendingProvider("");
    }
  }

  async function removeProvider(providerId) {
    const provider = PROVIDERS.find((entry) => entry.id === providerId);
    if (!globalThis.confirm?.(`Remove the locally saved ${provider?.label || providerId} key?`)) return;
    setPendingProvider(providerId);
    setError("");
    setNotice("");
    try {
      const result = await bridge.remove(providerId);
      if (!result?.ok) throw new Error(result?.message || "The API key could not be removed.");
      setProviderStatus((current) => ({ ...current, [providerId]: result.provider }));
      setDrafts((current) => ({ ...current, [providerId]: "" }));
      setNotice(`${result.provider.label} key removed from this machine.`);
    } catch (removeError) {
      setError(removeError?.message || "The API key could not be removed.");
    } finally {
      setPendingProvider("");
    }
  }

  return (
    <div className="modal-backdrop provider-credentials-backdrop" role="dialog" aria-modal="true" aria-labelledby="provider-credentials-title" onClick={onClose}>
      <section className="provider-credentials-panel hapa-panel" data-variant="notch" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow"><ShieldCheck size={14} /> Machine-local secrets</span>
            <h2 id="provider-credentials-title">Provider API keys</h2>
            <p>Add or replace credentials for future image and media generation runs.</p>
          </div>
          <button type="button" className="icon-button hapa-btn" data-icon-only aria-label="Close API key settings" title="Close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="provider-credentials-security-note">
          <LockKeyhole size={18} />
          <div>
            <strong>Encrypted locally; excluded from source control.</strong>
            <span>The desktop app stores encrypted bytes in its OS application-data directory, outside this repository. Saved keys are never returned to this screen.</span>
          </div>
        </div>

        {!available && (
          <div className="provider-credentials-message is-error">
            API key storage is available only in the canonical Hapa Avatar Builder Electron desktop app.
          </div>
        )}

        <div className="provider-credentials-list">
          {PROVIDERS.map((provider) => {
            const status = providerStatus[provider.id];
            const configured = Boolean(status?.configured);
            const pending = pendingProvider === provider.id;
            const draft = drafts[provider.id];
            return (
              <article className="provider-credential-card" key={provider.id}>
                <div className="provider-credential-heading">
                  <div className="provider-credential-icon"><KeyRound size={18} /></div>
                  <div>
                    <h3>{provider.label}</h3>
                    <code>{provider.envName}</code>
                  </div>
                  <span className={`provider-credential-state ${configured ? "is-configured" : ""}`}>
                    {configured ? <><CheckCircle2 size={14} /> Saved locally</> : "Not configured"}
                  </span>
                </div>
                {configured && (
                  <div className="provider-credential-metadata">
                    <span>Fingerprint <code>{status.fingerprint}</code></span>
                    {formatUpdatedAt(status.updatedAt) && <span>Updated {formatUpdatedAt(status.updatedAt)}</span>}
                  </div>
                )}
                <label htmlFor={`provider-key-${provider.id}`}>{configured ? "Replace key" : "API key"}</label>
                <div className="provider-credential-entry">
                  <input
                    id={`provider-key-${provider.id}`}
                    type="password"
                    value={draft}
                    placeholder={provider.placeholder}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={!available || pending}
                    onChange={(event) => setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && draft.trim().length >= 12 && !pending) void saveProvider(provider.id);
                    }}
                  />
                  <button type="button" className="hapa-btn" data-intent="primary" disabled={!available || pending || draft.trim().length < 12} onClick={() => void saveProvider(provider.id)}>
                    {pending ? "Saving…" : configured ? "Replace" : "Save locally"}
                  </button>
                  {configured && (
                    <button type="button" className="hapa-btn" data-intent="danger" disabled={!available || pending} onClick={() => void removeProvider(provider.id)}>Remove</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {(notice || error) && <div className={`provider-credentials-message ${error ? "is-error" : "is-success"}`} role="status">{error || notice}</div>}
        <footer>No cloud sync · No browser storage · No plaintext fallback · No key reveal API</footer>
      </section>
    </div>
  );
}
