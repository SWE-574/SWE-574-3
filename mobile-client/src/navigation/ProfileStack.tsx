import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../presentation/screens/ProfileScreen";
import LoginScreen from "../presentation/screens/LoginScreen";
import RegisterScreen from "../presentation/screens/RegisterScreen";
import PublicProfileScreen from "../presentation/screens/PublicProfileScreen";
import AchievementsListScreen from "../presentation/screens/AchievementsListScreen";
import NotificationsScreen from "../presentation/screens/NotificationsScreen";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Login: undefined;
  Register: undefined;
  PublicProfile: { userId: string };
  AchievementsList: { userId: string };
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <Stack.Screen
        name="AchievementsList"
        component={AchievementsListScreen}
        options={{
          headerShown: true,
          title: "Achievements",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
