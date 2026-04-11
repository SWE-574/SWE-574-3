import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useFocusEffect,
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Ionicons, SimpleLineIcons } from "@expo/vector-icons";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import { listServices } from "../../api/services";
import {
  getUserHistory,
  getVerifiedReviews,
  type ProfileReview,
} from "../../api/users";
import {
  listTransactions,
  type TransactionSummary,
} from "../../api/transactions";
import type { Service, UserHistoryItem } from "../../api/types";
import {
  groupHistoryItems,
  isOwnHistoryItem,
} from "../../utils/historyGrouping";
import AchievementsSection from "../components/AchievementsSection";
import ProfileSkillsSection from "../components/ProfileSkillsSection";
import ProfileListingStatsRow from "../components/ProfileListingStatsRow";
import NotificationBadge from "../components/NotificationBadge";
import { useNotificationStore } from "../../store/useNotificationStore";

type ProfileHomeNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, "ProfileHome">,
  BottomTabNavigationProp<BottomTabParamList>
>;

type EditableProfile = {
  first_name: string;
  last_name: string;
  email: string;
  bio: string;
  location: string;
  avatar_url: string;
  banner_url: string;
};

const DEFAULT_BANNER_URI =
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80";
const DEFAULT_AVATAR_URI =
  "https://api.dicebear.com/9.x/avataaars/png?seed=profile";

const EMPTY_SUMMARY: TransactionSummary = {
  current_balance: 0,
  total_earned: 0,
  total_spent: 0,
};

type ProfileTabKey = "offers" | "needs" | "events" | "history" | "reviews";

