/**
 * Returns up to 2 initials from a full name string, e.g. "Jane Doe" → "JD".
 * When called with (firstName, lastName) the parts are joined before splitting.
 */
export function getInitials(
  firstOrFullName?: string,
  lastName?: string,
): string {
  const name = lastName
    ? `${firstOrFullName ?? ""} ${lastName}`.trim()
    : (firstOrFullName ?? "");
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}
