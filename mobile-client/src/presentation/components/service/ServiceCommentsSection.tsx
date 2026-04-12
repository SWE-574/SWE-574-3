import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  listServiceComments,
  type ServiceComment,
  type ServiceCommentReply,
} from "../../../api/servicesComments";
import { colors } from "../../../constants/colors";
import { formatTimeAgo } from "../../../utils/formatTimeAgo";
import ImagePreviewModal from "../ImagePreviewModal";

type Props = {
  serviceId: string;
  refreshKey?: number;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function CommentAuthorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />;
  }

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackText}>
        {(initialsFromName(name) || "?").toUpperCase()}
      </Text>
    </View>
  );
}

function MediaStrip({
  media,
  onOpen,
}: {
  media: Array<{ id: string; file_url: string }>;
  onOpen: (urls: string[], index: number) => void;
}) {
  if (media.length === 0) return null;

  return (
    <View style={styles.mediaRow}>
      {media.map((item, index) => (
        <Pressable
          key={item.id}
          onPress={() => onOpen(media.map((entry) => entry.file_url), index)}
          style={styles.mediaThumbWrap}
        >
          <Image source={{ uri: item.file_url }} style={styles.mediaThumb} />
        </Pressable>
      ))}
    </View>
  );
}

function ReplyCard({
  reply,
  onOpenMedia,
}: {
  reply: ServiceCommentReply;
  onOpenMedia: (urls: string[], index: number) => void;
}) {
  return (
    <View style={styles.replyCard}>
      <View style={styles.commentHeader}>
        <CommentAuthorAvatar
          name={reply.user_name}
          avatarUrl={reply.user_avatar_url}
        />
        <View style={styles.commentMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.commentAuthor}>{reply.user_name}</Text>
            {reply.is_verified_review ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.GREEN} />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.commentTime}>{formatTimeAgo(reply.created_at)}</Text>
        </View>
      </View>

      <Text style={styles.commentBody}>
        {reply.is_deleted ? "This reply was removed." : reply.body}
      </Text>

      <MediaStrip media={[]} onOpen={onOpenMedia} />
    </View>
  );
}

function CommentCard({
  comment,
  onOpenMedia,
}: {
  comment: ServiceComment;
  onOpenMedia: (urls: string[], index: number) => void;
}) {
  return (
    <View style={styles.commentCard}>
      <View style={styles.commentHeader}>
        <CommentAuthorAvatar
          name={comment.user_name}
          avatarUrl={comment.user_avatar_url}
        />
        <View style={styles.commentMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.commentAuthor}>{comment.user_name}</Text>
            {comment.is_verified_review ? (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.GREEN} />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            ) : null}
            {typeof comment.handshake_hours === "number" ? (
              <View style={styles.hoursBadge}>
                <Text style={styles.hoursBadgeText}>{comment.handshake_hours}h</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.commentTime}>{formatTimeAgo(comment.created_at)}</Text>
        </View>
      </View>

      <Text style={styles.commentBody}>
        {comment.is_deleted ? "This review was removed." : comment.body}
      </Text>

      <MediaStrip media={comment.media ?? []} onOpen={onOpenMedia} />

      {(comment.replies ?? []).length > 0 ? (
        <View style={styles.replyList}>
          {(comment.replies ?? []).map((reply) => (
            <ReplyCard key={reply.id} reply={reply} onOpenMedia={onOpenMedia} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ServiceCommentsSection({
  serviceId,
  refreshKey = 0,
}: Props) {
  const [comments, setComments] = useState<ServiceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listServiceComments(serviceId, { page_size: 20 });
      setComments(response.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reviews.");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments, refreshKey]);

  const reviewCount = useMemo(() => comments.length, [comments]);

  const openMedia = useCallback((urls: string[], index: number) => {
    setLightboxUrls(urls);
    setLightboxIndex(index);
    setShowLightbox(true);
  }, []);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Reviews ({reviewCount})</Text>
          <Text style={styles.sectionSubtitle}>
            Reviews are left automatically after a completed exchange.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.BLUE} />
          <Text style={styles.centerStateText}>Loading reviews...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.GRAY400} />
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyText}>
            Completed exchanges will appear here once members leave feedback.
          </Text>
        </View>
      ) : (
        <View style={styles.commentList}>
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onOpenMedia={openMedia}
            />
          ))}
        </View>
      )}

      <ImagePreviewModal
        visible={showLightbox}
        images={lightboxUrls}
        initialIndex={lightboxIndex}
        onClose={() => setShowLightbox(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    padding: 16,
  },
  headerRow: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.GRAY500,
    lineHeight: 19,
  },
  centerState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  centerStateText: {
    fontSize: 13,
    color: colors.GRAY500,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY500,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: colors.RED,
    textAlign: "center",
  },
  commentList: {
    gap: 12,
  },
  commentCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.GRAY50,
    padding: 14,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GRAY300,
  },
  avatarFallbackText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GRAY700,
  },
  commentMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: colors.GREEN_LT,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GREEN,
  },
  hoursBadge: {
    borderRadius: 999,
    backgroundColor: colors.BLUE_LT,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hoursBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.BLUE,
  },
  commentTime: {
    marginTop: 4,
    fontSize: 12,
    color: colors.GRAY500,
  },
  commentBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: colors.GRAY700,
  },
  mediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  mediaThumbWrap: {
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.GRAY200,
  },
  mediaThumb: {
    width: "100%",
    height: "100%",
  },
  replyList: {
    gap: 10,
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.GRAY200,
  },
  replyCard: {
    borderRadius: 14,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 12,
  },
});
