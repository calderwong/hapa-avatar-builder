import { buildAttachmentNavigation } from "./deepLinks.js";

export default function BuilderAttachmentNavigation({ attachment, catalog, bindings, telemetry, processAdapter }) {
  const links = buildAttachmentNavigation(attachment, { catalog, bindings, telemetry, processAdapter });
  return <div className="builder-overcard-navigation" data-attachment-revision={attachment.revision}>
    <strong>Navigate</strong>
    <a href={links.source.href}>{links.source.label}</a>
    {links.binding && <a href={links.binding.href}>{links.binding.label}</a>}
    {links.process && <a href={links.process.href}>{links.process.label}</a>}
    <span>{links.evidence.length ? "Recent safe evidence" : "Telemetry not reported"}</span>
    {links.evidence.map((entry) => <a key={entry.id} href={entry.href} title={`${entry.level} · ${entry.at}`}>{entry.label}</a>)}
  </div>;
}
