import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
} from "react-native";
import { Image } from "react-native";
import type { ChatMessageWithMeta } from "../../../types/chatTypes";
import { colors } from "../../../constants/colors";
import { parseMessageContent } from "../../../utils/chatUtils";

export type ChatMessageBubbleProps = {
  item: ChatMessageWithMeta;
  isOwn: boolean;
  showAvatar: boolean;
  senderName: string;
  avatarUrl?: string;
  formatTime: (value?: string) => string;
};

export function ChatMessageBubble({
  item,
  isOwn,
  showAvatar,
  senderName,
  avatarUrl,
  formatTime,
}: ChatMessageBubbleProps) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const message = item.body || "";
  const match = message.match(urlRegex);
  const url = match ? match[0] : null;
  return (
    <View
      style={[
        styles.messageRow,
        isOwn ? styles.ownMessageRow : styles.otherMessageRow,
      ]}
    >
      {!isOwn ? (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {senderName?.charAt(0)?.toUpperCase() ?? "U"}
                </Text>
              </View>
            )
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.bubbleWrap,
          isOwn ? styles.ownBubbleWrap : styles.otherBubbleWrap,
        ]}
      >
        {!isOwn && showAvatar ? (
          <Text style={styles.senderName}>{senderName}</Text>
        ) : null}

        <View
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            item.pending && styles.pendingBubble,
          ]}
        >
          <Text>
            <Text
              style={[
                styles.messageText,
                isOwn ? styles.ownMessageText : styles.otherMessageText,
              ]}
            >
              {item.body?.replace(/https?:\/\/[^\s]+/g, "")}
            </Text>

            {url && (
              <Text onPress={() => Linking.openURL(url)} style={styles.mapLink}>
                Open in Google Maps
              </Text>
            )}
          </Text>

          <View style={styles.messageFooter}>
            {item.pending ? (
              <Text
                style={[
                  styles.pendingText,
                  isOwn ? styles.ownMessageTime : styles.otherMessageTime,
                ]}
              >
                Sending...
              </Text>
            ) : null}

            <Text
              style={[
                styles.messageTime,
                isOwn ? styles.ownMessageTime : styles.otherMessageTime,
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  messageRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-end",
  },
  ownMessageRow: {
    justifyContent: "flex-end",
  },
  otherMessageRow: {
    justifyContent: "flex-start",
  },
  avatarSlot: {
    width: 36,
    marginRight: 8,
    alignItems: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.GRAY300 ?? "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY700 ?? "#374151",
  },
  bubbleWrap: {
    maxWidth: "82%",
  },
  ownBubbleWrap: {
    alignItems: "flex-end",
  },
  otherBubbleWrap: {
    alignItems: "flex-start",
  },
  senderName: {
    fontSize: 12,
    color: colors.GRAY500,
    marginBottom: 4,
    marginLeft: 2,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ownBubble: {
    backgroundColor: colors.GREEN,
    borderBottomRightRadius: 6,
  },
  otherBubble: {
    backgroundColor: colors.WHITE,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  pendingBubble: {
    opacity: 0.8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  ownMessageText: {
    color: colors.WHITE,
  },
  otherMessageText: {
    color: colors.GRAY900 ?? "#111827",
  },
  messageFooter: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  pendingText: {
    fontSize: 11,
  },
  messageTime: {
    fontSize: 11,
  },
  ownMessageTime: {
    color: "rgba(255,255,255,0.8)",
  },
  otherMessageTime: {
    color: colors.GRAY400,
  },
  mapLink: {
    marginTop: 20,
    color: colors.GREEN,
    textDecorationLine: "underline",
    fontWeight: "500",
    fontSize: 15,
  },
});
