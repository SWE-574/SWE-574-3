import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Ionicons, SimpleLineIcons } from "@expo/vector-icons";
import {
  followUser,
  getUser,
  getUserHistory,
  getVerifiedReviews,
  type ProfileReview,
  unfollowUser,
} from "../../api/users";
import { listServices } from "../../api/services";
import type {
  PublicUserProfile,
  Service,
  UserHistoryItem,
} from "../../api/types";
import {
  groupHistoryItems,
  isOwnHistoryItem,
} from "../../utils/historyGrouping";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import AchievementsSection from "../components/AchievementsSection";
import ProfileSkillsSection from "../components/ProfileSkillsSection";
import ProfileListingStatsRow from "../components/ProfileListingStatsRow";

const DEFAULT_BANNER_URI =
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80";
const DEFAULT_AVATAR_URI =
  "https://api.dicebear.com/9.x/avataaars/png?seed=profile";

type PublicProfileNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, "PublicProfile">,
  BottomTabNavigationProp<BottomTabParamList>
>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; user: PublicUserProfile };

function achievementIdsForDisplay(user: PublicUserProfile): string[] {
  const achievements = user.achievements ?? [];
  const badges = user.badges ?? [];

  if (achievements.length === 0 && badges.length === 0) return [];
  return [...new Set([...achievements, ...badges])];
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatHours(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return `${Number.isFinite(amount) ? amount : 0}h`;
}

function getInitials(name?: string | null) {
  return (name || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function activityCardAccent(type: Service["type"]) {
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

export default function PublicProfileScreen() {
  const route = useRoute<RouteProp<ProfileStackParamList, "PublicProfile">>();
  const navigation = useNavigation<PublicProfileNavigation>();
  const { user: authUser, refreshUser } = useAuth();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeServices, setActiveServices] = useState<Service[]>([]);
  const [historyItems, setHistoryItems] = useState<UserHistoryItem[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<
    ReturnType<typeof groupHistoryItems>[number] | null
  >(null);
  const [followActionLoading, setFollowActionLoading] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    getUser(userId)
      .then((user) => {
        if (!cancelled) setState({ status: "success", user });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load profile";
          setState({ status: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setActiveServices([]);

    listServices({ user: userId, page_size: 50 })
      .then((res) => {
        if (cancelled) return;
        const rows = res.results ?? [];
        setActiveServices(rows.filter((service) => service.is_visible !== false));
      })
      .catch(() => {
        if (!cancelled) setActiveServices([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (state.status !== "success" || !state.user.show_history) {
      setHistoryItems([]);
      return;
    }

    let cancelled = false;

    getUserHistory(userId)
      .then((rows) => {
        if (!cancelled) setHistoryItems(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [state, userId]);

  useEffect(() => {
    if (state.status !== "success") {
      setReviews([]);
      return;
    }

    let cancelled = false;
    setReviewsLoading(true);

    getVerifiedReviews(userId, { page: 1, page_size: 20 })
      .then((response) => {
        if (!cancelled) {
          setReviews(response.results ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReviews([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReviewsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.status, userId]);

  if (state.status === "loading") {
    return (
      <View style={[styles.centerFill, styles.mutedBackground]}>
        <ActivityIndicator size="large" color={colors.GREEN} />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={[styles.centerFill, styles.mutedBackground, styles.errorPad]}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  const { user } = state;
  const fullName = [user.first_name, user.last_name]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" ")
    .trim();

  const bioText =
    user.bio != null && String(user.bio).trim() ? String(user.bio).trim() : null;
  const hasLongBio = (bioText?.length ?? 0) > 140;

  const locationText =
    user.location != null && String(user.location).trim()
      ? String(user.location).trim()
      : null;

  const joinedDate =
    user.date_joined != null && String(user.date_joined).trim()
      ? (() => {
          const date = new Date(user.date_joined as string);
          return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
        })()
      : null;

  const bannerUri =
    user.banner_url != null && String(user.banner_url).trim()
      ? String(user.banner_url).trim()
      : DEFAULT_BANNER_URI;

  const avatarUri =
    user.avatar_url != null && String(user.avatar_url).trim()
      ? String(user.avatar_url).trim()
      : DEFAULT_AVATAR_URI;

  const skills =
    user.skills?.filter(
      (skill) => skill?.id && skill?.name && String(skill.name).trim().length > 0,
    ) ?? [];

  const portfolioUrls =
    user.portfolio_images?.filter(
      (url) => typeof url === "string" && url.trim().length > 0,
    ) ?? [];

  const achievementIds = achievementIdsForDisplay(user);
  const canOpenAchievementsList =
    authUser?.id != null && String(authUser.id) === String(user.id);
  const isOwnProfile =
    authUser?.id != null && String(authUser.id) === String(user.id);
  const showFollowButton = authUser != null && !isOwnProfile;

  const openFollowList = (kind: "followers" | "following") => {
    if (!authUser) {
      Alert.alert(
        "Sign in required",
        "Sign in to see who follows this user and who they follow.",
      );
      return;
    }

    navigation.navigate("FollowList", { userId, kind });
  };

  const handleFollowToggle = () => {
    if (followActionLoading) return;

    const currentlyFollowing = Boolean(user.is_following);
    setFollowActionLoading(true);

    const request = currentlyFollowing ? unfollowUser(userId) : followUser(userId);

    request
      .then(() => {
        setState((prev) => {
          if (prev.status !== "success") return prev;

          const nextFollowing = !currentlyFollowing;
          const delta = nextFollowing ? 1 : -1;

          return {
            status: "success",
            user: {
              ...prev.user,
              is_following: nextFollowing,
              followers_count: Math.max(
                0,
                (prev.user.followers_count ?? 0) + delta,
              ),
            },
          };
        });

        void refreshUser();
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Could not update follow status.";
        Alert.alert("Error", message);
      })
      .finally(() => setFollowActionLoading(false));
  };

  const offersCount = activeServices.filter((service) => service.type === "Offer").length;
  const needsCount = activeServices.filter((service) => service.type === "Need").length;
  const ownHistoryEntries = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  );
  const exchangesCount = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  ).length;

  const renderServicesSection = () => {
    if (!activeServices.length) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No active services</Text>
          <Text style={styles.emptyStateText}>
            This member does not have any visible active services right now.
          </Text>
        </View>
      );
    }

    return activeServices.map((service) => (
      <Pressable
        key={service.id}
        accessibilityRole="button"
        accessibilityLabel={`Open service ${service.title}`}
        onPress={() => navigation.navigate("ServiceDetail", { id: service.id })}
        style={({ pressed }) => [
          styles.serviceCardPressable,
          pressed && styles.pressed,
        ]}
      >
        <ProfileActivityServiceCard service={service} />
      </Pressable>
    ));
  };

  const renderTimeActivitySection = () => {
    if (!user.show_history) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>Time activity is private</Text>
          <Text style={styles.emptyStateText}>
            This member chose not to share their completed exchange activity.
          </Text>
        </View>
      );
    }

    if (!ownHistoryEntries.length) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No time activity yet</Text>
          <Text style={styles.emptyStateText}>
            Completed exchanges on this member&apos;s services will appear here.
          </Text>
        </View>
      );
    }

    return ownHistoryEntries.map((entry) => (
      <Pressable
        key={entry.key}
        accessibilityRole="button"
        accessibilityLabel={`Open time activity item ${entry.serviceTitle}`}
        onPress={() => navigation.navigate("ServiceDetail", { id: entry.serviceId })}
        style={({ pressed }) => [
          styles.historyCard,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.historyCardHeader}>
          <View style={styles.historyCardTitleWrap}>
            <Text style={styles.historyCardTitle}>{entry.serviceTitle}</Text>
            <Text style={styles.historyCardMeta}>
              With {entry.partnerName} · {formatShortDate(entry.completedDate)}
            </Text>
          </View>
          <View style={styles.historyHoursPill}>
            <Text style={styles.historyHoursPillText}>{formatHours(entry.duration)}</Text>
          </View>
        </View>
        <View style={styles.historyCardFooter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View participants for ${entry.serviceTitle}`}
            onPress={(event) => {
              event.stopPropagation();
              setSelectedHistoryEntry(entry);
            }}
            style={({ pressed }) => [
              styles.historyFooterAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.historyFooterText}>
              {entry.useCount} participant{entry.useCount !== 1 ? "s" : ""}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={15}
              color={colors.GRAY400}
            />
          </Pressable>
        </View>
      </Pressable>
    ));
  };

  const renderReviewsSection = () => {
    if (reviewsLoading) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateText}>Reviews are loading...</Text>
        </View>
      );
    }

    if (!reviews.length) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No reviews yet</Text>
          <Text style={styles.emptyStateText}>
            Verified reviews from completed exchanges will appear here.
          </Text>
        </View>
      );
    }

    return reviews.map((review) => (
      <View key={review.id} style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          {review.user_avatar_url ? (
            <Image
              source={{ uri: review.user_avatar_url }}
              style={styles.reviewAvatarImage}
            />
          ) : (
            <View style={styles.reviewAvatar}>
              <Text style={styles.reviewAvatarText}>
                {(review.user_name || "?").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.reviewHeaderText}>
            <Text style={styles.reviewAuthor}>{review.user_name || "Community member"}</Text>
            <Text style={styles.reviewMeta}>
              {review.service_title || "Exchange review"} · {formatShortDate(review.created_at)}
            </Text>
          </View>
        </View>
        <Text style={styles.reviewBody}>{review.body}</Text>
      </View>
    ));
  };

  const renderServiceTab = (services: Service[], emptyText: string) => {
    if (!services.length) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>Nothing here yet</Text>
          <Text style={styles.emptyStateText}>{emptyText}</Text>
        </View>
      );
    }

    return services.map((service) => (
      <Pressable
        key={service.id}
        accessibilityRole="button"
        accessibilityLabel={`Open service ${service.title}`}
        onPress={() => navigation.navigate("ServiceDetail", { id: service.id })}
        style={({ pressed }) => [
          styles.serviceCardPressable,
          pressed && styles.pressed,
        ]}
      >
        <ProfileActivityServiceCard service={service} />
      </Pressable>
    ));
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="arrow-back" size={22} color={colors.GRAY700} />
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Image source={{ uri: bannerUri }} style={styles.banner} />

          <View style={styles.avatarWrapper}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          </View>

          <View style={styles.profileHeaderContent}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{fullName || "Unnamed User"}</Text>
              {showFollowButton ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: followActionLoading,
                    busy: followActionLoading,
                  }}
                  disabled={followActionLoading}
                  onPress={handleFollowToggle}
                  style={({ pressed }) => [
                    user.is_following
                      ? styles.followButtonOutline
                      : styles.followButtonFilled,
                    pressed && styles.pressed,
                    followActionLoading && styles.followButtonDisabled,
                  ]}
                >
                  {followActionLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={user.is_following ? colors.GRAY700 : colors.WHITE}
                    />
                  ) : (
                    <Text
                      style={
                        user.is_following
                          ? styles.followButtonOutlineText
                          : styles.followButtonFilledText
                      }
                    >
                      {user.is_following ? "Unfollow" : "Follow"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>

            <View style={styles.followMetaRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View followers"
                onPress={() => openFollowList("followers")}
              >
                <Text style={styles.followMetaLink}>
                  {user.followers_count ?? 0} followers
                </Text>
              </Pressable>
              <Text style={styles.followMetaDot}> · </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View following"
                onPress={() => openFollowList("following")}
              >
                <Text style={styles.followMetaLink}>
                  {user.following_count ?? 0} following
                </Text>
              </Pressable>
            </View>

            {locationText ? (
              <View style={styles.locationRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.GRAY500}
                />
                <Text style={styles.location}>{locationText}</Text>
              </View>
            ) : null}

            {joinedDate ? (
              <View style={styles.memberMetaRow}>
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={colors.GRAY500}
                />
                <Text style={styles.memberMetaText}>Member since {joinedDate}</Text>
              </View>
            ) : null}

            {bioText ? (
              <>
                <Text
                  style={styles.bio}
                  numberOfLines={isBioExpanded ? undefined : 3}
                >
                  {bioText}
                </Text>
                {hasLongBio ? (
                  <Pressable
                    onPress={() => setIsBioExpanded((prev) => !prev)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={styles.bioToggle}>
                      {isBioExpanded ? "Less" : "Read more"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        <ProfileListingStatsRow
          offersCount={offersCount}
          needsCount={needsCount}
          exchangesCount={exchangesCount}
        />

        <View style={styles.snapshotCard}>
          <View style={styles.snapshotHeader}>
            <View style={styles.snapshotHeaderLeft}>
              <View style={styles.snapshotIconWrap}>
                <Ionicons name="sparkles-outline" size={18} color={colors.GREEN} />
              </View>
              <View>
                <Text style={styles.snapshotTitle}>Community snapshot</Text>
                <Text style={styles.snapshotSubtitle}>Quick profile highlights</Text>
              </View>
            </View>
          </View>

          <View style={styles.snapshotStatsRow}>
            <View style={[styles.snapshotStatCard, styles.snapshotStatCardGreen]}>
              <Ionicons name="heart-outline" size={18} color={colors.GREEN} />
              <Text style={styles.snapshotStatValue}>{user.karma_score ?? 0}</Text>
              <Text style={styles.snapshotStatLabel}>Karma</Text>
            </View>

            <Pressable
              onPress={
                canOpenAchievementsList
                  ? () =>
                      navigation.navigate("AchievementsList", {
                        userId: user.id,
                      })
                  : undefined
              }
              disabled={!canOpenAchievementsList}
              style={({ pressed }) => [
                styles.snapshotStatCard,
                styles.snapshotStatCardPurple,
                pressed && canOpenAchievementsList && styles.pressed,
              ]}
            >
              <SimpleLineIcons name="badge" size={16} color={colors.PURPLE} />
              <Text style={styles.snapshotStatValue}>{user.badges?.length ?? 0}</Text>
              <View style={styles.snapshotLabelRow}>
                <Text style={styles.snapshotStatLabel}>Badges</Text>
                {canOpenAchievementsList ? (
                  <Ionicons
                    name="chevron-forward"
                    size={13}
                    color={colors.GRAY400}
                  />
                ) : null}
              </View>
            </Pressable>

            <View style={[styles.snapshotStatCard, styles.snapshotStatCardAmber]}>
              <Ionicons name="star-outline" size={18} color={colors.AMBER} />
              <Text style={styles.snapshotStatValue}>
                {user.achievements?.length ?? 0}
              </Text>
              <Text style={styles.snapshotStatLabel}>Achievements</Text>
            </View>
          </View>

          <View style={styles.traitsWrap}>
            <View style={styles.traitChip}>
              <Text style={styles.traitValue}>{user.helpful_count ?? 0}</Text>
              <Text style={styles.traitLabel}>Helpful</Text>
            </View>
            <View style={styles.traitChip}>
              <Text style={styles.traitValue}>{user.kind_count ?? 0}</Text>
              <Text style={styles.traitLabel}>Kind</Text>
            </View>
            <View style={styles.traitChip}>
              <Text style={styles.traitValue}>{user.punctual_count ?? 0}</Text>
              <Text style={styles.traitLabel}>Punctual</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              Active services
            </Text>
            <View style={styles.activeServicesCountPill}>
              <Text style={styles.activeServicesCountText}>
                {activeServices.length}
              </Text>
            </View>
          </View>
          <View style={styles.tabPanel}>{renderServicesSection()}</View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              Time activity
            </Text>
            <View style={styles.activeServicesCountPill}>
              <Text style={styles.activeServicesCountText}>
                {ownHistoryEntries.length}
              </Text>
            </View>
          </View>
          <View style={styles.tabPanel}>{renderTimeActivitySection()}</View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              Reviews
            </Text>
            <View style={styles.activeServicesCountPill}>
              <Text style={styles.activeServicesCountText}>
                {reviews.length}
              </Text>
            </View>
          </View>
          <View style={styles.tabPanel}>{renderReviewsSection()}</View>
        </View>

        {skills.length > 0 ? (
          <ProfileSkillsSection skills={skills} />
        ) : null}

        {achievementIds.length > 0 ? (
          <AchievementsSection
            completedIds={achievementIds}
            onViewAll={
              canOpenAchievementsList
                ? () =>
                    navigation.navigate("AchievementsList", {
                      userId: user.id,
                    })
                : undefined
            }
          />
        ) : null}

        {portfolioUrls.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
            >
              {portfolioUrls.map((imageUrl, index) => (
                <Image
                  key={`${imageUrl}-${index}`}
                  source={{ uri: imageUrl }}
                  style={styles.portfolioImage}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={selectedHistoryEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedHistoryEntry(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSelectedHistoryEntry(null)}
        >
          <Pressable style={styles.sheetCard} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Participants</Text>
            <Text style={styles.sheetSubtitle}>
              {selectedHistoryEntry?.serviceTitle || "Completed exchange"}
            </Text>
            <View style={styles.sheetList}>
              {(selectedHistoryEntry?.items ?? []).map((item, index) => (
                <View
                  key={`${item.partner_id}-${item.completed_date}-${index}`}
                  style={[
                    styles.sheetParticipantRow,
                    index > 0 && styles.sheetParticipantRowBorder,
                  ]}
                >
                  {item.partner_avatar_url ? (
                    <Image
                      source={{ uri: item.partner_avatar_url }}
                      style={styles.sheetParticipantAvatarImage}
                    />
                  ) : (
                    <View style={styles.sheetParticipantAvatar}>
                      <Text style={styles.sheetParticipantAvatarText}>
                        {getInitials(item.partner_name)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.sheetParticipantTextWrap}>
                    <Text style={styles.sheetParticipantName}>{item.partner_name}</Text>
                    <Text style={styles.sheetParticipantMeta}>
                      {formatShortDate(item.completed_date)} · {formatHours(item.duration)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProfileActivityServiceCard({ service }: { service: Service }) {
  const accent = activityCardAccent(service.type);
  const participantLabel =
    service.type === "Event"
      ? `${service.participant_count ?? 0}/${service.max_participants} joined`
      : service.max_participants > 1
        ? `${service.participant_count ?? 0}/${service.max_participants} spots`
        : "1:1 exchange";

  return (
    <View style={profileActivityCardStyles.card}>
      <View style={profileActivityCardStyles.topRow}>
        <View
          style={[
            profileActivityCardStyles.typeBadge,
            { backgroundColor: accent.bg },
          ]}
        >
          <Ionicons name={accent.icon} size={12} color={accent.color} />
          <Text
            style={[
              profileActivityCardStyles.typeBadgeText,
              { color: accent.color },
            ]}
          >
            {accent.label}
          </Text>
        </View>
        <View style={profileActivityCardStyles.metaRow}>
          <View style={profileActivityCardStyles.metaBadge}>
            <Ionicons name="time-outline" size={12} color={colors.GRAY500} />
            <Text style={profileActivityCardStyles.metaBadgeText}>
              {formatHours(service.duration)}
            </Text>
          </View>
          <View style={profileActivityCardStyles.metaBadge}>
            <Ionicons name="people-outline" size={12} color={colors.GRAY500} />
            <Text style={profileActivityCardStyles.metaBadgeText}>
              {participantLabel}
            </Text>
          </View>
        </View>
      </View>
      <Text style={profileActivityCardStyles.title} numberOfLines={2}>
        {service.title}
      </Text>
      <Text style={profileActivityCardStyles.description} numberOfLines={2}>
        {service.description || "No description yet."}
      </Text>
      <View style={profileActivityCardStyles.bottomRow}>
        <View style={profileActivityCardStyles.metaBadge}>
          <Ionicons name="location-outline" size={12} color={colors.GRAY500} />
          <Text style={profileActivityCardStyles.metaBadgeText}>
            {service.location_area || service.location_type || "Flexible"}
          </Text>
        </View>
        {service.schedule_details ? (
          <View style={profileActivityCardStyles.metaBadge}>
            <Ionicons name="calendar-outline" size={12} color={colors.GRAY500} />
            <Text
              style={profileActivityCardStyles.metaBadgeText}
              numberOfLines={1}
            >
              {service.schedule_details}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const getStyles = (top: number, bottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.GRAY50,
    },
    backButton: {
      position: "absolute",
      top: top + 12,
      left: 16,
      zIndex: 10,
      backgroundColor: "rgba(255,255,255,0.94)",
      borderRadius: 20,
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.GRAY200,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    mutedBackground: {
      backgroundColor: colors.GRAY50,
    },
    centerFill: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorPad: {
      padding: 16,
    },
    errorText: {
      fontSize: 15,
      color: colors.GRAY600,
      textAlign: "center",
    },
    scrollContent: {
      paddingBottom: Math.max(32, bottom + 16),
      paddingTop: top + 16,
    },
    heroCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      overflow: "hidden",
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    banner: {
      width: "100%",
      height: 120,
      backgroundColor: colors.GRAY200,
    },
    avatarWrapper: {
      position: "absolute",
      top: 74,
      left: 16,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.WHITE,
      alignItems: "center",
      justifyContent: "center",
      padding: 3,
      borderWidth: 1,
      borderColor: colors.GRAY200,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.GRAY200,
    },
    profileHeaderContent: {
      paddingHorizontal: 16,
      paddingTop: 44,
      paddingBottom: 14,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
      justifyContent: "space-between",
    },
    name: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.GRAY800,
      flex: 1,
      minWidth: 0,
    },
    followButtonFilled: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.GREEN,
      minWidth: 96,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.GREEN,
    },
    followButtonOutline: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY300,
      backgroundColor: colors.WHITE,
      minWidth: 96,
      alignItems: "center",
      justifyContent: "center",
    },
    followButtonFilledText: {
      color: colors.WHITE,
      fontSize: 14,
      fontWeight: "700",
    },
    followButtonOutlineText: {
      color: colors.GRAY700,
      fontSize: 14,
      fontWeight: "600",
    },
    followButtonDisabled: {
      opacity: 0.7,
    },
    followMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      marginBottom: 6,
    },
    followMetaLink: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.GREEN,
      textDecorationLine: "underline",
    },
    followMetaDot: {
      fontSize: 13,
      color: colors.GRAY500,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    memberMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    memberMetaText: {
      fontSize: 12,
      color: colors.GRAY500,
    },
    location: {
      fontSize: 14,
      color: colors.GRAY500,
    },
    bio: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.GRAY600,
    },
    bioToggle: {
      marginTop: 6,
      fontSize: 12,
      fontWeight: "600",
      color: colors.GREEN,
    },
    snapshotCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      padding: 14,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    snapshotHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    snapshotHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    snapshotIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: colors.GREEN_LT,
      alignItems: "center",
      justifyContent: "center",
    },
    snapshotTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 1,
    },
    snapshotSubtitle: {
      fontSize: 12,
      color: colors.GRAY500,
    },
    snapshotStatsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
    },
    snapshotStatCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.WHITE,
    },
    snapshotStatCardGreen: {
      backgroundColor: colors.GREEN_LT,
    },
    snapshotStatCardPurple: {
      backgroundColor: colors.PURPLE_LT,
    },
    snapshotStatCardAmber: {
      backgroundColor: colors.AMBER_LT,
    },
    snapshotStatValue: {
      color: colors.GRAY800,
      fontSize: 18,
      fontWeight: "700",
      lineHeight: 22,
    },
    snapshotStatLabel: {
      color: colors.GRAY600,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },
    snapshotLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    traitsWrap: {
      flexDirection: "row",
      gap: 8,
    },
    traitChip: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.GRAY50,
      paddingVertical: 10,
      alignItems: "center",
    },
    traitValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 2,
    },
    traitLabel: {
      fontSize: 11,
      color: colors.GRAY500,
      fontWeight: "600",
    },
    sectionCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      padding: 14,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.GRAY700,
      marginBottom: 8,
    },
    sectionTitleInline: {
      marginBottom: 0,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      gap: 10,
    },
    profileTabsRow: {
      paddingBottom: 4,
      gap: 8,
    },
    profileTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.GRAY100,
      borderWidth: 1,
      borderColor: colors.GRAY200,
    },
    profileTabActive: {
      backgroundColor: colors.GREEN_LT,
      borderColor: colors.GREEN,
    },
    profileTabText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.GRAY600,
    },
    profileTabTextActive: {
      color: colors.GREEN,
    },
    profileTabCount: {
      minWidth: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.WHITE,
      alignItems: "center",
    },
    profileTabCountActive: {
      backgroundColor: colors.GREEN,
    },
    profileTabCountText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.GRAY600,
    },
    profileTabCountTextActive: {
      color: colors.WHITE,
    },
    tabPanel: {
      marginTop: 12,
    },
    activeServicesAccordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
      gap: 10,
    },
    activeServicesAccordionHeaderOpen: {
      marginBottom: 12,
    },
    activeServicesHeaderTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    activeServicesCountPill: {
      backgroundColor: colors.GREEN_LT,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: "center",
    },
    activeServicesCountText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GREEN,
    },
    serviceCardPressable: {
      borderRadius: 12,
      marginBottom: 12,
    },
    serviceCardInProfile: {
      marginHorizontal: 0,
      marginBottom: 0,
    },
    emptyStateCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.GRAY50,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    emptyStateTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GRAY700,
      marginBottom: 4,
    },
    emptyStateText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.GRAY500,
    },
    historyCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.GRAY50,
      padding: 12,
      marginBottom: 10,
    },
    historyCardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    historyCardTitleWrap: {
      flex: 1,
    },
    historyCardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 4,
    },
    historyCardMeta: {
      fontSize: 12,
      color: colors.GRAY500,
      lineHeight: 17,
    },
    historyHoursPill: {
      backgroundColor: colors.GREEN_LT,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    historyHoursPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.GREEN,
    },
    historyCardFooter: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.GRAY200,
    },
    historyFooterAction: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    historyFooterText: {
      fontSize: 12,
      color: colors.GRAY500,
      fontWeight: "600",
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(17,24,39,0.18)",
      justifyContent: "flex-end",
      padding: 16,
    },
    sheetCard: {
      backgroundColor: colors.WHITE,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 18,
      borderWidth: 1,
      borderColor: colors.GRAY200,
    },
    sheetHandle: {
      width: 42,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.GRAY300,
      alignSelf: "center",
      marginBottom: 12,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 4,
    },
    sheetSubtitle: {
      fontSize: 13,
      color: colors.GRAY500,
      marginBottom: 14,
    },
    sheetList: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      overflow: "hidden",
      backgroundColor: colors.GRAY50,
    },
    sheetParticipantRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.WHITE,
    },
    sheetParticipantRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.GRAY200,
    },
    sheetParticipantAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.GREEN_LT,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetParticipantAvatarImage: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.GRAY200,
    },
    sheetParticipantAvatarText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GREEN,
    },
    sheetParticipantTextWrap: {
      flex: 1,
    },
    sheetParticipantName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 2,
    },
    sheetParticipantMeta: {
      fontSize: 12,
      color: colors.GRAY500,
    },
    reviewCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      backgroundColor: colors.WHITE,
      padding: 12,
      marginBottom: 10,
    },
    reviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    reviewAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.GREEN_LT,
      alignItems: "center",
      justifyContent: "center",
    },
    reviewAvatarImage: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.GRAY200,
    },
    reviewAvatarText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GREEN,
    },
    reviewHeaderText: {
      flex: 1,
    },
    reviewAuthor: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 2,
    },
    reviewMeta: {
      fontSize: 12,
      color: colors.GRAY500,
    },
    reviewBody: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.GRAY700,
    },
    tagsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    tag: {
      backgroundColor: colors.GREEN_LT,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tagText: {
      color: colors.GREEN,
      fontSize: 13,
      fontWeight: "600",
    },
    portfolioImage: {
      width: 170,
      height: 100,
      borderRadius: 12,
      marginRight: 12,
      backgroundColor: colors.GRAY200,
    },
    pressed: {
      opacity: 0.88,
    },
  });

const profileActivityCardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    padding: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
    flex: 1,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GRAY100,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY600,
    flexShrink: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY600,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
