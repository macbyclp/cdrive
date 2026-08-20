/** ChatReadState.scopeKey üretimi — hem kanal hem DM tek bir tabloda, tek bir stringle ayrılır. */
export function channelScopeKey(channelId: string) {
  return `channel:${channelId}`;
}
export function dmScopeKey(otherUserId: string) {
  return `dm:${otherUserId}`;
}

/** Bildirim/mesaj önizlemesi için içerik kısaltma. */
export function chatPreview(content: string, max = 80) {
  const trimmed = content.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}
