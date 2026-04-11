import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

const SPECS = [
  {
    label: "Offers",
    color: colors.GREEN,
    bg: colors.GREEN_LT,
    icon: "flash-outline" as const,
  },
  {
    label: "Needs",
    color: colors.BLUE,
    bg: colors.BLUE_LT,
    icon: "layers-outline" as const,
  },
  {
    label: "Exchanges",
    color: colors.AMBER,
    bg: colors.AMBER_LT,
    icon: "repeat-outline" as const,
  },
];

export default function ProfileListingStatsRow({
  offersCount,
  needsCount,
  exchangesCount,
}: {
  offersCount: number;
  needsCount: number;
  exchangesCount: number;
}) {
  const values = [offersCount, needsCount, exchangesCount];

  return (
    <View style={styles.row}>
      {SPECS.map((spec, i) => (
        <View key={spec.label} style={styles.card}>
          <View style={[styles.accentBar, { backgroundColor: spec.color }]} />
          <View style={styles.cardInner}>
            <View style={[styles.iconWrap, { backgroundColor: spec.bg }]}>
              <Ionicons name={spec.icon} size={17} color={spec.color} />
            </View>
            <Text style={[styles.value, { color: spec.color }]}>
              {values[i]}
            </Text>
            <Text style={styles.label}>{spec.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    flex: 1,
    backgroundColor: colors.WHITE,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.GRAY200,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
  cardInner: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.GRAY400,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});
