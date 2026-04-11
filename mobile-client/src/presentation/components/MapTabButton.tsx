import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
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
      <View style={styles.circleOuter}>
        <View style={[styles.circle, focused && styles.circleFocused]}>
          <Image source={hiveIcon} style={styles.logo} />
        </View>
      </View>
      <Text style={[styles.label, focused && styles.labelFocused]}>Map</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible" as const,
  },
  circleOuter: {
    overflow: "visible" as const,
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.YELLOW,
    borderWidth: 3,
    borderColor: colors.WHITE,
    marginTop: -18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 8,
  },
  circleFocused: {
    backgroundColor: colors.GREEN,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 2,
    color: colors.GRAY500,
  },
  labelFocused: {
    color: colors.GREEN,
  },
});
