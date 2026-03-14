import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Chat, listChats } from "../../api/chats";
import type { MessagesStackParamList } from "../../navigation/MessagesStack";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";

type Nav = NativeStackNavigationProp<MessagesStackParamList, "MessagesList">;

export default function MessagesScreen() {
  const navigation = useNavigation<Nav>();
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const user = useAuth();

  const fetchChats = useCallback(async () => {
    if (!user.user) {
      setChats([]);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await listChats();
      setChats(data);
      if (data.length === 0) {
        await new Promise((r) => setTimeout(r, 800));
        const retry = await listChats();
        setChats(retry);
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
      setError("Failed to load messages.");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [user.user]);

  useEffect(() => {
    if (!user.user) {
      setChats([]);
      setError(null);
      setLoading(false);
      return;
    }
  }, [user.user]);

  useFocusEffect(
    useCallback(() => {
      if (user.user) {
        fetchChats();
      }
    }, [user.user, fetchChats])
  );

  const openChat = (item: Chat) => {
    navigation.navigate("Chat", {
      handshakeId: item.handshake_id,
      otherUserName: item.other_user?.name ?? "Unknown",
      serviceTitle: item.service_title,
    });
  };

  const goToLogin = () => {
    const tabNav = navigation.getParent() as
      | import("@react-navigation/native").NavigationProp<BottomTabParamList>
      | undefined;

    tabNav?.navigate("Profile", { screen: "Login" });
  };

  const renderItem = ({ item }: { item: Chat }) => {
    const name = item?.other_user?.name ?? "Unknown";
    const avatarUrl = item?.other_user?.avatar_url ?? null;
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => openChat(item)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              accessibilityLabel={`${name} avatar`}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {name}
            </Text>

            {item?.last_message?.created_at ? (
              <Text style={styles.itemTime}>
                {new Date(item.last_message.created_at).toLocaleDateString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                  },
                )}{" "}
                {new Date(item.last_message.created_at).toLocaleTimeString(
                  undefined,
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </Text>
            ) : null}
          </View>

          {!!item?.service_title && (
            <Text style={styles.serviceTitle} numberOfLines={1}>
              {item.service_title}
            </Text>
          )}

          <Text style={styles.itemBody} numberOfLines={2}>
            {item?.last_message?.body ?? "No messages yet"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.screen}>
        {!user.user ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>You are not logged in</Text>
            <Text style={styles.subheader}>
              <Text style={styles.link} onPress={goToLogin}>
                Sign in
              </Text>
              {` to see your messages`}
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.BLUE} />
            <Text style={styles.subheader}>Loading messages...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Something went wrong</Text>
            <Text style={styles.subheader}>{error}</Text>

            <TouchableOpacity style={styles.retryButton} onPress={fetchChats}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={chats}
            renderItem={renderItem}
            keyExtractor={(item) => item.handshake_id}
            contentContainerStyle={[
              styles.listContent,
              chats.length === 0 && styles.emptyListContent,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={styles.stateTitle}>No conversations yet</Text>
                <Text style={styles.subheader}>
                  Your messages will appear here.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  listContent: { flexGrow: 1 },
  emptyListContent: {
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subheader: {
    fontSize: 15,
    color: colors.GRAY500,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
  },
  link: {
    color: colors.BLUE,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: colors.GRAY200,
    marginLeft: 76,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.WHITE,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 24,
    backgroundColor: colors.GRAY200,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.GRAY300,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarFallbackText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.GRAY600,
  },
  chatContent: {
    flex: 1,
    minWidth: 0,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900 ?? "#111827",
  },
  serviceTitle: {
    fontSize: 13,
    color: colors.BLUE,
    marginBottom: 4,
    fontWeight: "600",
  },
  itemBody: {
    fontSize: 14,
    color: colors.GRAY500,
    lineHeight: 20,
  },
  itemTime: {
    fontSize: 12,
    color: colors.GRAY400,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.BLUE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: colors.WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
});
