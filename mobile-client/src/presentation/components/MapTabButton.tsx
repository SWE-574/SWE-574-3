import React from "react";
import { View, TouchableOpacity, Text, Image, StyleSheet } from "react-native";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { colors } from "../../constants/colors";

const hiveIcon = require("../../assets/icon.png");

export default function MapTabButton({
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}: BottomTabBarButtonProps) {
  const focused = accessibilityState?.selected ?? false;

  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      activeOpacity={0.9}
      onLongPress={onLongPress ?? undefined}
      onPress={onPress ?? undefined}
      style={styles.wrapper}
    >
      <View style={[styles.circle, focused && styles.circleFocused]}>
        <Image source={hiveIcon} style={styles.logo} />
      </View>
      <Text style={[styles.label, focused && styles.labelFocused]}>Map</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.YELLOW,
    borderWidth: 3,
    borderColor: colors.WHITE,
    marginTop: -28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  circleFocused: {
    backgroundColor: colors.GREEN,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    color: colors.GRAY500,
  },
  labelFocused: {
    color: colors.GREEN,
  },
});
