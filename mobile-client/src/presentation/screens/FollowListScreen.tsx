import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getFollowers,
  getFollowing,
  getUser,
  unfollowUser,
} from "../../api/users";
import type { UserSummary } from "../../api/types";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";

type Nav = NativeStackNavigationProp<ProfileStackParamList, "FollowList">;
type FollowRoute = RouteProp<ProfileStackParamList, "FollowList">;

const headerBackStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    paddingVertical: 8,
    paddingRight: 8,
    maxWidth: 260,
  },
  pressed: { opacity: 0.65 },
  label: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.GRAY900,
    flexShrink: 1,
  },
});

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

function profileOwnerLabelFromApiUser(u: {
  first_name?: string;
  last_name?: string;
}): string {
  const n = [u.first_name, u.last_name]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" ")
    .trim();
  return n || "User";
}

export default function FollowListScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<FollowRoute>();
  const { userId, kind } = route.params;
  const { user: authUser, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [ownerLabel, setOwnerLabel] = useState("");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "success"; users: UserSummary[] }
  >({ status: "loading" });
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  const title = kind === "followers" ? "Followers" : "Following";

  useEffect(() => {
    let cancelled = false;
    setOwnerLabel("");
    getUser(userId)
      .then((u) => {
        if (!cancelled) setOwnerLabel(profileOwnerLabelFromApiUser(u));
      })
      .catch(() => {
        if (!cancelled) setOwnerLabel("User");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const goBackToOwnerProfile = useCallback(() => {
    if (authUser?.id != null && String(userId) === String(authUser.id)) {
      navigation.navigate("ProfileHome");
      return;
    }
    navigation.navigate("PublicProfile", { userId });
  }, [authUser?.id, navigation, userId]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goBackToOwnerProfile();
        return true;
      });
      return () => sub.remove();
    }, [goBackToOwnerProfile]),
  );

  useLayoutEffect(() => {
    const backTitle = ownerLabel || "…";
    navigation.setOptions({
      title,
      headerBackVisible: false,
      headerLeft: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            authUser?.id != null && String(userId) === String(authUser.id)
              ? "Back to my profile"
              : `Back to ${backTitle} profile`
          }
          onPress={goBackToOwnerProfile}
          style={({ pressed }) => [
            headerBackStyles.wrap,
            pressed && headerBackStyles.pressed,
          ]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.GREEN} />
          <Text style={headerBackStyles.label} numberOfLines={1}>
            {backTitle}
          </Text>
        </Pressable>
      ),
    });
  }, [
    authUser?.id,
    goBackToOwnerProfile,
    navigation,
    ownerLabel,
    title,
    userId,
  ]);

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

  const onPressUser = useCallback((target: UserSummary) => {
    navigation.navigate("PublicProfile", { userId: String(target.id) });
  }, [navigation]);

  const isOwnFollowingList =
    authUser?.id != null &&
    String(userId) === String(authUser.id) &&
    kind === "following";

  const handleUnfollow = useCallback((target: UserSummary) => {
    if (unfollowingId != null) return;
    const id = String(target.id);
    setUnfollowingId(id);
    unfollowUser(id)
      .then(() => {
        setState((prev) => {
          if (prev.status !== "success") return prev;
          return {
            status: "success",
            users: prev.users.filter((u) => String(u.id) !== id),
          };
        });
        void refreshUser({ force: true });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Could not unfollow this user.";
        Alert.alert("Error", message);
      })
      .finally(() => setUnfollowingId(null));
  }, [refreshUser, unfollowingId]);

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
          const targetId = String(item.id);
          const unfollowing = unfollowingId === targetId;
          return (
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open profile for ${name}`}
                onPress={() => onPressUser(item)}
                style={({ pressed }) => [
                  styles.rowMain,
                  pressed && styles.rowPressed,
                ]}
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
              </Pressable>
              {isOwnFollowingList ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unfollow ${name}`}
                  disabled={unfollowingId != null}
                  onPress={() => handleUnfollow(item)}
                  style={({ pressed }) => [
                    styles.unfollowBtn,
                    pressed && styles.unfollowBtnPressed,
                    unfollowingId != null && styles.unfollowBtnDisabled,
                  ]}
                >
                  {unfollowing ? (
                    <ActivityIndicator color={colors.WHITE} size="small" />
                  ) : (
                    <Text style={styles.unfollowBtnText}>Unfollow</Text>
                  )}
                </Pressable>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.GRAY400}
                />
              )}
            </View>
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
      gap: 10,
    },
    rowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
    },
    rowPressed: {
      backgroundColor: colors.GRAY50,
    },
    unfollowBtn: {
      flexShrink: 0,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.GREEN,
      minWidth: 96,
      alignItems: "center",
      justifyContent: "center",
    },
    unfollowBtnPressed: {
      opacity: 0.88,
    },
    unfollowBtnDisabled: {
      opacity: 0.65,
    },
    unfollowBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.WHITE,
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
