export function presentConversationList<T>(payload: T) {
  return payload;
}

export function presentConversationCreated<T>(payload: T) {
  return payload;
}

export function presentConversationAccepted(runId: string) {
  return { accepted: true, run_id: runId };
}
