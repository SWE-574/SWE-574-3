import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../presentation/screens/ProfileScreen";
import LoginScreen from "../presentation/screens/LoginScreen";
import RegisterScreen from "../presentation/screens/RegisterScreen";
import PublicProfileScreen from "../presentation/screens/PublicProfileScreen";
import AchievementsListScreen from "../presentation/screens/AchievementsListScreen";
import FollowListScreen from "../presentation/screens/FollowListScreen";
import NotificationsScreen from "../presentation/screens/NotificationsScreen";
import NotificationPreferencesScreen from "../presentation/screens/NotificationPreferencesScreen";
import MyCommitmentsScreen from "../presentation/screens/MyCommitmentsScreen";
import TimeActivityScreen from "../presentation/screens/TimeActivityScreen";
import ServiceDetailScreen from "../presentation/screens/ServiceDetailScreen";
import CalendarScreen from "../presentation/screens/CalendarScreen";
import ProfileEditScreen from "../presentation/screens/ProfileEditScreen";
import ActivityListScreen, {
  ACTIVITY_LIST_TITLES,
  type ActivityCategory,
} from "../presentation/screens/ActivityListScreen";
import { colors } from "../constants/colors";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Login: undefined;
  Register: undefined;
  PublicProfile: { userId: string };
  AchievementsList: { userId: string };
  FollowList: { userId: string; kind: "followers" | "following" };
  Notifications: undefined;
  NotificationPreferences: undefined;
  MyCommitments: undefined;
  TimeActivity: undefined;
  ProfileEdit:
    | {
        initialTab?: "identity" | "photos" | "skills" | "showcase" | "privacy";
      }
    | undefined;
  ServiceDetail: { id: string };
  Calendar: undefined;
  ActivityList: { category: ActivityCategory };
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
      <Stack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{
          headerShown: true,
          title: "Notification settings",
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="MyCommitments"
        component={MyCommitmentsScreen}
        options={{
          headerShown: true,
          title: "My commitments",
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="ProfileEdit"
        component={ProfileEditScreen}
        options={{
          headerShown: true,
          title: "Edit profile",
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: false,
          gestureEnabled: true,
          animation: "slide_from_right",
        }}
      />
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
      <Stack.Screen
        name="ActivityList"
        component={ActivityListScreen}
        options={({ route }) => ({
          headerShown: true,
          title: ACTIVITY_LIST_TITLES[route.params?.category ?? "offers"],
          headerStyle: { backgroundColor: colors.WHITE },
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: true,
          gestureEnabled: true,
          animation: "slide_from_right",
        })}
      />
    </Stack.Navigator>
  );
}
