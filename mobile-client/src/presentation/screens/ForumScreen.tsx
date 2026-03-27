import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { listCategories, listTopics } from "../../api/forum";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import TopicCard from "../components/TopicCard";
import type { ForumStackParamList } from "../../navigation/ForumStack";

type ForumNavProp = NativeStackNavigationProp<ForumStackParamList, "ForumFeed">;

type SortOption = "newest" | "most_active";

const PAGE_SIZE = 20;

function applySortMostActive(topics: ForumTopic[]): ForumTopic[] {
  const pinned = topics.filter((t) => t.is_pinned);
  const rest = topics
    .filter((t) => !t.is_pinned)
    .sort(
      (a, b) =>
        new Date(b.last_activity).getTime() -
        new Date(a.last_activity).getTime()
    );
  return [...pinned, ...rest];
}

export default function ForumScreen() {
  const navigation = useNavigation<ForumNavProp>();
  const { isAuthenticated } = useAuth();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => {/* categories are non-critical */});
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
        let results = response.results;
        if (currentSort === "most_active") {
          results = applySortMostActive(results);
        }
        setTopics((prev) => (replace ? results : [...prev, ...results]));
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

  // Reload when returning from CreateTopic
  useFocusEffect(
    useCallback(() => {
      fetchTopics(1, true, sort);
    }, [selectedCategory, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTopics(1, true, sort);
    setRefreshing(false);
  }, [fetchTopics, sort]);

  const handleLoadMore = useCallback(() => {
    if (!loading && !fetchingRef.current && hasMore) {
      fetchTopics(page + 1, false, sort);
    }
  }, [loading, hasMore, page, fetchTopics, sort]);

  const handleCategorySelect = useCallback((slug: string | null) => {
    setSelectedCategory(slug);
  }, []);

  const handleSortToggle = useCallback(() => {
    setSort((prev) => (prev === "newest" ? "most_active" : "newest"));
  }, []);

  const renderCategoryChip = useCallback(
    ({ item }: { item: ForumCategory | { slug: null; name: string } }) => {
      const isSelected =
        item.slug === null
          ? selectedCategory === null
          : selectedCategory === item.slug;
      return (
        <Pressable
          style={[styles.chip, isSelected && styles.chipSelected]}
          onPress={() => handleCategorySelect(item.slug)}
        >
          <Text
            style={[styles.chipText, isSelected && styles.chipTextSelected]}
          >
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [selectedCategory, handleCategorySelect]
  );

  const categoryData: Array<ForumCategory | { slug: null; name: string }> = [
    { slug: null, name: "All" },
    ...categories,
  ];

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
        <Pressable style={styles.emptyContainer} onPress={() => fetchTopics(1, true, sort)}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.RED} />
          <Text style={styles.emptyText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.GRAY300} />
        <Text style={styles.emptyText}>No topics yet.</Text>
      </View>
    );
  };

  if (loading && topics.length === 0 && !error) {
    return (
      <SafeAreaView edges={["top"]} style={styles.container}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>Forum</Text>
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
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Forum</Text>
        <Pressable style={styles.sortButton} onPress={handleSortToggle}>
          <Ionicons
            name={sort === "newest" ? "time-outline" : "flame-outline"}
            size={15}
            color={colors.GREEN}
          />
          <Text style={styles.sortButtonText}>
            {sort === "newest" ? "Newest" : "Most Active"}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.GREEN} />
        </Pressable>
      </View>

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TopicCard topic={item} onPress={() => {}} />
        )}
        ListHeaderComponent={
          <FlatList
            data={categoryData}
            keyExtractor={(item) =>
              item.slug === null ? "__all__" : item.slug
            }
            renderItem={renderCategoryChip}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
            style={styles.categoryStrip}
          />
        }
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
      />

      {isAuthenticated && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate("CreateTopic")}
        >
          <Ionicons name="add" size={28} color={colors.WHITE} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.GREEN_LT,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  categoryStrip: {
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    marginBottom: 12,
  },
  categoryList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.GRAY100,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  chipSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.GRAY700,
  },
  chipTextSelected: {
    color: colors.WHITE,
    fontWeight: "600",
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
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
    color: colors.GRAY500,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryText: {
    fontSize: 13,
    color: colors.GREEN,
    fontWeight: "600",
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
