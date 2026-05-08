import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../constants/colors";

/**
 * Custom bottom tab bar.
 *
 * Why a custom bar (vs. the @react-navigation default chrome): we want the
 * active tab to get an animated background pill behind its icon, the entire
 * bar to sit on a translucent off-white that looks pulled-forward, and a
 * hairline top edge instead of the default elevation. The Map tab's
 * tabBarButton override (the floating yellow/green hexagon) is honored by
 * delegating to descriptors[route.key].options.tabBarButton when present.
 */
export default function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          height: 64 + insets.bottom,
        },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if (options.tabBarButton) {
            // Hidden tabs return null from tabBarButton; honor them too.
            const Button = options.tabBarButton;
            return (
              <View key={route.key} style={styles.slot}>
                <Button
                  // Cast — the navigation lib's prop shape changed across
                  // versions but the props we need (onPress, accessibilityState)
                  // are forwarded through.
                  {...({} as any)}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate(route.name as never)}
                />
              </View>
            );
          }

          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          return (
            <TabItem
              key={route.key}
              focused={focused}
              label={String(label)}
              renderIcon={(color) =>
                options.tabBarIcon
                  ? options.tabBarIcon({
                      color,
                      size: 22,
                      focused,
                    })
                  : null
              }
              badge={options.tabBarBadge}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

interface TabItemProps {
  focused: boolean;
  label: string;
  renderIcon: (color: string) => React.ReactNode;
  badge?: React.ReactNode;
  onPress: () => void;
}

function TabItem({ focused, label, renderIcon, badge, onPress }: TabItemProps) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start();
  }, [focused, scale]);

  const pillStyle = {
    transform: [
      {
        scale: scale.interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        }),
      },
    ],
    opacity: scale,
  };

  const iconColor = focused ? colors.GREEN : colors.GRAY500;

  return (
    <Pressable onPress={onPress} style={styles.slot} hitSlop={6}>
      <View style={styles.itemInner}>
        <Animated.View style={[styles.activePill, pillStyle]} />
        <View style={styles.iconWrap}>{renderIcon(iconColor)}</View>
        {badge != null && badge !== "" ? (
          <View style={styles.badgeDot} />
        ) : null}
      </View>
      <Text
        style={[styles.label, focused && styles.labelFocused]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor:
      Platform.OS === "ios" ? "rgba(255,255,255,0.94)" : colors.WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.GRAY200,
    overflow: "visible",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "visible",
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 8,
    paddingBottom: 6,
    overflow: "visible",
  },
  itemInner: {
    width: 56,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  activePill: {
    position: "absolute",
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.GREEN_LT,
  },
  iconWrap: {
    zIndex: 1,
  },
  badgeDot: {
    position: "absolute",
    top: 2,
    right: 12,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.RED,
    borderWidth: 1.5,
    borderColor: colors.WHITE,
    zIndex: 2,
  },
  label: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "600",
    color: colors.GRAY500,
  },
  labelFocused: {
    color: colors.GREEN,
  },
});
