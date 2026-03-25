export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(joinApiUrl(baseUrl, path), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail ?? detail;
    } catch {
      // keep status text
    }
    throw new HttpError(detail, response.status);
  }

  return (await response.json()) as T;
}
