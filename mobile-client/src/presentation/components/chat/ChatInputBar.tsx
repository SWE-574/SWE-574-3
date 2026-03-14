import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";

export type ChatInputBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  editable: boolean;
  sendDisabled: boolean;
};

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  placeholder,
  editable,
  sendDisabled,
}: ChatInputBarProps) {
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.GRAY400}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSend}
          returnKeyType="send"
          editable={editable}
          multiline
          maxLength={1000}
        />
      </View>

      <TouchableOpacity
        style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
        onPress={onSend}
        disabled={sendDisabled}
        activeOpacity={0.8}
      >
        <Ionicons name="send" size={18} color={colors.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

export const styles = StyleSheet.create({
  inputRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 12,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    color: colors.GRAY900 ?? "#111827",
    paddingVertical: 11,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.GRAY400,
  },
});
