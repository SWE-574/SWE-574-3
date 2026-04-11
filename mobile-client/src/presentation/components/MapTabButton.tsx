import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import { colors } from "../../constants/colors";

export default function MapTabButton({ onPress }: BottomTabBarButtonProps) {
  const focused = useNavigationState(
    (s) => s.routes[s.index]?.name === "MapTab"
  );

  return (
    <TouchableOpacity
      style={styles.wrapper}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Ionicons
        name="map"
        color={colors.WHITE}
        size={30}
        style={[
          styles.icon,
          { backgroundColor: focused ? colors.GREEN : colors.YELLOW },
        ]}
      />
      <Text
        style={[
          styles.label,
          { color: focused ? colors.GREEN : colors.GRAY500 },
        ]}
      >
        Map
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    bottom: -10,
    left: 0,
    right: 0,
  },
  icon: {
    borderRadius: 30,
    padding: 10,
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
});
