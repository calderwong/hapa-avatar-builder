import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Image as ImageIcon, ShieldCheck } from "lucide-react";

export default function EchoTarotImagePromptReview({ promptSet, onNotice = () => {} }) {
  const [selectedKey, setSelectedKey] = useState(promptSet?.variants?.[0]?.key || "default-man");
  const [copiedKey, setCopiedKey] = useState("");
  const selected = useMemo(
    () => promptSet?.variants?.find((variant) => variant.key === selectedKey) || promptSet?.variants?.[0] || null,
    [promptSet, selectedKey]
  );

  async function copyPrompt() {
    if (!selected?.prompt) return;
    try {
      await navigator.clipboard.writeText(selected.prompt);
      setCopiedKey(selected.key);
      onNotice(`${promptSet.cardTitle} × ${promptSet.songTitle}: ${selected.label} prompt copied.`);
      window.setTimeout(() => setCopiedKey((current) => current === selected.key ? "" : current), 1800);
    } catch (error) {
      onNotice(`Prompt copy failed: ${error?.message || String(error)}`);
    }
  }

  if (!selected) return null;

  return (
    <details className="echo-tarot-prompt-review">
      <summary><ImageIcon size={13} /> GPT Image 2.5 prompts <span>{promptSet.variants.length} cast variations</span></summary>
      <div className="echo-tarot-prompt-status">
        <span><ShieldCheck size={12} /> Draft for human review</span>
        <small>No generation request is sent from this panel.</small>
      </div>
      <div className="echo-tarot-prompt-tabs" role="tablist" aria-label={`${promptSet.cardTitle} prompt cast variation`}>
        {promptSet.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="tab"
            aria-selected={variant.key === selected.key}
            className={variant.key === selected.key ? "active" : ""}
            onClick={() => setSelectedKey(variant.key)}
          >
            {variant.label}
          </button>
        ))}
      </div>
      <div className="echo-tarot-prompt-meta">
        <span>{promptSet.targetModel}</span><span>{promptSet.aspectRatio}</span><span>{promptSet.mappingStatus}</span>
      </div>
      <pre tabIndex="0" aria-label={`${selected.label} prompt for ${promptSet.cardTitle} and ${promptSet.songTitle}`}>{selected.prompt}</pre>
      <button type="button" onClick={copyPrompt} className="echo-tarot-copy-prompt">
        {copiedKey === selected.key ? <Check size={13} /> : <ClipboardCopy size={13} />}
        {copiedKey === selected.key ? "Copied" : `Copy ${selected.label} prompt`}
      </button>
    </details>
  );
}
