import React from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";
import { EdgeInsets, useSafeAreaInsets } from "react-native-safe-area-context";

export type ChatInputBarProps = {
  keyboardHeight: number;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  editable: boolean;
  sendDisabled: boolean;
};

export function ChatInputBar({
  keyboardHeight,
  value,
  onChangeText,
  onSend,
  placeholder,
  editable,
  sendDisabled,
}: ChatInputBarProps) {
  const insets = useSafeAreaInsets();
  const styles = getStyles(insets, keyboardHeight);
  return (
    <View style={styles.inputRow}>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.GRAY400}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSend}
        returnKeyType="send"
        editable={editable}
        multiline
        maxLength={1000}
        style={styles.inputWrap}
      />

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

export const getStyles = (insets: EdgeInsets, keyboardHeight: number) =>
  StyleSheet.create({
    inputRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      backgroundColor: "transparent",
      position: "absolute",
      bottom: keyboardHeight + Math.max(insets.bottom, 30),
      left: 0,
      right: 0,
    },
    inputWrap: {
      flex: 1,
      minHeight: 46,
      maxHeight: 120,
      borderRadius: 24,
      backgroundColor: "#fff",
      paddingHorizontal: 14,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.GRAY300,
      paddingTop: 10,
    },
    input: {
      fontSize: 15,
      color: "#111827",
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
