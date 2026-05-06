import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useNotificationSocket } from "../hooks/useNotificationSocket";
import { usePushNotifications } from "../hooks/usePushNotifications";
import BottomTabNavigator from "./BottomTabNavigator";
import InAppNotificationToast from "../presentation/components/InAppNotificationToast";
import AppOfflineBanner from "../presentation/components/AppOfflineBanner";

export default function RootNavigator() {
  const { isLoading } = useAuth();
  const navigation = useNavigation();
  useNotificationSocket();
  usePushNotifications(navigation as any);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppOfflineBanner />
      <View style={styles.flex}>
        <BottomTabNavigator />
      </View>
      <InAppNotificationToast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
});
