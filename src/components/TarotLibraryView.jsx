import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  FileJson,
  Film,
  ImagePlus,
  Layers3,
  Link2,
  Maximize2,
  Palette,
  Radar,
  Search,
  Sparkles,
  Tags
} from "lucide-react";
import {
  TAROT_CARD_STATUSES,
  TAROT_CARD_TYPES,
  TAROT_SUITS
} from "../domain/tarot.js";
import {
  MAJOR_ARCANA_COLOR_REFERENCE,
  MAJOR_ARCANA_REFERENCES,
  cardReferencePatch
} from "../domain/majorArcanaReference.js";

export const STANDALONE_TAROT_DECK_ID = "__standalone_tarot_cards";
export const TAROT_DECK_COLLECTION_PREFIX = "deck:";
export const TAROT_SET_COLLECTION_PREFIX = "set:";

const TAROT_SYNC_LABELS = {
  loading: "LOAD",
  saved: "SAVED",
  syncing: "SYNC",
  draft: "DRAFT"
};

const electronApiBase = globalThis.window?.hapaAvatarBuilder?.apiBase;
const API_BASE = electronApiBase || (globalThis.location?.port === "5178" ? "http://127.0.0.1:8787" : "");

function scheduleBufferedIdle(callback, timeout = 520) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, Math.min(timeout, 120));
  return () => window.clearTimeout(id);
}

function BufferedTextInput(props) {
  return <BufferedTextControl as="input" {...props} />;
}

function BufferedTextArea(props) {
  return <BufferedTextControl as="textarea" {...props} />;
}

function BufferedTextControl({ as: Component, value, onCommit, debounceMs = 520, onBlur, ...props }) {
  const textValue = value == null ? "" : String(value);
  const [draft, setDraft] = useState(textValue);
  const draftRef = useRef(textValue);
  const committedRef = useRef(textValue);
  const commitRef = useRef(onCommit);
  const timerRef = useRef(0);
  const idleCancelRef = useRef(null);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (textValue === committedRef.current) return;
    committedRef.current = textValue;
    draftRef.current = textValue;
    setDraft(textValue);
  }, [textValue]);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    idleCancelRef.current?.();
  }, []);

  function cancelPendingCommit() {
    window.clearTimeout(timerRef.current);
    idleCancelRef.current?.();
    idleCancelRef.current = null;
  }

  function flush(nextValue = draftRef.current) {
    cancelPendingCommit();
    if (nextValue === committedRef.current) return;
    committedRef.current = nextValue;
    commitRef.current?.(nextValue);
  }

  function scheduleCommit(nextValue) {
    cancelPendingCommit();
    timerRef.current = window.setTimeout(() => {
      idleCancelRef.current = scheduleBufferedIdle(() => {
        idleCancelRef.current = null;
        flush(nextValue);
      }, 520);
    }, debounceMs);
  }

  return (
    <Component
      {...props}
      value={draft}
      onChange={(event) => {
        const nextValue = event.target.value;
        draftRef.current = nextValue;
        setDraft(nextValue);
        scheduleCommit(nextValue);
      }}
      onBlur={(event) => {
        flush(event.target.value);
        onBlur?.(event);
      }}
    />
  );
}

export function tarotDeckCollectionId(deckId) {
  return deckId ? `${TAROT_DECK_COLLECTION_PREFIX}${deckId}` : STANDALONE_TAROT_DECK_ID;
}

export function tarotSetCollectionId(setId) {
  return setId ? `${TAROT_SET_COLLECTION_PREFIX}${setId}` : STANDALONE_TAROT_DECK_ID;
}

export function tarotCollectionKind(collectionId) {
  if (collectionId === STANDALONE_TAROT_DECK_ID) return "standalone";
  if (collectionId?.startsWith(TAROT_SET_COLLECTION_PREFIX)) return "set";
  return "deck";
}

export function tarotCollectionEntityId(collectionId) {
  if (!collectionId || collectionId === STANDALONE_TAROT_DECK_ID) return null;
  if (collectionId.startsWith(TAROT_DECK_COLLECTION_PREFIX)) return collectionId.slice(TAROT_DECK_COLLECTION_PREFIX.length);
  if (collectionId.startsWith(TAROT_SET_COLLECTION_PREFIX)) return collectionId.slice(TAROT_SET_COLLECTION_PREFIX.length);
  return collectionId;
}

