import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PostServiceScreen from "../presentation/screens/PostServiceScreen";
import PostOfferScreen from "../presentation/screens/PostOfferScreen";
import PostNeedScreen from "../presentation/screens/PostNeedScreen";
import PostEventScreen from "../presentation/screens/PostEventScreen";

export type PostStackParamList = {
  PostService: undefined;
  PostOffer: undefined;
  PostNeed: undefined;
  PostEvent: undefined;
};

const Stack = createNativeStackNavigator<PostStackParamList>();

export default function PostStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="PostService" component={PostServiceScreen} />
      <Stack.Screen name="PostOffer" component={PostOfferScreen} />
      <Stack.Screen name="PostNeed" component={PostNeedScreen} />
      <Stack.Screen name="PostEvent" component={PostEventScreen} />
    </Stack.Navigator>
  );
}
