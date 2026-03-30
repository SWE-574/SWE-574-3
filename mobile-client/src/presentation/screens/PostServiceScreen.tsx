import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { useAuth } from "../../context/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import { PostStackParamList } from "../../navigation/PostStack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function PostServiceScreen() {
  const { user } = useAuth();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<PostStackParamList, "PostService">
    >();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.buttons}>
        <Text style={styles.sectionLabel}>POST A SERVICE</Text>
        <TouchableOpacity
          style={styles.offerButton}
          onPress={() => navigation.navigate("PostOffer")}
        >
          <Text style={styles.offerText}>+ Offer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.needButton}
          onPress={() => navigation.navigate("PostNeed")}
        >
          <Ionicons
            name="layers"
            size={16}
            color={colors.BLUE}
            style={styles.needIcon}
          />
          <Text style={styles.needText}>Need</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.eventButton}
          onPress={() => navigation.navigate("PostEvent")}
        >
          <Text style={styles.eventText}>+ Event</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.WHITE,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.GRAY500,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  buttons: {
    gap: 20,
    paddingHorizontal: 36,
    flex: 1,
    justifyContent: "center",
  },
  offerButton: {
    backgroundColor: colors.GREEN,
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  offerText: {
    color: colors.WHITE,
    fontSize: 20,
    fontWeight: "500",
  },
  needButton: {
    backgroundColor: colors.BLUE_LT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  needIcon: {
    marginRight: 6,
  },
  needText: {
    color: colors.BLUE,
    fontSize: 20,
    fontWeight: "600",
  },
  eventButton: {
    backgroundColor: colors.AMBER_LT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  eventText: {
    color: colors.AMBER,
    fontSize: 20,
    fontWeight: "600",
  },
});
