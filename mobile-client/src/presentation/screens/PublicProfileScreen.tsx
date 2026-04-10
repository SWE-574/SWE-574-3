import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { getUser } from "../../api/users";
import type { UserSummary } from "../../api/types";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; user: UserSummary };

export default function PublicProfileScreen() {
  const route = useRoute<RouteProp<ProfileStackParamList, "PublicProfile">>();
  const { userId } = route.params;

  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getUser(userId)
      .then((user) => {
        if (!cancelled) setState({ status: "success", user });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load profile";
          setState({ status: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text>{state.message}</Text>
      </View>
    );
  }

  const { user } = state;
  const fullName = [user.first_name, user.last_name]
    .filter((part) => part && String(part).trim())
    .join(" ")
    .trim();
  const bioText =
    user.bio != null && String(user.bio).trim() ? String(user.bio) : null;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ marginBottom: 8 }}>
        Name: {fullName || "—"}
      </Text>
      <Text style={{ marginBottom: 8 }}>Bio: {bioText || "—"}</Text>
      {user.karma_score != null ? (
        <Text style={{ marginBottom: 8 }}>Karma: {user.karma_score}</Text>
      ) : null}
      {user.role ? (
        <Text style={{ marginBottom: 8 }}>Role: {user.role}</Text>
      ) : null}
      {user.date_joined ? (
        <Text style={{ marginBottom: 8 }}>Joined: {user.date_joined}</Text>
      ) : null}
    </View>
  );
}
