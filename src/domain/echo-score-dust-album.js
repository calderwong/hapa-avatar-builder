// Resolve a Song's place in the album colour language (P2 item 5) from Song
// Cards, using the album visual bible's phases and palette arc. The result is
// stored on the direction (`colour.album`), so composition never needs the
// Song store and UI, API and CLI compose the same score.
import { buildAlbumVisualBible } from "./album-visual-language.js";
import { teamColourHue } from "./echo-score-dust-colour.js";

const matches = (card, songId) => [card?.id, card?.songId, card?.cardId].includes(songId);

/** → { hue, saturation, lightness, phase, teamColour, position, of, bibleHash } or null. */
export function albumDustColour(songCards = [], songId) {
  const target = songCards.find((card) => matches(card, songId));
  if (!target) return null;
  const album = songCards.filter((card) => (card.albumId || "") === (target.albumId || ""))
    .sort((a, b) => (Number(a.trackNumber) || 9999) - (Number(b.trackNumber) || 9999) || String(a.id).localeCompare(String(b.id)));
  const cards = album.map((card) => {
    const p = card.performancePerspective || {};
    return { id: card.id, title: card.title, mood: card.mood, performancePerspective: { team_color: p.team_color || p.teamColor || "", avatar_id: p.avatar_id || p.avatarId || null } };
  });
  const bible = buildAlbumVisualBible(cards);
  const entry = bible.songs.find((song) => song.songId === target.id);
  const arc = bible.paletteArc.find((row) => row.phase === entry.phase);
  const teamColour = cards.find((card) => card.id === target.id).performancePerspective.team_color || entry.palette.primary;
  const hue = teamColourHue(teamColour) ?? teamColourHue(entry.palette.primary) ?? 268;
  // The arc runs dark → light for backgrounds; dust is light, so it is lifted
  // into a readable band while keeping the arc's order (a Hapa choice).
  return { hue, saturation: Math.round(Math.max(0.45, arc.saturation) * 100) / 100, lightness: Math.round((0.5 + 0.4 * arc.lightness) * 100) / 100,
    phase: entry.phase, teamColour: String(teamColour).slice(0, 80), position: album.indexOf(target) + 1, of: album.length, bibleHash: bible.bibleHash };
}
