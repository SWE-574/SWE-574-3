/**
 * ActivityListScreen - paginated vertical list of one Activity tab.
 *
 * Opened when the user taps "View more" on any of the horizontal carousels
 * in ProfileScreen → Activity. The screen reuses the same card components
 * the carousel uses so the visual identity stays consistent.
 *
 * The five subcategories (offers, needs, events, history, reviews) fetch
 * from different endpoints, so we keep the fetch logic local to this screen
 * and switch on the `category` route param.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import { listServices } from "../../api/services";
import {
  getUserHistory,
  getVerifiedReviews,
  type ProfileReview,
} from "../../api/users";
import type { Service } from "../../api/types";
import {
  groupHistoryItems,
  isOwnHistoryItem,
} from "../../utils/historyGrouping";
import { isOngoingProfileService } from "../../utils/profileServices";
import {
  formatHours,
  formatShortDate,
  getInitials,
} from "../../utils/profileFormatters";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import ActivityServiceCard from "../components/profile/ActivityServiceCard";
import HistoryCard, {
  type HistoryEntry,
} from "../components/profile/HistoryCard";
import ReviewCard from "../components/profile/ReviewCard";

export type ActivityCategory =
  | "offers"
  | "needs"
  | "events"
  | "history"
  | "reviews";

type Nav = NativeStackNavigationProp<ProfileStackParamList, "ActivityList">;

const PAGE_SIZE = 10;
const REVIEW_PAGE_SIZE = 10;

const TITLES: Record<ActivityCategory, string> = {
  offers: "All offers",
  needs: "All needs",
  events: "All events",
  history: "Exchange history",
  reviews: "Reviews",
};

export default function ActivityListScreen() {
  const route =
    useRoute<RouteProp<ProfileStackParamList, "ActivityList">>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const category: ActivityCategory = route.params?.category ?? "offers";

  const [services, setServices] = useState<Service[]>([]);
  const [servicesHasMore, setServicesHasMore] = useState(false);
  const [servicesPage, setServicesPage] = useState(1);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<HistoryEntry | null>(null);

  const isServiceCategory =
    category === "offers" || category === "needs" || category === "events";

  const serviceTypeForCategory = useCallback(
    (cat: ActivityCategory): "Offer" | "Need" | "Event" | undefined => {
      if (cat === "offers") return "Offer";
      if (cat === "needs") return "Need";
      if (cat === "events") return "Event";
      return undefined;
    },
    [],
  );

  useEffect(() => {
    if (!user?.id) {
      // Clear any previously loaded private data so it doesn't linger
      // visibly after the user logs out while this screen is mounted
      // (#627 review).
      setServices([]);
      setServicesHasMore(false);
      setServicesPage(1);
      setHistoryEntries([]);
      setHistoryPage(1);
      setReviews([]);
      setReviewsCount(0);
      setReviewsHasMore(false);
      setReviewPage(1);
      setSelectedHistoryEntry(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setServicesPage(1);
    setHistoryPage(1);
    setReviewPage(1);

    const owner = String(user.id);

    if (isServiceCategory) {
      // Real server-side pagination: ask the backend for one page at a time
      // filtered by service type, so users with >PAGE_SIZE services are no
      // longer truncated at an arbitrary client-side ceiling (#627 review).
      const type = serviceTypeForCategory(category);
      listServices({ user: owner, type, page: 1, page_size: PAGE_SIZE })
        .then((res) => {
          if (cancelled) return;
          const rows = (res.results ?? [])
            .filter((s) => s.is_visible !== false)
            .filter(isOngoingProfileService);
          setServices(rows);
          setServicesHasMore(Boolean(res.next));
        })
        .catch(() => {
          if (!cancelled) setError("Could not load activity.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (category === "history") {
      getUserHistory(owner)
        .then((rows) => {
          if (!cancelled) {
            const grouped = groupHistoryItems(rows.filter(isOwnHistoryItem));
            setHistoryEntries(grouped);
          }
        })
        .catch(() => {
          if (!cancelled) setError("Could not load history.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (category === "reviews") {
      getVerifiedReviews(owner, {
        page: 1,
        page_size: REVIEW_PAGE_SIZE,
      })
        .then((response) => {
          if (cancelled) return;
          setReviews(response.results ?? []);
          setReviewsCount(response.count ?? 0);
          setReviewsHasMore(Boolean(response.next));
        })
        .catch(() => {
          if (!cancelled) setError("Could not load reviews.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id, category, isServiceCategory, serviceTypeForCategory]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore) return;

    if (isServiceCategory) {
      if (!servicesHasMore || !user?.id) return;
      const nextPage = servicesPage + 1;
      const type = serviceTypeForCategory(category);
      setLoadingMore(true);
      listServices({
        user: String(user.id),
        type,
        page: nextPage,
        page_size: PAGE_SIZE,
      })
        .then((res) => {
          const rows = (res.results ?? [])
            .filter((s) => s.is_visible !== false)
            .filter(isOngoingProfileService);
          setServices((prev) => [...prev, ...rows]);
          setServicesHasMore(Boolean(res.next));
          setServicesPage(nextPage);
        })
        .catch(() => {
          /* no-op: keep current list, paging stalls until next attempt */
        })
        .finally(() => setLoadingMore(false));
      return;
    }

    if (category === "reviews") {
      if (!reviewsHasMore || !user?.id) return;
      const nextPage = reviewPage + 1;
      setLoadingMore(true);
      getVerifiedReviews(String(user.id), {
        page: nextPage,
        page_size: REVIEW_PAGE_SIZE,
      })
        .then((response) => {
          setReviews((prev) => [...prev, ...(response.results ?? [])]);
          setReviewsHasMore(Boolean(response.next));
          setReviewPage(nextPage);
        })
        .catch(() => {
          /* no-op: keep current list, paging stalls until next attempt */
        })
        .finally(() => setLoadingMore(false));
      return;
    }

    // History endpoint returns the full list in one shot, so paginate
    // locally to keep render cost bounded.
    if (historyPage * PAGE_SIZE >= historyEntries.length) return;
    setHistoryPage((p) => p + 1);
  }, [
    loadingMore,
    isServiceCategory,
    servicesHasMore,
    servicesPage,
    category,
    serviceTypeForCategory,
    user?.id,
    reviewsHasMore,
    reviewPage,
    historyPage,
    historyEntries.length,
  ]);

  const visibleHistory = historyEntries.slice(0, historyPage * PAGE_SIZE);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.GREEN} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const empty = (
    <View style={styles.empty}>
      <Ionicons
        name="information-circle-outline"
        size={28}
        color={colors.GRAY400}
      />
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyText}>
        Items will appear here once you have more activity.
      </Text>
    </View>
  );

  const footer = loadingMore ? (
    <ActivityIndicator
      size="small"
      color={colors.GREEN}
      style={{ paddingVertical: 16 }}
    />
  ) : null;

  if (isServiceCategory) {
    return (
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ActivityServiceCard
            service={item}
            layout="vertical"
            onPress={() =>
              navigation.navigate("ServiceDetail", { id: item.id })
            }
          />
        )}
        contentContainerStyle={styles.list}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        testID={`activity-list-${category}`}
      />
    );
  }

  if (category === "history") {
    return (
      <>
        <FlatList
          data={visibleHistory}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <HistoryCard
              entry={item}
              layout="vertical"
              onPress={() =>
                navigation.navigate("ServiceDetail", { id: item.serviceId })
              }
              onPressParticipants={() => setSelectedHistoryEntry(item)}
            />
          )}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          testID="activity-list-history"
        />
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
              {(selectedHistoryEntry?.items ?? []).map((item, index) => (
                <View
                  key={`${item.partner_id}-${item.completed_date}-${index}`}
                  style={[
                    styles.participantRow,
                    index > 0 && styles.participantRowBorder,
                  ]}
                >
                  {item.partner_avatar_url ? (
                    <Image
                      source={{ uri: item.partner_avatar_url }}
                      style={styles.participantAvatarImage}
                    />
                  ) : (
                    <View style={styles.participantAvatarFallback}>
                      <Text style={styles.participantInitials}>
                        {getInitials(item.partner_name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.participantName}>
                      {item.partner_name}
                    </Text>
                    <Text style={styles.participantMeta}>
                      {formatShortDate(item.completed_date)} ·{" "}
                      {formatHours(item.duration)}
                    </Text>
                  </View>
                </View>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  // reviews
  return (
    <FlatList
      data={reviews}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ReviewCard review={item} layout="vertical" />
      )}
      contentContainerStyle={styles.list}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      ListHeaderComponent={
        reviewsCount ? (
          <Text style={styles.countHeader}>
            {reviewsCount} review{reviewsCount !== 1 ? "s" : ""}
          </Text>
        ) : null
      }
      testID="activity-list-reviews"
    />
  );
}

export const ACTIVITY_LIST_TITLES = TITLES;

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.GRAY50,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.GRAY800,
  },
  emptyText: {
    fontSize: 13,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 19,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.RED,
  },
  countHeader: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.GRAY500,
    marginBottom: 8,
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
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  participantRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.GRAY200,
  },
  participantAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.GRAY200,
  },
  participantAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  participantInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GREEN,
  },
  participantName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 2,
  },
  participantMeta: {
    fontSize: 12,
    color: colors.GRAY500,
  },
});
