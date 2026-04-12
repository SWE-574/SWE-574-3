import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import CreateAccessGate from "../components/service/CreateAccessGate";
import ServiceWizard from "../components/service/ServiceWizard";
import type { RouteProp } from "@react-navigation/native";
import type { PostStackParamList } from "../../navigation/PostStack";

export default function PostNeedScreen() {
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PostStackParamList, "PostNeed">>();
  const serviceId = route.params?.serviceId;

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <CreateAccessGate
          title="Sign in to post a need"
          description="Only authenticated members can create new needs."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.GRAY900} />
        </Pressable>
        <Text style={styles.topBarTitle}>{serviceId ? "Edit Need" : "Create Need"}</Text>
        <View style={styles.backBtn} />
      </View>
      <ServiceWizard type="Need" serviceId={serviceId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 12,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    color: colors.GRAY900,
    textAlign: "center",
  },
  backBtn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
