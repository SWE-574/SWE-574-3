/**
 * Collapsible section for Profile — tap header to expand/collapse body.
 */

import React from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../constants/colors";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ProfileAccordionSectionProps = {
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Optional count pill (e.g. total activity items) */
  badge?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export default function ProfileAccordionSection({
  title,
  subtitle,
  icon,
  badge,
  expanded,
  onToggle,
  children,
}: ProfileAccordionSectionProps) {
  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? "Collapse section" : "Expand section"}
      >
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={21} color={colors.GREEN} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {badge != null && badge > 0 ? (
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          ) : null}
          <View style={[styles.chevronWrap, expanded && styles.chevronOpen]}>
            <Ionicons name="chevron-down" size={22} color={colors.GRAY500} />
          </View>
        </View>
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.WHITE,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    overflow: "hidden",
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: colors.WHITE,
  },
  headerPressed: {
    backgroundColor: colors.GRAY50,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${colors.GREEN}33`,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.GRAY900,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: colors.GRAY500,
    lineHeight: 16,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badgePill: {
    minWidth: 28,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.GRAY100,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.GRAY700,
  },
  chevronWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  chevronOpen: {
    transform: [{ rotate: "180deg" }],
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.GRAY200,
    backgroundColor: colors.GRAY50,
  },
});
