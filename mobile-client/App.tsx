import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import RootNavigator from "./src/navigation/RootNavigator";
import { Limelight } from "@getlimelight/sdk";

try {
  Limelight.connect(); // debug tool — must not crash app if SDK/native bridge fails
} catch {
  /* ignore */
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppErrorBoundary>
            <RootNavigator />
          </AppErrorBoundary>
          <StatusBar style="auto" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
