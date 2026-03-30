import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PostStackParamList } from "../../navigation/PostStack";
import { colors } from "../../constants/colors";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function PostOfferScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<PostStackParamList, "PostOffer">>();
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={colors.GREEN} />
      </TouchableOpacity>
      <Text style={styles.title}>Post Offer Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.GRAY800,
  },
});
