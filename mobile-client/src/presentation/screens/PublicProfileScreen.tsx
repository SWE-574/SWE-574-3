import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { getUser, getUserHistory } from "../../api/users";
import { listServices } from "../../api/services";
import type { PublicUserProfile, Service, UserHistoryItem } from "../../api/types";
import { groupHistoryItems, isOwnHistoryItem } from "../../utils/historyGrouping";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import AchievementsSection from "../components/AchievementsSection";
import ProfileListingStatsRow from "../components/ProfileListingStatsRow";
import ServiceCard from "../components/ServiceCard";

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
  const a = user.achievements ?? [];
  const b = user.badges ?? [];
  if (a.length === 0 && b.length === 0) return [];
  return [...new Set([...a, ...b])];
}

export default function PublicProfileScreen() {
  const route = useRoute<RouteProp<ProfileStackParamList, "PublicProfile">>();
  const navigation = useNavigation<PublicProfileNavigation>();
  const { user: authUser } = useAuth();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeServices, setActiveServices] = useState<Service[]>([]);
  const [activeServicesOpen, setActiveServicesOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<UserHistoryItem[]>([]);

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
    setActiveServicesOpen(false);
    listServices({ user: userId, page_size: 50 })
      .then((res) => {
        if (cancelled) return;
        const rows = res.results ?? [];
        const visible = rows.filter((s) => s.is_visible !== false);
        setActiveServices(visible);
      })
      .catch(() => {
        if (!cancelled) setActiveServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (state.status === "loading" || state.status === "error") {
      setHistoryItems([]);
      return;
    }
    if (state.status !== "success") return;
    if (!state.user.show_history) {
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
    user.bio != null && String(user.bio).trim() ? String(user.bio) : null;

  const locationText =
    user.location != null && String(user.location).trim()
      ? String(user.location).trim()
      : null;

  const joinedDate =
    user.date_joined != null && String(user.date_joined).trim()
      ? (() => {
          const d = new Date(user.date_joined as string);
          return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
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
      (s) => s?.id && s?.name && String(s.name).trim().length > 0,
    ) ?? [];

  const portfolioUrls =
    user.portfolio_images?.filter(
      (u) => typeof u === "string" && u.trim().length > 0,
    ) ?? [];

  const achievementIds = achievementIdsForDisplay(user);
  const canOpenAchievementsList =
    authUser?.id != null && String(authUser.id) === String(user.id);

  const offersCount = activeServices.filter((s) => s.type === "Offer").length;
  const needsCount = activeServices.filter((s) => s.type === "Need").length;
  const exchangesCount = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  ).length;

  return (
    <View style={styles.container}>
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
            </View>

            {locationText ? (
              <Text style={styles.location}>{locationText}</Text>
            ) : null}

            {bioText ? <Text style={styles.bio}>{bioText}</Text> : null}
          </View>
        </View>

        <ProfileListingStatsRow
          offersCount={offersCount}
          needsCount={needsCount}
          exchangesCount={exchangesCount}
        />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="heart-outline" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>{user.karma_score ?? 0}</Text>
            </View>
            <Text style={styles.statLabel}>karma</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <SimpleLineIcons name="badge" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>
                {user.badges?.length ?? 0}
              </Text>
            </View>
            <Text style={styles.statLabel}>Badges</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="star-outline" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>
                {user.achievements?.length ?? 0}
              </Text>
            </View>
            <Text style={styles.statLabel}>Achievements</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {user.helpful_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Helpful</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>{user.kind_count ?? 0}</Text>
            <Text style={styles.metricPillLabel}>Kind</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {user.punctual_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Punctual</Text>
          </View>
        </View>

        {joinedDate ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Member since</Text>
            <Text style={styles.joinedValue}>{joinedDate}</Text>
          </View>
        ) : null}

        {activeServices.length > 0 ? (
          <View style={styles.sectionCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Active services"
              accessibilityHint={
                activeServicesOpen
                  ? "Double tap to collapse the list"
                  : "Double tap to expand the list"
              }
              accessibilityState={{ expanded: activeServicesOpen }}
              onPress={() => setActiveServicesOpen((open) => !open)}
              style={({ pressed }) => [
                styles.activeServicesAccordionHeader,
                activeServicesOpen && styles.activeServicesAccordionHeaderOpen,
                pressed && styles.activeServicesAccordionHeaderPressed,
              ]}
            >
              <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                Active services
              </Text>
              <View style={styles.activeServicesHeaderTrailing}>
                <View style={styles.activeServicesCountPill}>
                  <Text style={styles.activeServicesCountText}>
                    {activeServices.length}
                  </Text>
                </View>
                <Ionicons
                  name={activeServicesOpen ? "chevron-up" : "chevron-down"}
                  size={22}
                  color={colors.GRAY700}
                />
              </View>
            </Pressable>
            {activeServicesOpen
              ? activeServices.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open service ${service.title}`}
                    onPress={() =>
                      navigation.navigate("Home", {
                        screen: "ServiceDetail",
                        params: { id: service.id },
                      })
                    }
                    style={({ pressed }) => [
                      styles.serviceCardPressable,
                      pressed && styles.serviceCardPressablePressed,
                    ]}
                  >
                    <ServiceCard
                      service={service}
                      style={styles.serviceCardInProfile}
                    />
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}

        {skills.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.tagsWrap}>
              {skills.map((skill) => (
                <View key={skill.id} style={styles.tag}>
                  <Text style={styles.tagText}>{skill.name}</Text>
                </View>
              ))}
            </View>
          </View>
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
    </View>
  );
}

const getStyles = (top: number, bottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.GRAY100,
    },
    mutedBackground: {
      backgroundColor: colors.GRAY100,
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
      borderRadius: 28,
      overflow: "hidden",
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    banner: {
      width: "100%",
      height: 150,
      backgroundColor: colors.GRAY200,
    },
    avatarWrapper: {
      position: "absolute",
      top: 98,
      left: 20,
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.WHITE,
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.GRAY200,
    },
    profileHeaderContent: {
      paddingHorizontal: 20,
      paddingTop: 62,
      paddingBottom: 20,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    },
    name: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.GRAY900,
    },
    location: {
      fontSize: 14,
      color: colors.GRAY500,
      marginBottom: 10,
    },
    bio: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.GRAY700,
      marginBottom: 4,
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      marginTop: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.WHITE,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.GREEN,
    },
    statIconWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    statValue: {
      color: colors.GREEN,
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 4,
    },
    statLabel: {
      color: colors.GRAY500,
      fontSize: 13,
      fontWeight: "400",
    },
    metricsRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    metricPill: {
      flex: 1,
      backgroundColor: colors.WHITE,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    metricPillValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.GRAY900,
    },
    metricPillLabel: {
      fontSize: 12,
      color: colors.GRAY500,
      marginTop: 2,
    },
    sectionCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 24,
      padding: 18,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.GRAY900,
      marginBottom: 10,
    },
    sectionTitleInline: {
      marginBottom: 0,
    },
    activeServicesAccordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
      marginHorizontal: -4,
      paddingHorizontal: 4,
      borderRadius: 12,
    },
    activeServicesAccordionHeaderOpen: {
      marginBottom: 12,
    },
    activeServicesAccordionHeaderPressed: {
      opacity: 0.75,
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
      borderRadius: 14,
      marginBottom: 12,
    },
    serviceCardPressablePressed: {
      opacity: 0.92,
    },
    serviceCardInProfile: {
      marginHorizontal: 0,
      marginBottom: 0,
    },
    joinedValue: {
      fontSize: 15,
      color: colors.GRAY700,
      fontWeight: "600",
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
      height: 110,
      borderRadius: 16,
      marginRight: 12,
      backgroundColor: colors.GRAY200,
    },
  });