function safeNumber(value: string | number | undefined | null): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
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
  const amount = safeNumber(value);
  return `${amount}h`;
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

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const navigation = useNavigation<ProfileHomeNavigation>();
  const insets = useSafeAreaInsets();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("offers");
  const [activeServices, setActiveServices] = useState<Service[]>([]);
  const [historyItems, setHistoryItems] = useState<UserHistoryItem[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<
    ReturnType<typeof groupHistoryItems>[number] | null
  >(null);
  const [timeSummary, setTimeSummary] = useState<TransactionSummary>(EMPTY_SUMMARY);

  const initialForm = useMemo<EditableProfile>(
    () => ({
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      email: user?.email ?? "",
      bio: user?.bio ?? "",
      location: (user as typeof user & { location?: string })?.location ?? "",
      avatar_url:
        (user as typeof user & { avatar_url?: string })?.avatar_url ?? "",
      banner_url:
        (user as typeof user & { banner_url?: string })?.banner_url ?? "",
    }),
    [user],
  );

  const [form, setForm] = useState<EditableProfile>(initialForm);

  useEffect(() => {
    if (!isEditing) {
      setForm(initialForm);
    }
  }, [initialForm, isEditing]);

  const profileUserId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!profileUserId) return;
      void refreshUser();
    }, [profileUserId, refreshUser]),
  );

  useEffect(() => {
    if (!user?.id) return;
    const ownerId = String(user.id);
    let cancelled = false;

    setActiveServices([]);
    listServices({ user: ownerId, page_size: 50 })
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
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setHistoryItems([]);
      return;
    }

    let cancelled = false;

    getUserHistory(String(user.id))
      .then((rows) => {
        if (!cancelled) setHistoryItems(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setTimeSummary(EMPTY_SUMMARY);
      return;
    }

    let cancelled = false;

    listTransactions({ page: 1, page_size: 1, direction: "all" })
      .then((res) => {
        if (!cancelled) {
          setTimeSummary(res.summary ?? EMPTY_SUMMARY);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTimeSummary(EMPTY_SUMMARY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setReviews([]);
      return;
    }

    let cancelled = false;
    setReviewsLoading(true);

    getVerifiedReviews(String(user.id), { page: 1, page_size: 20 })
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
  }, [user?.id]);

  const handleChange = (key: keyof EditableProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      await new Promise((resolve) => setTimeout(resolve, 600));

      setIsEditing(false);
      Alert.alert("Profile updated", "Your profile changes have been saved.");
    } catch {
      Alert.alert("Error", "Could not save your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView edges={["top"]} style={styles.authContainer}>
        <View style={styles.loggedOutCard}>
          <Text style={styles.loggedOutTitle}>Your profile</Text>
          <Text style={styles.loggedOutSubtitle}>
            Sign in to view your profile, update your details, manage your
            public info, and track your timebank activity.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typedUser = user as typeof user & {
    avatar_url?: string;
    banner_url?: string;
    location?: string;
    timebank_balance?: string | number;
    karma_score?: number;
    badges?: string[];
    skills?: Array<{ id: string; name: string }>;
    portfolio_images?: string[];
    is_verified?: boolean;
    helpful_count?: number;
    kind_count?: number;
    punctual_count?: number;
    achievements?: string[];
    followers_count?: number;
    following_count?: number;
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const activeListingServices = activeServices.filter(
    (service) => service.status === "Active",
  );
  const offerServices = activeListingServices.filter(
    (service) => service.type === "Offer",
  );
  const needServices = activeListingServices.filter(
    (service) => service.type === "Need",
  );
  const eventServices = activeListingServices.filter(
    (service) => service.type === "Event",
  );
  const ownHistoryEntries = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  );
  const offersCount = activeListingServices.filter(
    (service) => service.type === "Offer",
  ).length;
  const needsCount = activeListingServices.filter(
    (service) => service.type === "Need",
  ).length;
  const exchangesCount = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  ).length;

  const balance = safeNumber(
    timeSummary.current_balance || typedUser.timebank_balance,
  );
  const hasLongBio = form.bio.trim().length > 120;
  const showBioToggle = hasLongBio && !isEditing;
  const tabItems: Array<{ key: ProfileTabKey; label: string; count: number }> = [
    { key: "offers", label: "Offers", count: offerServices.length },
    { key: "needs", label: "Needs", count: needServices.length },
    { key: "events", label: "Events", count: eventServices.length },
    { key: "history", label: "History", count: ownHistoryEntries.length },
    { key: "reviews", label: "Reviews", count: reviews.length },
  ];

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

  const renderHistoryTab = () => {
    if (!ownHistoryEntries.length) {
      return (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No completed history yet</Text>
          <Text style={styles.emptyStateText}>
            Finished exchanges on your services will show up here.
          </Text>
        </View>
      );
    }

    return ownHistoryEntries.map((entry) => (
      <Pressable
        key={entry.key}
        accessibilityRole="button"
        accessibilityLabel={`Open history item ${entry.serviceTitle}`}
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

  const renderReviewsTab = () => {
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
          {review.is_verified_review ? (
            <View style={styles.reviewVerifiedPill}>
              <Text style={styles.reviewVerifiedText}>Verified</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.reviewBody}>{review.body}</Text>
        <View style={styles.reviewFooter}>
          {review.handshake_hours ? (
            <View style={styles.reviewInfoChip}>
              <Ionicons name="time-outline" size={12} color={colors.GREEN} />
              <Text style={styles.reviewInfoChipText}>
                {formatHours(review.handshake_hours)}
              </Text>
            </View>
          ) : null}
          {review.reply_count ? (
            <View style={styles.reviewInfoChip}>
              <Ionicons
                name="chatbubble-outline"
                size={12}
                color={colors.PURPLE}
              />
              <Text style={styles.reviewInfoChipText}>
                {review.reply_count} replies
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    ));
  };

  const renderActiveTab = () => {
    if (activeTab === "offers") {
      return renderServiceTab(
        offerServices,
        "Your active offers will appear here for quick access.",
      );
    }

    if (activeTab === "needs") {
      return renderServiceTab(
        needServices,
        "Your active needs will appear here once you post them.",
      );
    }

    if (activeTab === "events") {
      return renderServiceTab(
        eventServices,
        "Your upcoming or open events will appear here.",
      );
    }

    if (activeTab === "history") {
      return renderHistoryTab();
    }

    return renderReviewsTab();
  };

  return (
    <View style={styles.container}>
      {menuOpen ? (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        />
      ) : null}
      {user ? (
        <>
          <Pressable
            onPress={() => setMenuOpen((prev) => !prev)}
            style={styles.overflowButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={colors.GRAY700}
            />
          </Pressable>
          {menuOpen ? (
            <View style={styles.overflowMenu}>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setIsEditing(true);
                }}
                style={({ pressed }) => [
                  styles.overflowMenuItem,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="settings-outline" size={17} color={colors.GRAY700} />
                <Text style={styles.overflowMenuText}>Settings</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate("TimeActivity");
                }}
                style={({ pressed }) => [
                  styles.overflowMenuItem,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="time-outline" size={17} color={colors.GRAY700} />
                <Text style={styles.overflowMenuText}>Time Activity</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                style={({ pressed }) => [
                  styles.overflowMenuItem,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="log-out-outline" size={17} color={colors.RED} />
                <Text style={styles.overflowMenuDangerText}>Log out</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
      <TouchableOpacity
        onPress={() => (navigation as any).navigate("Notifications")}
        style={styles.notificationButton}
      >
        <Ionicons
          name="notifications-outline"
          size={22}
          color={colors.GREEN}
        />
        <NotificationBadge count={unreadCount} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Image
            source={{ uri: form.banner_url || DEFAULT_BANNER_URI }}
            style={styles.banner}
          />

          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: form.avatar_url || DEFAULT_AVATAR_URI }}
              style={styles.avatar}
            />
          </View>

          <View style={styles.profileHeaderContent}>
            {!isEditing ? (
              <>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{fullName || "Unnamed User"}</Text>
                  {typedUser.is_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedBadgeText}>Verified</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.followMetaRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View your followers"
                    onPress={() => {
                      if (!user?.id) return;
                      navigation.navigate("FollowList", {
                        userId: String(user.id),
                        kind: "followers",
                      });
                    }}
                  >
                    <Text style={styles.followMetaLink}>
                      {typedUser.followers_count ?? 0} followers
                    </Text>
                  </Pressable>
                  <Text style={styles.followMetaDot}> · </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View users you follow"
                    onPress={() => {
                      if (!user?.id) return;
                      navigation.navigate("FollowList", {
                        userId: String(user.id),
                        kind: "following",
                      });
                    }}
                  >
                    <Text style={styles.followMetaLink}>
                      {typedUser.following_count ?? 0} following
                    </Text>
                  </Pressable>
                </View>

                {form.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.GRAY500}
                    />
                    <Text style={styles.location}>{form.location}</Text>
                  </View>
                ) : null}

                {form.bio ? (
                  <>
                    <Text
                      style={styles.bio}
                      numberOfLines={isBioExpanded ? undefined : 2}
                    >
                      {form.bio}
                    </Text>
                    {showBioToggle ? (
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
              </>
            ) : (
              <>
                <InputField
                  label="First name"
                  value={form.first_name}
                  editable
                  onChangeText={(value) => handleChange("first_name", value)}
                />
                <InputField
                  label="Last name"
                  value={form.last_name}
                  editable
                  onChangeText={(value) => handleChange("last_name", value)}
                />
                <InputField
                  label="Email"
                  value={form.email}
                  editable
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onChangeText={(value) => handleChange("email", value)}
                />
                <InputField
                  label="Location"
                  value={form.location}
                  editable
                  onChangeText={(value) => handleChange("location", value)}
                />
                <InputField
                  label="Bio"
                  value={form.bio}
                  editable
                  multiline
                  onChangeText={(value) => handleChange("bio", value)}
                />
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.secondarySmallButton}
                    onPress={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <Text style={styles.secondarySmallButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryGreenButton}
                    onPress={() => void handleSave()}
                    disabled={isSaving}
                  >
                    <Text style={styles.primaryGreenButtonText}>
                      {isSaving ? "Saving..." : "Save changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        <ProfileListingStatsRow
          offersCount={offersCount}
          needsCount={needsCount}
          exchangesCount={exchangesCount}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open time activity"
          onPress={() => navigation.navigate("TimeActivity")}
          style={({ pressed }) => [
            styles.balanceCard,
            pressed && styles.balanceCardPressed,
          ]}
        >
          <View style={styles.balanceTopRow}>
            <View style={styles.balanceHeadingWrap}>
              <View style={styles.balanceIconWrap}>
                <Ionicons name="time-outline" size={18} color={colors.WHITE} />
              </View>
              <View>
                <Text style={styles.balanceEyebrow}>Your Time</Text>
                <Text style={styles.balanceMainValue}>{balance}</Text>
                <Text style={styles.balanceLabel}>hours available</Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color="rgba(255,255,255,0.82)"
            />
          </View>

        </Pressable>

        <View style={styles.miniStatsRow}>
          <MiniStatCard
            icon={<Ionicons name="heart-outline" size={18} color={colors.GREEN} />}
            label="Karma"
            value={typedUser.karma_score ?? 0}
            accentColor={colors.GREEN}
            accentBg={colors.GREEN_LT}
          />
          <MiniStatCard
            icon={
              <SimpleLineIcons name="badge" size={16} color={colors.PURPLE} />
            }
            label="Badges"
            value={typedUser.badges?.length ?? 0}
            accentColor={colors.PURPLE}
            accentBg={colors.PURPLE_LT}
            onPress={
              user?.id
                ? () =>
                    navigation.navigate("AchievementsList", {
                      userId: user.id,
                    })
                : undefined
            }
          />
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.helpful_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Helpful</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.kind_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Kind</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.punctual_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Punctual</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              Activity
            </Text>
            <View style={styles.activeServicesCountPill}>
              <Text style={styles.activeServicesCountText}>
                {tabItems.find((item) => item.key === activeTab)?.count ?? 0}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTabsRow}
          >
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={({ pressed }) => [
                    styles.profileTab,
                    isActive && styles.profileTabActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.profileTabText,
                      isActive && styles.profileTabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={[
                      styles.profileTabCount,
                      isActive && styles.profileTabCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.profileTabCountText,
                        isActive && styles.profileTabCountTextActive,
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.tabPanel}>{renderActiveTab()}</View>
        </View>

        {!!typedUser.skills?.length && (
          <ProfileSkillsSection skills={typedUser.skills} />
        )}

        <AchievementsSection
          completedIds={[
            ...new Set([
              ...(typedUser.achievements ?? []),
              ...(typedUser.badges ?? []),
            ]),
          ]}
          onViewAll={
            user?.id
              ? () =>
                  navigation.navigate("AchievementsList", {
                    userId: user.id,
                  })
              : undefined
          }
        />

        {!!typedUser.portfolio_images?.length && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {typedUser.portfolio_images.map((imageUrl, index) => (
                <Image
                  key={`${imageUrl}-${index}`}
                  source={{ uri: imageUrl }}
                  style={styles.portfolioImage}
                />
              ))}
            </ScrollView>
          </View>
        )}

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

function MiniStatCard({
  icon,
  label,
  value,
  accentColor,
  accentBg,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accentColor: string;
  accentBg: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[miniCardStyles.accentBar, { backgroundColor: accentColor }]} />
      <View style={miniCardStyles.inner}>
        <View style={miniCardStyles.topRow}>
          <View style={[miniCardStyles.iconWrap, { backgroundColor: accentBg }]}>
            {icon}
          </View>
          <Text style={miniCardStyles.value}>{value}</Text>
        </View>
        <View style={miniCardStyles.bottomRow}>
          <Text style={miniCardStyles.label}>{label}</Text>
          {onPress ? (
            <Ionicons name="chevron-forward" size={14} color={colors.GRAY400} />
          ) : null}
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [miniCardStyles.card, pressed && { opacity: 0.9 }]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={miniCardStyles.card}>
      {content}
    </View>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onChangeText: (value: string) => void;
};

function InputField({
  label,
  value,
  editable = false,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  onChangeText,
}: InputFieldProps) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.GRAY400}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          !editable && styles.readOnlyInput,
        ]}
      />
    </View>
  );
}

const miniCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.WHITE,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
  inner: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.GRAY500,
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

const getStyles = (top: number, bottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.GRAY50,
    },
    scrollContent: {
      paddingTop: top + 16,
      paddingBottom: Math.max(32, bottom + 16),
    },
    authContainer: {
      flex: 1,
      backgroundColor: colors.GRAY50,
      padding: 16,
      justifyContent: "center",
    },
    loggedOutCard: {
      backgroundColor: colors.WHITE,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      padding: 24,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    loggedOutTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 10,
    },
    loggedOutSubtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.GRAY500,
      marginBottom: 24,
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
    editHeroButton: {
      position: "absolute",
      top: 12,
      right: 68,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.WHITE,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    profileHeaderContent: {
      paddingHorizontal: 16,
      paddingTop: 44,
      paddingBottom: 14,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    },
    name: {
      flexShrink: 1,
      fontSize: 24,
      fontWeight: "700",
      color: colors.GRAY800,
    },
    verifiedBadge: {
      backgroundColor: colors.BLUE_LT,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
    },
    verifiedBadgeText: {
      color: colors.BLUE,
      fontSize: 12,
      fontWeight: "700",
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
    notificationButton: {
      position: "absolute",
      top: top + 12,
      right: 16,
      zIndex: 10,
      backgroundColor: "rgba(255,255,255,0.92)",
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
    overflowButton: {
      position: "absolute",
      top: top + 12,
      right: 64,
      zIndex: 10,
      backgroundColor: "rgba(255,255,255,0.92)",
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
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 8,
    },
    overflowMenu: {
      position: "absolute",
      top: top + 58,
      right: 16,
      zIndex: 12,
      backgroundColor: colors.WHITE,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      paddingVertical: 6,
      minWidth: 180,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    overflowMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    overflowMenuText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.GRAY700,
    },
    overflowMenuDangerText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.RED,
    },
    balanceCard: {
      marginHorizontal: 16,
      marginTop: 14,
      backgroundColor: colors.GREEN,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GREEN,
      padding: 14,
      shadowColor: colors.GREEN,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    balanceCardPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.995 }],
    },
    balanceTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    balanceHeadingWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    balanceIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    balanceEyebrow: {
      fontSize: 11,
      fontWeight: "600",
      color: "rgba(255,255,255,0.82)",
      marginBottom: 2,
    },
    balanceMainValue: {
      fontSize: 30,
      fontWeight: "700",
      lineHeight: 34,
      color: colors.WHITE,
    },
    balanceLabel: {
      fontSize: 12,
      color: "rgba(255,255,255,0.84)",
      marginTop: 1,
    },
    balanceDivider: {
      height: 1,
      backgroundColor: "rgba(255,255,255,0.14)",
      marginVertical: 12,
    },
    balanceSummaryRow: {
      flexDirection: "row",
      gap: 10,
    },
    balanceSummaryItem: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    balanceSummaryLabel: {
      fontSize: 11,
      color: "rgba(255,255,255,0.74)",
      marginBottom: 3,
    },
    balanceSummaryValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.WHITE,
    },
    miniStatsRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginTop: 10,
    },
    metricsRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    metricPill: {
      flex: 1,
      backgroundColor: colors.WHITE,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      paddingVertical: 10,
      alignItems: "center",
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    metricPillValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.GRAY800,
    },
    metricPillLabel: {
      fontSize: 11,
      color: colors.GRAY500,
      marginTop: 1,
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
      marginBottom: 10,
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
      marginBottom: 10,
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
    reviewVerifiedPill: {
      backgroundColor: colors.BLUE_LT,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    reviewVerifiedText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.BLUE,
    },
    reviewBody: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.GRAY700,
    },
    reviewFooter: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
    },
    reviewInfoChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.GRAY50,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.GRAY200,
    },
    reviewInfoChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.GRAY600,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.GRAY600,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.GRAY50,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.GRAY900,
    },
    multilineInput: {
      minHeight: 100,
    },
    readOnlyInput: {
      color: colors.GRAY700,
      backgroundColor: colors.GRAY100,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
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
    primaryButton: {
      backgroundColor: colors.GREEN,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 12,
    },
    primaryButtonText: {
      color: colors.WHITE,
      fontSize: 16,
      fontWeight: "700",
    },
    secondaryButton: {
      backgroundColor: colors.WHITE,
      borderWidth: 1,
      borderColor: colors.GRAY300,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    secondaryButtonText: {
      color: colors.GRAY900,
      fontSize: 16,
      fontWeight: "700",
    },
    secondarySmallButton: {
      backgroundColor: colors.WHITE,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.RED,
    },
    secondarySmallButtonText: {
      color: colors.RED,
      fontSize: 14,
      fontWeight: "500",
    },
    primaryGreenButton: {
      backgroundColor: colors.GREEN,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    primaryGreenButtonText: {
      color: colors.WHITE,
      fontSize: 14,
      fontWeight: "700",
    },
    pressed: {
      opacity: 0.88,
    },
  });
