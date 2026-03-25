export function formatSse(packet: unknown): string {
  const payload = packet as { type?: string; data?: { seq?: number } };
  const lines: string[] = [];
  if (payload.type === "event" && typeof payload.data?.seq === "number") {
    lines.push(`id: ${payload.data.seq}`);
  }
  const serialized = JSON.stringify(packet);
  for (const line of serialized.split("\n")) {
    lines.push(`data: ${line}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
