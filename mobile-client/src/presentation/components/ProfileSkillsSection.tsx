import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/colors";

type SkillItem = {
  id: string;
  name: string;
};

export default function ProfileSkillsSection({
  skills,
  embedded = false,
}: {
  skills: SkillItem[];
  /** Inside ProfileAccordionSection — hide duplicate header / outer card chrome */
  embedded?: boolean;
}) {
  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      {!embedded ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.GREEN} />
            </View>
            <View>
              <Text style={styles.title}>Skills</Text>
              <Text style={styles.subtitle}>What this member often shares</Text>
            </View>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{skills.length}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.chipsWrap}>
        {skills.map((skill) => (
          <View key={skill.id} style={[styles.chip, styles.chipEmphasized]}>
            <Ionicons name="flash-outline" size={12} color={colors.GREEN} />
            <Text style={[styles.chipText, styles.chipTextEmphasized]}>
              {skill.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.WHITE,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    shadowColor: colors.GRAY900,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardEmbedded: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 12,
    color: colors.GRAY500,
  },
  countPill: {
    minWidth: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.GREEN_LT,
    alignItems: "center",
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GREEN,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: colors.GRAY100,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  chipEmphasized: {
    backgroundColor: colors.GREEN_LT,
    borderColor: "rgba(41, 129, 90, 0.18)",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  chipTextEmphasized: {
    color: colors.GREEN,
  },
});
