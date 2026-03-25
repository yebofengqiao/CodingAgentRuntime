export function presentArtifactNotFound(kind: string) {
  return { detail: `Artifact kind '${kind}' not found` };
}
