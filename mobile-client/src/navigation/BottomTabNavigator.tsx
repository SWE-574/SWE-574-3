import React from "react";
import {
  BottomTabNavigationProp,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import HomeStack from "./HomeStack";
import type { HomeStackParamList } from "./HomeStack";
import ForumStack from "./ForumStack";
import type { ForumStackParamList } from "./ForumStack";
import PostStack from "./PostStack";
import type { PostStackParamList } from "./PostStack";
import MessagesStack from "./MessagesStack";
import type { MessagesStackParamList } from "./MessagesStack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../constants/colors";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PostServiceTabButton from "../presentation/components/PostServiceTabButton";
import ProfileStack, { ProfileStackParamList } from "./ProfileStack";
import { useNotificationStore } from "../store/useNotificationStore";

export type BottomTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Forum: NavigatorScreenParams<ForumStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  PostService: NavigatorScreenParams<PostStackParamList>;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  const navigation =
    useNavigation<BottomTabNavigationProp<BottomTabParamList, "PostService">>();
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
        tabBarStyle: {
          paddingBottom: insets.bottom + 10,
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
        name="PostService"
        component={PostStack}
        options={{
          title: "Post Service",
          tabBarButton: (props) => <PostServiceTabButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("PostService", { screen: "PostServiceHome" });
          },
        })}
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
    </Tab.Navigator>
  );
}
