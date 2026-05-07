import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../presentation/screens/HomeScreen";
import ServiceDetailScreen from "../presentation/screens/ServiceDetailScreen";
import MapScreen from "../presentation/screens/MapScreen";
import NotificationsScreen from "../presentation/screens/NotificationsScreen";
import ActivityScreen from "../presentation/screens/ActivityScreen";

export type HomeStackParamList = {
  HomeFeed: undefined;
  ServiceDetail: { id: string };
  Map: undefined;
  Notifications: undefined;
  Activity: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="HomeFeed" component={HomeScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Activity" component={ActivityScreen} />
    </Stack.Navigator>
  );
}
