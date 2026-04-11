import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import HomeStack from "./HomeStack";
import type { HomeStackParamList } from "./HomeStack";
import ForumStack from "./ForumStack";
import type { ForumStackParamList } from "./ForumStack";
import PostStack from "./PostStack";
import type { PostStackParamList } from "./PostStack";
import MapStack from "./MapStack";
import type { MapStackParamList } from "./MapStack";
import MessagesStack from "./MessagesStack";
import type { MessagesStackParamList } from "./MessagesStack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ProfileStack, { ProfileStackParamList } from "./ProfileStack";
import { useNotificationStore } from "../store/useNotificationStore";
import MapTabButton from "../presentation/components/MapTabButton";

export type BottomTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Forum: NavigatorScreenParams<ForumStackParamList>;
  MapTab: NavigatorScreenParams<MapStackParamList>;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  PostService: NavigatorScreenParams<PostStackParamList>;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  const insets = useSafeAreaInsets();
  const notifications = useNotificationStore((s) => s.notifications);

  const chatUnreadCount = notifications.filter(
    (n) => n.type === "chat_message" && !n.is_read,
  ).length;
  const hasProfileNotification = notifications.some(
    (n) =>
      (n.type === "positive_rep" || n.type === "admin_warning") && !n.is_read,
  );

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.GREEN,
        tabBarInactiveTintColor: colors.GRAY500,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginBottom: 4,
        },
        tabBarStyle: {
          height: 70 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Forum"
        component={ForumStack}
        options={{
          title: "Forum",
          tabBarLabel: "Forum",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubble" : "chatbubble-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />

      <Tab.Screen
        name="MapTab"
        component={MapStack}
        options={{
          title: "Map",
          tabBarLabel: "Map",
          tabBarButton: (props) => <MapTabButton {...props} />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{
          title: "Messages",
          tabBarLabel: "Messages",
          tabBarBadge: chatUnreadCount > 0 ? chatUnreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: "#EF4444", fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbox" : "chatbox-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarBadge: hasProfileNotification ? "" : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#EF4444",
            minWidth: 8,
            maxHeight: 8,
            borderRadius: 4,
            fontSize: 0,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              color={color}
              size={size}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("Profile", { screen: "ProfileHome" });
          },
        })}
      />
      {/* Hidden tab — navigated to programmatically from HomeScreen post button */}
      <Tab.Screen
        name="PostService"
        component={PostStack}
        options={{
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
