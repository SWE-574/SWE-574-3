import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ForumScreen from "../presentation/screens/ForumScreen";
import CreateTopicScreen from "../presentation/screens/CreateTopicScreen";

export type ForumStackParamList = {
  ForumFeed: undefined;
  CreateTopic: undefined;
};

const Stack = createNativeStackNavigator<ForumStackParamList>();

export default function ForumStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ForumFeed" component={ForumScreen} />
      <Stack.Screen name="CreateTopic" component={CreateTopicScreen} />
    </Stack.Navigator>
  );
}
