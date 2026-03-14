import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../presentation/screens/ProfileScreen";
import LoginScreen from "../presentation/screens/LoginScreen";
import RegisterScreen from "../presentation/screens/RegisterScreen";

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Login: undefined;
  Register: undefined;
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
    </Stack.Navigator>
  );
}
