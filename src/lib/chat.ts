/** ChatReadState.scopeKey üretimi — hem kanal hem DM tek bir tabloda, tek bir stringle ayrılır. */
export function channelScopeKey(channelId: string) {
  return `channel:${channelId}`;
}
export function dmScopeKey(otherUserId: string) {
  return `dm:${otherUserId}`;
}
