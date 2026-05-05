/**
 * ProfileHero – gradient hero card for own and public profile modes.
 *
 * Layout:
 *   - Optional cover photo (banner_url) above the card (LinkedIn-style)
 *   - Green brand gradient background (flat GREEN with overlay, no external gradient lib needed)
 *   - Left: avatar, name, meta strip, bio, action button
 *   - Right: "AT A GLANCE" stats subcard (semi-transparent glass)
 *   - Below stats: BadgeShowcase compact
 *   - Own mode: "View Time Activity →" ghost button below the card
 *
 * expo-linear-gradient is NOT installed; we emulate with a flat green bg +
 * a semi-transparent dark top overlay to give depth.
 */

import React from "react";
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
import { getInitials } from "../../../utils/getInitials";
import BadgeShowcase from "./BadgeShowcase";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProfileHeroProps {
  /** "own" = authenticated user's own profile; "public" = another user's profile */
  mode: "own" | "public";

  user: {
    id?: string;
    first_name?: string;
    last_name?: string;
    /** email kept for type compat; NOT displayed as @handle in the UI */
    email?: string;
    bio?: string | null;
    avatar_url?: string | null;
    /** Cover photo URL — shown above the hero card (LinkedIn-style) */
    banner_url?: string | null;
    date_joined?: string;
    location?: string | null;
    karma_score?: number;
    followers_count?: number;
    following_count?: number;
    featured_badges?: string[];
    featured_badges_detail?: BadgeDetail[];
  };

  /** Own profile: count of active offers + needs (replaces time balance) */
  activeServicesCount?: number;

  /** Both modes: completed exchanges count */
  completedExchanges?: number;

  /** Public profile: average reputation score */
  reputationScore?: number;

  followers?: number;
  following?: number;

  /** Own profile: tap the Edit button */
  onEditPress?: () => void;

  /** Public profile: tap Message */
  onMessagePress?: () => void;

  /** Public profile: tap Report */
  onReportPress?: () => void;

  /** Tap the avatar (own profile: open image picker) */
  onAvatarPress?: () => void;

  /** Tap followers count */
  onFollowersPress?: () => void;

  /** Tap following count */
  onFollowingPress?: () => void;

  /** Own profile empty showcase: request opening the picker in the edit sheet */
  onBadgePickerOpenRequest?: () => void;

  /** Own profile: navigate to TimeActivity screen */
  onTimeActivityPress?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

// getInitials is imported from utils/getInitials (shared utility).

function formatJoinedDate(dateStr?: string): string {
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

// ── Sub-components ────────────────────────────────────────────────────────

function StatItem({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | number;
  onPress?: () => void;
}) {
  const content = (
    <View style={statStyles.statItem}>
      <Text style={statStyles.statValue}>{String(value)}</Text>
      <Text style={statStyles.statLabel}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && { opacity: 0.8 }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ── Main component ────────────────────────────────────────────────────────

export default function ProfileHero({
  mode,
  user,
  activeServicesCount,
  completedExchanges,
  reputationScore,
  followers,
  following,
  onEditPress,
  onMessagePress,
  onReportPress,
  onAvatarPress,
  onFollowersPress,
  onFollowingPress,
  onBadgePickerOpenRequest,
  onTimeActivityPress,
}: ProfileHeroProps) {
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const initials = getInitials(user.first_name, user.last_name);

  const joinedStr = formatJoinedDate(user.date_joined);

  const bio = user.bio?.trim() ?? "";
  const truncatedBio = bio.length > 80 ? bio.slice(0, 79) + "…" : bio;

  const followerCount = followers ?? user.followers_count ?? 0;
  const followingCount = following ?? user.following_count ?? 0;

  // Meta strip: Joined Mon YYYY · city (no @handle — username field removed per THEME.md)
  const memberSinceLabel = joinedStr ? `Joined ${joinedStr}` : "";

  const badgesDetail: BadgeDetail[] = user.featured_badges_detail ?? [];

  return (
    <View>
      {/* Cover photo (banner_url) — LinkedIn-style, above the hero card */}
      {user.banner_url ? (
        <View style={styles.coverPhotoWrapper}>
          <Image
            source={{ uri: user.banner_url }}
            style={styles.coverPhoto}
            accessibilityIgnoresInvertColors
            accessibilityLabel="Cover photo"
          />
        </View>
      ) : null}

      <View style={[styles.container, user.banner_url ? styles.containerWithCover : null]}>
        {/* Gradient emulation: flat GREEN + dark overlay at top */}
        <View style={styles.gradientBase} />
        <View style={styles.gradientOverlayTop} />
        <View style={styles.gradientOverlayBottom} />

        {/* Decorative blob top-right */}
        <View style={styles.blobTopRight} />
        {/* Decorative blob bottom-left */}
        <View style={styles.blobBottomLeft} />

        <View style={styles.content}>
          {/* Left column */}
          <View style={styles.leftCol}>
            {/* Avatar */}
            <Pressable
              onPress={mode === "own" ? onAvatarPress : undefined}
              accessibilityRole={mode === "own" ? "button" : "image"}
              accessibilityLabel={
                mode === "own" ? "Change avatar" : `${fullName} avatar`
              }
              style={styles.avatarWrapper}
            >
              {user.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  style={styles.avatar}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              {mode === "own" && (
                <View style={styles.cameraOverlay}>
                  <Ionicons name="camera" size={14} color={colors.WHITE} />
                </View>
              )}
            </Pressable>

            {/* Name */}
            <Text style={styles.name} numberOfLines={2}>
              {fullName || "User"}
            </Text>

            {/* Identity meta strip: Joined Mon YYYY · city */}
            <Text style={styles.metaStrip} numberOfLines={1}>
              {[
                memberSinceLabel || null,
                user.location ? user.location : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            {/* Bio */}
            {truncatedBio ? (
              <Text style={styles.bio} numberOfLines={2}>
                {truncatedBio}
              </Text>
            ) : null}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              {mode === "own" ? (
                <Pressable
                  onPress={onEditPress}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.editButton,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Ionicons name="pencil-outline" size={14} color={colors.GREEN} />
                  <Text style={styles.editButtonText}>Edit profile</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={onMessagePress}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.messageButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Message this user"
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={colors.WHITE} />
                    <Text style={styles.messageButtonText}>Message</Text>
                  </Pressable>
                  <Pressable
                    onPress={onReportPress}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.reportButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Report this user"
                  >
                    <Text style={styles.reportButtonText}>Report</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {/* Right column: stats glass card */}
          <View style={styles.rightCol}>
            <View style={styles.glassCard}>
              <Text style={styles.glassEyebrow}>AT A GLANCE</Text>

              <View style={styles.statsGrid}>
                {/* Row 1: mode-specific stats */}
                {mode === "own" ? (
                  <>
                    <StatItem
                      label="Active services"
                      value={activeServicesCount ?? 0}
                    />
                    <StatItem
                      label="Exchanges"
                      value={completedExchanges ?? 0}
                    />
                  </>
                ) : (
                  <>
                    <StatItem
                      label="Exchanges"
                      value={completedExchanges ?? 0}
                    />
                    <StatItem
                      label="Reputation"
                      value={
                        reputationScore != null
                          ? reputationScore.toFixed(1)
                          : "—"
                      }
                    />
                  </>
                )}

                {/* Row 2: Followers·Following (consolidated tile) + Member since */}
                <StatItem
                  label="Followers · Following"
                  value={`${followerCount} · ${followingCount}`}
                  onPress={onFollowersPress ?? onFollowingPress}
                />
                <StatItem
                  label="Member since"
                  value={joinedStr || "—"}
                />
              </View>

              {/* Badge showcase compact */}
              <View style={styles.badgeRow}>
                <BadgeShowcase
                  variant="compact"
                  mode={mode}
                  badges={badgesDetail}
                  onPickerOpenRequest={onBadgePickerOpenRequest}
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Own profile: "View Time Activity →" ghost button */}
      {mode === "own" && onTimeActivityPress ? (
        <Pressable
          onPress={onTimeActivityPress}
          style={({ pressed }) => [
            styles.timeActivityLink,
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View Time Activity"
        >
          <Ionicons name="time-outline" size={14} color={colors.GREEN} />
          <Text style={styles.timeActivityLinkText}>View Time Activity →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

// GREEN brand gradient palette (no expo-linear-gradient; emulated with overlays)
const HERO_DARK = "#064E3B"; // dark emerald (top overlay)
const HERO_BASE = "#2D5C4E"; // colors.GREEN (base)
const HERO_LIGHT = "#34D399"; // emerald-400 (bottom accent)

const statStyles = StyleSheet.create({
  statItem: {
    alignItems: "center",
    paddingVertical: 4,
    minWidth: 60,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.WHITE,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  // Cover photo (banner_url) – LinkedIn-style strip above the hero card
  coverPhotoWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    height: 100,
  },
  coverPhoto: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 22,
    overflow: "hidden",
    minHeight: 200,
    shadowColor: HERO_DARK,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // When a cover photo is shown, the hero card connects flush to it
  containerWithCover: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  gradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_BASE,
  },
  gradientOverlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: HERO_DARK,
    opacity: 0.6,
  },
  gradientOverlayBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: HERO_LIGHT,
    opacity: 0.18,
  },
  blobTopRight: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  blobBottomLeft: {
    position: "absolute",
    bottom: -24,
    left: -24,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  content: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  leftCol: {
    flex: 1.1,
    gap: 6,
  },
  rightCol: {
    flex: 1,
  },
  // Avatar
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.WHITE,
    overflow: "hidden",
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.GREEN,
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Text
  name: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.WHITE,
    lineHeight: 26,
  },
  metaStrip: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.76)",
  },
  bio: {
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
  },
  // Action buttons
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editButton: {
    backgroundColor: colors.WHITE,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GREEN,
  },
  messageButton: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  messageButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.WHITE,
  },
  reportButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  reportButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  // Glass card (right column)
  glassCard: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    padding: 10,
  },
  glassEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    marginBottom: 8,
    textAlign: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 4,
  },
  badgeRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    paddingTop: 8,
  },
  // "View Time Activity →" ghost link below the hero (own mode only)
  timeActivityLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GREEN,
    backgroundColor: colors.GREEN_LT,
  },
  timeActivityLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GREEN,
  },
});
