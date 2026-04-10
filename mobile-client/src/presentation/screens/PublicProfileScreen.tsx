import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";

export default function PublicProfileScreen() {
  const route = useRoute<RouteProp<ProfileStackParamList, "PublicProfile">>();
  const { userId } = route.params;

  useEffect(() => {
    console.log(userId);
  }, [userId]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Public Profile Screen</Text>
    </View>
  );
}
