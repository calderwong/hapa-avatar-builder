function BuilderEntityFace({ entity, compact }) {
  const title = entity.presentation?.title || entity.label || entity.entityId;
  const subtitle = entity.presentation?.subtitle || entity.entityType;
  const thumbnail = entity.presentation?.thumbnail;
  return (
    <span className={`builder-overcard-entity ${thumbnail ? "has-thumbnail" : ""}`} title={`${title} · ${subtitle}`}>
      {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <b aria-hidden="true">{title.slice(0, 1).toUpperCase()}</b>}
      {!compact && <em>{title}</em>}
    </span>
  );
}

const entityTypes = ["avatar", "card", "deck", "set", "node", "tool", "scene", "song"];

export const avatarBuilderOvercardRenderers = [
  {
    id: "avatar-builder-native-entity",
    entityTypes,
    render: (entity, context) => <BuilderEntityFace entity={entity} compact={context.compact} />,
  },
];
