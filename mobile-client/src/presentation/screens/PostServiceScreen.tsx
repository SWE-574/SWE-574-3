import React from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import MenuRow from "../components/MenuRow";
import { useAuth } from "../../context/AuthContext";

export default function PostServiceScreen() {
  const { user, logout } = useAuth();
  const navigation =
    useNavigation<BottomTabNavigationProp<BottomTabParamList, "PostService">>();

  return (
    <SafeAreaView style={styles.container}>
      <Text>Post Service</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  subheader: {
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#000",
    padding: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
