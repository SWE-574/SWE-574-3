import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../../constants/colors";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { PostStackParamList } from "../../navigation/PostStack";
import { Ionicons } from "@expo/vector-icons";
export default function PostNeedScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<PostStackParamList, "PostNeed">>();
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={colors.GREEN} />
      </TouchableOpacity>
      <Text style={styles.title}>Post Need Screen</Text>
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
