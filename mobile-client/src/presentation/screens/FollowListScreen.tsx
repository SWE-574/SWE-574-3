import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getFollowers, getFollowing } from "../../api/users";
import type { UserSummary } from "../../api/types";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";

type Nav = NativeStackNavigationProp<ProfileStackParamList, "FollowList">;
type FollowRoute = RouteProp<ProfileStackParamList, "FollowList">;

function rowDisplayName(u: UserSummary): string {
  const n = [u.first_name, u.last_name]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (n) return n;
  if (u.email && String(u.email).trim()) {
    return String(u.email).split("@")[0] ?? "User";
  }
  return "User";
}

function initials(u: UserSummary): string {
  const f = (u.first_name || "").trim().charAt(0);
  const l = (u.last_name || "").trim().charAt(0);
  const s = (f + l).toUpperCase();
  if (s) return s;
  return (u.email || "U").charAt(0).toUpperCase();
}

export default function FollowListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<FollowRoute>();
  const { userId, kind } = route.params;
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "success"; users: UserSummary[] }
  >({ status: "loading" });

  const title = kind === "followers" ? "Followers" : "Following";

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const req = kind === "followers" ? getFollowers(userId) : getFollowing(userId);
    req
      .then((users) => {
        if (!cancelled) setState({ status: "success", users });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Could not load this list.";
          setState({ status: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, kind]);

  const onPressUser = useCallback(
    (target: UserSummary) => {
      const targetId = String(target.id);
      if (authUser?.id != null && targetId === String(authUser.id)) {
        navigation.popToTop();
        return;
      }
      navigation.navigate("PublicProfile", { userId: targetId });
    },
    [authUser?.id, navigation],
  );

  const styles = useMemo(
    () => getStyles(insets.bottom),
    [insets.bottom],
  );

  if (state.status === "loading") {
    return (
      <View style={[styles.centered, styles.fill]}>
        <ActivityIndicator size="large" color={colors.GREEN} />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={[styles.centered, styles.fill, styles.errorPad]}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  const { users } = state;

  return (
    <View style={styles.fill}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          users.length === 0 ? styles.emptyListContent : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No users to show</Text>
            <Text style={styles.emptySubtitle}>
              {kind === "followers"
                ? "Nobody is following this user yet."
                : "This user is not following anyone yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = rowDisplayName(item);
          const uri =
            item.avatar_url != null && String(item.avatar_url).trim()
              ? String(item.avatar_url).trim()
              : null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open profile for ${name}`}
              onPress={() => onPressUser(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials(item)}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.GRAY400}
              />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function getStyles(bottomInset: number) {
  return StyleSheet.create({
    fill: {
      flex: 1,
      backgroundColor: colors.GRAY100,
    },
    centered: {
      justifyContent: "center",
      alignItems: "center",
    },
    errorPad: {
      padding: 24,
    },
    errorText: {
      fontSize: 15,
      color: colors.GRAY600,
      textAlign: "center",
    },
    listContent: {
      paddingBottom: Math.max(24, bottomInset + 16),
    },
    emptyListContent: {
      flexGrow: 1,
      paddingBottom: Math.max(24, bottomInset + 16),
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.WHITE,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.GRAY200,
      gap: 12,
    },
    rowPressed: {
      backgroundColor: colors.GRAY50,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.GRAY200,
    },
    avatarPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.GREEN,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitials: {
      color: colors.WHITE,
      fontSize: 16,
      fontWeight: "700",
    },
    name: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.GRAY900,
    },
    emptyWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
      minHeight: 220,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.GRAY800,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.GRAY500,
      textAlign: "center",
      lineHeight: 20,
    },
  });
}
