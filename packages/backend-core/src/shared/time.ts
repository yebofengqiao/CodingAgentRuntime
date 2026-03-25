export function utcNow(): Date {
  return new Date();
}

export function isoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}
