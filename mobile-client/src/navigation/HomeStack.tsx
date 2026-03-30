import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../presentation/screens/HomeScreen";
import ServiceDetailScreen from "../presentation/screens/ServiceDetailScreen";
import MapScreen from "../presentation/screens/MapScreen";

export type HomeStackParamList = {
  HomeFeed: undefined;
  ServiceDetail: { id: string };
  Map: undefined;
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
    </Stack.Navigator>
  );
}
