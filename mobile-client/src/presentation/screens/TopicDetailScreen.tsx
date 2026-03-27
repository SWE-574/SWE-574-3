import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumTopic, ForumPost } from "../../api/forum";
import { getTopic, listTopicPosts, createTopicPost } from "../../api/forum";
import { colors } from "../../constants/colors";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { useAuth } from "../../context/AuthContext";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import type { ForumStackParamList } from "../../navigation/ForumStack";

type NavProp = NativeStackNavigationProp<ForumStackParamList, "TopicDetail">;
type RouteParam = RouteProp<ForumStackParamList, "TopicDetail">;

const PAGE_SIZE = 20;

function getInitials(name: string): string {
  return (name || "?")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function TopicHeader({ topic }: { topic: ForumTopic }) {
  return (
    <View style={styles.topicHeader}>
      <View style={styles.categoryChip}>
        <Text style={styles.categoryText} numberOfLines={1}>
          {topic.category_name}
        </Text>
      </View>

      <Text style={styles.topicTitle}>{topic.title}</Text>

      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(topic.author_name)}</Text>
        </View>
        <Text style={styles.authorName}>{topic.author_name}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.timeAgo}>{formatTimeAgo(topic.created_at)}</Text>
      </View>

      <Text style={styles.topicBody}>{topic.body}</Text>

      <View style={styles.repliesDivider}>
        <View style={styles.dividerLine} />
        <Text style={styles.repliesLabel}>
          {topic.reply_count === 1
            ? "1 Reply"
            : `${topic.reply_count} Replies`}
        </Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

function PostItem({ post }: { post: ForumPost }) {
  return (
    <View style={styles.postItem}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(post.author_name)}</Text>
        </View>
        <Text style={styles.authorName}>{post.author_name}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.timeAgo}>{formatTimeAgo(post.created_at)}</Text>
      </View>
      <Text style={styles.postBody}>{post.body}</Text>
    </View>
  );
}

export default function TopicDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { id, title } = useRoute<RouteParam>().params;
  const { isAuthenticated } = useAuth();

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ForumPost>>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [topicData, postsData] = await Promise.all([
          getTopic(id),
          listTopicPosts(id, { page: 1, page_size: PAGE_SIZE }),
        ]);
        if (cancelled) return;
        setTopic(topicData as ForumTopic);
        setPosts(postsData.results);
        setHasMore(postsData.next !== null);
        setPage(1);
      } catch {
        if (!cancelled) setError("Failed to load topic.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await listTopicPosts(id, { page: page + 1, page_size: PAGE_SIZE });
      setPosts((prev) => [...prev, ...data.results]);
      setHasMore(data.next !== null);
      setPage((p) => p + 1);
    } catch {
      // silent — user can scroll again
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [id, page, hasMore]);

  const handleSubmit = useCallback(async () => {
    const text = replyText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const newPost = await createTopicPost(id, { body: text });
      setReplyText("");
      setPosts((prev) => [...prev, newPost as ForumPost]);
      // Scroll to the new post after state settles
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch {
      Alert.alert("Error", "Failed to send reply. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [id, replyText]);

  const renderFooter = () => {
    if (!loadingMore) return null;
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
          onPress={() => {
            setError(null);
            setLoading(true);
            getTopic(id)
              .then((t) => setTopic(t as ForumTopic))
              .catch(() => setError("Failed to load topic."))
              .finally(() => setLoading(false));
          }}
        >
          <Ionicons name="alert-circle-outline" size={36} color={colors.RED} />
          <Text style={styles.emptyText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      );
    }
    if (topic && posts.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-outline" size={36} color={colors.GRAY300} />
          <Text style={styles.emptyText}>No replies yet. Be the first!</Text>
        </View>
      );
    }
    return null;
  };

  const renderComposer = () => {
    if (!topic) return null;
    if (topic.is_locked) {
      return (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={15} color={colors.GRAY500} />
          <Text style={styles.lockedText}>This topic is locked.</Text>
        </View>
      );
    }
    if (!isAuthenticated) {
      return (
        <View style={styles.lockedBanner}>
          <Ionicons name="person-outline" size={15} color={colors.GRAY500} />
          <Text style={styles.lockedText}>Log in to reply.</Text>
        </View>
      );
    }
    return (
      <ChatInputBar
        value={replyText}
        onChangeText={setReplyText}
        onSend={handleSubmit}
        placeholder="Write a reply…"
        editable={!submitting}
        sendDisabled={submitting || !replyText.trim()}
      />
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.GRAY900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.GREEN}
          style={styles.fullScreenSpinner}
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FlatList
            ref={listRef}
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PostItem post={item} />}
            ListHeaderComponent={
              topic ? <TopicHeader topic={topic} /> : null
            }
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={renderFooter}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
          {renderComposer()}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  fullScreenSpinner: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  // Topic header
  topicHeader: {
    backgroundColor: colors.WHITE,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  categoryChip: {
    alignSelf: "flex-start",
    backgroundColor: "#D1FAE5",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GREEN,
  },
  topicTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.GRAY900,
    lineHeight: 28,
    marginBottom: 12,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.WHITE,
  },
  authorName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
    flexShrink: 1,
  },
  dot: {
    fontSize: 13,
    color: colors.GRAY400,
    marginHorizontal: 4,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  topicBody: {
    fontSize: 15,
    color: colors.GRAY900,
    lineHeight: 23,
    marginBottom: 16,
  },
  repliesDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.GRAY200,
  },
  repliesLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  // Post items
  postItem: {
    backgroundColor: colors.WHITE,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  postBody: {
    fontSize: 14,
    color: colors.GRAY900,
    lineHeight: 21,
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY100,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
  // Empty / error
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.GRAY500,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GREEN,
  },
  // Composer banners
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: colors.WHITE,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY200,
  },
  lockedText: {
    fontSize: 14,
    color: colors.GRAY500,
  },
});
