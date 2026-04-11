import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "../presentation/screens/MapScreen";

export type MapStackParamList = {
  MapView: undefined;
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapView" component={MapScreen} />
    </Stack.Navigator>
  );
}
