import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { setServiceSaved } from "../../api/services";
import type { Service } from "../../api/types";
import { colors } from "../../constants/colors";

interface Props {
  service: Service;
  isOwner: boolean;
  onChange?: (next: Partial<Service>) => void;
}

export default function SaveButton({ service, isOwner, onChange }: Props) {
  const [saved, setSaved] = useState(Boolean(service.is_saved));
  const [busy, setBusy] = useState(false);

  if (isOwner) return null;

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
  buttonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: colors.GRAY700,
  },
  buttonTextActive: {
    color: colors.WHITE,
  },
});
