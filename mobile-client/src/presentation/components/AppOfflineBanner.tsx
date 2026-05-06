/**
 * Global offline banner. Mounted once above the tab navigator so the user
 * always knows when the app is operating without a network.
 *
 * Three states:
 *   - Offline (red):    no network. Tapping navigates to MyCommitments
 *                       so the user can reach their cached data.
 *   - Stale (amber):    online again but the signed-in shell still shows
 *                       cached data because the last `getMe` failed.
 *   - Reconnecting:     transient (2.5s) flash after offline→online while
 *                       caches refetch in the background.
 *
 * Hidden when online, fresh, and not stale.
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../hooks/useConnectivity";

const RECONNECT_FLASH_MS = 2500;

type BannerKind = "offline" | "stale" | "reconnecting";

export default function AppOfflineBanner() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isOnline } = useConnectivity();
  const { isAuthenticated, isStale } = useAuth();

  const wasOfflineRef = useRef(false);
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnecting(true);
      const id = setTimeout(() => setShowReconnecting(false), RECONNECT_FLASH_MS);
      return () => clearTimeout(id);
    }
  }, [isOnline]);

  const kind: BannerKind | null = !isOnline
    ? "offline"
    : showReconnecting
      ? "reconnecting"
      : isStale && isAuthenticated
        ? "stale"
        : null;

  if (!kind) return null;

  const handlePress = () => {
    if (kind !== "offline") return;
    if (!isAuthenticated) return;
    try {
      navigation.navigate("Profile", { screen: "MyCommitments" });
    } catch {
      /* no-op if navigation isn't ready */
    }
  };

  const copy = {
    offline: "You are offline. Tap to view your synced commitments.",
    stale: "Showing cached data while we reconnect.",
    reconnecting: "Reconnecting...",
  }[kind];

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole={kind === "offline" ? "button" : undefined}
      style={[
        styles.row,
        { paddingTop: insets.top + 8 },
        kind === "offline" && styles.rowOffline,
        kind === "stale" && styles.rowStale,
        kind === "reconnecting" && styles.rowReconnecting,
      ]}
    >
      <Text
        style={[
          styles.text,
          kind === "offline" && styles.textOffline,
          kind === "stale" && styles.textStale,
        ]}
        numberOfLines={2}
      >
        {copy}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  rowOffline: {
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
  },
  rowStale: {
    backgroundColor: "#FFF7ED",
    borderBottomWidth: 1,
    borderBottomColor: "#FED7AA",
  },
  rowReconnecting: {
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  text: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  textOffline: {
    color: "#991B1B",
    fontWeight: "600",
  },
  textStale: {
    color: "#9A3412",
  },
});
