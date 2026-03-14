export function normalizeStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function getIdLike(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const maybeId = (value as Record<string, unknown>).id;
    if (typeof maybeId === "string" || typeof maybeId === "number") {
      return String(maybeId);
    }
  }
  return undefined;
}

export function getEmailLike(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const maybeEmail = (value as Record<string, unknown>).email;
    if (typeof maybeEmail === "string") {
      return maybeEmail;
    }
  }
  return undefined;
}

export function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Matches common Google Maps URL patterns */
const GOOGLE_MAPS_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|goo\.gl\/maps|maps\.app\.goo\.gl)\/[^\s]*/gi;

export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "link"; url: string };

/**
 * Splits message content into text and Google Maps link segments.
 * Google Maps URLs are returned as link segments; all other text is returned as text segments.
 */
export function parseMessageContent(content: string): MessageSegment[] {
  const raw = (content ?? "").trim();
  if (!raw) return [];

  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(GOOGLE_MAPS_URL_REGEX.source, "gi");
  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: raw.slice(lastIndex, match.index) });
    }
    segments.push({ type: "link", url: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: "text", value: raw.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: raw }];
}
