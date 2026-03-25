type ResolveAllowedCorsOriginInput = {
  configuredFrontendUrl?: string | null;
  requestOrigin?: string | null;
  nodeEnv?: string | null;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

function normalizeHttpOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && url.port.length > 0;
  } catch {
    return false;
  }
}

export function resolveAllowedCorsOrigin({
  configuredFrontendUrl,
  requestOrigin,
  nodeEnv,
}: ResolveAllowedCorsOriginInput): string | null {
  const normalizedRequestOrigin = normalizeHttpOrigin(requestOrigin);
  if (!normalizedRequestOrigin) {
    return null;
  }

  const normalizedConfiguredOrigin = normalizeHttpOrigin(configuredFrontendUrl);
  if (nodeEnv === "production") {
    return normalizedConfiguredOrigin === normalizedRequestOrigin
      ? normalizedRequestOrigin
      : null;
  }

  if (normalizedConfiguredOrigin === normalizedRequestOrigin) {
    return normalizedRequestOrigin;
  }

  return isLoopbackHttpOrigin(normalizedRequestOrigin) ? normalizedRequestOrigin : null;
}
