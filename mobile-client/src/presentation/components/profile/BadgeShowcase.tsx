/**
 * BadgeShowcase – compact display or picker grid for featured badges.
 *
 * variant="compact":
 *   - Horizontal row of up to 2 badges (40px circles with name caption).
 *   - Own mode + empty: shows "+ Showcase a badge" dashed placeholder.
 *   - Public mode + empty: renders nothing.
 *
 * variant="picker":
 *   - Scrollable grid of ALL badges from badgeProgress.
 *   - Press to toggle selection; max 2 enforced.
 *   - Third selection swaps out the oldest (with inline message).
 *   - Locked (not earned) badges are greyed and non-pressable.
 */

import React, { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";
import type { BadgeDetail } from "../../../api/calendar";

// ── Types ─────────────────────────────────────────────────────────────────

/** Shape used in picker mode – represents every badge with progress info */
export interface BadgeProgress {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  earned_at: string | null;
  /** Whether the badge has been earned by the user */
  is_earned: boolean;
  /** Optional progress hint for locked badges */
  progress_hint?: string;
}

export interface BadgeShowcaseProps {
  variant: "compact" | "picker";
  /** "own" = the authenticated user's profile; "public" = read-only view */
  mode?: "own" | "public";

  // compact variant props
  /** Resolved badge details for the currently featured badges */
  badges?: BadgeDetail[];
  /** Called when the empty-state placeholder is pressed (own compact) */
  onPickerOpenRequest?: () => void;

  // picker variant props
  /** Full badge progress list for the picker grid */
  badgeProgress?: BadgeProgress[];
  /** Currently selected badge IDs (controlled) */
  selectedIds?: string[];
  /** Called when selection changes */
  onSelectionChange?: (ids: string[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatEarnedDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

// ── Compact mode ──────────────────────────────────────────────────────────

function CompactBadge({ badge }: { badge: BadgeDetail }) {
  return (
    <View style={compactStyles.badge}>
      <View style={compactStyles.iconWrapper}>
        {badge.icon_url ? (
          <Image
            source={{ uri: badge.icon_url }}
            style={compactStyles.icon}
            accessibilityLabel={badge.name}
          />
        ) : (
          <View style={compactStyles.iconFallback}>
            <Ionicons name="ribbon-outline" size={20} color={colors.GREEN} />
          </View>
        )}
      </View>
      <Text style={compactStyles.badgeName} numberOfLines={2}>
        {badge.name}
      </Text>
      {badge.earned_at ? (
        <Text style={compactStyles.earnedDate}>
          {formatEarnedDate(badge.earned_at)}
        </Text>
      ) : null}
    </View>
  );
}

function CompactShowcase({
  badges,
  mode,
  onPickerOpenRequest,
}: {
  badges: BadgeDetail[];
  mode?: "own" | "public";
  onPickerOpenRequest?: () => void;
}) {
  const featured = badges.slice(0, 2);

  if (featured.length === 0) {
    if (mode === "public") return null;

    // Own mode empty placeholder
    return (
      <Pressable
        onPress={onPickerOpenRequest}
        style={({ pressed }) => [
          compactStyles.emptyPlaceholder,
          pressed && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Showcase a badge"
      >
        <Ionicons
          name="add-circle-outline"
          size={16}
          color="rgba(255,255,255,0.7)"
        />
        <Text style={compactStyles.emptyPlaceholderText}>Showcase a badge</Text>
      </Pressable>
    );
  }

  return (
    <View style={compactStyles.row}>
      {featured.map((badge) => (
        <CompactBadge key={badge.id} badge={badge} />
      ))}
    </View>
  );
}

// ── Picker mode ───────────────────────────────────────────────────────────

function PickerBadgeItem({
  badge,
  selected,
  selectionOrder,
  onPress,
}: {
  badge: BadgeProgress;
  selected: boolean;
  selectionOrder: number;
  onPress: () => void;
}) {
  const isLocked = !badge.is_earned;

  return (
    <Pressable
      onPress={isLocked ? undefined : onPress}
      style={({ pressed }) => [
        pickerStyles.badge,
        selected && pickerStyles.badgeSelected,
        isLocked && pickerStyles.badgeLocked,
        pressed && !isLocked && { opacity: 0.85 },
      ]}
      accessibilityRole={isLocked ? "none" : "checkbox"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${badge.name}${isLocked ? " (locked)" : ""}`}
    >
      <View style={pickerStyles.iconWrapper}>
        {badge.icon_url ? (
          <Image
            source={{ uri: badge.icon_url }}
            style={[pickerStyles.icon, isLocked && pickerStyles.iconLocked]}
            accessibilityLabel={badge.name}
          />
        ) : (
          <View
            style={[
              pickerStyles.iconFallback,
              isLocked && pickerStyles.iconFallbackLocked,
            ]}
          >
            <Ionicons
              name={isLocked ? "lock-closed-outline" : "ribbon-outline"}
              size={22}
              color={isLocked ? colors.GRAY400 : colors.GREEN}
            />
          </View>
        )}

        {selected && (
          <View style={pickerStyles.selectionBadge}>
            <Text style={pickerStyles.selectionBadgeText}>{selectionOrder}</Text>
          </View>
        )}

        {isLocked && (
          <View style={pickerStyles.lockOverlay}>
            <Ionicons name="lock-closed" size={12} color={colors.WHITE} />
          </View>
        )}
      </View>

      <Text
        style={[pickerStyles.badgeName, isLocked && pickerStyles.textLocked]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>

      {isLocked && badge.progress_hint ? (
        <Text style={pickerStyles.progressHint} numberOfLines={1}>
          {badge.progress_hint}
        </Text>
      ) : badge.earned_at ? (
        <Text style={pickerStyles.earnedDate}>
          {formatEarnedDate(badge.earned_at)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function PickerGrid({
  badgeProgress,
  selectedIds,
  onSelectionChange,
}: {
  badgeProgress: BadgeProgress[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const [swapMessage, setSwapMessage] = useState<string | null>(null);

  const handlePress = (badge: BadgeProgress) => {
    if (!badge.is_earned) return;

    const alreadySelected = selectedIds.includes(badge.id);

    if (alreadySelected) {
      // Deselect
      onSelectionChange(selectedIds.filter((id) => id !== badge.id));
      setSwapMessage(null);
      return;
    }

    if (selectedIds.length < 2) {
      onSelectionChange([...selectedIds, badge.id]);
      setSwapMessage(null);
      return;
    }

    // Max 2 reached: swap out the oldest (first in array)
    const [removed, ...rest] = selectedIds;
    const removedBadge = badgeProgress.find((b) => b.id === removed);
    const newIds = [...rest, badge.id];
    onSelectionChange(newIds);
    setSwapMessage(
      `Replaced "${removedBadge?.name ?? removed}" with "${badge.name}"`,
    );
  };

  return (
    <View>
      <Text style={pickerStyles.eyebrow}>PICK UP TO 2 TO FEATURE</Text>

      {swapMessage ? (
        <View style={pickerStyles.swapMessage}>
          <Ionicons name="swap-horizontal-outline" size={14} color={colors.AMBER} />
          <Text style={pickerStyles.swapMessageText}>{swapMessage}</Text>
        </View>
      ) : null}

      <View style={pickerStyles.grid}>
        {badgeProgress.map((badge) => {
          const selected = selectedIds.includes(badge.id);
          const selectionOrder = selected ? selectedIds.indexOf(badge.id) + 1 : 0;
          return (
            <PickerBadgeItem
              key={badge.id}
              badge={badge}
              selected={selected}
              selectionOrder={selectionOrder}
              onPress={() => handlePress(badge)}
            />
          );
        })}
      </View>

      {badgeProgress.length === 0 && (
        <View style={pickerStyles.emptyState}>
          <Ionicons name="ribbon-outline" size={32} color={colors.GRAY400} />
          <Text style={pickerStyles.emptyStateText}>
            No badges earned yet. Complete exchanges to earn badges.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────

export default function BadgeShowcase({
  variant,
  mode = "own",
  badges = [],
  onPickerOpenRequest,
  badgeProgress = [],
  selectedIds = [],
  onSelectionChange,
}: BadgeShowcaseProps) {
  if (variant === "compact") {
    return (
      <CompactShowcase
        badges={badges}
        mode={mode}
        onPickerOpenRequest={onPickerOpenRequest}
      />
    );
  }

  // picker variant – rendered inside ProfileEditSheet's outer ScrollView, so no
  // inner ScrollView here (nested same-direction ScrollViews collapse on Android
  // and cause gesture conflicts on iOS). The flat View inherits scroll from above.
  return (
    <View style={{ paddingBottom: 16 }}>
      <PickerGrid
        badgeProgress={badgeProgress}
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange ?? (() => {})}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const compactStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
  },
  badge: {
    alignItems: "center",
    maxWidth: 70,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  iconFallback: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  badgeName: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    marginTop: 4,
  },
  earnedDate: {
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  emptyPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  emptyPlaceholderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
});

const pickerStyles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: colors.GRAY500,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  swapMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.AMBER_LT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  swapMessageText: {
    fontSize: 12,
    color: colors.AMBER,
    fontWeight: "600",
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  badge: {
    width: "30%",
    alignItems: "center",
    backgroundColor: colors.WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 10,
    minHeight: 100,
    justifyContent: "flex-start",
  },
  badgeSelected: {
    borderColor: colors.GREEN,
    backgroundColor: colors.GREEN_LT,
  },
  badgeLocked: {
    opacity: 0.5,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  iconLocked: {
    opacity: 0.5,
  },
  iconFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  iconFallbackLocked: {
    backgroundColor: colors.GRAY100,
  },
  selectionBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.WHITE,
  },
  selectionBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.WHITE,
  },
  lockOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.GRAY500,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY700,
    textAlign: "center",
    marginBottom: 2,
  },
  textLocked: {
    color: colors.GRAY400,
  },
  earnedDate: {
    fontSize: 10,
    color: colors.GRAY400,
    textAlign: "center",
  },
  progressHint: {
    fontSize: 9,
    color: colors.AMBER,
    textAlign: "center",
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
  },
  emptyStateText: {
    fontSize: 13,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 18,
  },
});
