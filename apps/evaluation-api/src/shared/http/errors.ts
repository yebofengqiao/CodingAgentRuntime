export function detailStatus(detail: string, notFound = 404, fallback = 409) {
  return detail.toLowerCase().includes("not found") ? notFound : fallback;
}

export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
