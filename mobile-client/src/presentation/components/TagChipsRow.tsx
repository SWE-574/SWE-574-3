import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getFeaturedChips, type FeaturedChip } from "../../api/featured";
import { colors } from "../../constants/colors";

interface TagChipsRowProps {
  activeQid: string | null;
  onSelect: (qid: string | null) => void;
}

export default function TagChipsRow({ activeQid, onSelect }: TagChipsRowProps) {
  const [chips, setChips] = useState<FeaturedChip[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFeaturedChips()
      .then(({ chips: rows }) => {
        if (!cancelled) setChips(rows);
      })
      .catch(() => {
        if (!cancelled) setChips([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <Chip label="All" active={activeQid === null} onPress={() => onSelect(null)} />
      {chips.map((chip) => (
        <Chip
          key={chip.qid}
          label={chip.label}
          active={activeQid === chip.qid}
          onPress={() => onSelect(chip.qid)}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: colors.GRAY800 ?? "#1F2937",
  },
  chipIdle: {
    backgroundColor: colors.GRAY100 ?? "#F3F4F6",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  chipTextActive: {
    color: colors.WHITE,
  },
  chipTextIdle: {
    color: colors.GRAY700 ?? "#374151",
  },
});

export type { FeaturedChip };
