// Picture motifs for Score Dust: a repeating section can form a cast Avatar's
// silhouette in dust. Cast comes from the Echo Avatar cast registry (evergreen
// cast plus explicit song bindings); images come from each Avatar's own assets.
import { ECHO_AVATAR_CAST_REGISTRY } from "./echo-avatar-cast-registry.js";

/** Cast members eligible for a Song: explicit song bindings first, then evergreen cast. */
export function scoreDustCastFor(songId, registry = ECHO_AVATAR_CAST_REGISTRY) {
  const bound = registry.songBindings?.[songId] || [];
  const seen = new Set(), out = [];
  for (const member of [...bound, ...(registry.evergreen || [])]) {
    if (!member?.avatarId || seen.has(member.avatarId)) continue;
    seen.add(member.avatarId);
    out.push({ avatarId: member.avatarId, name: member.name || member.avatarId, seedAssetId: member.seedAssetId || null, castClass: member.castClass || "" });
  }
  return out;
}

const isImage = (asset) => asset && (asset.type === "image" || /\.(png|webp|jpe?g|gif|avif)$/i.test(String(asset.uri || asset.name || "")));

/** The Avatar's first glTF/GLB model as a 3D shape option (null when it has none). */
export function scoreDustModelOption(avatar, member, resolveUri = (uri) => uri) {
  const model = (avatar?.assets || []).find((asset) => asset?.uri && (asset.type === "model" || /\.(glb|gltf)(?:$|\?)/i.test(String(asset.uri))) && /\.(glb|gltf)(?:$|\?)/i.test(String(asset.uri || asset.name || "")));
  if (!model) return null;
  return { assetId: `avatar-model:${avatar.id}:${model.id}`, avatarId: avatar.id, kind: "model", label: `${member?.name || avatar.primaryName || avatar.id} (3D)`, url: resolveUri(model.uri), source: "avatar-model" };
}

/** Choose the registered seed image, else a backgroundless image, else any image. */
export function scoreDustPictureOption(avatar, member, resolveUri = (uri) => uri) {
  const assets = (avatar?.assets || []).filter((asset) => isImage(asset) && asset.uri);
  const asset = assets.find((a) => a.id === member?.seedAssetId)
    || assets.find((a) => /backgroundless|cutout|transparent/i.test(`${a.id} ${a.name}`))
    || assets[0];
  if (!asset) return null;
  return { assetId: `avatar:${avatar.id}:${asset.id}`, avatarId: avatar.id, label: `${member?.name || avatar.primaryName || avatar.id}`, url: resolveUri(asset.uri), source: asset.id === member?.seedAssetId ? "cast-seed" : "avatar-asset" };
}
