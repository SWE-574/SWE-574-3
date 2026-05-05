/**
 * ProfileHero – gradient hero card for own and public profile modes.
 *
 * Layout:
 *   - Optional cover photo (banner_url) above the card (LinkedIn-style)
 *   - Green brand gradient background (flat GREEN with overlay, no external gradient lib needed)
 *   - Avatar, name, meta strip, bio, action button
 *   - "AT A GLANCE" stats directly on the hero surface
 *   - Below stats: BadgeShowcase compact
 *
 * expo-linear-gradient is NOT installed; we emulate with a flat green bg +
 * a semi-transparent dark top overlay to give depth.
 */

import React, { useEffect, useState } from "react";
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
import { normalizeRuntimeUrl } from "../../../constants/env";
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

function formatHeroLocation(location?: string | null): string | null {
  if (!location) return null;
  const slashParts = location
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length >= 2) return `${slashParts[0]} / ${slashParts[1]}`;

  const commaParts = location
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !["Türkiye", "Turkey"].includes(part));
  if (commaParts.length >= 2) return `${commaParts[1]} / ${commaParts[0]}`;

  return location.trim();
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
}: ProfileHeroProps) {
  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const initials = getInitials(user.first_name, user.last_name);

  const joinedStr = formatJoinedDate(user.date_joined);

  const bio = user.bio?.trim() ?? "";
  const heroLocation = formatHeroLocation(user.location);
  const avatarUrl = normalizeRuntimeUrl(user.avatar_url);
  const bannerUrl = normalizeRuntimeUrl(user.banner_url);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const followerCount = followers ?? user.followers_count ?? 0;
  const followingCount = following ?? user.following_count ?? 0;

  const badgesDetail: BadgeDetail[] = user.featured_badges_detail ?? [];

  useEffect(() => {
    setCoverFailed(false);
  }, [bannerUrl]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  return (
    <View>
      <View style={styles.container}>
        {bannerUrl ? (
          <View style={styles.coverPhotoWrapper}>
            <Image
              source={{ uri: bannerUrl }}
              style={[styles.coverPhoto, coverFailed && styles.hiddenCoverPhoto]}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Cover photo"
              onError={() => setCoverFailed(true)}
            />
          </View>
        ) : null}

        <View style={[styles.heroBody, bannerUrl ? styles.heroBodyWithCover : null]}>
          {/* Gradient emulation: flat GREEN + dark overlay at top */}
          <View style={[styles.gradientBase, bannerUrl ? styles.gradientWithCover : null]} />
          <View style={[styles.gradientOverlayTop, bannerUrl ? styles.gradientWithCover : null]} />
          <View style={styles.badgeOverlay}>
            <BadgeShowcase
              variant="compact"
              mode={mode}
              badges={badgesDetail}
              onPickerOpenRequest={onBadgePickerOpenRequest}
            />
          </View>

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
                <View style={styles.avatarClip}>
                  {avatarUrl && !avatarFailed ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={styles.avatar}
                      accessibilityIgnoresInvertColors
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitials}>{initials}</Text>
                    </View>
                  )}
                </View>
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

              {/* Location meta strip */}
              {heroLocation ? (
                <View style={styles.locationRow}>
                  <Ionicons
                    name="location-outline"
                    size={13}
                    color="rgba(255,255,255,0.76)"
                  />
                  <Text style={styles.metaStrip} numberOfLines={1}>
                    {heroLocation}
                  </Text>
                </View>
              ) : null}

              {/* Bio */}
              {bio ? (
                <Text style={styles.bio}>
                  {bio}
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
              <View style={styles.statsCard}>
                <Text style={styles.glassEyebrow}>AT A GLANCE</Text>

                <View style={styles.statsGrid}>
                  {/* Row 1: mode-specific stats */}
                  {mode === "own" ? (
                    <>
                      <StatItem
                        label="Karma"
                        value={user.karma_score ?? "—"}
                      />
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
                      label="Karma"
                      value={user.karma_score ?? "—"}
                    />
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
                    label="Followers"
                    value={followerCount}
                    onPress={onFollowersPress}
                  />
                  <StatItem
                    label="Following"
                    value={followingCount}
                    onPress={onFollowingPress}
                  />
                  <StatItem
                    label="Member since"
                    value={joinedStr || "—"}
                  />
                </View>

              </View>
            </View>
          </View>
        </View>
      </View>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

// GREEN brand gradient palette (no expo-linear-gradient; emulated with overlays)
const HERO_DARK = "#064E3B"; // dark emerald (top overlay)
const HERO_BASE = "#2D5C4E"; // colors.GREEN (base)
const statStyles = StyleSheet.create({
  statItem: {
    alignItems: "flex-start",
    paddingVertical: 7,
    minWidth: "30%",
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
    textAlign: "left",
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  // Cover photo lives inside the hero card; the green background is the fallback.
  coverPhotoWrapper: {
    height: 100,
    backgroundColor: HERO_BASE,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  coverPhoto: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  hiddenCoverPhoto: {
    opacity: 0,
  },
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 22,
    backgroundColor: HERO_BASE,
    overflow: "visible",
    shadowColor: HERO_DARK,
    shadowOpacity: 0.38,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  heroBody: {
    minHeight: 200,
    borderRadius: 22,
    overflow: "hidden",
  },
  heroBodyWithCover: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  gradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_BASE,
    borderRadius: 22,
  },
  gradientWithCover: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  gradientOverlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: HERO_DARK,
    opacity: 0.6,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  content: {
    flexDirection: "column",
    padding: 16,
    paddingTop: 18,
    gap: 14,
    overflow: "hidden",
    borderRadius: 22,
  },
  leftCol: {
    gap: 6,
    paddingRight: 74,
  },
  rightCol: {
    width: "100%",
    paddingTop: 0,
  },
  badgeOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    maxWidth: 76,
  },
  // Avatar
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.WHITE,
    overflow: "visible",
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  avatarClip: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
    overflow: "hidden",
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
    bottom: -1,
    right: -1,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1.5,
    borderColor: colors.WHITE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
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
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
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
  statsCard: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  glassEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    marginBottom: 6,
    textAlign: "left",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: 10,
  },
  badgeRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    paddingTop: 8,
  },
});
