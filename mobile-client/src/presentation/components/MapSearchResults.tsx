import React from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import type { Service, ServiceType } from "../../api/types";
import { formatDistanceKm } from "../../utils/discovery";

const TYPE_COLOR: Record<ServiceType, string> = {
  Offer: colors.GREEN,
  Need: colors.BLUE,
  Event: colors.AMBER,
};

const ROW_HEIGHT = 76;
// Cap visible rows so the dropdown never swallows the map. Beyond MAX_ROWS the
// FlatList scrolls internally — same behaviour as web Browse search.
const MAX_ROWS = 6;

export interface MapSearchResult {
  service: Service;
  distanceKm: number | null;
}

interface MapSearchResultsProps {
  results: MapSearchResult[];
  onSelect: (service: Service) => void;
  emptyLabel?: string;
}

export default function MapSearchResults({
  results,
  onSelect,
  emptyLabel = "No matches",
}: MapSearchResultsProps) {
  const visibleRows = Math.min(results.length, MAX_ROWS);
  const containerHeight = results.length === 0 ? 56 : visibleRows * ROW_HEIGHT;

  if (results.length === 0) {
    return (
      <View
        style={[styles.container, styles.emptyContainer, { height: containerHeight }]}
        testID="map-search-results-empty"
      >
        <Ionicons name="search-outline" size={14} color={colors.GRAY500} />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { height: containerHeight }]}
      testID="map-search-results"
    >
      <FlatList
        data={results}
        keyExtractor={(item) => item.service.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ResultRow item={item} onPress={() => onSelect(item.service)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function ResultRow({
  item,
  onPress,
}: {
  item: MapSearchResult;
  onPress: () => void;
}) {
  const typeColor = TYPE_COLOR[item.service.type] ?? colors.GRAY700;
  const tags = item.service.tags?.slice(0, 3) ?? [];
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.GRAY100 }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.service.title}`}
      testID={`map-search-row-${item.service.id}`}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.service.title}
        </Text>
        <View style={styles.rowMeta}>
          <View
            style={[styles.typePill, { backgroundColor: typeColor + "22" }]}
          >
            <Text style={[styles.typePillText, { color: typeColor }]}>
              {item.service.type}
            </Text>
          </View>
          {tags.map((t) => (
            <View key={t.id} style={styles.tagPill}>
              <Text style={styles.tagPillText} numberOfLines={1}>
                #{t.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {item.distanceKm !== null ? (
        <Text style={styles.distance}>{formatDistanceKm(item.distanceKm)}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },
  emptyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  emptyText: {
    fontSize: 13,
    color: colors.GRAY500,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  rowPressed: {
    backgroundColor: colors.GRAY50,
  },
  rowMain: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  typePill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  tagPill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: colors.GRAY100,
    maxWidth: 110,
  },
  tagPillText: {
    fontSize: 11,
    color: colors.GRAY700,
  },
  distance: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY100,
  },
});
