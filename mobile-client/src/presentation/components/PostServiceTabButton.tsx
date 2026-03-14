import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigationState } from "@react-navigation/native";
import { colors } from "../../constants/colors";

export default function PostServiceTabButton({
  onPress,
}: BottomTabBarButtonProps) {
  const state = useNavigationState((s) => s);

  const focused = state.routes[state.index]?.name === "PostService";

  const styles = getStyles(focused);

  return (
    <TouchableOpacity
      style={styles.wrapper}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <MaterialIcons
        name="add"
        color={colors.WHITE}
        size={50}
        style={styles.icon}
      />

      <Text
        style={[
          styles.label,
          { color: focused ? colors.GREEN : colors.GRAY500 },
        ]}
      >
        Post Service
      </Text>
    </TouchableOpacity>
  );
}

const getStyles = (focused: boolean) =>
  StyleSheet.create({
    wrapper: {
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      bottom: -10,
      left: 0,
      right: 0,
    },

    icon: {
      backgroundColor: focused ? colors.GREEN : colors.YELLOW,
      borderRadius: 40,
      padding: 3,
      marginBottom: 4,
    },
    label: {
      fontSize: 10,
      marginTop: 2,
      fontWeight: "500",
    },
  });
