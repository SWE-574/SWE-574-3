import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../constants/colors";
import type { PostStackParamList } from "../../navigation/PostStack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import CreateAccessGate from "../components/service/CreateAccessGate";

function TopBar({ title }: { title: string }) {
  return (
    <View style={topBarStyles.bar}>
      <Text style={topBarStyles.title}>{title}</Text>
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  bar: {
    backgroundColor: colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.GRAY900,
  },
});

const OPTIONS = [
  {
    screen: "PostOffer" as const,
    label: "Offer",
    eyebrow: "GIVE TIME",
    icon: "sparkles" as const,
    gradient: ["#2D5C4E", "#1a3d35"] as [string, string],
    caption: "Share a skill or service you can provide to the community",
  },
  {
    screen: "PostNeed" as const,
    label: "Need",
    eyebrow: "ASK FOR HELP",
    icon: "search" as const,
    gradient: ["#1D4ED8", "#1e3a8a"] as [string, string],
    caption: "Describe what you need help with and find community members who can assist",
  },
  {
    screen: "PostEvent" as const,
    label: "Event",
    eyebrow: "HOST A SESSION",
    icon: "calendar" as const,
    gradient: ["#B45309", "#78350f"] as [string, string],
    caption: "Organize a community event — no TimeBank credits involved",
  },
] as const;

export default function PostServiceScreen() {
  const { isAuthenticated } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<PostStackParamList, "PostServiceHome">>();

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <CreateAccessGate
          title="Sign in to create listings"
          description="Offers, needs, and events are available to authenticated members only."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <TopBar title="New service" />
      <View style={styles.header}>
        <Text style={styles.subtitle}>What are you sharing today?</Text>
      </View>

      <View style={styles.list}>
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.screen}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: opt.gradient[0] },
              pressed && styles.cardPressed,
            ]}
            onPress={() => navigation.navigate(opt.screen)}
          >
            {/* Decorative circles — same pattern as web */}
            <View
              style={[
                styles.deco,
                { backgroundColor: "rgba(255,255,255,0.06)", top: -28, right: -28 },
              ]}
            />
            <View
              style={[
                styles.decoSm,
                { backgroundColor: "rgba(255,255,255,0.04)", bottom: -16, left: 60 },
              ]}
            />

            <View style={styles.cardInner}>
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name={opt.icon} size={18} color="rgba(255,255,255,0.65)" />
                  <Text style={styles.eyebrow}>{opt.eyebrow}</Text>
                </View>
                <View style={styles.arrow}>
                  <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.55)" />
                </View>
              </View>

              <Text style={styles.cardLabel}>{opt.label}</Text>
              <Text style={styles.cardCaption}>{opt.caption}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const DECO_SIZE = 90;
const DECO_SM_SIZE = 56;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: colors.GRAY500,
    fontWeight: "500",
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  deco: {
    position: "absolute",
    width: DECO_SIZE,
    height: DECO_SIZE,
    borderRadius: DECO_SIZE / 2,
  },
  decoSm: {
    position: "absolute",
    width: DECO_SM_SIZE,
    height: DECO_SM_SIZE,
    borderRadius: DECO_SM_SIZE / 2,
  },
  cardInner: {
    padding: 18,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1.2,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.WHITE,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  cardCaption: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 19,
  },
});
