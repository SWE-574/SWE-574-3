import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";

export type QuickFilterId = "all" | "new" | "online" | "recurrent" | "weekend";

export interface QuickFilterItem {
  id: QuickFilterId;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}

const FILTERS: QuickFilterItem[] = [
  { id: "all", label: "All", icon: "grid-outline" },
  { id: "new", label: "New", icon: "trending-up-outline" },
  { id: "online", label: "Online", icon: "wifi-outline" },
  { id: "recurrent", label: "Recurrent", icon: "repeat-outline" },
  { id: "weekend", label: "Weekend", icon: "calendar-outline" },
];

const INACTIVE_COLOR = "#757575";

export interface QuickFiltersProps {
  selectedId: QuickFilterId;
  onSelect: (id: QuickFilterId) => void;
}

export default function QuickFilters({
  selectedId,
  onSelect,
}: QuickFiltersProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {FILTERS.map((filter) => {
        const isSelected = selectedId === filter.id;
        return (
          <TouchableOpacity
            key={filter.id}
            activeOpacity={0.7}
            onPress={() => onSelect(filter.id)}
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
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginRight: 8,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
  },
  pillSelected: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  label: {
    fontSize: 14,
    color: INACTIVE_COLOR,
    fontWeight: "400",
    marginLeft: 6,
  },
  labelSelected: {
    color: "#fff",
  },
});
