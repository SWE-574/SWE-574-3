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
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ForumTopic, ForumPost } from "../../api/forum";
import {
  getTopic,
  listTopicPosts,
  createTopicPost,
  patchTopic,
  deleteTopic,
  patchPost,
  deletePost,
} from "../../api/forum";
import { colors } from "../../constants/colors";
import { formatTimeAgo } from "../../utils/formatTimeAgo";
import { getInitials } from "../../utils/getInitials";
import { useAuth } from "../../context/AuthContext";
import { ChatInputBar } from "../components/chat/ChatInputBar";
import type { ForumStackParamList } from "../../navigation/ForumStack";
import type { UserSummary } from "../../api/types";

type NavProp = NativeStackNavigationProp<ForumStackParamList, "TopicDetail">;
type RouteParam = RouteProp<ForumStackParamList, "TopicDetail">;

const PAGE_SIZE = 20;

function parseApiError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.status === 403 || e.status === "403") {
      return "You don't have permission to do this.";
    }
    if (typeof e.detail === "string") return e.detail;
    if (typeof e.body === "string") return e.body;
    if (typeof e.title === "string") return e.title;
  }
  return "Something went wrong. Please try again.";
}

function EditActionButtons({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.editActions}>
      <Pressable
        style={[styles.editBtn, styles.editBtnSave, saving && styles.editBtnDisabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.WHITE} />
        ) : (
          <Text style={styles.editBtnSaveText}>Save</Text>
        )}
      </Pressable>
      <Pressable style={[styles.editBtn, styles.editBtnCancel]} onPress={onCancel}>
        <Text style={styles.editBtnCancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

// ─── TopicHeader ─────────────────────────────────────────────────────────────

interface TopicHeaderProps {
  topic: ForumTopic;
  user: UserSummary | null;
  isEditing: boolean;
  editTitle: string;
  editBody: string;
  saving: boolean;
  onEditTitleChange: (v: string) => void;
  onEditBodyChange: (v: string) => void;
  onMenu: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function TopicHeader({
  topic,
  user,
  isEditing,
  editTitle,
  editBody,
  saving,
  onEditTitleChange,
  onEditBodyChange,
  onMenu,
  onSave,
  onCancel,
}: TopicHeaderProps) {
  const isOwner = !!user && user.id === topic.author_id;

  return (
    <View style={styles.topicHeader}>
      <View style={styles.topicHeaderTop}>
        <View style={styles.categoryChip}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {topic.category_name}
          </Text>
        </View>
        {isOwner && !isEditing && (
          <Pressable style={styles.menuButton} onPress={onMenu} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.GRAY500} />
          </Pressable>
        )}
      </View>

      {isEditing ? (
        <>
          <TextInput
            style={styles.editTitleInput}
            value={editTitle}
            onChangeText={onEditTitleChange}
            placeholder="Topic title"
            placeholderTextColor={colors.GRAY400}
            maxLength={200}
          />
          <TextInput
            style={styles.editBodyInput}
            value={editBody}
            onChangeText={onEditBodyChange}
            placeholder="Topic body"
            placeholderTextColor={colors.GRAY400}
            multiline
            maxLength={10000}
            textAlignVertical="top"
          />
          <EditActionButtons saving={saving} onSave={onSave} onCancel={onCancel} />
        </>
      ) : (
        <>
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
        </>
      )}

      <View style={styles.repliesDivider}>
        <View style={styles.dividerLine} />
        <Text style={styles.repliesLabel}>
          {topic.reply_count === 1 ? "1 Reply" : `${topic.reply_count} Replies`}
        </Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

// ─── PostItem ────────────────────────────────────────────────────────────────

interface PostItemProps {
  post: ForumPost;
  user: UserSummary | null;
  isEditing: boolean;
  editingPostBody: string;
  savingPost: boolean;
  onEditBodyChange: (v: string) => void;
  onMenu: (post: ForumPost) => void;
  onSave: (postId: string) => void;
  onCancel: () => void;
}

function PostItem({
  post,
  user,
  isEditing,
  editingPostBody,
  savingPost,
  onEditBodyChange,
  onMenu,
  onSave,
  onCancel,
}: PostItemProps) {
  const isOwner = !!user && user.id === post.author_id;

  return (
    <View style={styles.postItem}>
      <View style={styles.postHeaderRow}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(post.author_name)}</Text>
          </View>
          <Text style={styles.authorName}>{post.author_name}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.timeAgo}>{formatTimeAgo(post.created_at)}</Text>
        </View>
        {isOwner && !isEditing && (
          <Pressable style={styles.menuButton} onPress={() => onMenu(post)} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={16} color={colors.GRAY500} />
          </Pressable>
        )}
      </View>

      {isEditing ? (
        <>
          <TextInput
            style={styles.editBodyInput}
            value={editingPostBody}
            onChangeText={onEditBodyChange}
            placeholder="Edit your reply…"
            placeholderTextColor={colors.GRAY400}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            autoFocus
          />
          <EditActionButtons
            saving={savingPost}
            onSave={() => onSave(post.id)}
            onCancel={onCancel}
          />
        </>
      ) : (
        <Text style={styles.postBody}>{post.body}</Text>
      )}
    </View>
  );
}

// ─── TopicDetailScreen ───────────────────────────────────────────────────────

export default function TopicDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const { id, title } = useRoute<RouteParam>().params;
  const { isAuthenticated, user } = useAuth();

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostBody, setEditingPostBody] = useState("");
  const [savingPost, setSavingPost] = useState(false);

  const listRef = useRef<FlatList<ForumPost>>(null);
  const loadingMoreRef = useRef(false);
  const topicRef = useRef<ForumTopic | null>(null);

  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);

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
  }, [id, retryKey]);

  const handleRetry = useCallback(() => setRetryKey((k) => k + 1), []);

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
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch (err) {
      Alert.alert("Error", parseApiError(err));
    } finally {
      setSubmitting(false);
    }
  }, [id, replyText]);

  const handleTopicMenu = useCallback(() => {
    Alert.alert("Topic Options", undefined, [
      {
        text: "Edit Topic",
        onPress: () => {
          const t = topicRef.current;
          if (!t) return;
          setEditTitle(t.title);
          setEditBody(t.body);
          setIsEditingTopic(true);
        },
      },
      {
        text: "Delete Topic",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete Topic", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteTopic(id);
                  navigation.goBack();
                } catch (err) {
                  Alert.alert("Error", parseApiError(err));
                }
              },
            },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [id, navigation]);

  const handleSaveTopic = useCallback(async () => {
    const title = editTitle.trim();
    const body = editBody.trim();
    if (!title || !body) {
      Alert.alert("Error", "Title and body cannot be empty.");
      return;
    }
    setSavingTopic(true);
    try {
      const updated = await patchTopic(id, { title, body });
      setTopic(updated as ForumTopic);
      setIsEditingTopic(false);
    } catch (err) {
      Alert.alert("Error", parseApiError(err));
    } finally {
      setSavingTopic(false);
    }
  }, [id, editTitle, editBody]);

  const handleCancelTopicEdit = useCallback(() => {
    setIsEditingTopic(false);
    setEditTitle("");
    setEditBody("");
  }, []);

  const handlePostMenu = useCallback((post: ForumPost) => {
    Alert.alert("Reply Options", undefined, [
      {
        text: "Edit",
        onPress: () => {
          setEditingPostId(post.id);
          setEditingPostBody(post.body);
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete Reply", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                try {
                  await deletePost(post.id);
                  setPosts((prev) => prev.filter((p) => p.id !== post.id));
                } catch (err) {
                  Alert.alert("Error", parseApiError(err));
                }
              },
            },
          ]),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const handleSavePost = useCallback(async (postId: string) => {
    const body = editingPostBody.trim();
    if (!body) {
      Alert.alert("Error", "Reply cannot be empty.");
      return;
    }
    setSavingPost(true);
    try {
      const updated = await patchPost(postId, { body });
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? (updated as ForumPost) : p))
      );
      setEditingPostId(null);
      setEditingPostBody("");
    } catch (err) {
      Alert.alert("Error", parseApiError(err));
    } finally {
      setSavingPost(false);
    }
  }, [editingPostBody]);

  const handleCancelPostEdit = useCallback(() => {
    setEditingPostId(null);
    setEditingPostBody("");
  }, []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <ActivityIndicator size="small" color={colors.GREEN} style={styles.footerSpinner} />
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <Pressable style={styles.emptyContainer} onPress={handleRetry}>
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
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.GRAY900} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.GREEN} style={styles.fullScreenSpinner} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FlatList
            ref={listRef}
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PostItem
                post={item}
                user={user}
                isEditing={editingPostId === item.id}
                editingPostBody={editingPostBody}
                savingPost={savingPost}
                onEditBodyChange={setEditingPostBody}
                onMenu={handlePostMenu}
                onSave={handleSavePost}
                onCancel={handleCancelPostEdit}
              />
            )}
            ListHeaderComponent={
              topic ? (
                <TopicHeader
                  topic={topic}
                  user={user}
                  isEditing={isEditingTopic}
                  editTitle={editTitle}
                  editBody={editBody}
                  saving={savingTopic}
                  onEditTitleChange={setEditTitle}
                  onEditBodyChange={setEditBody}
                  onMenu={handleTopicMenu}
                  onSave={handleSaveTopic}
                  onCancel={handleCancelTopicEdit}
                />
              ) : null
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  topicHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  categoryChip: {
    backgroundColor: "#D1FAE5",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.GREEN,
  },
  menuButton: {
    padding: 6,
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
    flex: 1,
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
    marginTop: 4,
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
  postHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
  // Inline edit
  editTitleInput: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: "600",
    color: colors.GRAY900,
    backgroundColor: colors.GRAY50,
    marginBottom: 10,
  },
  editBodyInput: {
    borderWidth: 1,
    borderColor: colors.GRAY200,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.GRAY900,
    backgroundColor: colors.GRAY50,
    minHeight: 100,
    marginBottom: 10,
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
  },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  editBtnSave: {
    backgroundColor: colors.GREEN,
  },
  editBtnCancel: {
    backgroundColor: colors.GRAY100,
  },
  editBtnDisabled: {
    opacity: 0.6,
  },
  editBtnSaveText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.WHITE,
  },
  editBtnCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.GRAY700,
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
