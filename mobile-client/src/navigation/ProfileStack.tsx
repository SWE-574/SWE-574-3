import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../presentation/screens/ProfileScreen";
import LoginScreen from "../presentation/screens/LoginScreen";
import RegisterScreen from "../presentation/screens/RegisterScreen";
import PublicProfileScreen from "../presentation/screens/PublicProfileScreen";
import AchievementsListScreen from "../presentation/screens/AchievementsListScreen";
import FollowListScreen from "../presentation/screens/FollowListScreen";
import NotificationsScreen from "../presentation/screens/NotificationsScreen";
import TimeActivityScreen from "../presentation/screens/TimeActivityScreen";
import ServiceDetailScreen from "../presentation/screens/ServiceDetailScreen";
import CalendarScreen from "../presentation/screens/CalendarScreen";
import { colors } from "../constants/colors";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Login: undefined;
  Register: undefined;
  PublicProfile: { userId: string };
  AchievementsList: { userId: string };
  FollowList: { userId: string; kind: "followers" | "following" };
  Notifications: undefined;
  TimeActivity: undefined;
  ServiceDetail: { id: string };
  Calendar: undefined;
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
      <Stack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{
          headerShown: false,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
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
      <Stack.Screen
        name="FollowList"
        component={FollowListScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Screen
        name="TimeActivity"
        component={TimeActivityScreen}
        options={{
          headerShown: true,
          title: "Time Activity",
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          headerShown: true,
          title: "Calendar",
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
    </Stack.Navigator>
  );
}
