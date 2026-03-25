export function presentExperimentList<T>(payload: T) {
  return payload;
}

export function presentExperimentRead<T>(payload: T) {
  return payload;
}

export function presentExperimentStart(id: string, started: boolean) {
  return { id, status: "running", started };
}
