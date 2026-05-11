/**
 * ScreenTopBar - shared top bar for tab root screens.
 *
 * Provides a consistent header treatment across Profile, Forum, and Messages:
 *   - Respects the safe-area top inset (renders under it, padded above content).
 *   - Same height, padding, type scale, and bottom border.
 *   - Optional right-side slot for actions (icon buttons, badges).
 *
 * Use `transparent` when the screen wants to render content directly under the
 * status bar (e.g. ProfileScreen hero); the bar still owns its height so the
 * action slot can host floating round buttons without ad-hoc absolute math.
 */

import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../constants/colors";

export type ScreenTopBarProps = {
  title?: string;
  right?: React.ReactNode;
  /** Render the bar surface as transparent (no fill, no border). */
  transparent?: boolean;
  style?: ViewStyle;
};

export const SCREEN_TOP_BAR_HEIGHT = 52;

export default function ScreenTopBar({
  title,
  right,
  transparent = false,
  style,
}: ScreenTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top },
        transparent ? styles.wrapTransparent : styles.wrapOpaque,
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.actions}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    zIndex: 5,
  },
  wrapOpaque: {
    backgroundColor: colors.WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.GRAY200,
  },
  wrapTransparent: {
    backgroundColor: "transparent",
  },
  row: {
    height: SCREEN_TOP_BAR_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.GRAY900,
    letterSpacing: -0.4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
