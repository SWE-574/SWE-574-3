import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Notification } from "../../api/notifications";
import { NOTIFICATION_ICONS } from "../../constants/notificationMappings";
import { colors } from "../../constants/colors";

interface NotificationItemProps {
  notification: Notification;
  onPress: (notification: Notification) => void;
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  return new Date(dateString).toLocaleDateString();
}

export default function NotificationItem({
  notification,
  onPress,
}: NotificationItemProps) {
  const iconName = NOTIFICATION_ICONS[notification.type] ?? "notifications-outline";
  const isUnread = !notification.is_read;

  return (
    <Pressable
      onPress={() => onPress(notification)}
      style={[styles.container, isUnread && styles.unreadBg]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={iconName as any} size={20} color={colors.GREEN} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
          {notification.title}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {notification.message}
        </Text>
        <Text style={styles.time}>{timeAgo(notification.created_at)}</Text>
      </View>
      {isUnread && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  unreadBg: {
    backgroundColor: "#F0FAF6",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F5F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  titleUnread: {
    fontWeight: "700",
  },
  message: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
    marginLeft: 8,
  },
});
