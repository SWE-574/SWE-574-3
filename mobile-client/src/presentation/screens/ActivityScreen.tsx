import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  listActivityFeed,
  type ActivityEvent,
} from "../../api/activity";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { colors } from "../../constants/colors";

function actorName(a: ActivityEvent["actor"]): string {
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || "Someone";
}

function describe(event: ActivityEvent): string {
  const actor = actorName(event.actor);
  if (event.verb === "service_created" && event.service) {
    return `${actor} posted ${event.service.title}`;
  }
  if (event.verb === "handshake_accepted" && event.service) {
    return `${actor} is joining ${event.service.title}`;
  }
  if (event.verb === "user_followed" && event.target_user) {
    return `${actor} started following ${actorName(event.target_user)}`;
  }
  return `${actor} did something`;
}

function verbIcon(verb: ActivityEvent["verb"]) {
  if (verb === "service_created") return "document-text-outline" as const;
  if (verb === "handshake_accepted") return "checkmark-circle-outline" as const;
  return "person-add-outline" as const;
}

function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.floor((Date.now() - then) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

export default function ActivityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList, "Activity">>();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = React.useCallback(async () => {
    try {
      const { results } = await listActivityFeed({ days: 14 });
      setEvents(results ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handlePress = (event: ActivityEvent) => {
    if (event.service) {
      navigation.navigate("ServiceDetail", { id: event.service.id });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.GRAY700} />
        </Pressable>
        <Text style={styles.title}>Activity</Text>
        <View style={styles.backButton} />
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.PURPLE} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nothing here yet. Follow some people to see what they post.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              style={styles.row}
            >
              <Ionicons
                name={verbIcon(item.verb)}
                size={18}
                color={colors.PURPLE}
                style={styles.icon}
              />
              <View style={styles.body}>
                <Text style={styles.text}>{describe(item)}</Text>
                <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900,
    textAlign: "center",
  },
  loadingRow: {
    paddingVertical: 32,
    alignItems: "center",
  },
  listContent: {
    paddingVertical: 8,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    color: colors.GRAY500,
    fontSize: 13,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  icon: {
    marginRight: 12,
  },
  body: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    color: colors.GRAY900,
  },
  timestamp: {
    fontSize: 11,
    color: colors.GRAY500,
    marginTop: 2,
  },
});
