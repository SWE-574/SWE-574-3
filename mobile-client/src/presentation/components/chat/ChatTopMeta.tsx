import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../../constants/colors";

export type ChatTopMetaProps = {
  otherUserName: string;
  subtitle?: string;
  handshakeStatus?: string;
  formatStatusLabel: (status: string) => string;
  connected: boolean;
  reconnectAttempts: number;
};

export function ChatTopMeta({
  otherUserName,
  subtitle,
  handshakeStatus,
  formatStatusLabel,
  connected,
  reconnectAttempts,
}: ChatTopMetaProps) {
  return (
    <View style={styles.topMeta}>
      <View style={styles.topMetaTextWrap}>
        <Text style={styles.topMetaTitle}>{otherUserName}</Text>
        {!!subtitle ? (
          <Text style={styles.topMetaSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {!!handshakeStatus ? (
          <Text style={styles.topMetaMeta}>
            Status: {formatStatusLabel(handshakeStatus)}
          </Text>
        ) : null}
      </View>

      <View style={styles.statusWrap}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: connected ? colors.GREEN : colors.GRAY400 },
          ]}
        />
        <Text style={styles.statusText}>
          {connected
            ? "Connected"
            : reconnectAttempts > 0
              ? "Reconnecting"
              : "Connecting"}
        </Text>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  topMeta: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topMetaTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  topMetaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
  topMetaSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.GRAY500,
  },
  topMetaMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.GRAY500,
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    color: colors.GRAY500,
  },
});
