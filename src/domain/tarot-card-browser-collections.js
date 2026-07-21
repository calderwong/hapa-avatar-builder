const BUILD_WEEK_SET_ID = "codex-build-week-2026";

function normalizedSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function browserItemSearchValues(item = {}) {
  const buildWeek = item.card?.enrichment?.media?.codexBuildWeek || {};
  return [
    item.title,
    item.subtitle,
    item.label,
    item.kind,
    item.card?.summary,
    item.card?.meaning,
    item.card?.archetype,
    buildWeek.setId,
    buildWeek.setTitle,
    buildWeek.category,
    buildWeek.number,
    ...(item.keywords || []),
    ...(item.tags || [])
  ];
}

export function filterTarotCardBrowserItemsByQuery(items = [], query = "") {
  const term = normalizedSearchText(query);
  if (!term) return items;
  return items.filter((item) => normalizedSearchText(browserItemSearchValues(item).join(" ")).includes(term));
}

export function buildTarotCardBrowserCollections(items = []) {
  const collections = new Map();
  for (const item of items) {
    const buildWeek = item.card?.enrichment?.media?.codexBuildWeek || {};
    const setId = String(buildWeek.setId || "").trim();
    if (!setId) continue;
    const collection = collections.get(setId) || {
      id: setId,
      title: String(buildWeek.setTitle || (setId === BUILD_WEEK_SET_ID ? "Codex Build Week" : setId)).trim(),
      description: String(buildWeek.setDescription || "Mined Tarot Card collection").trim(),
      items: [],
      categories: []
    };
    const cardId = String(item.cardId || item.card?.id || item.id || "").trim();
    if (!collection.items.some((candidate) => String(candidate.cardId || candidate.card?.id || candidate.id || "") === cardId)) {
      collection.items.push(item);
    }
    const category = String(buildWeek.category || "").trim();
    if (category && !collection.categories.includes(category)) collection.categories.push(category);
    collections.set(setId, collection);
  }
  return [...collections.values()]
    .map((collection) => ({
      ...collection,
      items: [...collection.items].sort((first, second) =>
        Number(first.card?.enrichment?.media?.codexBuildWeek?.order || 999) - Number(second.card?.enrichment?.media?.codexBuildWeek?.order || 999) ||
        String(first.title || "").localeCompare(String(second.title || ""))
      ),
      categories: [...collection.categories].sort(),
      count: collection.items.length
    }))
    .sort((first, second) => first.title.localeCompare(second.title));
}