export function tarotTitleFromAsset(asset = {}) {
  const source = asset.metadata?.originalFileName || asset.name || "Untitled Tarot Card";
  const clean = source
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean
    ? clean.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Untitled Tarot Card";
}

export default function TarotLibraryView({
  store,
  summary,
  dashboard,
  avatars,
  selectedDeckId,
  selectedDeck,
  selectedSet,
  selectedCard,
  selectedCardId,
  cardsForDeck,
  attachPack,
  syncState,
  onCreateDeck,
  onCreateSet,
  onSelectDeck,
  onSelectCard,
  onUpdateDeck,
  onUpdateSet,
  onUpdateCard,
  onSetDeckMembership,
  onSetSetMembership,
  onToggleAvatar,
  onUpload,
  onUploadLoop,
  onDrop,
  onExpand,
  onPreview,
  onPreviewHide
}) {
  const decks = store?.decks || [];
  const sets = store?.sets || [];
  const cards = store?.cards || [];
  const standaloneCards = cards.filter((card) => !card.deckIds?.length && !card.setIds?.length);
  const isStandalone = selectedDeckId === STANDALONE_TAROT_DECK_ID;
  const inputId = "tarot-card-upload-picker";
  const loopInputId = "tarot-loop-upload-picker";
  const linkedAvatars = new Set((selectedCard?.avatarLinks || []).map((link) => link.avatarId));
  const cardBackOptions = cards.filter((card) => card.cardType === "card_back");
  const loopVideos = (selectedCard?.assets || []).filter((asset) => asset.type === "video");
  const [cardReferenceOpen, setCardReferenceOpen] = useState(false);
  const [cardReferenceQuery, setCardReferenceQuery] = useState("");
  const activeTitle = isStandalone
    ? "Standalone Cards"
    : selectedSet?.title || selectedDeck?.title || "Hapa Tarot Library";
  const activeSubtitle = isStandalone
    ? "cards can be decked, set-collected, or avatar-linked later"
    : selectedSet
      ? `${selectedSet.status} set / ${selectedSet.cardIds.length} cards`
      : selectedDeck?.subtitle || "custom deck branch";

  return (
    <section className="tarot-workspace-view">
      <div className="tarot-command-header panel hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow">Tarot Library</p>
          <h2>{activeTitle}</h2>
          <span>{activeSubtitle}</span>
        </div>
        <div className="tarot-readouts">
          <TarotStatusChip label="SYNC" value={TAROT_SYNC_LABELS[syncState] || String(syncState || "local").toUpperCase()} tone={syncState === "saved" ? "green" : syncState === "syncing" ? "cyan" : "gold"} />
          <TarotStatusChip label="DECKS" value={summary.decks} tone="cyan" />
          <TarotStatusChip label="SETS" value={summary.sets} tone="green" />
          <TarotStatusChip label="CARDS" value={summary.cards} tone="rose" />
          <TarotStatusChip label="BACKS" value={summary.cardBacks} tone="gold" />
          <TarotStatusChip label="LOOPS" value={summary.loopVideos} tone="fuchsia" />
          <TarotStatusChip label="LINKS" value={summary.avatarLinks} tone="fuchsia" />
        </div>
      </div>

      <aside className="panel hapa-panel tarot-deck-rail" data-variant="notch">
        <div className="tarot-collection-section">
          <div className="section-head hapa-panel-head">
            <span><BookOpen size={15} /> Decks</span>
            <button type="button" onClick={onCreateDeck}>New Deck</button>
          </div>
          <div className="tarot-deck-list">
            <button
              className={`tarot-deck-row hapa-card ${isStandalone ? "selected" : ""}`}
              data-card-type="lore"
              data-granularity="mini"
              data-state={isStandalone ? "selected" : "idle"}
              type="button"
              onClick={() => onSelectDeck(STANDALONE_TAROT_DECK_ID)}
            >
              <Sparkles size={16} />
              <span>
                <strong>Standalone Cards</strong>
                <small>{standaloneCards.length} awaiting deck, set, or avatar link</small>
              </span>
              <em>{standaloneCards.length}</em>
            </button>

            {decks.map((deck) => {
              const deckCollectionId = tarotDeckCollectionId(deck.id);
              const selected = deckCollectionId === selectedDeckId;
              const deckBack = deck.backCardId ? cards.find((card) => card.id === deck.backCardId) : null;
              return (
                <button
                  className={`tarot-deck-row hapa-card ${selected ? "selected" : ""}`}
                  data-card-type="protocol"
                  data-granularity="mini"
                  data-state={selected ? "selected" : "idle"}
                  key={deck.id}
                  type="button"
                  onClick={() => onSelectDeck(deckCollectionId)}
                >
                  <BookOpen size={16} />
                  <span>
                    <strong>{deck.title}</strong>
                    <small>{deck.status} / {deck.cardIds.length} cards{deckBack ? ` / back: ${deckBack.title}` : ""}</small>
                  </span>
                  <em>{deck.cardIds.length}</em>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tarot-collection-section">
          <div className="section-head hapa-panel-head">
            <span><Layers3 size={15} /> Sets</span>
            <button type="button" onClick={onCreateSet}>New Set</button>
          </div>
          <div className="tarot-deck-list">
            {sets.map((set) => {
              const setCollectionId = tarotSetCollectionId(set.id);
              const selected = setCollectionId === selectedDeckId;
              return (
                <button
                  className={`tarot-deck-row hapa-card ${selected ? "selected" : ""}`}
                  data-card-type="protocol"
                  data-granularity="mini"
                  data-state={selected ? "selected" : "idle"}
                  key={set.id}
                  type="button"
                  onClick={() => onSelectDeck(setCollectionId)}
                >
                  <Layers3 size={16} />
                  <span>
                    <strong>{set.title}</strong>
                    <small>{set.status} / {set.cardIds.length} cards</small>
                  </span>
                  <em>{set.cardIds.length}</em>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDeck && (
          <form className="tarot-deck-editor hapa-panel" data-variant="resting" onSubmit={(event) => event.preventDefault()}>
            <div className="section-head hapa-panel-head compact">
              <span><BadgeCheck size={14} /> Deck Contract</span>
              <em>{selectedDeck.status}</em>
            </div>
            <label>
              <span>Deck title</span>
              <BufferedTextInput value={selectedDeck.title} onCommit={(value) => onUpdateDeck(selectedDeck.id, { title: value })} />
            </label>
            <label>
              <span>Subtitle</span>
              <BufferedTextInput value={selectedDeck.subtitle || ""} onCommit={(value) => onUpdateDeck(selectedDeck.id, { subtitle: value })} />
            </label>
            <label>
              <span>Deck notes</span>
              <BufferedTextArea value={selectedDeck.description || ""} onCommit={(value) => onUpdateDeck(selectedDeck.id, { description: value })} />
            </label>
            <label>
              <span>Card back</span>
              <select value={selectedDeck.backCardId || ""} onChange={(event) => onUpdateDeck(selectedDeck.id, { backCardId: event.target.value || null })}>
                <option value="">No deck back selected</option>
                {cardBackOptions.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
              </select>
            </label>
          </form>
        )}

        {selectedSet && (
          <form className="tarot-set-editor hapa-panel" data-variant="resting" onSubmit={(event) => event.preventDefault()}>
            <div className="section-head hapa-panel-head compact">
              <span><Layers3 size={14} /> Set Contract</span>
              <em>{selectedSet.status}</em>
            </div>
            <label>
              <span>Set title</span>
              <BufferedTextInput value={selectedSet.title} onCommit={(value) => onUpdateSet(selectedSet.id, { title: value })} />
            </label>
            <label>
              <span>Set notes</span>
              <BufferedTextArea value={selectedSet.description || ""} onCommit={(value) => onUpdateSet(selectedSet.id, { description: value })} />
            </label>
          </form>
        )}
      </aside>

      <section className="tarot-card-stage">
        <TarotLibraryDashboard dashboard={dashboard} />
        <CardReferencePanel
          open={cardReferenceOpen}
          query={cardReferenceQuery}
          selectedCard={selectedCard}
          onToggle={() => setCardReferenceOpen((open) => !open)}
          onQuery={setCardReferenceQuery}
          onApply={(entry) => {
            const patch = cardReferencePatch(entry);
            if (selectedCard && patch) onUpdateCard(selectedCard.id, patch);
          }}
        />

        <div
          className="tarot-upload-panel panel hapa-panel"
          data-variant="notch"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div>
            <p className="eyebrow">Card Upload</p>
            <h3>{isStandalone ? "Upload standalone cards" : `Upload into ${selectedSet?.title || selectedDeck?.title || "collection"}`}</h3>
            <span>Images create card records. Videos attach as loop media to the selected or newest card.</span>
          </div>
          <input
            id={inputId}
            className="file-input"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onUpload}
          />
          <label className="hapa-btn tarot-upload-button" data-intent="primary" htmlFor={inputId}>
            <ImagePlus size={17} />
            Upload Cards
          </label>
        </div>

        <div className="tarot-card-grid">
          {cardsForDeck.length ? cardsForDeck.map((card) => (
            <TarotCardTile
              key={card.id}
              card={card}
              selected={card.id === selectedCardId}
              onSelect={() => onSelectCard(card.id)}
              onExpand={onExpand}
              onPreview={onPreview}
              onPreviewHide={onPreviewHide}
            />
          )) : (
            <div className="tarot-empty-state hapa-panel" data-variant="resting">
              <Sparkles size={26} />
              <strong>No cards here yet</strong>
              <span>Upload card images or choose another deck.</span>
            </div>
          )}
        </div>
      </section>

      <aside className="panel hapa-panel tarot-inspector" data-variant="notch">
        <div className="section-head hapa-panel-head">
          <span><Tags size={15} /> Card Inspector</span>
          <em>{selectedCard ? selectedCard.status : "empty"}</em>
        </div>

        {selectedCard ? (
          <>
            <article className="tarot-card-detail hapa-card" data-card-type="lore" data-granularity="detail" data-state="selected">
              <div className="tarot-card-visual">
                {selectedCard.asset ? (
                  <TarotAssetPreview
                    asset={selectedCard.asset}
                    hoverAsset={loopVideos[0] || null}
                    loopCount={loopVideos.length}
                    onPreview={onPreview}
                    onPreviewHide={onPreviewHide}
                    meta={{ attached: true, slotLabel: "Tarot Card", loopCount: loopVideos.length }}
                  />
                ) : <Sparkles size={36} />}
                {selectedCard.asset && (
                  <button className="expand-button visible" title="Expand Tarot card" aria-label={`Expand ${selectedCard.title}`} onClick={() => onExpand(selectedCard.asset, [selectedCard.asset, ...loopVideos])}>
                    <Maximize2 size={13} />
                  </button>
                )}
              </div>
              <strong>{selectedCard.title}</strong>
              <span>{tarotCardTypeLabel(selectedCard.cardType)} / {selectedCard.arcana} / {selectedCard.suit}</span>
            </article>

            <form className="tarot-card-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                <span>Card title</span>
                <BufferedTextInput value={selectedCard.title} onCommit={(value) => onUpdateCard(selectedCard.id, { title: value })} />
              </label>
              <div className="tarot-card-form-grid">
                <label>
                  <span>Number</span>
                  <BufferedTextInput value={selectedCard.number || ""} onCommit={(value) => onUpdateCard(selectedCard.id, { number: value })} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={selectedCard.status} onChange={(event) => onUpdateCard(selectedCard.id, { status: event.target.value })}>
                    {TAROT_CARD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label>
                  <span>Card type</span>
                  <select value={selectedCard.cardType || "card_front"} onChange={(event) => onUpdateCard(selectedCard.id, { cardType: event.target.value })}>
                    {TAROT_CARD_TYPES.map((cardType) => <option key={cardType} value={cardType}>{tarotCardTypeLabel(cardType)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Suit</span>
                  <select value={selectedCard.suit} onChange={(event) => onUpdateCard(selectedCard.id, { suit: event.target.value })}>
                    {TAROT_SUITS.map((suit) => <option key={suit} value={suit}>{suit}</option>)}
                  </select>
                </label>
                <label>
                  <span>Arcana</span>
                  <select value={selectedCard.arcana} onChange={(event) => onUpdateCard(selectedCard.id, { arcana: event.target.value })}>
                    <option value="major">major</option>
                    <option value="minor">minor</option>
                    <option value="oracle">oracle</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Keywords</span>
                <BufferedTextInput value={(selectedCard.keywords || []).join(", ")} onCommit={(value) => onUpdateCard(selectedCard.id, { keywords: splitTagInput(value) })} />
              </label>
              <label>
                <span>Upright meaning</span>
                <BufferedTextArea value={selectedCard.meaning || ""} onCommit={(value) => onUpdateCard(selectedCard.id, { meaning: value })} />
              </label>
              <label>
                <span>Reversed meaning</span>
                <BufferedTextArea value={selectedCard.reversedMeaning || ""} onCommit={(value) => onUpdateCard(selectedCard.id, { reversedMeaning: value })} />
              </label>
              <label>
                <span>Prompt / lore notes</span>
                <BufferedTextArea value={selectedCard.promptNotes || ""} onCommit={(value) => onUpdateCard(selectedCard.id, { promptNotes: value })} />
              </label>
            </form>

            <section className="tarot-loop-panel hapa-panel" data-variant="resting">
              <div className="section-head hapa-panel-head compact">
                <span><Film size={14} /> Loop Videos</span>
                <em>{loopVideos.length}</em>
              </div>
              <input
                id={loopInputId}
                className="file-input"
                type="file"
                accept="video/*"
                multiple
                onChange={onUploadLoop}
              />
              <label className="hapa-btn tarot-loop-upload" data-intent="secondary" htmlFor={loopInputId}>
                <Film size={15} />
                Attach Loop Video
              </label>
              {loopVideos.length ? (
                <div className="tarot-loop-list">
                  {loopVideos.map((asset) => (
                    <button key={asset.id} type="button" className="tarot-loop-row hapa-card" onClick={() => onExpand(asset, loopVideos)}>
                      <div className="tarot-loop-thumb">
                        <TarotAssetPreview
                          asset={asset}
                          onPreview={onPreview}
                          onPreviewHide={onPreviewHide}
                          meta={{ attached: true, slotLabel: "Loop Video" }}
                        />
                      </div>
                      <span>
                        <strong>{asset.name}</strong>
                        <small>{formatDuration(asset.metadata?.duration || asset.duration)} / {formatMegabytes(asset.metadata?.sizeBytes || asset.sizeBytes)}</small>
                      </span>
                      <Maximize2 size={13} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="tarot-loop-empty">No loop videos attached yet.</p>
              )}
            </section>

            <section className="tarot-membership-panel hapa-panel" data-variant="resting">
              <div className="section-head hapa-panel-head compact">
                <span><BookOpen size={14} /> Deck Membership</span>
                <em>{selectedCard.deckIds.length}</em>
              </div>
              <div className="tarot-check-list">
                {decks.map((deck) => (
                  <label key={deck.id} className="tarot-check-row">
                    <input
                      type="checkbox"
                      checked={selectedCard.deckIds.includes(deck.id)}
                      onChange={(event) => onSetDeckMembership(selectedCard.id, deck.id, event.target.checked)}
                    />
                    <span>
                      <strong>{deck.title}</strong>
                      <small>{deck.cardIds.length} cards</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="tarot-membership-panel hapa-panel" data-variant="resting">
              <div className="section-head hapa-panel-head compact">
                <span><Layers3 size={14} /> Set Membership</span>
                <em>{selectedCard.setIds.length}</em>
              </div>
              <div className="tarot-check-list">
                {sets.map((set) => (
                  <label key={set.id} className="tarot-check-row">
                    <input
                      type="checkbox"
                      checked={selectedCard.setIds.includes(set.id)}
                      onChange={(event) => onSetSetMembership(selectedCard.id, set.id, event.target.checked)}
                    />
                    <span>
                      <strong>{set.title}</strong>
                      <small>{set.cardIds.length} cards</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="tarot-avatar-link-panel hapa-panel" data-variant="resting">
              <div className="section-head hapa-panel-head compact">
                <span><Link2 size={14} /> Avatar Links</span>
                <em>{selectedCard.avatarLinks.length}</em>
              </div>
              <div className="tarot-avatar-link-list">
                {avatars.map((avatar) => {
                  const portrait = defaultCloseupEmotionAsset(avatar);
                  const active = linkedAvatars.has(avatar.id);
                  return (
                    <button
                      key={avatar.id}
                      className={`tarot-avatar-link hapa-card ${active ? "selected" : ""}`}
                      data-card-type="avatar"
                      data-granularity="mini"
                      data-state={active ? "selected" : "idle"}
                      type="button"
                      onClick={() => onToggleAvatar(selectedCard.id, avatar.id)}
                    >
                      <div className={`avatar-orb ${portrait ? "has-portrait" : ""}`} style={{ "--progress": active ? "100%" : "0%" }}>
                        {portrait ? <TarotAssetPreview asset={portrait} mode="thumb" /> : <span>{avatar.primaryName.slice(0, 1)}</span>}
                      </div>
                      <span>
                        <strong>{avatar.primaryName}</strong>
                        <small>{active ? "linked" : "available"}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="attach-panel tarot-attach-panel">
              <div className="section-head hapa-panel-head compact">
                <span><FileJson size={15} /> Tarot Attach Pack</span>
                <em>{selectedCard.id}</em>
              </div>
              <pre>{JSON.stringify(attachPack, null, 2)}</pre>
            </div>
          </>
        ) : (
          <div className="empty-state hapa-panel" data-variant="resting">
            <Sparkles size={30} />
            <span>Select or upload a Tarot card</span>
          </div>
        )}
      </aside>
    </section>
  );
}

function CardReferencePanel({ open, query, selectedCard, onToggle, onQuery, onApply }) {
  const normalizedQuery = query.trim().toLowerCase();
  const colorRows = normalizedQuery
    ? MAJOR_ARCANA_COLOR_REFERENCE.filter((entry) => cardReferenceSearchText(entry).includes(normalizedQuery))
    : MAJOR_ARCANA_COLOR_REFERENCE;
  const arcanaRows = normalizedQuery
    ? MAJOR_ARCANA_REFERENCES.filter((entry) => cardReferenceSearchText(entry).includes(normalizedQuery))
    : MAJOR_ARCANA_REFERENCES;

  return (
    <section className="tarot-card-reference hapa-panel" data-variant="resting" data-open={open ? "true" : "false"}>
      <div className="section-head hapa-panel-head compact">
        <span><BookOpen size={14} /> Card Reference</span>
        <button type="button" onClick={onToggle}>{open ? "Close" : "Open"}</button>
      </div>

      {open && (
        <div className="tarot-card-reference-body">
          <div className="tarot-card-reference-toolbar">
            <label className="tarot-card-reference-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search card, color, keyword"
              />
            </label>
            <div className="tarot-card-reference-counts">
              <span>{colorRows.length} colors</span>
              <span>{arcanaRows.length} arcana</span>
              <span>{selectedCard ? `Target: ${selectedCard.title}` : "No target selected"}</span>
            </div>
          </div>

          <div className="tarot-card-reference-table-wrap">
            <table className="tarot-card-reference-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Swatch</th>
                  <th>Hex</th>
                  <th>RGB</th>
                  <th>Color</th>
                  <th>Rider-Waite</th>
                  <th>Decimal</th>
                </tr>
              </thead>
              <tbody>
                {colorRows.map((entry) => (
                  <tr key={entry.no}>
                    <td>{entry.no}</td>
                    <td>
                      <span className="tarot-card-reference-swatch" style={{ "--reference-color": entry.hex }} />
                    </td>
                    <td>{entry.hex}</td>
                    <td>({entry.rgb.join(", ")})</td>
                    <td>{entry.color}</td>
                    <td>{entry.riderWaite || "-"}</td>
                    <td>{entry.decimal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tarot-card-reference-summary-grid">
            {arcanaRows.map((entry) => (
              <article className="tarot-card-reference-summary" key={entry.no} style={{ "--reference-color": entry.hex }}>
                <header>
                  <span className="tarot-card-reference-number">{entry.no}</span>
                  <div>
                    <p className="eyebrow">{entry.color} / {entry.hex}</p>
                    <h3>{entry.arcana.title}</h3>
                  </div>
                  <button
                    type="button"
                    className="hapa-btn tarot-card-reference-apply"
                    data-intent="primary"
                    disabled={!selectedCard}
                    onClick={() => onApply(entry)}
                    title={selectedCard ? `Apply ${entry.arcana.title} to ${selectedCard.title}` : "Select a card before applying a reference"}
                  >
                    <Palette size={14} />
                    Apply
                  </button>
                </header>
                <div className="tarot-card-reference-keywords">
                  {entry.arcana.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
                <dl>
                  <div>
                    <dt>Upright</dt>
                    <dd>{entry.arcana.upright}</dd>
                  </div>
                  <div>
                    <dt>Reversed</dt>
                    <dd>{entry.arcana.reversed}</dd>
                  </div>
                  <div>
                    <dt>Creation Notes</dt>
                    <dd>{entry.arcana.creationNotes}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function cardReferenceSearchText(entry = {}) {
  return [
    entry.no,
    entry.hex,
    entry.rgb?.join(" "),
    entry.color,
    entry.riderWaite,
    entry.decimal,
    entry.arcana?.title,
    ...(entry.arcana?.keywords || []),
    entry.arcana?.upright,
    entry.arcana?.reversed,
    entry.arcana?.creationNotes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function TarotLibraryDashboard({ dashboard }) {
  if (!dashboard) return null;
  const cardTypeEntries = Object.entries(dashboard.counts?.cardTypes || {});
  const suitEntries = Object.entries(dashboard.counts?.suits || {});
  const arcanaEntries = Object.entries(dashboard.counts?.arcana || {});
  const statusEntries = Object.entries(dashboard.counts?.statuses || {});
  const loopLeader = dashboard.media?.loopsByCard?.[0] || null;
  return (
    <section className="tarot-library-dashboard hapa-panel" data-variant="resting">
      <div className="section-head hapa-panel-head compact">
        <span><Radar size={14} /> Tarot Library Dashboard</span>
        <em>{dashboard.enrichment.cardsEnriched}/{dashboard.summary.cards} enriched</em>
      </div>
      <div className="tarot-dashboard-grid">
        <TarotDashboardMetric label="Card types" value={cardTypeEntries.map(([type, count]) => `${tarotCardTypeLabel(type)} ${count}`).join(" / ") || "--"} />
        <TarotDashboardMetric label="Suits" value={suitEntries.map(([suit, count]) => `${suit} ${count}`).join(" / ") || "--"} />
        <TarotDashboardMetric label="Arcana" value={arcanaEntries.map(([arcana, count]) => `${arcana} ${count}`).join(" / ") || "--"} />
        <TarotDashboardMetric label="Statuses" value={statusEntries.map(([status, count]) => `${status} ${count}`).join(" / ") || "--"} />
        <TarotDashboardMetric label="Loop media" value={`${dashboard.media.loopVideos} loops / ${dashboard.media.enrichedLoopVideos} enriched`} />
        <TarotDashboardMetric label="Review queue" value={`${dashboard.enrichment.cardsNeedingReview} cards / ${dashboard.media.loopVideosNeedingReview} loops`} />
        <TarotDashboardMetric label="Avatar links" value={`${dashboard.enrichment.avatarLinkedCards} linked cards`} />
        <TarotDashboardMetric label="Loop leader" value={loopLeader ? `${loopLeader.title}: ${loopLeader.loops}` : "no loops"} />
      </div>
      <div className="tarot-dashboard-tags">
        {dashboard.topTags.slice(0, 18).map((item) => (
          <span key={item.tag}>{item.tag} <b>{item.count}</b></span>
        ))}
      </div>
    </section>
  );
}

function TarotDashboardMetric({ label, value }) {
  return (
    <div className="tarot-dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TarotCardTile({ card, selected, onSelect, onExpand, onPreview, onPreviewHide }) {
  const loopVideos = (card.assets || []).filter((asset) => asset.type === "video");
  const loopCount = loopVideos.length;
  const loopPreviewAsset = loopVideos[0] || null;
  return (
    <article
      className={`tarot-card-tile hapa-card ${selected ? "selected" : ""}`}
      data-card-type="lore"
      data-granularity="standard"
      data-state={selected ? "selected" : card.avatarLinks.length ? "active" : "idle"}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={() => card.asset && onExpand(card.asset, [card.asset, ...loopVideos])}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="tarot-card-tile-media">
        {card.asset ? (
          <TarotAssetPreview
            asset={card.asset}
            hoverAsset={loopPreviewAsset}
            loopCount={loopCount}
            onPreview={onPreview}
            onPreviewHide={onPreviewHide}
            meta={{ attached: true, slotLabel: "Tarot Card", loopCount }}
          />
        ) : <Sparkles size={34} />}
        {card.asset && (
          <button className="expand-button visible" title="Expand Tarot card" aria-label={`Expand ${card.title}`} onClick={(event) => {
            event.stopPropagation();
            onExpand(card.asset, [card.asset, ...loopVideos]);
          }}>
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      <footer>
        <p className="eyebrow">{card.number || tarotCardTypeLabel(card.cardType)}</p>
        <strong>{card.title}</strong>
        <span>{card.keywords.slice(0, 4).join(" / ") || `${card.status} / ${card.suit}`}</span>
        <div className="tarot-card-flags">
          <em>{tarotCardTypeLabel(card.cardType)}</em>
          <em>{card.deckIds.length} decks</em>
          <em>{card.setIds.length} sets</em>
          <em>{loopCount} loops</em>
          <em>{card.avatarLinks.length} avatars</em>
        </div>
      </footer>
    </article>
  );
}

function TarotAssetPreview({ asset, hoverAsset = null, loopCount = 0, mode = "preview", onPreview, onPreviewHide, meta = {} }) {
  const source = mediaSourceForAsset(asset, mode);
  const hoverSource = hoverAsset ? mediaSourceForAsset(hoverAsset, "full") : null;
  const canPreview = source?.uri || source?.fullUri;
  const previewMeta = {
    ...meta,
    previewAsset: hoverAsset || null,
    loopCount
  };
  return (
    <span
      className="asset-thumb tarot-asset-thumb"
      onMouseEnter={(event) => asset && onPreview?.(asset, event, previewMeta)}
      onMouseMove={(event) => asset && onPreview?.(asset, event, previewMeta)}
      onMouseLeave={onPreviewHide}
    >
      <span className="asset-visual-shell">
        {asset?.type === "video" && source?.fullUri ? (
          <video
            className="asset-image"
            src={source.fullUri}
            poster={source.posterUri || source.uri}
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : canPreview ? (
          <img className="asset-image" src={source.uri || source.fullUri} alt="" loading="lazy" />
        ) : (
          <Sparkles size={24} />
        )}
        {hoverSource?.fullUri && (
          <video
            className="tarot-hover-loop"
            src={hoverSource.fullUri}
            poster={hoverSource.posterUri || hoverSource.uri}
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        {loopCount > 0 && <em className="loop-count-badge">{loopCount}</em>}
      </span>
    </span>
  );
}

function TarotStatusChip({ label, value, tone = "cyan" }) {
  return (
    <div className="status-chip" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function mediaSourceForAsset(asset, mode = "preview") {
  if (!asset) return null;
  const thumbnailUri = thumbnailUriForAsset(asset);
  const fullUri = asset.uri || thumbnailUri;
  const resolvedThumbnailUri = resolveMediaUri(thumbnailUri);
  const resolvedFullUri = resolveMediaUri(fullUri);
  const canRenderFullAsImage = asset.type === "image";
  if (mode === "thumb") {
    return {
      uri: resolvedThumbnailUri || (canRenderFullAsImage ? resolvedFullUri : null),
      fullUri: resolvedFullUri,
      posterUri: resolvedThumbnailUri || undefined
    };
  }
  if (mode === "full") {
    return {
      uri: asset.type === "video"
        ? resolvedThumbnailUri || resolvedFullUri
        : canRenderFullAsImage
          ? resolvedFullUri || resolvedThumbnailUri
          : resolvedThumbnailUri,
      fullUri: resolvedFullUri,
      posterUri: resolvedThumbnailUri || undefined
    };
  }
  return {
    uri: resolvedThumbnailUri || (canRenderFullAsImage ? resolvedFullUri : null),
    fullUri: resolvedFullUri,
    posterUri: resolvedThumbnailUri || undefined
  };
}

function thumbnailUriForAsset(asset = {}) {
  if (!asset) return null;
  if (asset.metadata?.thumbnailUri) return asset.metadata.thumbnailUri;
  if (asset.metadata?.thumbnail?.uri) return asset.metadata.thumbnail.uri;
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  const firstFrame = frames.find((frame) => frame.marker === "first") || frames[0];
  return firstFrame?.thumbnail?.uri || firstFrame?.thumbnailUri || firstFrame?.uri || null;
}

function resolveMediaUri(uri) {
  if (typeof uri !== "string" || !uri) return uri;
  if (/^(data:|blob:|https?:|file:)/.test(uri)) return uri;
  if (uri.startsWith("/media/") && API_BASE) return `${API_BASE}${uri}`;
  return uri;
}

function defaultCloseupEmotionAsset(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const slottedAssetIds = new Set(
    (Array.isArray(avatar.slots) ? avatar.slots : [])
      .filter((slot) => slot.requirementId === "closeup_emotions" && slot.assetId)
      .map((slot) => slot.assetId)
  );
  return assets.find((asset) => slottedAssetIds.has(asset.id) && (asset.type === "image" || thumbnailUriForAsset(asset) || asset.uri))
    || assets.find((asset) => asset.requirementId === "closeup_emotions" && (asset.type === "image" || thumbnailUriForAsset(asset) || asset.uri))
    || assets.find((asset) => asset.type === "image" || thumbnailUriForAsset(asset) || asset.uri)
    || null;
}

function splitTagInput(value) {
  return String(value || "")
    .split(/[,#]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function tarotCardTypeLabel(cardType = "card_front") {
  const labels = {
    card_front: "Card Front",
    card_back: "Card Back",
    oracle_card: "Oracle Card",
    reference_card: "Reference"
  };
  return labels[cardType] || String(cardType).replace(/_/g, " ");
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes)) return "size --";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 1 : 2)} MB`;
}
