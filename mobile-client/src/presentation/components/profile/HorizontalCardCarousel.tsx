/**
 * HorizontalCardCarousel - generic horizontally scrollable list with optional
 * "View more" tile.
 *
 * Use it for Activity tab carousels (offers, needs, events, history, reviews,
 * saved). The carousel itself only owns the scroll behavior and the trailing
 * "view more" CTA; each card is built by the caller via `renderItem` so this
 * component stays agnostic of the data shape.
 */

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";

export type HorizontalCardCarouselProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  /** When set, only the first `maxItems` are rendered inline. */
  maxItems?: number;
  /** Cap width for the "view more" tile; defaults to ~half a card. */
  cardHeight?: number;
  /** Render this when there are no items. */
  emptyContent?: React.ReactNode;
  /** Shown on the "view more" tile next to the count. */
  viewMoreLabel?: string;
  /** Tap handler for the "view more" tile. Hides the tile when undefined. */
  onViewMore?: () => void;
  contentContainerStyle?: ViewStyle;
};

export default function HorizontalCardCarousel<T>({
  items,
  renderItem,
  keyExtractor,
  maxItems,
  cardHeight = 156,
  emptyContent,
  viewMoreLabel = "View more",
  onViewMore,
  contentContainerStyle,
}: HorizontalCardCarouselProps<T>) {
  if (!items.length) {
    return <>{emptyContent ?? null}</>;
  }

  const visibleItems =
    typeof maxItems === "number" ? items.slice(0, maxItems) : items;
  const hiddenCount = items.length - visibleItems.length;
  const showViewMore = onViewMore && hiddenCount > 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, contentContainerStyle]}
      decelerationRate="fast"
    >
      {visibleItems.map((item, index) => (
        <View key={keyExtractor(item, index)}>{renderItem(item, index)}</View>
      ))}
      {showViewMore ? (
        <Pressable
          onPress={onViewMore}
          accessibilityRole="button"
          accessibilityLabel={`${viewMoreLabel}, ${hiddenCount} more`}
          style={({ pressed }) => [
            styles.viewMore,
            { height: cardHeight },
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.viewMoreIcon}>
            <Ionicons name="arrow-forward" size={20} color={colors.GREEN} />
          </View>
          <Text style={styles.viewMoreLabel}>{viewMoreLabel}</Text>
          <Text style={styles.viewMoreSub}>
            +{hiddenCount} more
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 4,
    paddingRight: 12,
    gap: 10,
  },
  viewMore: {
    width: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45,92,78,0.20)",
    backgroundColor: "rgba(240,253,244,0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  viewMoreIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: `${colors.GREEN}33`,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.GREEN,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  viewMoreLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GREEN,
  },
  viewMoreSub: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.GRAY500,
  },
});
