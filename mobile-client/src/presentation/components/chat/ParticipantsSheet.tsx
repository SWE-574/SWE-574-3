import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors } from "../../../constants/colors";

export type ChatParticipantItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  participants: ChatParticipantItem[];
  onClose: () => void;
  onParticipantPress?: (participant: ChatParticipantItem) => void;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

export function ParticipantsSheet({
  visible,
  title,
  subtitle,
  participants,
  onClose,
  onParticipantPress,
}: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.GRAY600} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {participants.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={28} color={colors.GRAY400} />
                <Text style={styles.emptyTitle}>No participants yet</Text>
                <Text style={styles.emptyText}>
                  Participants will appear here after they join the conversation.
                </Text>
              </View>
            ) : (
              participants.map((participant) => (
                <TouchableOpacity
                  key={participant.id}
                  style={styles.row}
                  activeOpacity={onParticipantPress ? 0.78 : 1}
                  disabled={!onParticipantPress}
                  onPress={() => onParticipantPress?.(participant)}
                >
                  {participant.avatarUrl ? (
                    <Image source={{ uri: participant.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>
                        {getInitials(participant.name)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.meta}>
                    <Text style={styles.name}>{participant.name}</Text>
                    {participant.subtitle ? (
                      <Text style={styles.subtext}>{participant.subtitle}</Text>
                    ) : null}
                  </View>
                  {onParticipantPress ? (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.GRAY400}
                    />
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "72%",
    backgroundColor: colors.WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.GRAY200,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.GRAY500,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.GRAY100,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.BLUE_LT,
  },
  avatarFallbackText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.BLUE,
  },
  meta: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  subtext: {
    marginTop: 3,
    fontSize: 12,
    color: colors.GRAY500,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: colors.GRAY500,
  },
});
