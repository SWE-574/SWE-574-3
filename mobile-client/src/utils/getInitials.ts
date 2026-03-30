export function getInitials(name: string): string {
  return (name || "?")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}
