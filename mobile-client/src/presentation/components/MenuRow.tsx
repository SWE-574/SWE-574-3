import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

interface MenuRowProps {
  title: string;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export default function MenuRow({ title, onPress, iconName }: MenuRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <View style={styles.rowContent}>
        {iconName && (
          <Ionicons
            name={iconName}
            size={22}
            color="#6a48d8"
            style={styles.icon}
          />
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#bbb" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
    justifyContent: "space-between",
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
    color: "#222",
  },
});
