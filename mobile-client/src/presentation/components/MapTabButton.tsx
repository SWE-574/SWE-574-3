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
  style,
}: BottomTabBarButtonProps) {
  const focused = accessibilityState?.selected ?? false;

  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      activeOpacity={0.9}
      onLongPress={onLongPress ?? undefined}
      onPress={onPress ?? undefined}
      style={[style, styles.wrapper]}
    >
      <View style={styles.floatingContainer}>
        <View style={[styles.circle, focused && styles.circleFocused]}>
          <Image source={hiveIcon} style={styles.logo} />
        </View>
        <Text style={[styles.label, focused && styles.labelFocused]}>Map</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingContainer: {
    alignItems: "center",
    transform: [{ translateY: -16 }],
  },
  circle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.YELLOW,
    borderWidth: 4,
    borderColor: colors.WHITE,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 10,
  },
  circleFocused: {
    backgroundColor: colors.GREEN,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    color: colors.GRAY500,
    textAlign: "center",
    minWidth: 72,
  },
  labelFocused: {
    color: colors.GREEN,
  },
});
