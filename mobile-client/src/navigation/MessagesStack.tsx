import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MessagesScreen from "../presentation/screens/MessagesScreen";
import ChatScreen from "../presentation/screens/ChatScreen";
import GroupChatScreen from "../presentation/screens/GroupChatScreen";
import PublicChatScreen from "../presentation/screens/PublicChatScreen";
import PublicProfileScreen from "../presentation/screens/PublicProfileScreen";
import ServiceDetailScreen from "../presentation/screens/ServiceDetailScreen";
import AchievementsListScreen from "../presentation/screens/AchievementsListScreen";
import FollowListScreen from "../presentation/screens/FollowListScreen";

export type MessagesStackParamList = {
  MessagesList: undefined;
  Chat: {
    handshakeId: string;
    otherUserName: string;
    serviceTitle?: string;
    otherUserId?: string;
    otherUserAvatarUrl?: string;
    isProvider?: boolean;
    serviceType?: string;
    scheduleType?: string;
    maxParticipants?: number;
    serviceLocationType?: string;
    serviceLocationArea?: string | null;
    serviceExactLocation?: string | null;
    serviceExactLocationMapsUrl?: string | null;
    serviceLocationGuide?: string | null;
    serviceScheduledTime?: string | null;
    provisionedHours?: number;
  };
  GroupChat: {
    groupId: string;
    groupTitle?: string;
  };
  PublicChat: {
    roomId: string;
    roomTitle?: string;
  };
  UserPublicProfile: {
    userId: string;
  };
  ServiceDetail: { id: string };
  AchievementsList: { userId: string };
  FollowList: { userId: string; kind: "followers" | "following" };
};

const Stack = createNativeStackNavigator<MessagesStackParamList>();

export default function MessagesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: { fontSize: 17, fontWeight: "600" },
        headerShadowVisible: true,
      }}
    >
      <Stack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ title: "Messages" }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: "Chat" }}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={{ title: "Group chat" }}
      />
      <Stack.Screen
        name="PublicChat"
        component={PublicChatScreen}
        options={{ title: "Event chat" }}
      />
      <Stack.Screen
        name="UserPublicProfile"
        component={PublicProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ServiceDetail"
        component={ServiceDetailScreen}
        options={{ title: "Service Detail" }}
      />
      <Stack.Screen
        name="AchievementsList"
        component={AchievementsListScreen}
        options={{ title: "Achievements" }}
      />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
    </Stack.Navigator>
  );
}
