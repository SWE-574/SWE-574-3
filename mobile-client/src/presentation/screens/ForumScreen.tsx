import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumCategory, ForumTopic } from "../../api/forum";
import { getMyActivity, listCategories, listTopics } from "../../api/forum";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import TopicCard from "../components/TopicCard";
import type { ForumStackParamList } from "../../navigation/ForumStack";

type ForumNavProp = NativeStackNavigationProp<ForumStackParamList, "ForumFeed">;
type SortOption = "newest" | "most_active";

type CategoryFilterItem = {
  id: string;
  slug: string | null;
  name: string;
  icon: string;
  color: string;
  topic_count: number;
  description: string;
};

const PAGE_SIZE = 20;
const FEATURED_TOPICS_LIMIT = 5;

function sortTopics(topics: ForumTopic[], sort: SortOption): ForumTopic[] {
  const pinned = topics.filter((topic) => topic.is_pinned);
  const rest = topics
    .filter((topic) => !topic.is_pinned)
    .sort((a, b) =>
      sort === "most_active"
        ? new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  return [...pinned, ...rest];
}

function getCategoryTone(color: string) {
  switch (color) {
    case "blue":
      return { bg: colors.BLUE, light: colors.BLUE_LT };
    case "purple":
      return { bg: colors.PURPLE, light: colors.PURPLE_LT };
    case "amber":
    case "orange":
      return { bg: colors.AMBER, light: colors.AMBER_LT };
    case "red":
      return { bg: colors.RED, light: colors.RED_LT };
    case "green":
    default:
      return { bg: colors.GREEN, light: colors.GREEN_LT };
  }
}

function getCategoryIconName(icon: string) {
  switch (icon) {
    case "book-open":
      return "book-outline" as const;
    case "calendar":
      return "calendar-outline" as const;
    case "users":
      return "people-outline" as const;
    case "star":
      return "star-outline" as const;
    case "lightbulb":
      return "bulb-outline" as const;
    case "globe":
      return "globe-outline" as const;
    case "code":
      return "code-slash-outline" as const;
    case "heart":
      return "heart-outline" as const;
    case "home":
      return "home-outline" as const;
    case "tool":
      return "construct-outline" as const;
    case "award":
      return "trophy-outline" as const;
    case "message-square":
    default:
      return "chatbubble-ellipses-outline" as const;
  }
}

export default function ForumScreen() {
  const navigation = useNavigation<ForumNavProp>();
  const { isAuthenticated, user } = useAuth();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendingTopics, setTrendingTopics] = useState<ForumTopic[]>([]);
  const [ownActiveTopics, setOwnActiveTopics] = useState<ForumTopic[]>([]);
  const [myTopicCount, setMyTopicCount] = useState(0);
  const [myReplyCount, setMyReplyCount] = useState(0);
  const [showOwnActiveTopics, setShowOwnActiveTopics] = useState(false);
  const listRef = useRef<FlatList<ForumTopic>>(null);
  const categoryListRef = useRef<FlatList<CategoryFilterItem>>(null);
  const fetchingRef = useRef(false);
  const categoriesSectionY = useRef(0);

  useEffect(() => {
    listCategories()
      .then((data) =>
        setCategories(
          data
            .filter((category) => category.is_active)
            .sort((a, b) => a.display_order - b.display_order)
        )
      )
      .catch(() => {
        // categories are non-critical
      });
  }, []);

  const fetchTopics = useCallback(
    async (pageNum: number, replace: boolean, currentSort: SortOption) => {
      if (fetchingRef.current) return;

      fetchingRef.current = true;
      if (replace) setLoading(true);
      setError(null);

      try {
        const response = await listTopics({
          page: pageNum,
          page_size: PAGE_SIZE,
          ...(selectedCategory ? { category: selectedCategory } : {}),
        });

        const nextResults = sortTopics(response.results, currentSort);
        setTopics((prev) => (replace ? nextResults : [...prev, ...nextResults]));
        setHasMore(response.next !== null);
        setPage(pageNum);
      } catch {
        setError("Failed to load topics. Tap to retry.");
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [selectedCategory]
  );

  const fetchTrendingTopics = useCallback(async () => {
    try {
      const response = await listTopics({
        page: 1,
        page_size: FEATURED_TOPICS_LIMIT,
      });
      setTrendingTopics(sortTopics(response.results, "most_active"));
    } catch {
      setTrendingTopics([]);
    }
  }, []);

  const fetchOwnActiveTopics = useCallback(async () => {
    if (!user) {
      setOwnActiveTopics([]);
      setMyTopicCount(0);
      setMyReplyCount(0);
      return;
    }

    try {
      const activity = await getMyActivity();
      setOwnActiveTopics(sortTopics(activity.open_topic_items ?? [], "most_active"));
      setMyTopicCount(activity.my_topics);
      setMyReplyCount(activity.my_replies);
    } catch {
      setOwnActiveTopics([]);
      setMyTopicCount(0);
      setMyReplyCount(0);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchTopics(1, true, sort);
      fetchTrendingTopics();
      fetchOwnActiveTopics();
    }, [fetchOwnActiveTopics, fetchTopics, fetchTrendingTopics, sort])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTopics(1, true, sort),
      fetchTrendingTopics(),
      fetchOwnActiveTopics(),
    ]);
    setRefreshing(false);
  }, [fetchOwnActiveTopics, fetchTopics, fetchTrendingTopics, sort]);

  const handleLoadMore = useCallback(() => {
    if (!showOwnActiveTopics && !loading && !fetchingRef.current && hasMore) {
      fetchTopics(page + 1, false, sort);
    }
  }, [fetchTopics, hasMore, loading, page, showOwnActiveTopics, sort]);

  const selectedCategoryInfo = useMemo(
    () => categories.find((category) => category.slug === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  const totalTopicCount = useMemo(
    () => categories.reduce((sum, category) => sum + category.topic_count, 0),
    [categories]
  );

  const categoryData = useMemo<CategoryFilterItem[]>(
    () => [
      {
        id: "__all__",
        slug: null,
        name: "All topics",
        icon: "home",
        color: "green",
        topic_count: totalTopicCount,
        description: "Browse the full community stream",
      },
      ...categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        icon: category.icon,
        color: category.color,
        topic_count: category.topic_count,
        description: category.description,
      })),
    ],
    [categories, totalTopicCount]
  );

  const scrollToCategories = useCallback(() => {
    listRef.current?.scrollToOffset({
      offset: Math.max(0, categoriesSectionY.current - 8),
      animated: true,
    });
  }, []);

  const openCreateTopic = useCallback(() => {
    if (selectedCategoryInfo) {
      navigation.navigate("CreateTopic", { categoryId: selectedCategoryInfo.id });
      return;
    }
    navigation.navigate("CreateTopic");
  }, [navigation, selectedCategoryInfo]);

  const displayTopics = useMemo(
    () => (showOwnActiveTopics ? ownActiveTopics : topics),
    [ownActiveTopics, showOwnActiveTopics, topics]
  );

  const scrollCategoryIntoView = useCallback((index: number) => {
    setTimeout(() => {
      categoryListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      });
    }, 50);
  }, []);

  const renderCategoryCard = useCallback(
    ({ item, index }: { item: CategoryFilterItem; index: number }) => {
      const isSelected =
        item.slug === null ? selectedCategory === null : selectedCategory === item.slug;
      const tone = getCategoryTone(item.color);

      return (
        <Pressable
          style={[
            styles.categoryCard,
            isSelected && {
              borderColor: tone.bg,
              backgroundColor: tone.light,
            },
          ]}
          onPress={() => {
            setShowOwnActiveTopics(false);
            setSelectedCategory(item.slug);
            scrollToCategories();
            scrollCategoryIntoView(index);
          }}
        >
          <View
            style={[
              styles.categoryCardIcon,
              { backgroundColor: isSelected ? tone.bg : colors.GRAY100 },
            ]}
          >
            <Ionicons
              name={getCategoryIconName(item.icon)}
              size={16}
              color={isSelected ? colors.WHITE : colors.GRAY500}
            />
          </View>
          <View style={styles.categoryCardTextWrap}>
            <Text
              style={[
                styles.categoryCardTitle,
                isSelected && { color: tone.bg },
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text style={styles.categoryCardMeta}>
              {item.topic_count} topic{item.topic_count === 1 ? "" : "s"}
            </Text>
          </View>
        </Pressable>
      );
    },
    [selectedCategory]
  );

  const renderFeaturedTopic = useCallback(
    ({ item }: { item: ForumTopic }) => {
      const tone = getCategoryTone(
        categories.find((category) => category.slug === item.category_slug)?.color ?? "green"
      );

      return (
        <Pressable
          style={[styles.featuredCard, { borderColor: tone.light }]}
          onPress={() =>
            navigation.navigate("TopicDetail", { id: item.id, title: item.title })
          }
        >
          <View style={styles.featuredCardTop}>
            <View
              style={[
                styles.featuredCategoryChip,
                { backgroundColor: tone.light },
              ]}
            >
              <Text style={[styles.featuredCategoryText, { color: tone.bg }]}>
                {item.category_name}
              </Text>
            </View>
            {item.is_pinned ? (
              <View style={styles.featuredPinnedBadge}>
                <Ionicons name="pin" size={10} color={colors.AMBER} />
                <Text style={styles.featuredPinnedText}>Pinned</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.featuredContentWrap}>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.featuredExcerpt} numberOfLines={2}>
              {item.body}
            </Text>
          </View>

          <View style={styles.featuredMetaGrid}>
            <View style={styles.featuredAuthorBlock}>
              <View style={styles.featuredAvatar}>
                {item.author_avatar_url ? (
                  <Image
                    source={{ uri: item.author_avatar_url }}
                    style={styles.featuredAvatarImage}
                  />
                ) : (
                  <Text style={styles.featuredAvatarText}>
                    {item.author_name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.featuredAuthorTextWrap}>
                <Text style={styles.featuredMetaAuthor} numberOfLines={1}>
                  {item.author_name}
                </Text>
                <Text style={styles.featuredMetaSubtext} numberOfLines={1}>
                  {item.reply_count} replies
                </Text>
              </View>
            </View>

            <View style={styles.featuredStatsBlock}>
              <View style={styles.featuredStatPill}>
                <Ionicons name="eye-outline" size={12} color={colors.GRAY500} />
                <Text style={styles.featuredStatText}>{item.view_count}</Text>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [categories, navigation]
  );

  const renderFooter = () => {
    if (!loading || topics.length === 0) return null;
    return (
      <ActivityIndicator
        size="small"
        color={colors.GREEN}
        style={styles.footerSpinner}
      />
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    if (error) {
      return (
        <Pressable
          style={styles.emptyContainer}
          onPress={() => fetchTopics(1, true, sort)}
        >
          <Ionicons name="alert-circle-outline" size={40} color={colors.RED} />
          <Text style={styles.emptyText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.GRAY300} />
        <Text style={styles.emptyTitle}>
          {showOwnActiveTopics
            ? "No active topics yet"
            : selectedCategoryInfo
            ? `No topics in ${selectedCategoryInfo.name} yet`
            : "No topics yet"}
        </Text>
        <Text style={styles.emptyText}>
          {showOwnActiveTopics
            ? "Your currently open discussions will appear here."
            : selectedCategoryInfo
            ? "Try another category or start the first discussion here."
            : "Community discussions will appear here once members begin posting."}
        </Text>
        {isAuthenticated ? (
          <Pressable style={styles.emptyButton} onPress={openCreateTopic}>
            <Ionicons name="add" size={18} color={colors.WHITE} />
            <Text style={styles.emptyButtonText}>Start a topic</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const headerContent = (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroBackdropCircleLg} />
        <View style={styles.heroBackdropCircleSm} />
        <Text style={styles.heroKicker}>MY FORUM ACTIVITY</Text>

        <View style={styles.heroStatsRow}>
          <Pressable
            style={styles.heroStatCard}
            onPress={() => {
              if (!isAuthenticated) return;
              setSelectedCategory(null);
              setShowOwnActiveTopics((prev) => !prev);
              scrollToCategories();
            }}
            disabled={!isAuthenticated}
          >
            <Text
              style={[
                styles.heroStatValue,
                showOwnActiveTopics && styles.heroStatValueSelected,
              ]}
            >
              {myTopicCount}
            </Text>
            <Text
              style={[
                styles.heroStatLabel,
                showOwnActiveTopics && styles.heroStatLabelSelected,
              ]}
            >
              Topics
            </Text>
          </Pressable>
          <View
            style={[styles.heroStatCard, styles.heroStatCardWithDivider]}
          >
            <Text style={styles.heroStatValue}>{myReplyCount}</Text>
            <Text style={styles.heroStatLabel}>Replies</Text>
          </View>
        </View>
      </View>

      {trendingTopics.length > 0 ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Featured</Text>
              <Text style={styles.sectionTitle}>Trending now</Text>
            </View>
          </View>

          <FlatList
            data={trendingTopics}
            keyExtractor={(item) => `featured-${item.id}`}
            renderItem={renderFeaturedTopic}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredList}
          />
        </View>
      ) : null}

      <View
        style={styles.sectionBlock}
        onLayout={(e) => {
          categoriesSectionY.current = e.nativeEvent.layout.y;
        }}
      >
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Explore</Text>
            <Text style={styles.sectionTitle}>Categories</Text>
          </View>
        </View>

        <FlatList
          ref={categoryListRef}
          data={categoryData}
          keyExtractor={(item) => item.id}
          renderItem={renderCategoryCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      {selectedCategoryInfo ? (
        <View
          style={[
            styles.selectedCategoryCard,
            { backgroundColor: getCategoryTone(selectedCategoryInfo.color).light },
          ]}
        >
          <View
            style={[
              styles.selectedCategoryIcon,
              { backgroundColor: getCategoryTone(selectedCategoryInfo.color).bg },
            ]}
          >
            <Ionicons
              name={getCategoryIconName(selectedCategoryInfo.icon)}
              size={16}
              color={colors.WHITE}
            />
          </View>
          <View style={styles.selectedCategoryContent}>
            <Text style={styles.selectedCategoryName}>
              {selectedCategoryInfo.name}
            </Text>
            <Text style={styles.selectedCategoryDescription}>
              {selectedCategoryInfo.description}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.listToolbar}>
        <View>
          <Text style={styles.sectionEyebrow}>Browse</Text>
          <Text style={styles.sectionTitle}>
            {showOwnActiveTopics
              ? "Your active topics"
              : selectedCategoryInfo
              ? "Topics in this category"
              : "Latest discussions"}
          </Text>
        </View>

        <View style={styles.sortSegment}>
          <Pressable
            style={[
              styles.sortSegmentButton,
              sort === "newest" && styles.sortSegmentButtonActive,
            ]}
            onPress={() => setSort("newest")}
          >
            <Ionicons
              name="time-outline"
              size={13}
              color={sort === "newest" ? colors.WHITE : colors.GRAY600}
            />
            <Text
              style={[
                styles.sortSegmentText,
                sort === "newest" && styles.sortSegmentTextActive,
              ]}
            >
              New
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sortSegmentButton,
              sort === "most_active" && styles.sortSegmentButtonActive,
            ]}
            onPress={() => setSort("most_active")}
          >
            <Ionicons
              name="flame-outline"
              size={13}
              color={sort === "most_active" ? colors.WHITE : colors.GRAY600}
            />
            <Text
              style={[
                styles.sortSegmentText,
                sort === "most_active" && styles.sortSegmentTextActive,
              ]}
            >
              Active
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (loading && topics.length === 0 && !error) {
    return (
      <SafeAreaView edges={["top"]} style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Community Forum</Text>
        </View>
        <ActivityIndicator
          size="large"
          color={colors.GREEN}
          style={styles.fullScreenSpinner}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Community Forum</Text>
      </View>

      <FlatList
        ref={listRef}
        data={displayTopics}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TopicCard
            topic={item}
            categoryTone={getCategoryTone(
              categories.find((category) => category.slug === item.category_slug)?.color ??
                "green"
            )}
            onPress={() =>
              navigation.navigate("TopicDetail", { id: item.id, title: item.title })
            }
          />
        )}
        ListHeaderComponent={headerContent}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.GREEN}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {isAuthenticated ? (
        <Pressable style={styles.fab} onPress={openCreateTopic}>
          <Ionicons name="add" size={28} color={colors.WHITE} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  topBar: {
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: 22,
    backgroundColor: colors.GREEN,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
    overflow: "hidden",
  },
  heroBackdropCircleLg: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: -36,
    right: -28,
  },
  heroBackdropCircleSm: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.08)",
    bottom: -18,
    left: -8,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroStatCard: {
    flex: 1,
    paddingRight: 12,
  },
  heroStatCardWithDivider: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.22)",
    paddingLeft: 16,
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.WHITE,
    marginBottom: 4,
  },
  heroStatLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
  heroStatValueSelected: {
    color: colors.WHITE,
  },
  heroStatLabelSelected: {
    color: colors.WHITE,
  },
  sectionBlock: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY500,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.GRAY400,
    fontWeight: "600",
  },
  featuredList: {
    paddingHorizontal:12,
    paddingVertical: 3,
    gap: 12,
  },
  featuredCard: {
    width: 250,
    minHeight: 176,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  featuredCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  featuredCategoryChip: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    maxWidth: 150,
  },
  featuredCategoryText: {
    fontSize: 11,
    fontWeight: "700",
  },
  featuredPinnedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.AMBER_LT,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  featuredPinnedText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.AMBER,
  },
  featuredTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 8,
  },
  featuredContentWrap: {
    flex: 1,
  },
  featuredExcerpt: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY600,
    marginBottom: 14,
  },
  featuredMetaGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  featuredAuthorBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  featuredAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 8,
  },
  featuredAvatarImage: {
    width: "100%",
    height: "100%",
  },
  featuredAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.WHITE,
  },
  featuredAuthorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  featuredMetaAuthor: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY700,
    marginBottom: 2,
  },
  featuredMetaSubtext: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  featuredStatsBlock: {
    minWidth: 52,
    alignItems: "flex-end",
  },
  featuredStatPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GRAY100,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  featuredStatText: {
    fontSize: 12,
    color: colors.GRAY500,
    fontWeight: "600",
  },
  categoryList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  categoryCard: {
    width: 152,
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  categoryCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCardTextWrap: {
    flex: 1,
  },
  categoryCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY800,
    marginBottom: 4,
  },
  categoryCardMeta: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  selectedCategoryCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedCategoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCategoryContent: {
    flex: 1,
  },
  selectedCategoryName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
    marginBottom: 3,
  },
  selectedCategoryDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY600,
  },
  listToolbar: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  sortSegment: {
    flexDirection: "row",
    backgroundColor: colors.WHITE,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 4,
    gap: 4,
  },
  sortSegmentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  sortSegmentButtonActive: {
    backgroundColor: colors.GREEN,
  },
  sortSegmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY600,
  },
  sortSegmentTextActive: {
    color: colors.WHITE,
  },
  listContent: {
    paddingBottom: 88,
    flexGrow: 1,
  },
  fullScreenSpinner: {
    flex: 1,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 70,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.GRAY800,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 20,
  },
  retryText: {
    fontSize: 13,
    color: colors.GREEN,
    fontWeight: "600",
  },
  emptyButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GREEN,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.WHITE,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.GRAY900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
