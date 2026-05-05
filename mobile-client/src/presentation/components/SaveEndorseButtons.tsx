import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { setServiceSaved, setServiceEndorsed } from "../../api/services";
import type { Service } from "../../api/types";
import { colors } from "../../constants/colors";

interface Props {
  service: Service;
  isOwner: boolean;
  onChange?: (next: Partial<Service>) => void;
}

export default function SaveEndorseButtons({ service, isOwner, onChange }: Props) {
  const [saved, setSaved] = useState(Boolean(service.is_saved));
  const [endorsed, setEndorsed] = useState(Boolean(service.is_endorsed));
  const [endorseCount, setEndorseCount] = useState(service.endorsement_count ?? 0);
  const [busy, setBusy] = useState(false);

  if (isOwner) {
    if (endorseCount > 0) {
      return (
        <View style={styles.row}>
          <Ionicons name="thumbs-up" size={14} color={colors.GREEN} />
          <Text style={styles.endorseCountText}>
            {endorseCount} {endorseCount === 1 ? "endorsement" : "endorsements"}
          </Text>
        </View>
      );
    }
    return null;
  }

  const toggleSaved = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setServiceSaved(service.id, !saved);
      setSaved(res.is_saved);
      onChange?.({ is_saved: res.is_saved });
    } catch {
      // Best-effort; surface in toast pattern can come later.
    } finally {
      setBusy(false);
    }
  };

  const toggleEndorsed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setServiceEndorsed(service.id, !endorsed);
      setEndorsed(res.is_endorsed);
      setEndorseCount(res.endorsement_count);
      onChange?.({
        is_endorsed: res.is_endorsed,
        endorsement_count: res.endorsement_count,
      });
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggleSaved}
        style={[styles.button, saved ? styles.buttonSaved : styles.buttonIdle]}
        disabled={busy}
      >
        <Ionicons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={16}
          color={saved ? colors.WHITE : colors.GRAY700}
        />
        <Text style={[styles.buttonText, saved && styles.buttonTextActive]}>
          {saved ? "Saved" : "Save"}
        </Text>
      </Pressable>
      <Pressable
        onPress={toggleEndorsed}
        style={[
          styles.button,
          endorsed ? styles.buttonEndorsed : styles.buttonIdle,
        ]}
        disabled={busy}
      >
        <Ionicons
          name={endorsed ? "thumbs-up" : "thumbs-up-outline"}
          size={16}
          color={endorsed ? colors.WHITE : colors.GRAY700}
        />
        <Text style={[styles.buttonText, endorsed && styles.buttonTextActive]}>
          {endorsed ? "Endorsed" : "Endorse"}
          {endorseCount > 0 ? ` · ${endorseCount}` : ""}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
    alignItems: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  buttonIdle: {
    backgroundColor: colors.GRAY50,
    borderColor: colors.GRAY200,
  },
  buttonSaved: {
    backgroundColor: colors.PURPLE,
    borderColor: colors.PURPLE,
  },
  buttonEndorsed: {
    backgroundColor: colors.GREEN,
    borderColor: colors.GREEN,
  },
  buttonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  buttonTextActive: {
    color: colors.WHITE,
  },
  endorseCountText: {
    marginLeft: 6,
    fontSize: 13,
    color: colors.GRAY600,
    fontWeight: "600",
  },
});
