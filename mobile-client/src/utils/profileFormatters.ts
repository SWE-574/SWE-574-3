import type { Service } from "../api/types";
import { colors } from "../constants/colors";

function safeNumber(value: string | number | undefined | null): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function formatShortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatHours(value?: string | number | null) {
  return `${safeNumber(value)}h`;
}

export function getInitials(name?: string | null) {
  return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
}

export function activityCardAccent(type: Service["type"]) {
  if (type === "Offer") {
    return {
      color: colors.GREEN,
      bg: colors.GREEN_LT,
      label: "Offer",
      icon: "leaf-outline" as const,
    };
  }

  if (type === "Need") {
    return {
      color: colors.BLUE,
      bg: colors.BLUE_LT,
      label: "Need",
      icon: "layers-outline" as const,
    };
  }

  return {
    color: colors.AMBER,
    bg: colors.AMBER_LT,
    label: "Event",
    icon: "sparkles-outline" as const,
  };
}
