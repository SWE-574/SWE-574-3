import type { ForYouSignals, Service } from "../api/types";

export type PillIdentity =
  | "tag"
  | "follow"
  | "cooccur"
  | "engagement"
  | "newcomer"
  | "default";

// Mirror of frontend/src/utils/forYouChips.ts FOR_YOU_WEIGHTS. Kept inline so
// the mobile bundle does not reach into the web package; the web file already
// documents the rationale (weights match the backend ranking blend so the
// dominant chip reflects what actually moved the score).
const FOR_YOU_WEIGHTS = {
  tag: 0.5,
  follow: 0.3,
  cooccur: 0.2,
  engagement: 0.15,
} as const;

function dominantForYou(signals?: ForYouSignals | null): PillIdentity | null {
  if (!signals) return null;
  const entries: Array<[Exclude<PillIdentity, "default" | "newcomer">, number]> =
    [
      ["tag", signals.tag * FOR_YOU_WEIGHTS.tag],
      ["follow", signals.follow * FOR_YOU_WEIGHTS.follow],
      ["cooccur", signals.cooccur * FOR_YOU_WEIGHTS.cooccur],
      ["engagement", (signals.engagement ?? 0) * FOR_YOU_WEIGHTS.engagement],
    ];
  let topName: Exclude<PillIdentity, "default" | "newcomer"> | null = null;
  let topValue = 0;
  for (const [name, value] of entries) {
    if (value > topValue) {
      topName = name;
      topValue = value;
    }
  }
  return topName;
}

// Same priority chain as web SmartPill: dominant for_you signal first, then
// the newcomer flag as a discovery fallback. Capacity / explore-pool flavours
// from web are deliberately omitted — those are not user-selectable filter
// chips on the map.
export function pillIdentity(service: Service): PillIdentity {
  const dominant = dominantForYou(service.for_you_signals);
  if (dominant) return dominant;
  if (service.is_newcomer_owner) return "newcomer";
  return "default";
}

export interface SignalChipDef {
  id: Exclude<PillIdentity, "default">;
  label: string;
  color: string;
}

export const SIGNAL_CHIPS: SignalChipDef[] = [
  { id: "follow", label: "From your network", color: "#F59E0B" },
  { id: "tag", label: "Matches your interests", color: "#A855F7" },
  { id: "newcomer", label: "Rising newcomer", color: "#F472B6" },
  { id: "engagement", label: "Saved by others", color: "#14B8A6" },
];
