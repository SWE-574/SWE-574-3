import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MessagesScreen from "../presentation/screens/MessagesScreen";
import ChatScreen from "../presentation/screens/ChatScreen";
import GroupChatScreen from "../presentation/screens/GroupChatScreen";
import PublicChatScreen from "../presentation/screens/PublicChatScreen";

export type MessagesStackParamList = {
  MessagesList: undefined;
  Chat: {
    handshakeId: string;
    otherUserName: string;
    serviceTitle?: string;
    otherUserId?: string;
  };
  GroupChat: {
    groupId: string;
    groupTitle?: string;
  };
  PublicChat: {
    roomId: string;
    roomTitle?: string;
  };
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
    </Stack.Navigator>
  );
}
