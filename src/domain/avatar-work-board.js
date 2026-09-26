// Identity belongs to Builder; task truth stays at the existing Kanban owner.
export function avatarWorkBoardUrl(avatarId) {
  if (typeof avatarId !== 'string' || !avatarId.trim()) return null;
  const url = new URL('http://127.0.0.1:5181/avatars.html');
  url.searchParams.set('avatar', avatarId);
  return url.href;
}
