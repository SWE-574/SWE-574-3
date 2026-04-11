import React from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";

export interface QuickFilterItem {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  selected?: boolean;
  onPress: () => void;
}

const INACTIVE_COLOR = "#757575";

export interface QuickFiltersProps {
  items: QuickFilterItem[];
}

export default function QuickFilters({ items }: QuickFiltersProps) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {items.map((filter) => {
        const isSelected = filter.selected ?? false;
        return (
          <TouchableOpacity
            key={filter.id}
            activeOpacity={0.7}
            onPress={filter.onPress}
            style={[styles.pill, isSelected && styles.pillSelected]}
          >
            <Ionicons
              name={filter.icon}
              size={18}
              color={isSelected ? "#fff" : INACTIVE_COLOR}
            />
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginRight: 8,
    minHeight: 40,
    borderRadius: 20,
    justifyContent: "center",
  },
  pillSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  label: {
    fontSize: 13,
    color: INACTIVE_COLOR,
    fontWeight: "500",
    marginLeft: 6,
  },
  labelSelected: {
    color: "#fff",
  },
});
