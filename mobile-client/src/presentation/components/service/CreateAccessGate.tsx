import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "../../../navigation/BottomTabNavigator";
import { colors } from "../../../constants/colors";

type NavProp = BottomTabNavigationProp<BottomTabParamList>;

type Props = {
  title: string;
  description: string;
};

export default function CreateAccessGate({ title, description }: Props) {
  const navigation = useNavigation<NavProp>();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Create access</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Profile", { screen: "Login" })}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Profile", { screen: "Register" })}
          >
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
    padding: 16,
    justifyContent: "center",
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 20,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: colors.GRAY600,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GREEN,
  },
  primaryButtonText: {
    color: colors.WHITE,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
    borderWidth: 1,
    borderColor: colors.GRAY200,
  },
  secondaryButtonText: {
    color: colors.GRAY800,
    fontSize: 15,
    fontWeight: "800",
  },
});
