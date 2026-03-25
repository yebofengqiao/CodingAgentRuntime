export function presentRunRead<T>(payload: T) {
  return payload;
}

export function presentRunAction(id: string, status: string, started: boolean) {
  return { id, status, started };
}

export function presentTraceRead<T>(payload: T) {
  return payload;
}
