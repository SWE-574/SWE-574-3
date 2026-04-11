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
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{
          title: "Messages",
          tabBarLabel: "Messages",
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
